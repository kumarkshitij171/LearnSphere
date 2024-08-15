import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
dotenv.config();
// prisma client => using Supabase
const DB_URL: string = process.env.DATABASE_URL!

export async function connectDB() {
    // connect to the database using the prisma client

}