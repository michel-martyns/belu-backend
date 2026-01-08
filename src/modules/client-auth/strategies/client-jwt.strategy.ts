import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ClientJwtPayload {
  sub: string; // clientId
  email: string;
  tenantId: string;
  type: 'CLIENT';
}

@Injectable()
export class ClientJwtStrategy extends PassportStrategy(Strategy, 'client-jwt') {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // Usa um secret separado para clientes ou o mesmo se não configurado
    const secret =
      configService.get<string>('CLIENT_JWT_SECRET') ||
      configService.get<string>('JWT_SECRET') ||
      'fallback-secret';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: ClientJwtPayload) {
    // Verifica se é um token de cliente
    if (payload.type !== 'CLIENT') {
      throw new UnauthorizedException('Token inválido para cliente');
    }

    const client = await this.prisma.client.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!client) {
      throw new UnauthorizedException('Cliente não encontrado');
    }

    if (client.deletedAt) {
      throw new UnauthorizedException('Conta desativada');
    }

    if (!client.tenant.isActive) {
      throw new UnauthorizedException('Clínica desativada');
    }

    return {
      id: client.id,
      tenantId: client.tenantId,
      email: client.email,
      name: client.name,
      phone: client.phone,
      type: 'CLIENT' as const,
    };
  }
}
