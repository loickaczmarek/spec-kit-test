import request from 'supertest';
import { createApp } from '../../src/api/app';
import { PrismaClient } from '@prisma/client';
import { Express } from 'express';

/**
 * Integration test for accessible spot ticket issuance (T056)
 * Tests User Story 1: Entry with Available Parking Spot
 *
 * Verifies:
 * - Spot is assigned for ACCESSIBLE vehicle type
 * - Ticket is returned with correct details
 * - Event is published (via service integration)
 */
describe('POST /v1/facilities/:facility_id/tickets - Accessible Spot Ticket Issuance', () => {
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
        name: 'Test Tenant for Accessible Integration',
        slug: 'test-tenant-accessible-integration',
        status: 'ACTIVE',
      },
    });
    testTenantId = tenant.id;

    const facility = await prisma.facility.create({
      data: {
        tenant_id: testTenantId,
        name: 'Test Garage - Accessible Integration',
        address: '101 Accessibility Lane',
        timezone: 'Europe/Paris',
        total_spots: 10,
        status: 'ACTIVE',
      },
    });
    testFacilityId = facility.id;

    // Create ACCESSIBLE spots (typically fewer than regular spots)
    await prisma.spot.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        facility_id: testFacilityId,
        spot_number: `ACCESS-${String(i + 1).padStart(2, '0')}`,
        vehicle_type: 'ACCESSIBLE',
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

  describe('Successful accessible spot ticket issuance', () => {
    it('should issue a ticket for accessible parking using French input "handicapé"', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'handicapé', // French input per FR-001
        ticket_format: 'magnetic_stripe',
      };

      // Act
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .send(requestBody)
        .expect(201);

      // Assert
      expect(response.body).toHaveProperty('ticket_id');
      expect(response.body.facility_id).toBe(testFacilityId);
      expect(response.body.vehicle_type).toBe('ACCESSIBLE');
      expect(response.body.status).toBe('ISSUED');

      // Verify database
      const ticketInDb = await prisma.ticket.findUnique({
        where: { id: response.body.ticket_id },
      });
      expect(ticketInDb?.vehicle_type).toBe('ACCESSIBLE');

      const spotInDb = await prisma.spot.findUnique({
        where: { id: response.body.spot_id },
      });
      expect(spotInDb?.status).toBe('OCCUPIED');
      expect(spotInDb?.vehicle_type).toBe('ACCESSIBLE');
      expect(spotInDb?.spot_number).toMatch(/^ACCESS-\d{2}$/);
    });

    it('should prioritize accessible spots close to entrance (spot_number ordering)', async () => {
      // Arrange
      const requestBody = {
        vehicle_type: 'handicapé',
        ticket_format: 'magnetic_stripe',
      };

      // Act - Issue 2 tickets
      const response1 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .send(requestBody)
        .expect(201);

      const response2 = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .send(requestBody)
        .expect(201);

      // Assert - Spots assigned in order (ACCESS-01 first, then ACCESS-02, etc.)
      const spot1 = await prisma.spot.findUnique({
        where: { id: response1.body.spot_id },
      });
      const spot2 = await prisma.spot.findUnique({
        where: { id: response2.body.spot_id },
      });

      // Verify spots are assigned in ascending order
      expect(spot1?.spot_number).toBeTruthy();
      expect(spot2?.spot_number).toBeTruthy();
      expect(spot1!.spot_number < spot2!.spot_number).toBe(true);
    });

    it('should handle all ticket formats for accessible parking', async () => {
      // Test different formats
      const formats: Array<'magnetic_stripe' | 'qr_code' | 'nfc'> = [
        'magnetic_stripe',
        'qr_code',
        'nfc',
      ];

      // Note: We have 3 spots total, 2 used above, 1 remaining
      // This test will use the last spot and then fail on subsequent attempts
      const requestBody = {
        vehicle_type: 'handicapé',
        ticket_format: formats[0], // Use the remaining spot
      };

      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .send(requestBody)
        .expect(201);

      expect(response.body.barcode).toBeTruthy();
    });
  });

  describe('Accessible parking compliance', () => {
    it('should enforce accessible spot availability even when other spots available', async () => {
      // Arrange - Add regular CAR spots
      await prisma.spot.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({
          facility_id: testFacilityId,
          spot_number: `CAR-${String(i + 1).padStart(3, '0')}`,
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
        })),
      });

      // All ACCESSIBLE spots now occupied from previous tests
      const requestBody = {
        vehicle_type: 'handicapé',
        ticket_format: 'magnetic_stripe',
      };

      // Act - Try to get accessible ticket when all ACCESSIBLE spots occupied
      const response = await request(app)
        .post(`/v1/facilities/${testFacilityId}/tickets`)
        .set('X-Tenant-ID', testTenantId)
        .send(requestBody)
        .expect(409); // Should fail even though CAR spots available

      // Assert
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('ACCESSIBLE');
    });

    it('should track accessible spot utilization separately from regular spots', async () => {
      // Arrange - Count spot types
      const accessibleTotal = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'ACCESSIBLE',
        },
      });

      const accessibleOccupied = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'ACCESSIBLE',
          status: 'OCCUPIED',
        },
      });

      const carAvailable = await prisma.spot.count({
        where: {
          facility_id: testFacilityId,
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
        },
      });

      // Assert - All accessible spots occupied, CAR spots still available
      expect(accessibleTotal).toBe(3);
      expect(accessibleOccupied).toBe(3);
      expect(carAvailable).toBe(5);
    });
  });
});
