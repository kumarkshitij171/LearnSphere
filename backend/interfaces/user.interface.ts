
export interface Iuser {
    id: string;
    email: string;
    name: string;
    role: string;
    isVerified: boolean;
    password: string;
    courses: string[];
    avatar?: string | null;
    createdAt: Date;
    updatedAt: Date;
}