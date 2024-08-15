import { Redis } from "ioredis"
import dotenv from "dotenv"
dotenv.config()

const redisClient = () => {
    if (process.env.REDIS_URI) {
        console.log("Redis is connected")
        return process.env.REDIS_URI
    }
    // if not have redis url give the error
    throw new Error("Redis URI is not defined")
}

export const redis = new Redis(redisClient())