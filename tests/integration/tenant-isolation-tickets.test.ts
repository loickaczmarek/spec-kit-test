import request from 'supertest';
import express from 'express';
import ticketRoutes from '../../src/ticketing/api/ticketRoutes';
import { errorHandler } from '../../src/shared/middleware/errorHandler';
import { prisma } from '../../src/infrastructure/database/PrismaClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Integration test for User Story 3 - Ticket Isolation
 * Per tasks.md T077
 *
 * Scenario: Verify tickets include correct tenant_id and queries filtered by tenant
 */

const app = express();
app.use(express.json());
app.use('/v1', ticketRoutes);
app.use(errorHandler); // Add error handler middleware

describe('User Story 3 - Ticket Isolation', () => {
  let tenantAId: string;
  let tenantBId: string;
  let facilityAId: string;
  let facilityBId: string;
  let ticketAId: string;
  let ticketBId: string;

  beforeAll(async () => {
    // Create Tenant A
    tenantAId = uuidv4();
    await prisma.tenant.create({
      data: {
        id: tenantAId,
        name: 'Tenant A - Paris',
        slug: `tenant-a-tickets-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    // Create Tenant B
    tenantBId = uuidv4();
    await prisma.tenant.create({
      data: {
        id: tenantBId,
        name: 'Tenant B - Lyon',
        slug: `tenant-b-tickets-${Date.now()}`,
        status: 'ACTIVE',
      },
    });

    // Create Facility for Tenant A
    facilityAId = uuidv4();
    await prisma.facility.create({
      data: {
        id: facilityAId,
        tenant_id: tenantAId,
        name: 'Paris Facility',
        address: '123 Rue de Paris',
        timezone: 'Europe/Paris',
        total_spots: 5,
        status: 'ACTIVE',
      },
    });

    await prisma.spot.create({
      data: {
        id: uuidv4(),
        facility_id: facilityAId,
        spot_number: 'A-1',
        vehicle_type: 'CAR',
        status: 'AVAILABLE',
        version: 1,
      },
    });

    // Create Facility for Tenant B
    facilityBId = uuidv4();
    await prisma.facility.create({
      data: {
        id: facilityBId,
        tenant_id: tenantBId,
        name: 'Lyon Facility',
        address: '456 Rue de Lyon',
        timezone: 'Europe/Paris',
        total_spots: 5,
        status: 'ACTIVE',
      },
    });

    await prisma.spot.create({
      data: {
        id: uuidv4(),
        facility_id: facilityBId,
        spot_number: 'B-1',
        vehicle_type: 'CAR',
        status: 'AVAILABLE',
        version: 1,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.ticket.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
    await prisma.spot.deleteMany({ where: { facility_id: { in: [facilityAId, facilityBId] } } });
    await prisma.facility.deleteMany({ where: { id: { in: [facilityAId, facilityBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  });

  it('should create tickets with correct tenant_id', async () => {
    // Issue ticket for Tenant A
    const responseA = await request(app)
      .post(`/v1/facilities/${facilityAId}/tickets`)
      .set('x-api-key', `test-api-key-${tenantAId}`) // Tenant A's API key
      .send({
        vehicle_type: 'voiture',
      });

    expect(responseA.status).toBe(201);
    ticketAId = responseA.body.ticket_id;

    // Verify ticket A has correct tenant_id in database
    const ticketA = await prisma.ticket.findUnique({
      where: { id: ticketAId },
    });
    expect(ticketA).toBeDefined();
    expect(ticketA?.tenant_id).toBe(tenantAId);

    // Issue ticket for Tenant B
    const responseB = await request(app)
      .post(`/v1/facilities/${facilityBId}/tickets`)
      .set('x-api-key', `test-api-key-${tenantBId}`) // Tenant B's API key
      .send({
        vehicle_type: 'voiture',
      });

    expect(responseB.status).toBe(201);
    ticketBId = responseB.body.ticket_id;

    // Verify ticket B has correct tenant_id in database
    const ticketB = await prisma.ticket.findUnique({
      where: { id: ticketBId },
    });
    expect(ticketB).toBeDefined();
    expect(ticketB?.tenant_id).toBe(tenantBId);
  });

  it('should filter ticket queries by tenant_id', async () => {
    // Query tickets for Tenant A - should only see their ticket
    const ticketsA = await prisma.ticket.findMany({
      where: { tenant_id: tenantAId },
    });

    expect(ticketsA.length).toBeGreaterThanOrEqual(1);
    expect(ticketsA.every((ticket) => ticket.tenant_id === tenantAId)).toBe(true);
    expect(ticketsA.some((ticket) => ticket.id === ticketAId)).toBe(true);
    expect(ticketsA.some((ticket) => ticket.id === ticketBId)).toBe(false);

    // Query tickets for Tenant B - should only see their ticket
    const ticketsB = await prisma.ticket.findMany({
      where: { tenant_id: tenantBId },
    });

    expect(ticketsB.length).toBeGreaterThanOrEqual(1);
    expect(ticketsB.every((ticket) => ticket.tenant_id === tenantBId)).toBe(true);
    expect(ticketsB.some((ticket) => ticket.id === ticketBId)).toBe(true);
    expect(ticketsB.some((ticket) => ticket.id === ticketAId)).toBe(false);
  });

  it('should verify cross-tenant ticket access is prevented', async () => {
    // Tenant A tries to query Ticket B (belongs to Tenant B)
    const ticketFromA = await prisma.ticket.findFirst({
      where: {
        id: ticketBId,
        tenant_id: tenantAId, // Wrong tenant!
      },
    });

    // Should return null (no access)
    expect(ticketFromA).toBeNull();

    // Tenant B tries to query Ticket A (belongs to Tenant A)
    const ticketFromB = await prisma.ticket.findFirst({
      where: {
        id: ticketAId,
        tenant_id: tenantBId, // Wrong tenant!
      },
    });

    // Should return null (no access)
    expect(ticketFromB).toBeNull();
  });

  it('should verify tenant isolation at repository layer', async () => {
    // Use TicketRepository to verify tenant filtering
    const { PrismaTicketRepository } = await import('../../src/ticketing/repositories/TicketRepository');
    const { TicketId } = await import('../../src/shared/domain/TicketId');
    const { TenantId } = await import('../../src/shared/domain/TenantId');

    const ticketRepo = new PrismaTicketRepository();

    // Tenant A can access their ticket
    const ticketAFound = await ticketRepo.findById(new TicketId(ticketAId), new TenantId(tenantAId));
    expect(ticketAFound).not.toBeNull();
    expect(ticketAFound?.tenantId.toString()).toBe(tenantAId);

    // Tenant A cannot access Tenant B's ticket
    const ticketBFromA = await ticketRepo.findById(new TicketId(ticketBId), new TenantId(tenantAId));
    expect(ticketBFromA).toBeNull();

    // Tenant B can access their ticket
    const ticketBFound = await ticketRepo.findById(new TicketId(ticketBId), new TenantId(tenantBId));
    expect(ticketBFound).not.toBeNull();
    expect(ticketBFound?.tenantId.toString()).toBe(tenantBId);

    // Tenant B cannot access Tenant A's ticket
    const ticketAFromB = await ticketRepo.findById(new TicketId(ticketAId), new TenantId(tenantBId));
    expect(ticketAFromB).toBeNull();
  });
});
