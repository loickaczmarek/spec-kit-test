import { Router } from 'express';

/**
 * API route aggregation
 * Central place to register all API routes
 */
export function registerRoutes(): Router {
  const router = Router();

  // Health check is already registered in app.ts

  // TODO: Register ticket routes
  // router.use('/v1', ticketRoutes);

  // TODO: Register facility routes
  // router.use('/v1', facilityRoutes);

  return router;
}
