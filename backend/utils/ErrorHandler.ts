class ErrorHandler extends Error {
    statusCode: Number;

    constructor(statusCode: Number, message: string) {
        super(message);
        this.statusCode = statusCode;


        ErrorHandler.captureStackTrace(this, this.constructor)
    }

}

export default ErrorHandler