import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private client: Redis;

    constructor(private config: ConfigService) {}

    onModuleInit() {
        this.client = new Redis(this.config.get<string>('REDIS_URI')!);
    }

    async onModuleDestroy() {
        await this.client.quit();
    }

    get(key: string) { return this.client.get(key); }
    set(key: string, value: string, ttlSeconds?: number) {
        return ttlSeconds
            ? this.client.setex(key, ttlSeconds, value)
            : this.client.set(key, value);
    }
    del(key: string) { return this.client.del(key); }
    incr(key: string) { return this.client.incr(key); }
    publish(channel: string, message: string) { return this.client.publish(channel, message); }
}
