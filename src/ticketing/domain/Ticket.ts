import { TicketId } from '../../shared/domain/TicketId';
import { TenantId } from '../../shared/domain/TenantId';
import { FacilityId } from '../../shared/domain/FacilityId';
import { SpotId } from '../../shared/domain/SpotId';
import { VehicleType } from '../../facility/domain/VehicleType';

/**
 * Ticket aggregate root
 * Represents an issued parking ticket with assigned spot and audit metadata
 * Per data-model.md lines 134-175
 */
export class Ticket {
  private constructor(
    public readonly id: TicketId,
    public readonly tenantId: TenantId,
    public readonly facilityId: FacilityId,
    public readonly spotId: SpotId,
    public readonly vehicleType: VehicleType,
    public readonly issuedAt: Date,
    public readonly expiresAt: Date | null,
    private _status: TicketStatus,
    private _barcode: string | null,
    public readonly createdAt: Date,
    private _updatedAt: Date
  ) {
    this.validate();
  }

  private validate(): void {
    // Validate ticket was not issued in the future
    if (this.issuedAt > new Date()) {
      throw new Error('Ticket cannot be issued in the future');
    }

    // Validate barcode length if present
    if (this._barcode && this._barcode.length > 500) {
      throw new Error('Barcode must not exceed 500 characters');
    }
  }

  get status(): TicketStatus {
    return this._status;
  }

  get barcode(): string | null {
    return this._barcode;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  static create(
    tenantId: string,
    facilityId: string,
    spotId: string,
    vehicleType: VehicleType,
    barcode?: string
  ): Ticket {
    const now = new Date();
    const ticketId = TicketId.generate();

    return new Ticket(
      ticketId,
      new TenantId(tenantId),
      new FacilityId(facilityId),
      new SpotId(spotId),
      vehicleType,
      now,
      null, // expiresAt - future feature
      TicketStatus.ISSUED,
      barcode || null,
      now,
      now
    );
  }

  setBarcode(barcode: string): void {
    if (barcode.length > 500) {
      throw new Error('Barcode must not exceed 500 characters');
    }
    this._barcode = barcode;
    this._updatedAt = new Date();
  }

  markAsPaid(): void {
    if (this._status !== TicketStatus.ISSUED) {
      throw new Error(`Cannot mark ticket as paid. Current status: ${this._status}`);
    }
    this._status = TicketStatus.PAID;
    this._updatedAt = new Date();
  }

  markAsValidated(): void {
    if (this._status !== TicketStatus.PAID && this._status !== TicketStatus.ISSUED) {
      throw new Error(`Cannot validate ticket. Current status: ${this._status}`);
    }
    this._status = TicketStatus.VALIDATED;
    this._updatedAt = new Date();
  }

  cancel(): void {
    if (this._status === TicketStatus.VALIDATED) {
      throw new Error('Cannot cancel a validated ticket');
    }
    this._status = TicketStatus.CANCELLED;
    this._updatedAt = new Date();
  }

  isActive(): boolean {
    return this._status === TicketStatus.ISSUED || this._status === TicketStatus.PAID;
  }
}

/**
 * Ticket lifecycle status enum
 * Per data-model.md lines 146-147
 */
export enum TicketStatus {
  ISSUED = 'ISSUED',
  PAID = 'PAID',
  VALIDATED = 'VALIDATED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}
