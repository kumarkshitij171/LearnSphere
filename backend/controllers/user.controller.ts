import { NextFunction, Request, Response } from "express";
import { catchAsyncError } from "../middleware/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { PrismaClient } from "@prisma/client";
import { Iuser } from "../interfaces/user.interface";
import jwt from 'jsonwebtoken';
import ejs from 'ejs';
import { sendMail } from "../utils/sendMail";
import path from "path";

const prisma = new PrismaClient();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


interface IactivationToken {
    token: string;
    activationCode: string;
}

// Account activation token
const createActivationToken = (user: Iuser): IactivationToken => {
    const activationCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit number
    const token = jwt.sign(
        {
            id: user.id,
            name: user.name,
            activationCode
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

        // create a user with valid interface data
        const userDoc: IuserRegistration = {
            name,
            email,
            password,
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
        const { token, activationCode } = createActivationToken(user);
        const activationMail = ejs.renderFile(path.join(__dirname, "../views/activationMail.ejs"), {
            activationCode,
            name: user.name
        });

        // send activation mail
        await sendMail({
            email: user.email,
            subject: 'Account Activation',
            template: 'activationMail',
            data: {
                activationCode,
                name: user.name
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
})