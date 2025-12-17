import { createApp } from './app';
import { Logger } from '../infrastructure/logging/WinstonLogger';
import { PrismaClientSingleton } from '../infrastructure/database/PrismaClient';

const PORT = process.env.PORT || 3000;

/**
 * HTTP server bootstrap with graceful shutdown
 * Per plan.md Implementation Guidelines
 */
async function startServer() {
  try {
    const app = createApp();

    const server = app.listen(PORT, () => {
      Logger.info(`Server listening on http://localhost:${PORT}`);
      Logger.info(`Health check available at http://localhost:${PORT}/health`);
      Logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      Logger.info(`${signal} received, shutting down gracefully...`);

      server.close(async () => {
        Logger.info('HTTP server closed');

        // Close database connection
        await PrismaClientSingleton.disconnect();

        // TODO: Close Redis connection
        // TODO: Close Kafka connection

        Logger.info('All connections closed, exiting process');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        Logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    // Listen for termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    Logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
}

// Start the server
startServer();
