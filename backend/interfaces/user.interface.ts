import { Prisma } from "@prisma/client";

export interface Iuser {
    id: string;
    email: string;
    name: string;
    role: string;
    isVerified: boolean;
    password: string;
    courses: string[];
    avatar?: string | null;
    extended?: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
}