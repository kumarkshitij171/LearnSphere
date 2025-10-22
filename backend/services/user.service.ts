import { PrismaClient } from "@prisma/client";
import { Iuser } from "../interfaces/user.interface";
import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from "bcryptjs";

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
            activationCode:encryptActivationCode
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
            const otpVerified = await verifyPassword(otp,decodedToken.activationCode);
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

export const createDashboardAccessToken = async (): Promise<string> => {
    return "token_value";
};