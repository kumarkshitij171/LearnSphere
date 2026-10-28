import Joi from 'joi';
import ErrorHandler from './ErrorHandler';

// User registration validation schema
export const registerUserSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .pattern(/^[a-zA-Z\s]+$/)
        .required()
        .messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be at least 2 characters long',
            'string.max': 'Name must be less than 50 characters',
            'string.pattern.base': 'Name can only contain letters and spaces',
            'any.required': 'Name is required'
        }),
    email: Joi.string()
        .email({ tlds: { allow: false } })
        .trim()
        .lowercase()
        .max(255)
        .required()
        .messages({
            'string.empty': 'Email is required',
            'string.email': 'Please provide a valid email address',
            'string.max': 'Email must be less than 255 characters',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .min(8)
        .max(128)
        .required()
        .messages({
            'string.empty': 'Password is required',
            'string.min': 'Password must be at least 8 characters long',
            'string.max': 'Password must be less than 128 characters',
            'any.required': 'Password is required'
        }),
    avatar: Joi.string()
        .uri()
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Avatar must be a valid URL'
        })
});

// User login validation schema
export const loginUserSchema = Joi.object({
    email: Joi.string()
        .email({ tlds: { allow: false } })
        .trim()
        .lowercase()
        .required()
        .messages({
            'string.empty': 'Email is required',
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string()
        .required()
        .messages({
            'string.empty': 'Password is required',
            'any.required': 'Password is required'
        })
});

// Email verification validation schema
export const verifyUserSchema = Joi.object({
    otp: Joi.string()
        .pattern(/^\d{6}$/)
        .required()
        .messages({
            'string.empty': 'OTP is required',
            'string.pattern.base': 'OTP must be a 6-digit number',
            'any.required': 'OTP is required'
        }),
    token: Joi.string()
        .optional() // Token can come from header, so make it optional in body
        .allow('')
        .messages({
            'string.empty': 'Token is required',
        })
});

// Refresh token validation schema
export const refreshTokenSchema = Joi.object({
    refresh_token: Joi.string()
        .optional()
        .allow('')
});

// Course creation validation schema
// 0 is free. A paid price starts at 1 because Razorpay cannot charge less than ₹1, so a ₹0.50
// course would create orders no gateway can capture.
export const MAX_COURSE_PRICE = 500000;
const coursePrice = Joi.number()
    .min(0)
    .max(MAX_COURSE_PRICE)
    .custom((value: number, helpers) => {
        if (value > 0 && value < 1) return helpers.error('price.belowMinimum');
        // compare with a tolerance: 19.99 * 100 is 1998.9999999999998 in floating point
        if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) return helpers.error('price.precision');
        return value;
    })
    .messages({
        'number.base': 'Price must be a number',
        'number.min': 'Price cannot be negative',
        'number.max': 'Price cannot be more than 5,00,000',
        'price.belowMinimum': 'A paid course must cost at least 1 (use 0 for a free course)',
        'price.precision': 'Price can have at most two decimal places',
    });

export const createCourseSchema = Joi.object({
    title: Joi.string().trim().min(3).max(150).required().messages({
        'string.empty': 'Title is required',
        'string.min': 'Title must be at least 3 characters long',
        'any.required': 'Title is required'
    }),
    description: Joi.string().trim().min(10).max(5000).required().messages({
        'string.empty': 'Description is required',
        'string.min': 'Description must be at least 10 characters long',
        'any.required': 'Description is required'
    }),
    price: coursePrice.optional()
});

// Course update validation schema (all fields optional). The thumbnail is set only through its
// upload endpoints, never as a free-form URL.
export const updateCourseSchema = Joi.object({
    title: Joi.string().trim().min(3).max(150).optional(),
    description: Joi.string().trim().min(10).max(5000).optional(),
    price: coursePrice.optional(),
    isPublished: Joi.boolean().optional()
}).min(1);

// Course and lesson thumbnails: content type → the extension its S3 key gets
export const THUMBNAIL_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type ThumbnailContentType = keyof typeof THUMBNAIL_TYPES;

export const thumbnailPresignSchema = Joi.object({
    contentType: Joi.string().valid(...Object.keys(THUMBNAIL_TYPES)).required().messages({
        'any.only': 'A thumbnail must be a JPEG, PNG or WebP image',
        'any.required': 'contentType is required'
    })
});

export const thumbnailConfirmSchema = Joi.object({
    key: Joi.string().max(512).required().messages({ 'any.required': 'key is required' })
});

// Video update validation schema (title/description only; all optional)
export const updateVideoSchema = Joi.object({
    title: Joi.string().trim().min(1).max(200).optional(),
    description: Joi.string().trim().max(5000).optional().allow(null, '')
}).min(1);

// Optional fields of the transcoder's /processed callback
export const TRANSCODE_ERROR_CODES = ['CORRUPT_OR_UNSUPPORTED', 'SOURCE_MISSING', 'GAVE_UP', 'UNKNOWN'] as const;
export type TranscodeErrorCode = (typeof TRANSCODE_ERROR_CODES)[number];
// a type, not an interface, so it is assignable to Prisma's JSON input
export type RenditionReport = { label: string; width: number; height: number; bandwidth: number };

const transcodeReportSchemas = {
    duration: Joi.number().integer().min(0),
    resolutions: Joi.array().min(1).max(16).items(Joi.object({
        label: Joi.string().pattern(/^\d+p$/).required(),
        width: Joi.number().integer().positive().required(),
        height: Joi.number().integer().positive().required(),
        bandwidth: Joi.number().integer().positive().required()
    })),
    errorCode: Joi.string().valid(...TRANSCODE_ERROR_CODES)
};

/**
 * The well-formed optional fields of a transcoder report. A malformed one is dropped and named in
 * `ignored` rather than rejected: a 4xx is final for the transcoder, and must not cost a video its READY.
 */
export const transcodeReportExtras = (body: Record<string, unknown> = {}) => {
    const ignored: string[] = [];
    const pick = <T>(field: keyof typeof transcodeReportSchemas): T | undefined => {
        if (body[field] === undefined || body[field] === null) return undefined;
        const { error, value } = transcodeReportSchemas[field].validate(body[field], { convert: false, stripUnknown: true });
        if (error) ignored.push(field);
        return error ? undefined : (value as T);
    };
    return {
        duration: pick<number>('duration'),
        resolutions: pick<RenditionReport[]>('resolutions'),
        errorCode: pick<TranscodeErrorCode>('errorCode'),
        ignored
    };
};

// Validation middleware
export const validate = (schema: Joi.ObjectSchema) => {
    return (req: any, res: any, next: any) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessages = error.details.map((detail) => detail.message).join('. ');
            return next(new ErrorHandler(400, errorMessages));
        }

        req.body = value;
        next();
    };
};

