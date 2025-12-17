import request from 'supertest';
import { createApp } from '../../src/api/app';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';

/**
 * Integration test for motorcycle ticket issuance (T054)
 * Tests User Story 1: Entry with Available Parking Spot
 *
 * Verifies:
 * - Spot is assigned for MOTORCYCLE vehicle type
 * - Ticket is returned with correct details
 * - Event is published (via service integration)
 */
describe('POST /v1/facilities/:facility_id/tickets - Motorcycle Ticket Issuance', () => {
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
        name: 'Test Tenant for Motorcycle Integration',
        slug: 'test-tenant-motorcycle-integration',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    const facility = await prisma.facility.create({
      data: {
        tenant_id: testTenantId,
        name: 'Test Garage - Motorcycle Integration',
        address: '456 Test Avenue',
        timezone: 'Europe/Paris',
        total_spots: 20,
        status: 'ACTIVE',
      },
    });
    testFacilityId = facility.id;

    // Create MOTORCYCLE spots
    await prisma.spot.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `MOTO-${String(i + 1).padStart(3, '0')}`,
        vehicle_type: 'MOTORCYCLE',
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

  describe('Successful motorcycle ticket issuance', () => {
    it('should issue a ticket for a motorcycle using French input "moto"', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'moto', // French input per FR-001
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert - Response structure and values
      expect(response.body).toHaveProperty('ticket_id');
      expect(response.body.facility_id).toBe(testFacilityId);
      expect(response.body.vehicle_type).toBe('MOTORCYCLE');
      expect(response.body.status).toBe('ISSUED');

      // Assert - Database state
      const ticketInDb = await prisma.ticket.findUnique({
        where: { id: response.body.ticket_id },
      });
      expect(ticketInDb?.vehicle_type).toBe('MOTORCYCLE');

      const spotInDb = await prisma.spot.findUnique({
        where: { id: response.body.spot_id },
      });
      expect(spotInDb?.status).toBe('OCCUPIED');
      expect(spotInDb?.vehicle_type).toBe('MOTORCYCLE');
    });

    it('should handle QR code format for motorcycles', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'moto',
        ticket_format: 'qr_code', // Alternative format
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert
      expect(response.body.vehicle_type).toBe('MOTORCYCLE');
      expect(response.body.barcode).toBeTruthy();
    });

    it('should issue tickets until motorcycle spots are exhausted', async () => {
      // Arrange - We have 5 motorcycle spots total, 2 already used above
      const requestBody = {
        vehicle_type: 'moto',
        ticket_format: 'magnetic_stripe',
      };

      // Act - Issue 3 more tickets to fill remaining spots
      const responses: any[] = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post(`/v1/facilities/${testFacilityId}/tickets`)
          .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
          .send(requestBody)
          .expect(201);
        responses.push(response.body);
      }

      // Assert - All unique spot IDs
      const spotIds = responses.map((r) => r.spot_id);
      const uniqueSpotIds = new Set(spotIds);
      expect(uniqueSpotIds.size).toBe(3);

      // Assert - All spots now OCCUPIED
      const availableSpots = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'MOTORCYCLE',
          status: 'AVAILABLE',
        },
      });
      expect(availableSpots).toBe(0);

      // Next ticket should fail (tested in ticket-rejection-motorcycle.test.ts for User Story 2)
    });
  });

  describe('Validation scenarios', () => {
    it('should not assign a CAR spot to a motorcycle', async () => {
      // Arrange - Create a CAR spot in the same facility
      await prisma.spot.create({
        data: {
          facility_id: testFacilityId,
          spot_number: 'CAR-999',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        },
      });

      const requestBody = {
        vehicle_type: 'moto',
        ticket_format: 'magnetic_stripe',
      };

      // Act - Try to get motorcycle ticket (all motorcycle spots occupied from previous test)
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409); // No available MOTORCYCLE spots, even though CAR spot available

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('MOTORCYCLE');
    });
  });
});
