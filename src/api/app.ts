import express, { Express } from 'express';
import { errorHandler } from '../shared/middleware/errorHandler';
import { Logger } from '../infrastructure/logging/WinstonLogger';

/**
 * Express app setup with JSON/URL-encoded body parsers
 * Configured per plan.md Implementation Guidelines
 */
export function createApp(): Express {
  const app = express();

  // Body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, _res, next) => {
    Logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });

  // Health check endpoint (no auth required)
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'ticketing-service',
    });
  });

  // API routes
  const ticketRoutes = require('../ticketing/api/ticketRoutes').default;
  app.use('/v1', ticketRoutes);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
