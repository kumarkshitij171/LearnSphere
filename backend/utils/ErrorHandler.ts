class ErrorHandler extends Error {
    statusCode: Number;
    // extra fields merged into the error body, e.g. { requiresOrder: true }
    details?: Record<string, unknown>;

    constructor(statusCode: Number, message: string, details?: Record<string, unknown>) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;


        ErrorHandler.captureStackTrace(this, this.constructor)
    }

}

export default ErrorHandler
