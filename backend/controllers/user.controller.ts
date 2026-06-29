import { NextFunction, Request, Response } from "express";
import { catchAsyncError } from "../middleware/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { Prisma, PrismaClient } from "@prisma/client";
import { sendMail } from "../utils/sendMail";
import { createActivationToken, encryptedPassword, generateAccessToken, generateTokens, hashToken, verifyPassword, verifyRefreshToken, verifyToken } from "../services/user.service";
import jwt, { JwtPayload } from 'jsonwebtoken';
import { validatePassword } from "../utils/passwordValidation";

const prisma = new PrismaClient();

const REFRESH_COOKIE_PATH = '/api/v1/users/refresh-token';

const refreshTokenOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: REFRESH_COOKIE_PATH,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
}

const deviceContext = (req: Request) => ({
    userAgent: req.headers['user-agent'],
    ip: req.ip,
});

const accessTokenOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 5 * 60 * 1000 // 5 minutes
}

interface IuserRegistration {
    name: string;
    email: string;
    password: string;
    avatar?: string;
}

export const registerUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, email, password }: IuserRegistration = req.body;
        
        // Validate password strength
        validatePassword(password);

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
                role: 'STUDENT',
                isVerified: false,
                courses: []
            }
        })

        // create activation code
        const { token, activationCode } = await createActivationToken(user);
        const activationUrl = `${process.env.CLIENT_URL}/verify?otp=${activationCode}&token=${token}`;

        // send activation mail to user email
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

        // Check if request is from mobile app (check for custom header or user-agent)
        const isMobileApp = req.headers['x-mobile-app'] === 'true' || req.headers['user-agent']?.includes('Mobile');

        // send response - token in body for mobile, cookie for web
        const response = res.status(201);
        
        if (!isMobileApp) {
            // Web app: set cookie
            response.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                expires: new Date(Date.now() + 24 * 60 * 60 * 5000) // 5 days
            });
        }

        return response.json({
            success: true,
            message: 'Account created successfully. Please verify your email to activate your account',
            ...(isMobileApp && { token }) // Only include token in body for mobile
        })

    } catch (error: any) {
        console.log(error);
        return next(new ErrorHandler(400, error.message));
    }
});

export const verifyUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Support token from multiple sources: header, body, query, or cookie
        const authHeader = req.headers.authorization;
        const token = 
            (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null) ||
            (req.headers['x-verification-token'] as string) ||
            (req.headers['x-token'] as string) ||
            req.cookies.token || 
            req.body.token || 
            req.query.token;
        
        // Support both query (GET) and body (POST) for backward compatibility
        const otp = req.method === 'POST' ? req.body.otp : req.query.otp;

        if (!otp || !token) {
            return next(new ErrorHandler(400, 'OTP and Token are required'));
        }

        if (!await verifyToken(token as string, otp as string)) {
            return next(new ErrorHandler(400, 'Account cannot be verified. Invalid OTP or token.'));
        }

        const decodedToken = jwt.verify(token as string, process.env.JWT_SECRET!) as JwtPayload;

        if(!decodedToken){
            return next(new ErrorHandler(400, "Token is not valid"));
        }

        const user = await prisma.user.findUnique({ where: { id: (decodedToken as any).id } });
        
        if(!user) {
            return next(new ErrorHandler(404, "User not found"));
        }

        // Check if request is from mobile app
        const isMobileApp = req.headers['x-mobile-app'] === 'true' || req.headers['user-agent']?.includes('Mobile');

        // create new token for access the dashboard
        const { accessToken, refreshToken } = await generateTokens(user, deviceContext(req));

        const response = res.status(200);
        
        if (!isMobileApp) {
            // Web app: set cookies
            response.cookie("access_token", accessToken, accessTokenOptions)
                    .cookie("refresh_token", refreshToken, refreshTokenOptions);
        }

        return response.json({
            success: true,
            message: 'Account verified successfully.',
            ...(isMobileApp && { 
                accessToken,
                refreshToken 
            })
        })

    } catch (error: any) {
        console.log(error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return next(new ErrorHandler(401, 'Invalid or expired verification token'));
        }
        return next(new ErrorHandler(400, error.message || 'Verification failed'));
    }
});

