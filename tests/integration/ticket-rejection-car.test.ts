import request from 'supertest';
import { createApp } from '../../src/api/app';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';

/**
 * Integration test for car ticket rejection (T066)
 * Tests User Story 2: Entry with No Available Spots
 *
 * Verifies:
 * - System returns 409 Conflict when no spots available
 * - Error message includes vehicle type
 * - Error code is NO_SPOTS_AVAILABLE
 * - Response format matches OpenAPI spec
 */
describe('POST /v1/facilities/:facility_id/tickets - Car Ticket Rejection (No Spots)', () => {
  let app: Express;
  let prisma: PrismaClient;
  let testTenantId: string;
  let testFacilityId: string;

  beforeAll(async () => {
    // Initialize Prisma client
    prisma = new PrismaClient();

    // Create Express app
    app = createApp();

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();

    // Disconnect Prisma
    await prisma.$disconnect();
  });

  async function setupTestData() {
    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Tenant for Car Rejection',
        slug: 'test-tenant-car-rejection',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    // Create test facility
    const facility = await prisma.facility.create({
      data: {
        tenant_id: testTenantId,
        name: 'Test Garage - Car Rejection',
        address: '456 Rejection Street',
        timezone: 'Europe/Paris',
        total_spots: 5,
        status: 'ACTIVE',
      },
    });
    testFacilityId = facility.id;

    // Create CAR spots - all OCCUPIED
    await prisma.spot.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `CAR-${String(i + 1).padStart(3, '0')}`,
        vehicle_type: 'CAR',
        status: 'OCCUPIED', // All spots occupied
        version: 1,
      })),
    });

    // Create MOTORCYCLE spots - available (to verify vehicle type filtering works)
    await prisma.spot.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `MOTO-${String(i + 1).padStart(3, '0')}`,
        vehicle_type: 'MOTORCYCLE',
        status: 'AVAILABLE',
        version: 1,
      })),
    });
  }

  async function cleanupTestData() {
    // Delete in reverse order of creation (respecting foreign keys)
    await prisma.ticket.deleteMany({ where: { tenant_id: testTenantId } });
    await prisma.spot.deleteMany({ where: { facility_id: testFacilityId } });
    await prisma.facility.deleteMany({ where: { tenant_id: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
  }

  describe('No available spots for CAR', () => {
    it('should return 409 Conflict when all CAR spots are occupied', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'voiture', // French for car
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409);

      // Assert - Error response structure per OpenAPI spec
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('details');

      // Assert - Error code
      expect(response.body.error).toBe('NO_SPOTS_AVAILABLE');

      // Assert - Error message includes vehicle type
      expect(response.body.message).toContain('CAR');
      expect(response.body.message.toLowerCase()).toContain('aucune place disponible');

      // Assert - Details include facility and vehicle type
      expect(response.body.details).toHaveProperty('facility_id');
      expect(response.body.details).toHaveProperty('vehicle_type');
      expect(response.body.details.facility_id).toBe(testFacilityId);
      expect(response.body.details.vehicle_type).toBe('CAR');
    });

    it('should not create a ticket in database when no spots available', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'voiture',
        ticket_format: 'magnetic_stripe',
      };

      // Get ticket count before request
      const ticketCountBefore = await prisma.ticket.count({
        where: { facility_id: testFacilityId },
      });

      // Act
      await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409);

      // Assert - No ticket created
      const ticketCountAfter = await prisma.ticket.count({
        where: { facility_id: testFacilityId },
      });
      expect(ticketCountAfter).toBe(ticketCountBefore);
    });

    it('should not change spot status when no spots available', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'voiture',
        ticket_format: 'magnetic_stripe',
      };

      // Get all CAR spots before request
      const spotsBefore = await prisma.spot.findMany({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'CAR',
        },
      });

      // Act
      await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409);

      // Assert - Spots remain unchanged
      const spotsAfter = await prisma.spot.findMany({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'CAR',
        },
      });

      expect(spotsAfter.length).toBe(spotsBefore.length);
      spotsAfter.forEach((spot, index) => {
        expect(spot.status).toBe(spotsBefore[index].status);
        expect(spot.updated_at).toEqual(spotsBefore[index].updated_at);
      });
    });

    it('should still allow MOTORCYCLE tickets when CAR spots are full', async () => {
      // Arrange - Request motorcycle ticket
      const requestBody = {
        vehicle_type: 'moto', // French for motorcycle
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert - Motorcycle ticket issued successfully
      expect(response.body).toHaveProperty('ticket_id');
      expect(response.body.vehicle_type).toBe('MOTORCYCLE');

      // Verify spot is MOTORCYCLE type
      const spot = await prisma.spot.findUnique({
        where: { id: response.body.spot_id },
      });
      expect(spot?.vehicle_type).toBe('MOTORCYCLE');
      expect(spot?.status).toBe('OCCUPIED');
    });
  });

  describe('Error response consistency', () => {
    it('should return consistent error format for multiple rejection requests', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'voiture',
        ticket_format: 'magnetic_stripe',
      };

      // Act - Send 3 requests
      const response1 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409);

      const response2 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409);

      const response3 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409);

      // Assert - All responses have same structure
      [response1, response2, response3].forEach((response) => {
        expect(response.body.error).toBe('NO_SPOTS_AVAILABLE');
        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details.vehicle_type).toBe('CAR');
      });
    });
  });
});
