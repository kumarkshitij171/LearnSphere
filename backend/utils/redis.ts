import { Redis } from "ioredis";

// Lazy client so importing this module never crashes boot when REDIS_URI is unset.
let client: Redis | null = null;

export const getRedis = (): Redis => {
    if (!client) {
        if (!process.env.REDIS_URI) {
            throw new Error("REDIS_URI is not defined");
        }
        client = new Redis(process.env.REDIS_URI);
    }
    return client;
};