export const reverifyUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const email = (req.query.email as string)?.trim().toLowerCase();

        if (!email) {
            return next(new ErrorHandler(400, "Email is required"));
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return next(new ErrorHandler(404, "No account found with this email"));
        }

        if (user.isVerified) {
            return next(new ErrorHandler(400, "Account is already verified. Please log in."));
        }

        // create a fresh activation code + token
        const { token, activationCode } = await createActivationToken(user);
        const activationUrl = `${process.env.CLIENT_URL}/verify?otp=${activationCode}&token=${token}`;

        // resend activation mail to user email
        await sendMail({
            email: user.email,
            subject: 'Account Activation',
            template: 'activationMail',
            data: {
                activationCode,
                name: user.name,
                activationUrl
            }
        });

        // Check if request is from mobile app
        const isMobileApp = req.headers['x-mobile-app'] === 'true' || req.headers['user-agent']?.includes('Mobile');

        const response = res.status(200);

        if (!isMobileApp) {
            // Web app: set token cookie so the /verify page can read it (httpOnly)
            response.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                expires: new Date(Date.now() + 24 * 60 * 60 * 5000) // 5 days
            });
        }

        return response.json({
            success: true,
            message: 'Verification email sent. Please check your inbox.',
            ...(isMobileApp && { token })
        });
    } catch (error: any) {
        console.log(error);
        return next(new ErrorHandler(400, error.message));
    }
})

export const refreshAccessToken = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    // Support both cookie (web) and body (mobile)
    const refreshToken = req.cookies.refresh_token || req.body.refresh_token;

    if (!refreshToken) {
        return next(new ErrorHandler(401, "No refresh token provided"));
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded || typeof decoded === "string") {
        return next(new ErrorHandler(401, "Invalid or expired refresh token"));
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
        return next(new ErrorHandler(404, "User not found"));
    }

    // Validate against the single session stored on the user row. The presented
    // token must match the stored SHA-256 hash and not be past its expiry.
    const session = (user.extended as Prisma.JsonObject | null)?.session as
        | { refreshTokenHash?: string; expiresAt?: string }
        | undefined;

    const expired = session?.expiresAt ? new Date(session.expiresAt) <= new Date() : true;
    if (!session?.refreshTokenHash || expired || session.refreshTokenHash !== hashToken(refreshToken)) {
        return next(new ErrorHandler(401, "Session expired. Please login again"));
    }

    // Check if request is from mobile app
    const isMobileApp = req.headers['x-mobile-app'] === 'true' || req.headers['user-agent']?.includes('Mobile');

    // No rotation: mint only a new access token. The refresh token (and its
    // cookie) are left untouched, which also makes concurrent refreshes safe.
    const accessToken = generateAccessToken(user);

    const response = res.status(200);

    if (!isMobileApp) {
        // Web app: refresh only the access-token cookie.
        response.cookie("access_token", accessToken, accessTokenOptions);
    }

    return response.json({
        success: true,
        message: "Token refreshed",
        ...(isMobileApp && { accessToken })
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

    // Check if request is from mobile app
    const isMobileApp = req.headers['x-mobile-app'] === 'true' || req.headers['user-agent']?.includes('Mobile');

    // generateTokens persists the session (hashed refresh token + expiry +
    // device) on the user row, so no separate update is needed here.
    const { accessToken, refreshToken } = await generateTokens(user, deviceContext(req));

    const response = res.status(200);

    if (!isMobileApp) {
        // Web app: set cookies
        response.cookie("access_token", accessToken, accessTokenOptions)
                .cookie("refresh_token", refreshToken, refreshTokenOptions);
    }

    return response.json({
        success: true,
        message: "Login successful",
        ...(isMobileApp && {
            accessToken,
            refreshToken
        })
    });
});

export const getCurrentUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;

    if (!userId) {
        return next(new ErrorHandler(401, "Unauthorized"));
    }

    // isAuthenticated is stateless (only id/email/role from the JWT), so load
    // the full profile from the DB here.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return next(new ErrorHandler(404, "User not found"));
    }

    // Never leak the password hash (or the session secrets) to the client.
    const { password, extended, ...safeUser } = user;

    return res.status(200).json({
        success: true,
        user: safeUser,
    });
});

export const logoutUser = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Clear cookies for web apps. The refresh cookie MUST be cleared at the
        // same scoped path it was set with, or the browser won't delete it.
        res.cookie("access_token", "", {
            maxAge: 1,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        res.cookie("refresh_token", "", {
            maxAge: 1,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: REFRESH_COOKIE_PATH
        });

        const userId = req?.user?.id;
        if (!userId) {
            return next(new ErrorHandler(401, "Unauthorized"));
        }

        // Revoke the session by clearing it from the user row (req.user no longer
        // carries `extended`, so read the current value from the DB).
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const existingData = (user?.extended as Prisma.JsonObject) || {};
        const { session: _removed, ...updatedExtended } = existingData;

        await prisma.user.update({
            where: { id: userId },
            data: {
                extended: updatedExtended,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Logout successful",
        });

    } catch (error: any) {
        return next(new ErrorHandler(400, error.message || "Logout failed"));
    }
});


