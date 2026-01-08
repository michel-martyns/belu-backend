import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DigitalSignatureService } from './digital-signature.service';

@Injectable()
export class DigitalSignatureScheduler {
  private readonly logger = new Logger(DigitalSignatureScheduler.name);

  constructor(private readonly signatureService: DigitalSignatureService) {}

  // Executa a cada hora para expirar solicitações
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiration() {
    this.logger.log('Verificando solicitações de assinatura expiradas...');

    try {
      const count = await this.signatureService.expireSignatureRequests();

      if (count > 0) {
        this.logger.log(`${count} solicitação(ões) marcada(s) como expirada(s)`);
      }
    } catch (error) {
      this.logger.error('Erro ao processar expirações:', error);
    }
  }
}
