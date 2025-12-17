import request from 'supertest';
import { createApp } from '../../src/api/app';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';

/**
 * Integration test for motorcycle ticket rejection (T067)
 * Tests User Story 2: Entry with No Available Spots
 *
 * Verifies:
 * - System returns 409 Conflict when no MOTORCYCLE spots available
 * - Error response format matches OpenAPI spec for MOTORCYCLE type
 * - Other vehicle types are not affected
 */
describe('POST /v1/facilities/:facility_id/tickets - Motorcycle Ticket Rejection (No Spots)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let testTenantId: string;
  let testFacilityId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = createApp();
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function setupTestData() {
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant for Motorcycle Rejection',
        slug: 'test-tenant-motorcycle-rejection',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    const facility = await prisma.facility.create({
      data: {
        tenant_id: testTenantId,
        name: 'Test Garage - Motorcycle Rejection',
        address: '789 Moto Street',
        timezone: 'Europe/Paris',
        total_spots: 8,
        status: 'ACTIVE',
      },
    });
    testFacilityId = facility.id;

    // Create MOTORCYCLE spots - all OCCUPIED
    await prisma.spot.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `MOTO-${String(i + 1).padStart(3, '0')}`,
        vehicle_type: 'MOTORCYCLE',
        status: 'OCCUPIED',
        version: 1,
      })),
    });

    // Create CAR spots - available (to verify filtering)
    await prisma.spot.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `CAR-${String(i + 1).padStart(3, '0')}`,
        vehicle_type: 'CAR',
        status: 'AVAILABLE',
        version: 1,
      })),
    });
  }

  async function cleanupTestData() {
    await prisma.ticket.deleteMany({ where: { tenant_id: testTenantId } });
    await prisma.spot.deleteMany({ where: { facility_id: testFacilityId } });
    await prisma.facility.deleteMany({ where: { tenant_id: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
  }

  it('should return 409 Conflict when all MOTORCYCLE spots are occupied', async () => {
    const requestBody = {
      vehicle_type: 'moto',
      ticket_format: 'magnetic_stripe',
    };

    const response = await request(app)
      .post(`/v1/facilities/${testFacilityId}/tickets`)
      .set('X-Tenant-ID', testTenantId)
      .set('X-API-Key', `test-api-key-${testTenantId}`)
      .send(requestBody)
      .expect(409);

    expect(response.body.error).toBe('NO_SPOTS_AVAILABLE');
    expect(response.body.message).toContain('MOTORCYCLE');
    expect(response.body.details.vehicle_type).toBe('MOTORCYCLE');
  });

  it('should still allow CAR tickets when MOTORCYCLE spots are full', async () => {
    const requestBody = {
      vehicle_type: 'voiture',
      ticket_format: 'magnetic_stripe',
    };

    const response = await request(app)
      .post(`/v1/facilities/${testFacilityId}/tickets`)
      .set('X-Tenant-ID', testTenantId)
      .set('X-API-Key', `test-api-key-${testTenantId}`)
      .send(requestBody)
      .expect(201);

    expect(response.body.vehicle_type).toBe('CAR');
  });
});
