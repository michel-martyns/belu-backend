import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QueuesService } from './queues.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { QUEUE_NAMES } from './queues.constants';

@Controller('queues')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  /**
   * Obtém estatísticas de todas as filas
   * GET /api/queues/stats
   */
  @Get('stats')
  async getAllStats() {
    const stats = await this.queuesService.getAllQueueStats();
    return {
      queues: stats,
      summary: {
        totalQueues: stats.length,
        totalWaiting: stats.reduce((acc, q) => acc + q.waiting, 0),
        totalActive: stats.reduce((acc, q) => acc + q.active, 0),
        totalCompleted: stats.reduce((acc, q) => acc + q.completed, 0),
        totalFailed: stats.reduce((acc, q) => acc + q.failed, 0),
        totalDelayed: stats.reduce((acc, q) => acc + q.delayed, 0),
      },
    };
  }

  /**
   * Obtém estatísticas de uma fila específica
   * GET /api/queues/:queueName/stats
   */
  @Get(':queueName/stats')
  async getQueueStats(@Param('queueName') queueName: string) {
    this.validateQueueName(queueName);
    return this.queuesService.getQueueStats(queueName);
  }

  /**
   * Pausa uma fila
   * POST /api/queues/:queueName/pause
   */
  @Post(':queueName/pause')
  @HttpCode(HttpStatus.OK)
  async pauseQueue(@Param('queueName') queueName: string) {
    this.validateQueueName(queueName);
    await this.queuesService.pauseQueue(queueName);
    return { message: `Queue ${queueName} paused` };
  }

  /**
   * Resume uma fila
   * POST /api/queues/:queueName/resume
   */
  @Post(':queueName/resume')
  @HttpCode(HttpStatus.OK)
  async resumeQueue(@Param('queueName') queueName: string) {
    this.validateQueueName(queueName);
    await this.queuesService.resumeQueue(queueName);
    return { message: `Queue ${queueName} resumed` };
  }

  /**
   * Limpa uma fila (jobs completos e falhos)
   * POST /api/queues/:queueName/clean
   */
  @Post(':queueName/clean')
  @HttpCode(HttpStatus.OK)
  async cleanQueue(@Param('queueName') queueName: string) {
    this.validateQueueName(queueName);
    await this.queuesService.cleanQueue(queueName);
    return { message: `Queue ${queueName} cleaned` };
  }

  /**
   * Remove um job específico
   * DELETE /api/queues/:queueName/jobs/:jobId
   */
  @Delete(':queueName/jobs/:jobId')
  async removeJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    this.validateQueueName(queueName);
    await this.queuesService.removeJob(queueName, jobId);
    return { message: `Job ${jobId} removed from queue ${queueName}` };
  }

  /**
   * Retry um job falho
   * POST /api/queues/:queueName/jobs/:jobId/retry
   */
  @Post(':queueName/jobs/:jobId/retry')
  @HttpCode(HttpStatus.OK)
  async retryJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    this.validateQueueName(queueName);
    await this.queuesService.retryJob(queueName, jobId);
    return { message: `Job ${jobId} retried in queue ${queueName}` };
  }

  /**
   * Lista todas as filas disponíveis
   * GET /api/queues
   */
  @Get()
  listQueues() {
    return {
      queues: Object.values(QUEUE_NAMES),
      description: {
        [QUEUE_NAMES.EMAIL]: 'Fila de envio de emails',
        [QUEUE_NAMES.NOTIFICATION]: 'Fila de notificações (multi-canal)',
        [QUEUE_NAMES.WHATSAPP]: 'Fila de mensagens WhatsApp',
        [QUEUE_NAMES.BILLING]: 'Fila de processamento de cobrança',
        [QUEUE_NAMES.REPORTS]: 'Fila de geração de relatórios',
      },
    };
  }

  private validateQueueName(queueName: string): void {
    const validQueues = Object.values(QUEUE_NAMES);
    if (!validQueues.includes(queueName as any)) {
      throw new Error(
        `Invalid queue name: ${queueName}. Valid queues: ${validQueues.join(', ')}`,
      );
    }
  }
}