// Query validation middleware (for GET requests)
export const validateQuery = (schema: Joi.ObjectSchema) => {
    return (req: any, res: any, next: any) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessages = error.details.map((detail) => detail.message).join('. ');
            return next(new ErrorHandler(400, errorMessages));
        }

        req.query = value;
        next();
    };
};

// Validation middleware for verify endpoint (supports token from header, body, or query)
export const validateVerify = (schema: Joi.ObjectSchema) => {
    return (req: any, res: any, next: any) => {
        // Check token from multiple sources: header, body, query, or cookie
        const tokenFromHeader = req.headers.authorization?.replace('Bearer ', '') || 
                               req.headers['x-verification-token'] || 
                               req.headers['x-token'];
        
        // Merge body and query for validation
        const dataToValidate = {
            ...req.body,
            ...req.query,
            // If token is in header, add it to validation data
            ...(tokenFromHeader && !req.body.token && !req.query.token ? { token: tokenFromHeader } : {})
        };

        const { error, value } = schema.validate(dataToValidate, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errorMessages = error.details.map((detail) => detail.message).join('. ');
            return next(new ErrorHandler(400, errorMessages));
        }

        // Ensure token is present from at least one source
        const token = tokenFromHeader || value.token || req.cookies.token;
        if (!token) {
            return next(new ErrorHandler(400, 'Token is required. Provide it in header (Authorization: Bearer <token> or x-verification-token), body, query, or cookie'));
        }

        // Update req.body and req.query with validated values
        if (req.method === 'POST') {
            req.body = { ...value, token };
        } else {
            req.query = { ...value, token };
        }
        
        next();
    };
};

