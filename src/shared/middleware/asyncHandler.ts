import { Request, Response, NextFunction } from 'express';

/**
 * Async error handler wrapper
 * Wraps async route handlers to catch promise rejections
 * Per plan.md Implementation Guidelines (lines 353-363)
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
