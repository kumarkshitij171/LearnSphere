import { Prisma, PrismaClient } from "@prisma/client";
import { Iuser } from "../interfaces/user.interface";
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import bcrypt from "bcryptjs";
import crypto from "crypto";

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


export const hashToken = (token: string): string =>
    crypto.createHash("sha256").update(token).digest("hex");


export const generateAccessToken = (user: Iuser): string => {
    const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRY || "5m";
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.ACCESS_TOKEN_SECRET!,
        { expiresIn: accessTokenExpiry } as SignOptions
    );
};

interface ISessionContext {
    userAgent?: string;
    ip?: string;
}

export const generateTokens = async (user: Iuser, context: ISessionContext = {}) => {
    const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || "7d";

    const accessToken = generateAccessToken(user);

    const refreshToken = jwt.sign(
        { id: user.id },
        process.env.REFRESH_TOKEN_SECRET!,
        { expiresIn: refreshTokenExpiry } as SignOptions
    );

    const decoded = jwt.decode(refreshToken) as JwtPayload | null;
    const expiresAt = decoded?.exp
        ? new Date(decoded.exp * 1000).toISOString()
        : null;

    const existingExtended =
        user.extended && typeof user.extended === "object" && !Array.isArray(user.extended)
            ? (user.extended as Prisma.JsonObject)
            : {};

    await prisma.user.update({
        where: { id: user.id },
        data: {
            extended: {
                ...existingExtended,
                session: {
                    refreshTokenHash: hashToken(refreshToken),
                    expiresAt,
                    device: {
                        userAgent: context.userAgent ?? null,
                        ip: context.ip ?? null,
                    },
                    createdAt: new Date().toISOString(),
                },
            },
        },
    });

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