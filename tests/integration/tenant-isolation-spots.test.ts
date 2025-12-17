import request from 'supertest';
import express from 'express';
import ticketRoutes from '../../src/ticketing/api/ticketRoutes';
import { errorHandler } from '../../src/shared/middleware/errorHandler';
import { prisma } from '../../src/infrastructure/database/PrismaClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Integration test for User Story 3 - Spot Availability Isolation
 * Per tasks.md T076
 *
 * Scenario: Tenant A full, Tenant B available →
 *   Tenant A request rejected without considering B's spots
 */

const app = express();
app.use(express.json());
app.use('/v1', ticketRoutes);
app.use(errorHandler); // Add error handler middleware

describe('User Story 3 - Spot Availability Isolation', () => {
  let tenantAId: string;
  let tenantBId: string;
  let facilityAId: string;
  let facilityBId: string;
  let spotAId: string;

  beforeAll(async () => {
    // Create Tenant A
    tenantAId = uuidv4();
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: 'Tenant A - City of Paris',
        slug: `tenant-a-spots-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    // Create Tenant B
    tenantBId = uuidv4();
    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: 'Tenant B - City of Lyon',
        slug: `tenant-b-spots-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    // Create Facility for Tenant A (will be full)
    facilityAId = uuidv4();
    await prisma.facility.create({
      data: {
        id: facilityAId,
        tenant_id: tenantAId,
        name: 'Paris Facility A - Full',
        address: '123 Rue de Paris',
        timezone: 'Europe/Paris',
        total_spots: 1,
        status: 'ACTIVE',
      },
    });

    // Create ONE spot for Facility A (Tenant A) - will be marked as OCCUPIED
    spotAId = uuidv4();
    await prisma.spot.create({
      data: {
        id: spotAId,
        facility_id: facilityAId,
        spot_number: 'A-1',
        vehicle_type: 'CAR',
        status: 'OCCUPIED', // Already occupied!
        version: 1,
      },
    });

    // Create Facility for Tenant B (has available spots)
    facilityBId = uuidv4();
    await prisma.facility.create({
      data: {
        id: facilityBId,
        tenant_id: tenantBId,
        name: 'Lyon Facility B - Available',
        address: '456 Rue de Lyon',
        timezone: 'Europe/Paris',
        total_spots: 10,
        status: 'ACTIVE',
      },
    });

    // Create MANY available spots for Facility B (Tenant B)
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
        {
          id: uuidv4(),
          facility_id: facilityBId,
          spot_number: 'B-3',
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

  it('should reject Tenant A request when their facility is full, even though Tenant B has availability', async () => {
    // Tenant A tries to get a ticket for their full facility
    const response = await request(app)
      .post(`/v1/facilities/${facilityAId}/tickets`)
      .set('x-api-key', `test-api-key-${tenantAId}`) // Tenant A's API key
      .send({
        vehicle_type: 'voiture',
      });

    // Should return 409 NO_SPOTS_AVAILABLE
    // Even though Tenant B has 3 available spots, Tenant A cannot access them
    expect(response.status).toBe(409);
    expect(response.body.message).toContain('Aucune place disponible');
  });

  it('should allow Tenant B to get ticket when they have available spots', async () => {
    // Tenant B can issue tickets for their facility with available spots
    const response = await request(app)
      .post(`/v1/facilities/${facilityBId}/tickets`)
      .set('x-api-key', `test-api-key-${tenantBId}`) // Tenant B's API key
      .send({
        vehicle_type: 'voiture',
      });

    // Should succeed
    expect(response.status).toBe(201);
    expect(response.body.ticket_id).toBeDefined();
    expect(response.body.facility_id).toBe(facilityBId);
  });

  it('should verify spot availability is isolated per tenant', async () => {
    // Count available spots for Tenant A (should be 0)
    const spotCountA = await prisma.spot.count({
      where: {
        facility: { tenant_id: tenantAId },
        vehicle_type: 'CAR',
        status: 'AVAILABLE',
      },
    });
    expect(spotCountA).toBe(0);

    // Count available spots for Tenant B (should be at least 2 remaining)
    const spotCountB = await prisma.spot.count({
      where: {
        facility: { tenant_id: tenantBId },
        vehicle_type: 'CAR',
        status: 'AVAILABLE',
      },
    });
    expect(spotCountB).toBeGreaterThanOrEqual(2);
  });
});
