import request from 'supertest';
import { createApp } from '../../src/api/app';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';

/**
 * Integration test for truck/bus spot ticket issuance (T058)
 * Tests User Story 1: Entry with Available Parking Spot
 *
 * Verifies:
 * - Spot is assigned for TRUCK_BUS vehicle type
 * - Ticket is returned with correct details
 * - Event is published (via service integration)
 */
describe('POST /v1/facilities/:facility_id/tickets - Truck/Bus Spot Ticket Issuance', () => {
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
        name: 'Test Tenant for Truck Integration',
        slug: 'test-tenant-truck-integration',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    const facility = await prisma.facility.create({
      data: {
        tenant_id: testTenantId,
        name: 'Test Garage - Truck/Bus Integration',
        address: '303 Commercial Drive',
        timezone: 'Europe/Paris',
        total_spots: 8,
        status: 'ACTIVE',
      },
    });
    testFacilityId = facility.id;

    // Create TRUCK_BUS spots (larger spaces for commercial vehicles)
    await prisma.spot.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `TRUCK-${String(i + 1).padStart(2, '0')}`,
        vehicle_type: 'TRUCK_BUS',
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

  describe('Successful truck/bus ticket issuance', () => {
    it('should issue a ticket for truck/bus using French input "camion/bus"', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'camion/bus', // French input per FR-001
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
      expect(response.body.vehicle_type).toBe('TRUCK_BUS');
      expect(response.body.status).toBe('ISSUED');

      // Verify database
      const ticketInDb = await prisma.ticket.findUnique({
        where: { id: response.body.ticket_id },
      });
      expect(ticketInDb?.vehicle_type).toBe('TRUCK_BUS');

      const spotInDb = await prisma.spot.findUnique({
        where: { id: response.body.spot_id },
      });
      expect(spotInDb?.status).toBe('OCCUPIED');
      expect(spotInDb?.vehicle_type).toBe('TRUCK_BUS');
      expect(spotInDb?.spot_number).toMatch(/^TRUCK-\d{2}$/);
    });

    it('should support all ticket formats for commercial vehicles', async () => {
      // Test QR code format
      const response1 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send({
          vehicle_type: 'camion/bus',
          ticket_format: 'qr_code',
        })
        .expect(201);

      // Test NFC format
      const response2 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send({
          vehicle_type: 'camion/bus',
          ticket_format: 'nfc',
        })
        .expect(201);

      // Assert
      expect(response1.body.vehicle_type).toBe('TRUCK_BUS');
      expect(response1.body.barcode).toBeTruthy();
      expect(response2.body.vehicle_type).toBe('TRUCK_BUS');
      expect(response2.body.barcode).toBeTruthy();

      // Different spots assigned
      expect(response1.body.spot_id).not.toBe(response2.body.spot_id);
    });

    it('should exhaust all truck spots and return correct availability', async () => {
      // Arrange - 3 total spots, 2 already used above, 1 remaining
      const availableBefore = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'TRUCK_BUS',
          status: 'AVAILABLE',
        },
      });
      expect(availableBefore).toBe(1);

      // Act - Issue last ticket
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send({
          vehicle_type: 'camion/bus',
          ticket_format: 'magnetic_stripe',
        })
        .expect(201);

      // Assert - Last spot assigned
      expect(response.body.vehicle_type).toBe('TRUCK_BUS');

      // Verify all spots occupied
      const availableAfter = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'TRUCK_BUS',
          status: 'AVAILABLE',
        },
      });
      expect(availableAfter).toBe(0);

      // Next request should fail with 409
      await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send({
          vehicle_type: 'camion/bus',
          ticket_format: 'magnetic_stripe',
        })
        .expect(409);
    });
  });

  describe('Commercial vehicle restrictions', () => {
    it('should not assign passenger CAR spots to trucks/buses', async () => {
      // Arrange - Add passenger CAR spots
      await prisma.spot.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({
          facility_id: testFacilityId,
          spot_number: `CAR-${String(i + 1).padStart(3, '0')}`,
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        })),
      });

      // All TRUCK_BUS spots occupied from previous tests
      const requestBody = {
        vehicle_type: 'camion/bus',
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409); // Should fail - cannot use CAR spots for trucks

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('TRUCK_BUS');

      // Verify CAR spots still available
      const carAvailable = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
        },
      });
      expect(carAvailable).toBe(5);
    });

    it('should maintain separate inventory for TRUCK_BUS spots', async () => {
      // Verify spot inventories
      const truckTotal = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'TRUCK_BUS',
        },
      });

      const truckOccupied = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'TRUCK_BUS',
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
      expect(truckTotal).toBe(3);
      expect(truckOccupied).toBe(3); // All truck spots occupied
      expect(carTotal).toBe(5); // Separate CAR inventory
    });
  });

  describe('Large vehicle specific validations', () => {
    it('should return detailed error message when no truck spots available', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'camion/bus',
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send(requestBody)
        .expect(409);

      // Assert - Error message should be clear and helpful
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/TRUCK_BUS/i);
      expect(response.body.error).toMatch(/aucune place|no.*spot|not available/i);
    });

    it('should handle ticket issuance timestamp correctly for commercial vehicles', async () => {
      // Arrange - Create one more spot for this test
      await prisma.spot.create({
        data: {
          facility_id: testFacilityId,
          spot_number: 'TRUCK-99',
          vehicle_type: 'TRUCK_BUS',
          status: 'AVAILABLE',
          version: 1,
        },
      });

      const beforeTime = new Date();

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .set('X-API-Key', `test-api-key-${testTenantId}`)
        .send({
          vehicle_type: 'camion/bus',
          ticket_format: 'magnetic_stripe',
        })
        .expect(201);

      const afterTime = new Date();

      // Assert - Timestamp is reasonable
      const issuedAt = new Date(response.body.issued_at);
      expect(issuedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(issuedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());

      // Verify ticket in database
      const ticket = await prisma.ticket.findUnique({
        where: { id: response.body.ticket_id },
      });
      expect(ticket?.issued_at).toBeTruthy();
      expect(ticket?.status).toBe('ISSUED');
    });
  });
});
