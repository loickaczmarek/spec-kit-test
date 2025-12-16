import { PrismaClient as BasePrismaClient } from '@prisma/client';
import { Logger } from '../logging/WinstonLogger';

/**
 * Prisma client singleton with connection pooling
 * Configured per plan.md Implementation Guidelines
 */
class PrismaClientSingleton {
  private static instance: BasePrismaClient;

  static getInstance(): BasePrismaClient {
    if (!PrismaClientSingleton.instance) {
      PrismaClientSingleton.instance = new BasePrismaClient({
        log: [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
      });

      // Log queries in debug mode
      if (process.env.LOG_LEVEL === 'debug') {
        PrismaClientSingleton.instance.$on('query' as never, (e: any) => {
          Logger.debug('Prisma Query', {
            query: e.query,
            params: e.params,
            duration: `${e.duration}ms`,
          });
        });
      }

      // Log errors
      PrismaClientSingleton.instance.$on('error' as never, (e: any) => {
        Logger.error('Prisma Error', { message: e.message });
      });

      // Log warnings
      PrismaClientSingleton.instance.$on('warn' as never, (e: any) => {
        Logger.warn('Prisma Warning', { message: e.message });
      });

      Logger.info('Prisma Client initialized');
    }

    return PrismaClientSingleton.instance;
  }

  static async disconnect(): Promise<void> {
    if (PrismaClientSingleton.instance) {
      await PrismaClientSingleton.instance.$disconnect();
      Logger.info('Prisma Client disconnected');
    }
  }
}

export const prisma = PrismaClientSingleton.getInstance();
export { PrismaClientSingleton };
