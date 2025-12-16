import { Request, Response, NextFunction } from 'express';
import { Logger } from '../../infrastructure/logging/WinstonLogger';

/**
 * Extended Request interface with tenant context
 */
export interface TenantRequest extends Request {
  tenantId?: string;
  correlationId?: string;
}

/**
 * Tenant context middleware
 * Extracts tenant_id from JWT/API key and attaches to request
 * Per plan.md Implementation Guidelines (lines 373-402)
 */
export const tenantContext = async (
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Generate correlation ID for request tracking
    const correlationId = req.headers['x-request-id'] as string ||
                          req.headers['x-correlation-id'] as string ||
                          `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    req.correlationId = correlationId;

    // Extract API key from header
    const apiKey = req.headers['x-api-key'] as string;
    const authHeader = req.headers['authorization'] as string;

    if (!apiKey && !authHeader) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required. Provide JWT bearer token or API key.',
        correlation_id: correlationId,
      });
      return;
    }

    // TODO: In production, validate API key/JWT and extract tenant_id
    // For now, use a test tenant ID
    // This should be replaced with actual authentication service integration
    let tenantId: string | null = null;

    if (apiKey) {
      // Simple API key validation for development
      // Format: "test-api-key-{tenant_id}"
      if (apiKey.startsWith('test-api-key-')) {
        tenantId = apiKey.replace('test-api-key-', '');
      } else if (apiKey === 'test-token') {
        // Default test tenant
        tenantId = '550e8400-e29b-41d4-a716-446655440000';
      }
    } else if (authHeader?.startsWith('Bearer ')) {
      // JWT token validation would go here
      // For now, accept any Bearer token and use default tenant
      tenantId = '550e8400-e29b-41d4-a716-446655440000';
    }

    if (!tenantId) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Invalid API key or token',
        correlation_id: correlationId,
      });
      return;
    }

    req.tenantId = tenantId;

    Logger.debug('Tenant context established', {
      tenantId,
      correlationId,
      path: req.path,
    });

    next();
  } catch (error) {
    Logger.error('Error in tenant context middleware', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.correlationId,
    });
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An error occurred while processing your request',
      correlation_id: req.correlationId,
    });
  }
};
