import { NextFunction, Request, Response } from "express";
import { catchAsyncError } from "./catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import jwt, { JwtPayload } from 'jsonwebtoken';
import { Iuser } from "../interfaces/user.interface";

export const isAuthenticated = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    // Support both cookie (web) and Authorization header or body (mobile)
    const access_token = req.cookies.access_token || 
                       req.headers.authorization?.replace('Bearer ', '') || 
                       req.body.access_token;
    
    if (!access_token) {
        return next(new ErrorHandler(401, "Please login using the access token"));
    }
    
    try {
        const decodedToken = jwt.verify(access_token, process.env.ACCESS_TOKEN_SECRET!) as JwtPayload;
        
        if (!decodedToken || !decodedToken.id) {
            return next(new ErrorHandler(401, "Access token is not valid"));
        }
        
        req.user = {
            id: decodedToken.id,
            email: decodedToken.email,
            role: decodedToken.role,
        } as Iuser;

        next();
    } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
            return next(new ErrorHandler(401, "Invalid access token"));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new ErrorHandler(401, "Access token expired. Please refresh your token"));
        }
        return next(new ErrorHandler(401, "Authentication failed"));
    }
})

// checking this role has the access to that resources or not!
export const authorizedRoles = (...roles: string[]) => {
    return catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
        // check in the req.user -> role 
        if (!req?.user?.role) {
            return next(new ErrorHandler(403, "User role not found"));
        }

        // Admin has every permission.
        if (req.user.role === 'ADMIN') return next();

        if (!roles.includes(req.user.role)) {
            return next(new ErrorHandler(403, `Role ${req.user.role} is not allowed to access this resource`));
        }
        next();
    });
}