import { PrismaClient } from "@prisma/client";
import { Iuser } from "../interfaces/user.interface";
import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from "bcryptjs";
import { redis } from "../utils/redis";

interface IactivationToken {
    token: string;
    activationCode: string;
}

const BCRYPT_PEPPER = process.env.BCRYPT_PEPPER || "";

const prisma = new PrismaClient();

export const createActivationToken = async (user: Iuser): Promise<IactivationToken> => {
    const activationCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit number
    const encryptActivationCode = await encryptedPassword(activationCode);
    const token = jwt.sign(
        {
            id: user.id,
            name: user.name,
            activationCode: encryptActivationCode
        },
        process.env.JWT_SECRET!,
        {
            expiresIn: '5m'
        }
    )
    return {
        token,
        activationCode
    }
}

export const verifyToken = async (token: string, otp: string): Promise<boolean> => {
    try {
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
        if ('activationCode' in decodedToken) {
            const otpVerified = await verifyPassword(otp, decodedToken.activationCode);
            if (!otpVerified) return false;

            const id: string = decodedToken?.id;
            if (!id) return false;
            // update in db
            await prisma.user.update({
                where: { id: id },
                data: { isVerified: true }
            })
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error verifying token:", error);
        return false;
    }
}

export const encryptedPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password + BCRYPT_PEPPER, salt);
    return hash;
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
    return await bcrypt.compare(password + BCRYPT_PEPPER, hash);
};

export const generateTokens = async (user: Iuser) => {
    const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY || "5m";
    const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || "59m";
    
    const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.ACCESS_TOKEN_SECRET!,
        { expiresIn: accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
        { id: user.id },
        process.env.REFRESH_TOKEN_SECRET!,
        { expiresIn: refreshTokenExpiry }
    );
    
    // Calculate TTL in seconds from expiry string (e.g., "59m" -> 3540 seconds)
    const getTTLInSeconds = (expiry: string): number => {
        const match = expiry.match(/^(\d+)([smhd])$/);
        if (!match) return 3540; // Default to 59 minutes if format is invalid
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch (unit) {
            case 's': return value;
            case 'm': return value * 60;
            case 'h': return value * 60 * 60;
            case 'd': return value * 24 * 60 * 60;
            default: return 3540;
        }
    };
    
    const ttl = getTTLInSeconds(refreshTokenExpiry);
    
    // Save user session with TTL matching refresh token expiration
    await redis.setex(user.id.toString(), ttl, JSON.stringify(user));
    
    return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string) => {
    try {
        return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!);
    } catch {
        return null;
    }
};

export const verifyRefreshToken = (token: string) => {
    try {
        return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET!);
    } catch {
        return null;
    }
};