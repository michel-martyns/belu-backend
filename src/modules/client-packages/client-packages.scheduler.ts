import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientPackagesService } from './client-packages.service';

@Injectable()
export class ClientPackagesScheduler {
  private readonly logger = new Logger(ClientPackagesScheduler.name);

  constructor(private readonly packagesService: ClientPackagesService) {}

  // Executa todos os dias à meia-noite para expirar pacotes
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handlePackageExpiration() {
    this.logger.log('Iniciando verificação de pacotes expirados...');

    try {
      const count = await this.packagesService.expirePackages();

      if (count > 0) {
        this.logger.log(`${count} pacote(s) marcado(s) como expirado(s)`);
      } else {
        this.logger.log('Nenhum pacote expirado');
      }
    } catch (error) {
      this.logger.error('Erro ao processar pacotes expirados:', error);
    }
  }
}
