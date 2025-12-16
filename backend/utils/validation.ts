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
        .pattern(/^\d{4}$/)
        .required()
        .messages({
            'string.empty': 'OTP is required',
            'string.pattern.base': 'OTP must be a 4-digit number',
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

