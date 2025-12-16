import { DomainEvent } from '../../shared/events/DomainEvent';
import { VehicleType } from '../../facility/domain/VehicleType';

/**
 * TicketIssued domain event (v1)
 * Published to Kafka topic "tickets.issued.v1" after successful ticket creation
 * Per data-model.md lines 213-239
 */
export class TicketIssued extends DomainEvent {
  constructor(
    public readonly tenant_id: string,
    public readonly facility_id: string,
    public readonly ticket_id: string,
    public readonly spot_id: string,
    public readonly spot_number: string,
    public readonly vehicle_type: VehicleType,
    public readonly issued_at: string
  ) {
    super('v1.TicketIssued');
  }

  getEventType(): string {
    return 'TicketIssued';
  }

  toJSON(): Record<string, any> {
    return {
      schema_version: this.schema_version,
      event_id: this.event_id,
      timestamp: this.timestamp,
      tenant_id: this.tenant_id,
      facility_id: this.facility_id,
      ticket_id: this.ticket_id,
      spot_id: this.spot_id,
      spot_number: this.spot_number,
      vehicle_type: this.vehicle_type,
      issued_at: this.issued_at,
    };
  }

  static create(
    tenantId: string,
    facilityId: string,
    ticketId: string,
    spotId: string,
    spotNumber: string,
    vehicleType: VehicleType,
    issuedAt: Date
  ): TicketIssued {
    return new TicketIssued(
      tenantId,
      facilityId,
      ticketId,
      spotId,
      spotNumber,
      vehicleType,
      issuedAt.toISOString()
    );
  }
}
