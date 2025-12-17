import { Ticket } from '../domain/Ticket';
import { TicketIssued } from '../domain/TicketIssued';
import { FacilityId } from '../../shared/domain/FacilityId';
import { TenantId } from '../../shared/domain/TenantId';
import { VehicleType } from '../../facility/domain/VehicleType';
import { PrismaSpotRepository } from '../../facility/repositories/SpotRepository';
import { IFacilityRepository } from '../../facility/repositories/FacilityRepository';
import { IEventPublisher } from '../../shared/events/EventPublisher';
import { prisma } from '../../infrastructure/database/PrismaClient';
import { Prisma } from '@prisma/client';
import { Logger } from '../../infrastructure/logging/WinstonLogger';
import { AppError } from '../../shared/errors/AppError';
import { NoSpotsAvailableError } from '../../shared/errors/NoSpotsAvailableError';

/**
 * Transaction retry logic with exponential backoff
 * Per plan.md lines 183-202
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error: any) {
      // Retry on deadlock or serialization failure
      if (
        error.code === 'P2034' ||
        error.code === '40001' ||
        error.message?.includes('could not obtain lock')
      ) {
        retries++;
        if (retries >= maxRetries) {
          throw error;
        }
        const backoffMs = 100 * Math.pow(2, retries - 1);
        Logger.warn('Transaction conflict, retrying', {
          attempt: retries,
          backoffMs,
          error: error.message,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * TicketIssuanceService
 * Handles ticket issuance with atomic spot assignment
 * Per tasks.md T042-T043
 */
export class TicketIssuanceService {
  constructor(
    private facilityRepository: IFacilityRepository,
    private eventPublisher: IEventPublisher
  ) {}

  /**
   * Issue a ticket with atomic spot assignment
   * Uses Prisma transaction with pessimistic locking and retry logic
   * Per plan.md lines 150-178
   */
  async issueTicket(
    tenantId: TenantId,
    facilityId: FacilityId,
    vehicleType: VehicleType,
    barcode?: string
  ): Promise<Ticket> {
    // Verify facility exists and belongs to tenant
    const facility = await this.facilityRepository.findById(facilityId, tenantId);
    if (!facility) {
      throw new AppError(
        `Facility with ID ${facilityId.toString()} does not exist or does not belong to your tenant`,
        404,
        true,
        { facility_id: facilityId.toString(), tenant_id: tenantId.toString() }
      );
    }

    if (!facility.isActive()) {
      throw new AppError(
        `Facility ${facility.name} is not currently accepting entries (status: ${facility.status})`,
        409,
        true,
        { facility_id: facilityId.toString(), status: facility.status }
      );
    }

    // Execute spot assignment and ticket creation in transaction with retry
    const result = await executeWithRetry(async () => {
      return await prisma.$transaction(
        async (tx) => {
          // Find and lock an available spot (pessimistic lock)
          const spotRepo = new PrismaSpotRepository();
          const spot = await spotRepo.findAvailableSpot(facilityId, vehicleType);

          if (!spot) {
            throw new NoSpotsAvailableError(facilityId, vehicleType, facility.name);
          }

          // Update spot status to OCCUPIED (within transaction)
          await tx.spot.update({
            where: { id: spot.id.toString() },
            data: {
              status: 'OCCUPIED',
              updated_at: new Date(),
            },
          });

          // Create ticket
          const ticket = Ticket.create(
            tenantId.toString(),
            facilityId.toString(),
            spot.id.toString(),
            vehicleType,
            barcode
          );

          // Save ticket to database
          await tx.ticket.create({
            data: {
              id: ticket.id.toString(),
              tenant_id: ticket.tenantId.toString(),
              facility_id: ticket.facilityId.toString(),
              spot_id: ticket.spotId.toString(),
              vehicle_type: ticket.vehicleType,
              issued_at: ticket.issuedAt,
              expires_at: ticket.expiresAt,
              status: ticket.status,
              barcode: ticket.barcode,
              created_at: ticket.createdAt,
              updated_at: ticket.updatedAt,
            },
          });

          return { ticket, spot };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 5000, // 5s max transaction time
        }
      );
    });

    const { ticket, spot } = result;

    // Publish TicketIssued event (async, after transaction commit)
    try {
      const event = TicketIssued.create(
        ticket.tenantId.toString(),
        ticket.facilityId.toString(),
        ticket.id.toString(),
        ticket.spotId.toString(),
        spot.spotNumber,
        ticket.vehicleType,
        ticket.issuedAt
      );

      await this.eventPublisher.publish(event, 'tickets.issued.v1');

      Logger.info('TicketIssued event published', {
        ticket_id: ticket.id.toString(),
        spot_number: spot.spotNumber,
        vehicle_type: vehicleType,
      });
    } catch (error) {
      // Log failure for outbox processing (future enhancement)
      Logger.error('Failed to publish TicketIssued event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ticket_id: ticket.id.toString(),
      });
      // Don't fail the ticket issuance if event publishing fails
      // The ticket is already created and spot assigned
    }

    Logger.info('Ticket issued successfully', {
      ticket_id: ticket.id.toString(),
      facility_id: facilityId.toString(),
      spot_id: spot.id.toString(),
      vehicle_type: vehicleType,
      tenant_id: tenantId.toString(),
    });

    return ticket;
  }
}
