import { SpotId } from '../../shared/domain/SpotId';
import { FacilityId } from '../../shared/domain/FacilityId';
import { VehicleType } from './VehicleType';

/**
 * Spot entity
 * Represents a single parking space with vehicle type compatibility and availability status
 * Per data-model.md lines 74-107
 */
export class Spot {
  private constructor(
    public readonly id: SpotId,
    public readonly facilityId: FacilityId,
    public readonly spotNumber: string,
    public readonly vehicleType: VehicleType,
    private _status: SpotStatus,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date
  ) {
    this.validate();
  }

  private validate(): void {
    if (this.spotNumber.length < 1 || this.spotNumber.length > 50) {
      throw new Error('Spot number must be between 1 and 50 characters');
    }

    if (!/^[a-zA-Z0-9\s-]+$/.test(this.spotNumber)) {
      throw new Error('Spot number must contain only alphanumeric characters, spaces, and hyphens');
    }
  }

  get status(): SpotStatus {
    return this._status;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  static create(
    id: string,
    facilityId: string,
    spotNumber: string,
    vehicleType: VehicleType,
    status: SpotStatus = SpotStatus.AVAILABLE,
    version: number = 1,
    createdAt: Date = new Date(),
    updatedAt: Date = new Date()
  ): Spot {
    return new Spot(
      new SpotId(id),
      new FacilityId(facilityId),
      spotNumber,
      vehicleType,
      status,
      version,
      createdAt,
      updatedAt
    );
  }

  /**
   * Mark spot as occupied
   * State transition: AVAILABLE → OCCUPIED
   */
  markAsOccupied(): void {
    if (this._status !== SpotStatus.AVAILABLE) {
      throw new Error(`Cannot occupy spot ${this.spotNumber}. Current status: ${this._status}`);
    }

    this._status = SpotStatus.OCCUPIED;
    this._version += 1;
    this._updatedAt = new Date();
  }

  /**
   * Mark spot as available
   * State transition: OCCUPIED → AVAILABLE
   */
  markAsAvailable(): void {
    if (this._status !== SpotStatus.OCCUPIED && this._status !== SpotStatus.MAINTENANCE) {
      throw new Error(`Cannot make spot ${this.spotNumber} available. Current status: ${this._status}`);
    }

    this._status = SpotStatus.AVAILABLE;
    this._version += 1;
    this._updatedAt = new Date();
  }

  /**
   * Mark spot for maintenance
   * State transition: AVAILABLE → MAINTENANCE
   */
  markForMaintenance(): void {
    if (this._status !== SpotStatus.AVAILABLE) {
      throw new Error(`Cannot set spot ${this.spotNumber} to maintenance. Current status: ${this._status}`);
    }

    this._status = SpotStatus.MAINTENANCE;
    this._version += 1;
    this._updatedAt = new Date();
  }

  /**
   * Check if spot is available for assignment
   */
  isAvailable(): boolean {
    return this._status === SpotStatus.AVAILABLE;
  }

  /**
   * Check if spot matches the requested vehicle type
   */
  supportsVehicleType(vehicleType: VehicleType): boolean {
    return this.vehicleType === vehicleType;
  }
}

/**
 * Spot status enum
 * Per data-model.md lines 82-107
 */
export enum SpotStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  RESERVED = 'RESERVED',
  MAINTENANCE = 'MAINTENANCE',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}
