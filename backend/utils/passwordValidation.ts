import ErrorHandler from "./ErrorHandler";

interface PasswordValidationResult {
    isValid: boolean;
    errors: string[];
}

export const validatePasswordStrength = (password: string): PasswordValidationResult => {
    const errors: string[] = [];

    // Minimum length check
    if (password.length < 8) {
        errors.push("Password must be at least 8 characters long");
    }

    // Maximum length check (prevent DoS)
    if (password.length > 128) {
        errors.push("Password must be less than 128 characters");
    }

    // Uppercase letter check
    if (!/[A-Z]/.test(password)) {
        errors.push("Password must contain at least one uppercase letter");
    }

    // Lowercase letter check
    if (!/[a-z]/.test(password)) {
        errors.push("Password must contain at least one lowercase letter");
    }

    // Number check
    if (!/[0-9]/.test(password)) {
        errors.push("Password must contain at least one number");
    }

    // Special character check
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push("Password must contain at least one special character");
    }

    // Check for common weak passwords
    const commonPasswords = [
        'password', '12345678', 'password123', 'admin123', 'qwerty123',
        'welcome123', 'letmein', 'monkey', '1234567890', 'abc123'
    ];
    if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
        errors.push("Password is too common. Please choose a stronger password");
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

export const validatePassword = (password: string): void => {
    const result = validatePasswordStrength(password);
    if (!result.isValid) {
        throw new ErrorHandler(400, result.errors.join(". "));
    }
};

