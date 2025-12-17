import request from 'supertest';
import { createApp } from '../../src/api/app';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';

/**
 * Integration test for car ticket issuance (T053)
 * Tests User Story 1: Entry with Available Parking Spot
 *
 * Verifies:
 * - Spot is assigned for CAR vehicle type
 * - Ticket is returned with correct details
 * - Event is published (via service integration)
 */
describe('POST /v1/facilities/:facility_id/tickets - Car Ticket Issuance', () => {
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
        name: 'Test Tenant for Car Integration',
        slug: 'test-tenant-car-integration',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    // Create test facility
    const facility = await prisma.facility.create({
      data: {
        tenant_id: testTenantId,
        name: 'Test Garage - Car Integration',
        address: '123 Test Street',
        timezone: 'Europe/Paris',
        total_spots: 50,
        status: 'ACTIVE',
      },
    });
    testFacilityId = facility.id;

    // Create CAR spots
    await prisma.spot.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `CAR-${String(i + 1).padStart(3, '0')}`,
        vehicle_type: 'CAR',
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

  describe('Successful car ticket issuance', () => {
    it('should issue a ticket for a car and return 201 with ticket details', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'voiture', // French input per FR-001
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`) // Mock tenant context
        .send(requestBody)
        .expect(201);

      // Assert - Response structure
      expect(response.body).toHaveProperty('ticket_id');
      expect(response.body).toHaveProperty('facility_id');
      expect(response.body).toHaveProperty('spot_id');
      expect(response.body).toHaveProperty('vehicle_type');
      expect(response.body).toHaveProperty('issued_at');
      expect(response.body).toHaveProperty('barcode');
      expect(response.body).toHaveProperty('status');

      // Assert - Response values
      expect(response.body.facility_id).toBe(testFacilityId);
      expect(response.body.vehicle_type).toBe('CAR');
      expect(response.body.status).toBe('ISSUED');
      expect(response.body.barcode).toBeTruthy();

      // Assert - Ticket created in database
      const ticketInDb = await prisma.ticket.findUnique({
        where: { id: response.body.ticket_id },
      });
      expect(ticketInDb).toBeTruthy();
      expect(ticketInDb?.tenant_id).toBe(testTenantId);
      expect(ticketInDb?.facility_id).toBe(testFacilityId);
      expect(ticketInDb?.vehicle_type).toBe('CAR');
      expect(ticketInDb?.status).toBe('ISSUED');

      // Assert - Spot marked as OCCUPIED
      const spotInDb = await prisma.spot.findUnique({
        where: { id: response.body.spot_id },
      });
      expect(spotInDb).toBeTruthy();
      expect(spotInDb?.status).toBe('OCCUPIED');
      expect(spotInDb?.vehicle_type).toBe('CAR');
    });

    it('should issue multiple car tickets sequentially and assign different spots', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'voiture',
        ticket_format: 'magnetic_stripe',
      };

      // Act - Issue 3 tickets
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

      const response3 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert - Different spot IDs assigned
      const spotIds = [response1.body.spot_id, response2.body.spot_id, response3.body.spot_id];
      const uniqueSpotIds = new Set(spotIds);
      expect(uniqueSpotIds.size).toBe(3); // All different spots

      // Assert - Different ticket IDs
      const ticketIds = [
        response1.body.ticket_id,
        response2.body.ticket_id,
        response3.body.ticket_id,
      ];
      const uniqueTicketIds = new Set(ticketIds);
      expect(uniqueTicketIds.size).toBe(3); // All unique tickets
    });

    it('should accept ticket issuance without explicit ticket_format (defaults to magnetic_stripe)', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'voiture',
        // ticket_format omitted - should default
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert
      expect(response.body.barcode).toBeTruthy(); // Barcode generated with default format
    });
  });

  describe('Error scenarios', () => {
    it('should return 400 if vehicle_type is missing', async () => {
      // Arrange
      const requestBody = {
        ticket_format: 'magnetic_stripe',
        // vehicle_type missing
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('vehicle_type');
    });

    it('should return 400 if vehicle_type is invalid', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'invalid_type',
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 if tenant context is missing', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'voiture',
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        // No X-Tenant-ID header
        .send(requestBody)
        .expect(401);

      // Assert
      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 if facility does not exist', async () => {
      // Arrange
      const nonExistentFacilityId = '00000000-0000-0000-0000-000000000000';
      const requestBody = {
        vehicle_type: 'voiture',
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${nonExistentFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(404);

      // Assert
      expect(response.body).toHaveProperty('error');
    });
  });
});
