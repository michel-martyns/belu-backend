import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { INestApplication, Logger } from '@nestjs/common';
import { QueuesService } from './queues.service';

const logger = new Logger('BullBoard');

/**
 * Configura o Bull Board para monitoramento das filas
 * Acessível em /admin/queues
 */
export function configureBullBoard(app: INestApplication): void {
  try {
    const queuesService = app.get(QueuesService);
    const queues = queuesService.getAllQueues();

    if (queues.length === 0) {
      logger.warn('No queues found for Bull Board');
      return;
    }

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    const adapters = queues.map((queue: Queue) => new BullMQAdapter(queue));

    createBullBoard({
      queues: adapters,
      serverAdapter,
    });

    // Obter o app Express subjacente
    const httpAdapter = app.getHttpAdapter();
    const expressApp = httpAdapter.getInstance();

    // Adicionar middleware de autenticação básica para Bull Board
    expressApp.use('/admin/queues', (req: any, res: any, next: any) => {
      // Em produção, adicionar autenticação adequada
      const authHeader = req.headers.authorization;

      if (process.env.NODE_ENV === 'production') {
        // Verificar autenticação básica
        if (!authHeader || !authHeader.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
          return res.status(401).send('Authentication required');
        }

        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');

        const expectedUser = process.env.BULL_BOARD_USER || 'admin';
        const expectedPass = process.env.BULL_BOARD_PASSWORD || 'admin123';

        if (username !== expectedUser || password !== expectedPass) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
          return res.status(401).send('Invalid credentials');
        }
      }

      next();
    });

    expressApp.use('/admin/queues', serverAdapter.getRouter());

    logger.log(`Bull Board configured at /admin/queues with ${queues.length} queues`);
  } catch (error) {
    logger.error(`Failed to configure Bull Board: ${error.message}`);
  }
}
