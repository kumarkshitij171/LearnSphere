import { NextFunction, Request, Response } from "express";
import { catchAsyncError } from "../middleware/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { generatePresignedUploadURL } from "../services/s3.service";


export const generatePresignedURL = catchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req?.user?.id;

        if (!userId) {
            return next(new ErrorHandler(400, 'User not found'));
        }

        const {fileName, contentType} = req.body;

        if (!fileName || !contentType) {
            return next(new ErrorHandler(400, 'fileName and contentType are required'));
        }

        const { url, key } = await generatePresignedUploadURL(fileName, contentType, userId);

        return res.status(200).json({ url, key });
    } catch (error: any) {
        console.log(error);
        return next(new ErrorHandler(400, error.message));
    }
})