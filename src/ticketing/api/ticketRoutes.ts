import { Router } from 'express';
import { TenantRequest, tenantContext } from '../../shared/middleware/tenantContext';
import { asyncHandler } from '../../shared/middleware/asyncHandler';
import { TicketIssuanceService } from '../services/TicketIssuanceService';
import { PrismaFacilityRepository } from '../../facility/repositories/FacilityRepository';
import { KafkaEventPublisher } from '../../infrastructure/events/KafkaEventPublisher';
import { FacilityId } from '../../shared/domain/FacilityId';
import { TenantId } from '../../shared/domain/TenantId';
import { mapFrenchToVehicleType } from '../../facility/domain/VehicleType';
import { MagneticStripeWriter } from '../adapters/MagneticStripeWriter';
import { QRCodeWriter } from '../adapters/QRCodeWriter';
import { NFCWriter } from '../adapters/NFCWriter';
import { TicketWriter, TicketFormat } from '../adapters/TicketWriter';
import { AppError } from '../../shared/errors/AppError';
import { Logger } from '../../infrastructure/logging/WinstonLogger';

const router = Router();

// Initialize dependencies
const facilityRepository = new PrismaFacilityRepository();

// Initialize event publisher
const kafkaBrokers = (process.env.KAFKA_BROKER || 'localhost:9092').split(',');
const eventPublisher = new KafkaEventPublisher(kafkaBrokers);

// Connect event publisher on module load
eventPublisher.connect().catch((error) => {
  Logger.error('Failed to connect Kafka event publisher', {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
});

const ticketIssuanceService = new TicketIssuanceService(
  facilityRepository,
  eventPublisher
);

// Initialize ticket writers
const ticketWriters: TicketWriter[] = [
  new MagneticStripeWriter(),
  new QRCodeWriter(),
  new NFCWriter(),
];

/**
 * POST /v1/facilities/:facility_id/tickets
 * Issue a parking ticket
 * Per openapi.yaml and tasks.md T048-T052
 */
router.post(
  '/facilities/:facility_id/tickets',
  tenantContext,
  asyncHandler(async (req: TenantRequest, res) => {
    const { facility_id } = req.params;
    const { vehicle_type, ticket_format = 'magnetic_stripe' } = req.body;

    // Validate request
    if (!vehicle_type) {
      throw new AppError(
        'Missing required field: vehicle_type',
        400,
        true,
        { allowed_types: ['moto', 'voiture', 'électrique', 'camion/bus', 'handicapé', 'familial'] }
      );
    }

    if (!req.tenantId) {
      throw new AppError('Tenant context not found', 401);
    }

    // Map French vehicle type to enum
    let vehicleType;
    try {
      vehicleType = mapFrenchToVehicleType(vehicle_type);
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Invalid vehicle type',
        400,
        true,
        { allowed_types: ['moto', 'voiture', 'électrique', 'camion/bus', 'handicapé', 'familial'] }
      );
    }

    // Validate ticket format
    const validFormats: TicketFormat[] = ['magnetic_stripe', 'qr_code', 'nfc'];
    if (!validFormats.includes(ticket_format)) {
      throw new AppError(
        `Invalid ticket_format: ${ticket_format}`,
        400,
        true,
        { allowed_formats: validFormats }
      );
    }

    // Find appropriate ticket writer
    const writer = ticketWriters.find((w) => w.supports(ticket_format));
    if (!writer) {
      throw new AppError(
        `No ticket writer available for format: ${ticket_format}`,
        500,
        true
      );
    }

    const tenantId = new TenantId(req.tenantId);
    const facilityId = new FacilityId(facility_id);

    // Issue ticket
    const ticket = await ticketIssuanceService.issueTicket(
      tenantId,
      facilityId,
      vehicleType
    );

    // Write ticket to physical medium
    const writeResult = await writer.write(ticket);

    if (!writeResult.success) {
      Logger.error('Failed to write ticket', {
        ticket_id: ticket.id.toString(),
        format: ticket_format,
        error: writeResult.error,
      });
      // Continue anyway - ticket is already issued
    }

    // Update ticket with barcode
    if (writeResult.success && writeResult.barcode) {
      ticket.setBarcode(writeResult.barcode);
    }

    // Return success response
    res.status(201).json({
      ticket_id: ticket.id.toString(),
      facility_id: ticket.facilityId.toString(),
      spot_id: ticket.spotId.toString(),
      // Note: spot_number would need to be fetched from the spot
      // For now, we'll return the spot_id
      vehicle_type: ticket.vehicleType,
      issued_at: ticket.issuedAt.toISOString(),
      barcode: ticket.barcode,
      status: ticket.status,
    });
  })
);

export default router;
