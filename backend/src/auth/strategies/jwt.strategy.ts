import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthUser } from '../../common/decorators/current-user.decorator';

const cookieExtractor = (req: Request): string | null => {
  if (req?.cookies?.['access_token']) return req.cookies['access_token'];
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? '',
    });
  }

  validate(payload: { sub: string; email: string; role: string }): AuthUser {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
