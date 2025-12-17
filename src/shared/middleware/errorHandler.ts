import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { Logger } from '../../infrastructure/logging/WinstonLogger';

/**
 * Global error handler middleware
 * Must have 4 parameters per Express.js documentation
 * Per plan.md Implementation Guidelines (lines 405-429)
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const correlationId = (req as any).correlationId || 'unknown';

  // Log the error
  Logger.error('Request error', {
    message: err.message,
    stack: err.stack,
    correlationId,
    path: req.path,
    method: req.method,
  });

  // Determine status code and message
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message =
    err instanceof AppError && err.isOperational ? err.message : 'Internal Server Error';

  // Build error response
  const errorResponse: any = {
    error: err.name || 'INTERNAL_SERVER_ERROR',
    message,
    correlation_id: correlationId,
  };

  // Include details if available
  if (err instanceof AppError && err.details) {
    errorResponse.details = err.details;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  res.status(statusCode).json(errorResponse);
};
