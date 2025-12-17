import { Request, Response, NextFunction } from 'express';
import { tenantContext, TenantRequest } from '../../../src/shared/middleware/tenantContext';

/**
 * Unit test for tenant context middleware
 * Per tasks.md T078
 *
 * Verifies tenant_id extraction from x-api-key header
 */

describe('Tenant Context Middleware', () => {
  let mockRequest: Partial<TenantRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it('should extract tenant_id from x-api-key header with format test-api-key-{tenant_id}', async () => {
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';
    mockRequest.headers = {
      'x-api-key': `test-api-key-${tenantId}`,
    };

    await tenantContext(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as TenantRequest).tenantId).toBe(tenantId);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should return 401 if x-api-key header is missing', async () => {
    mockRequest.headers = {};

    await tenantContext(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'UNAUTHORIZED',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should use default tenant for test-token API key', async () => {
    mockRequest.headers = {
      'x-api-key': 'test-token',
    };

    await tenantContext(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as TenantRequest).tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should return 403 for invalid API key', async () => {
    mockRequest.headers = {
      'x-api-key': 'invalid-key',
    };

    await tenantContext(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'FORBIDDEN',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should attach correlation_id to request', async () => {
    const tenantId = 'tenant-abc-123';
    mockRequest.headers = {
      'x-api-key': `test-api-key-${tenantId}`,
    };

    await tenantContext(mockRequest as Request, mockResponse as Response, mockNext);

    const tenantRequest = mockRequest as TenantRequest;
    expect(tenantRequest.correlationId).toBeDefined();
    expect(tenantRequest.tenantId).toBe(tenantId);
  });

  it('should handle Bearer token with default tenant', async () => {
    mockRequest.headers = {
      authorization: 'Bearer some-jwt-token',
    };

    await tenantContext(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as TenantRequest).tenantId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('should use x-correlation-id if provided', async () => {
    const correlationId = 'custom-correlation-123';
    const tenantId = '123e4567-e89b-12d3-a456-426614174000';
    mockRequest.headers = {
      'x-api-key': `test-api-key-${tenantId}`,
      'x-correlation-id': correlationId,
    };

    await tenantContext(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as TenantRequest).correlationId).toBe(correlationId);
    expect((mockRequest as TenantRequest).tenantId).toBe(tenantId);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
