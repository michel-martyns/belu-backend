import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {} as Record<string, string>,
    };

    // Check database
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.services['database'] = 'healthy';
    } catch {
      checks.services['database'] = 'unhealthy';
      checks.status = 'degraded';
    }

    return checks;
  }

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return { status: 'not ready' };
    }
  }
}
