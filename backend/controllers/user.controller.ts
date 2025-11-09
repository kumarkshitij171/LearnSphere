import { NextFunction, Request, Response } from "express";
import { catchAsyncError } from "../middleware/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { Prisma, PrismaClient } from "@prisma/client";
import { sendMail } from "../utils/sendMail";
import { createActivationToken, encryptedPassword, generateTokens, verifyPassword, verifyRefreshToken, verifyToken } from "../services/user.service";
import jwt, { JwtPayload } from 'jsonwebtoken';

const prisma = new PrismaClient();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface IuserRegistration {
    name: string;
    email: string;
    password: string;
    avatar?: string;
}

export const registerUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, email, password }: IuserRegistration = req.body;
        if (!name || !email || !password) {
            return next(new ErrorHandler(400, 'Please fill all the fields'));
        }

        // check user email is valid or not
        if (!emailRegex.test(email)) {
            return next(new ErrorHandler(400, 'Invalid email format'));
        }

        // check if user already exists
        const userPresent = await prisma.user.findUnique({
            where: {
                email
            }
        });

        if (userPresent) {
            return next(new ErrorHandler(400, 'User already exists'));
        }

        // checking for avatar image get from frontend
        const avatar = undefined
        // encrypt password
        const encryptPassword = await encryptedPassword(password);

        // create a user with valid interface data
        const userDoc: IuserRegistration = {
            name,
            email,
            password: encryptPassword,
        }
        // now create an user in database
        const user = await prisma.user.create({
            data: {
                name: userDoc.name,
                email: userDoc.email,
                password: userDoc.password,
                avatar,
                role: 'user',
                isVerified: false,
                courses: []
            }
        })

        // create activation code
        const { token, activationCode } = await createActivationToken(user);
        const activationUrl = `${process.env.CLIENT_URL}/verify?otp=${activationCode}&token=${token}`;
        // send activation mail
        await sendMail({
            email: user.email,
            subject: 'Account Activation',
            template: 'activationMail',
            data: {
                activationCode,
                name: user.name,
                activationUrl
            }
        })

        // send response
        return res
            .status(201)
            .cookie('token', token, {
                httpOnly: true,
                expires: new Date(Date.now() + 24 * 60 * 60 * 5000) // 5 day
            })
            .json({
                success: true,
                message: 'Account created successfully. Please verify your email to activate your account',
                token
            })

    } catch (error: any) {
        console.log(error);
        return next(new ErrorHandler(400, error.message));
    }
});

export const verifyUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { otp, token } = req.query;

        if (!otp || !token) {
            return res.status(400).json({ error: 'OTP and Token are required' });
        }

        if (!await verifyToken(token as string, otp as string)) {
            return res.status(501).json({
                success: false,
                message: 'Account cannot be verified.',
            })
        }

        const decodedToken = jwt.verify(token as string, process.env.JWT_SECRET!) as JwtPayload;

        const user = await prisma.user.findUnique({ where: { id: (decodedToken as any).id } });
        if(!user) return;
        // create new token for access the dashboard
        const { accessToken, refreshToken } = await generateTokens(user);

        return res.status(200)
            .cookie("access_token", accessToken, {
                httpOnly: true,
                maxAge: 5 * 60 * 1000 // 5 minutes
            })
            .cookie("refresh_token", refreshToken, {
                httpOnly: true,
                maxAge: 59 * 60 * 1000 // 59 minutes
            })
            .json({
                success: true,
                message: 'Account verified successfully.',
                token: accessToken
            })

    } catch (error: any) {
        console.log(error);
        return next(new ErrorHandler(400, error.message));
    }
});

export const reverifyUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {

    } catch (error: any) {
        console.log(error);
        return next(new ErrorHandler(400, error.message));
    }
})

export const refreshAccessToken = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    const refreshToken = req.cookies.refresh_token || req.body.refresh_token;

    if (!refreshToken) {
        return next(new ErrorHandler(401, "No refresh token provided"));
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded || typeof decoded === "string") {
        return next(new ErrorHandler(403, "Invalid or expired refresh token"));
    }

    const user = await prisma.user.findUnique({ where: { id: (decoded as any).id } });
    if (!user) {
        return next(new ErrorHandler(404, "User not found"));
    }

    const { accessToken } = await generateTokens(user);

    res
        .cookie("access_token", accessToken, {
            httpOnly: true,
            maxAge: 5 * 60 * 1000
        })
        .json({
            success: true,
            accessToken
        });
});

export const loginUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(new ErrorHandler(400, "Email and password are required"));
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        return next(new ErrorHandler(400, "Invalid email or password"));
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
        return next(new ErrorHandler(400, "Invalid email or password"));
    }

    if (!user.isVerified) {
        return next(new ErrorHandler(403, "Please verify your account first"));
    }

    const { accessToken, refreshToken } = await generateTokens(user);

    const existingData = (user.extended as Prisma.JsonObject) || {};
    await prisma.user.update({
        where: { id: user.id },
        data: {
            extended: {
                ...existingData,
                refreshToken,
            },
        },
    });


    return res
        .status(200)
        .cookie("access_token", accessToken, {
            httpOnly: true,
            maxAge: 5 * 60 * 1000 // 5 minutes
        })
        .cookie("refresh_token", refreshToken, {
            httpOnly: true,
            maxAge: 59 * 60 * 1000 // 59 minutes
        })
        .json({
            success: true,
            message: "Login successful",
            accessToken,
            refreshToken
        });
});
