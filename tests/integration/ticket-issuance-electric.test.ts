import request from 'supertest';
import { createApp } from '../../src/api/app';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';

/**
 * Integration test for electric vehicle ticket issuance (T055)
 * Tests User Story 1: Entry with Available Parking Spot
 *
 * Verifies:
 * - Spot is assigned for ELECTRIC vehicle type
 * - Ticket is returned with correct details
 * - Event is published (via service integration)
 */
describe('POST /v1/facilities/:facility_id/tickets - Electric Vehicle Ticket Issuance', () => {
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
        name: 'Test Tenant for Electric Integration',
        slug: 'test-tenant-electric-integration',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    const facility = await prisma.facility.create({
      data: {
        tenant_id: testTenantId,
        name: 'Test Garage - Electric Integration',
        address: '789 Charging Station Blvd',
        timezone: 'Europe/Paris',
        total_spots: 15,
        status: 'ACTIVE',
      },
    });
    testFacilityId = facility.id;

    // Create ELECTRIC spots
    await prisma.spot.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `EV-${String(i + 1).padStart(3, '0')}`,
        vehicle_type: 'ELECTRIC',
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

  describe('Successful electric vehicle ticket issuance', () => {
    it('should issue a ticket for an electric vehicle using French input "électrique"', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'électrique', // French input per FR-001
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
      expect(response.body.vehicle_type).toBe('ELECTRIC');
      expect(response.body.status).toBe('ISSUED');

      // Verify database
      const ticketInDb = await prisma.ticket.findUnique({
        where: { id: response.body.ticket_id },
      });
      expect(ticketInDb?.vehicle_type).toBe('ELECTRIC');

      const spotInDb = await prisma.spot.findUnique({
        where: { id: response.body.spot_id },
      });
      expect(spotInDb?.status).toBe('OCCUPIED');
      expect(spotInDb?.vehicle_type).toBe('ELECTRIC');
      expect(spotInDb?.spot_number).toMatch(/^EV-\d{3}$/);
    });

    it('should support NFC format for electric vehicles (modern parking)', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'électrique',
        ticket_format: 'nfc', // Modern format for EV charging stations
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(201);

      // Assert
      expect(response.body.vehicle_type).toBe('ELECTRIC');
      expect(response.body.barcode).toBeTruthy();
    });

    it('should issue multiple electric vehicle tickets and track charging spots', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'électrique',
        ticket_format: 'qr_code',
      };

      // Act - Issue 5 tickets
      const tickets: any[] = [];
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post(`/v1/facilities/${testFacilityId}/tickets`)
          .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
          .send(requestBody)
          .expect(201);
        tickets.push(response.body);
      }

      // Assert - All tickets have unique spots
      const spotIds = tickets.map((t) => t.spot_id);
      const uniqueSpotIds = new Set(spotIds);
      expect(uniqueSpotIds.size).toBe(5);

      // Assert - Spot availability decreased
      const availableCount = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'ELECTRIC',
          status: 'AVAILABLE',
        },
      });
      // 8 total - 7 issued (2 from previous tests + 5 from this test) = 1 remaining
      expect(availableCount).toBe(1);
    });
  });

  describe('Electric vehicle specific scenarios', () => {
    it('should not assign non-electric spots to electric vehicles', async () => {
      // Arrange - Create regular CAR spot
      await prisma.spot.create({
        data: {
          facility_id: testFacilityId,
          spot_number: 'CAR-100',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        },
      });

      // Fill all ELECTRIC spots first
      const remainingElectricSpots = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'ELECTRIC',
          status: 'AVAILABLE',
        },
      });

      const requestBody = {
        vehicle_type: 'électrique',
        ticket_format: 'magnetic_stripe',
      };

      // Issue tickets to fill all ELECTRIC spots
      for (let i = 0; i < remainingElectricSpots; i++) {
        await request(app)
          .post(`/v1/facilities/${testFacilityId}/tickets`)
          .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
          .send(requestBody)
          .expect(201);
      }

      // Act - Try to get another electric ticket (all ELECTRIC spots occupied, but CAR spot available)
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409); // Should fail - no ELECTRIC spots available

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('ELECTRIC');
    });
  });
});
