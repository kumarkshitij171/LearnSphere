import { NextFunction, Request, Response } from 'express';
import ErrorHandler from '../utils/ErrorHandler';

export const ErrorMiddleWare = (err: any, req: Request, res: Response, next: NextFunction) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || 'Internal Server Error';

    // wrong prisma client connection
    if (err.message.includes('prisma')) {
        err.message = 'Internal Server Error';
        err.statusCode = 500;
        err = new ErrorHandler(err.statusCode, err.message);
    }
    // duplicate key error
    if (err.code === 11000) {
        err.message = `Duplicate ${Object.keys(err.keyValue)} entered`;
        err.statusCode = 400;
        err = new ErrorHandler(err.statusCode, err.message);
    }

    // wrong jwt token
    if (err.name === 'JsonWebTokenError') {
        err.message = 'Json Web Token is invalid. Try again';
        err.statusCode = 401;
        err = new ErrorHandler(err.statusCode, err.message);
    }

    // jwt expire error
    if (err.name === 'TokenExpiredError') {
        err.message = 'Json Web Token is expired. Try again';
        err.statusCode = 401;
        err = new ErrorHandler(err.statusCode, err.message);
    }

    // validation error
    if (err.name === 'ValidationError') {
        let message = Object.values(err.errors).map((val: any) => val.message);
        err.message = message;
        err.statusCode = 400;
        err = new ErrorHandler(err.statusCode, err.message);
    }

    res.status(err.statusCode).json({
        success: false,
        message: err.message,
        ...(err.details ?? {}),
    });
}