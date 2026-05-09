import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private config: ConfigService,
        private redis: RedisService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (req) => req?.cookies?.access_token,
                ExtractJwt.fromAuthHeaderAsBearerToken(),
            ]),
            secretOrKey: config.get<string>('ACCESS_TOKEN_SECRET')!,
        });
    }

    async validate(payload: { id: string }) {
        const session = await this.redis.get(payload.id);
        if (!session) throw new UnauthorizedException('Session expired');
        return JSON.parse(session);
    }
}
