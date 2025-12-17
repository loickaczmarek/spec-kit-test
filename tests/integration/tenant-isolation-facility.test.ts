import request from 'supertest';
import express from 'express';
import ticketRoutes from '../../src/ticketing/api/ticketRoutes';
import { errorHandler } from '../../src/shared/middleware/errorHandler';
import { prisma } from '../../src/infrastructure/database/PrismaClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Integration test for User Story 3 - Cross-Tenant Facility Access
 * Per tasks.md T075
 *
 * Scenario: Tenant A tries to access Tenant B's facility → 403 Forbidden
 */

const app = express();
app.use(express.json());
app.use('/v1', ticketRoutes);
app.use(errorHandler); // Add error handler middleware

describe('User Story 3 - Cross-Tenant Facility Access', () => {
  let tenantAId: string;
  let tenantBId: string;
  let facilityAId: string;
  let facilityBId: string;

  beforeAll(async () => {
    // Create Tenant A
    tenantAId = uuidv4();
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: 'Tenant A - City of Paris',
        slug: `tenant-a-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    // Create Tenant B
    tenantBId = uuidv4();
    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: 'Tenant B - City of Lyon',
        slug: `tenant-b-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    // Create Facility for Tenant A
    facilityAId = uuidv4();
    await prisma.facility.create({
      data: {
        id: facilityAId,
        tenant_id: tenantAId,
        name: 'Paris Facility A',
        address: '123 Rue de Paris',
        timezone: 'Europe/Paris',
        total_spots: 10,
        status: 'ACTIVE',
      },
    });

    // Create spots for Facility A (Tenant A)
    await prisma.spot.createMany({
      data: [
        {
          id: uuidv4(),
          facility_id: facilityAId,
          spot_number: 'A-1',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        },
        {
          id: uuidv4(),
          facility_id: facilityAId,
          spot_number: 'A-2',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        },
      ],
    });

    // Create Facility for Tenant B
    facilityBId = uuidv4();
    await prisma.facility.create({
      data: {
        id: facilityBId,
        tenant_id: tenantBId,
        name: 'Lyon Facility B',
        address: '456 Rue de Lyon',
        timezone: 'Europe/Paris',
        total_spots: 10,
        status: 'ACTIVE',
      },
    });

    // Create spots for Facility B (Tenant B)
    await prisma.spot.createMany({
      data: [
        {
          id: uuidv4(),
          facility_id: facilityBId,
          spot_number: 'B-1',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        },
        {
          id: uuidv4(),
          facility_id: facilityBId,
          spot_number: 'B-2',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        },
      ],
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.ticket.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
    await prisma.spot.deleteMany({ where: { facility_id: { in: [facilityAId, facilityBId] } } });
    await prisma.facility.deleteMany({ where: { id: { in: [facilityAId, facilityBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  });

  it('should reject cross-tenant facility access with 404', async () => {
    // Tenant A tries to issue ticket for Facility B (owned by Tenant B)
    const response = await request(app)
      .post(`/v1/facilities/${facilityBId}/tickets`)
      .set('x-api-key', `test-api-key-${tenantAId}`) // Tenant A's API key
      .send({
        vehicle_type: 'voiture',
      });

    // Should return 404 because facility doesn't exist for Tenant A's context
    expect(response.status).toBe(404);
    // Check for either error or message field (depends on error handler implementation)
    expect(response.body.message || response.body.error).toBeDefined();
  });

  it('should allow same-tenant facility access with 201', async () => {
    // Tenant A issues ticket for their own Facility A
    const response = await request(app)
      .post(`/v1/facilities/${facilityAId}/tickets`)
      .set('x-api-key', `test-api-key-${tenantAId}`) // Tenant A's API key
      .send({
        vehicle_type: 'voiture',
      });

    // Should succeed
    expect(response.status).toBe(201);
    expect(response.body.ticket_id).toBeDefined();
    expect(response.body.facility_id).toBe(facilityAId);
  });

  it('should prevent Tenant B from accessing Tenant A facility', async () => {
    // Tenant B tries to issue ticket for Facility A (owned by Tenant A)
    const response = await request(app)
      .post(`/v1/facilities/${facilityAId}/tickets`)
      .set('x-api-key', `test-api-key-${tenantBId}`) // Tenant B's API key
      .send({
        vehicle_type: 'voiture',
      });

    // Should return 404 because facility doesn't exist for Tenant B's context
    expect(response.status).toBe(404);
    // Check for either error or message field (depends on error handler implementation)
    expect(response.body.message || response.body.error).toBeDefined();
  });
});
