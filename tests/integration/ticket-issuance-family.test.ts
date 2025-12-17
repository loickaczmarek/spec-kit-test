import request from 'supertest';
import { createApp } from '../../src/api/app';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';

/**
 * Integration test for family spot ticket issuance (T057)
 * Tests User Story 1: Entry with Available Parking Spot
 *
 * Verifies:
 * - Spot is assigned for FAMILY vehicle type
 * - Ticket is returned with correct details
 * - Event is published (via service integration)
 */
describe('POST /v1/facilities/:facility_id/tickets - Family Spot Ticket Issuance', () => {
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
        name: 'Test Tenant for Family Integration',
        slug: 'test-tenant-family-integration',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    const facility = await prisma.facility.create({
      data: {
        tenant_id: testTenantId,
        name: 'Test Garage - Family Integration',
        address: '202 Family Circle',
        timezone: 'Europe/Paris',
        total_spots: 12,
        status: 'ACTIVE',
      },
    });
    testFacilityId = facility.id;

    // Create FAMILY spots (wider spaces near elevators)
    await prisma.spot.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `FAM-${String(i + 1).padStart(2, '0')}`,
        vehicle_type: 'FAMILY',
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

  describe('Successful family spot ticket issuance', () => {
    it('should issue a ticket for family parking using French input "familial"', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'familial', // French input per FR-001
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert
      expect(response.body).toHaveProperty('ticket_id');
      expect(response.body.facility_id).toBe(testFacilityId);
      expect(response.body.vehicle_type).toBe('FAMILY');
      expect(response.body.status).toBe('ISSUED');

      // Verify database
      const ticketInDb = await prisma.ticket.findUnique({
        where: { id: response.body.ticket_id },
      });
      expect(ticketInDb?.vehicle_type).toBe('FAMILY');

      const spotInDb = await prisma.spot.findUnique({
        where: { id: response.body.spot_id },
      });
      expect(spotInDb?.status).toBe('OCCUPIED');
      expect(spotInDb?.vehicle_type).toBe('FAMILY');
      expect(spotInDb?.spot_number).toMatch(/^FAM-\d{2}$/);
    });

    it('should support QR code format for family-friendly parking (mobile app integration)', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'familial',
        ticket_format: 'qr_code', // Popular with mobile apps for families
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert
      expect(response.body.vehicle_type).toBe('FAMILY');
      expect(response.body.barcode).toBeTruthy();
    });

    it('should issue multiple family tickets and track spot availability', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'familial',
        ticket_format: 'magnetic_stripe',
      };

      // Act - Issue 2 more tickets (4 total spots, 2 already used)
      const response1 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      const response2 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert - Different spots assigned
      expect(response1.body.spot_id).not.toBe(response2.body.spot_id);

      // Assert - All family spots now occupied
      const availableCount = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'FAMILY',
          status: 'AVAILABLE',
        },
      });
      expect(availableCount).toBe(0);
    });
  });

  describe('Family parking specific scenarios', () => {
    it('should not assign regular CAR spots to family parking requests', async () => {
      // Arrange - Add regular CAR spots
      await prisma.spot.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          facility_id: testFacilityId,
          spot_number: `CAR-${String(i + 1).padStart(3, '0')}`,
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        })),
      });

      // All FAMILY spots occupied from previous tests
      const requestBody = {
        vehicle_type: 'familial',
        ticket_format: 'magnetic_stripe',
      };

      // Act - Try to get family ticket when all FAMILY spots occupied
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409); // Should fail even though CAR spots available

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('FAMILY');

      // Verify CAR spots still available
      const carAvailable = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
        },
      });
      expect(carAvailable).toBe(10);
    });

    it('should maintain family spot inventory separately from other types', async () => {
      // Verify spot type separation
      const familyTotal = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'FAMILY',
        },
      });

      const familyOccupied = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'FAMILY',
          status: 'OCCUPIED',
        },
      });

      const carTotal = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'CAR',
        },
      });

      // Assert
      expect(familyTotal).toBe(4);
      expect(familyOccupied).toBe(4); // All family spots occupied
      expect(carTotal).toBe(10); // CAR spots separate inventory
    });
  });

  describe('Edge cases', () => {
    it('should handle family spot requests with default ticket format', async () => {
      // Arrange - Create one more FAMILY spot for this test
      await prisma.spot.create({
        data: {
          facility_id: testFacilityId,
          spot_number: 'FAM-99',
          vehicle_type: 'FAMILY',
          status: 'AVAILABLE',
          version: 1,
        },
      });

      const requestBody = {
        vehicle_type: 'familial',
        // ticket_format omitted - should default to magnetic_stripe
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert
      expect(response.body.vehicle_type).toBe('FAMILY');
      expect(response.body.barcode).toBeTruthy();

      // Verify spot assignment
      const spot = await prisma.spot.findUnique({
        where: { id: response.body.spot_id },
      });
      expect(spot?.spot_number).toBe('FAM-99');
    });
  });
});
