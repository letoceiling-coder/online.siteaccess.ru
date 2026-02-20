import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OperatorJwtStrategy extends PassportStrategy(Strategy, 'operator-jwt') {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('OPERATOR_JWT_SECRET') || config.get('JWT_SECRET') || 'dev-secret',
    });
  }

  async validate(payload: any) {
    // Verify membership still exists
    const membership = await (this.prisma as any).channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId: payload.channelId,
          userId: payload.userId,
        },
      },
    });

    if (!membership) {
      throw new UnauthorizedException('Membership not found');
    }

    return {
      userId: payload.userId,
      channelId: payload.channelId,
      role: payload.role,
    };
  }
}
