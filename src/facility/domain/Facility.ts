import { FacilityId } from '../../shared/domain/FacilityId';
import { TenantId } from '../../shared/domain/TenantId';

/**
 * Facility aggregate root
 * Represents a parking facility belonging to a specific tenant
 * Per data-model.md lines 43-70
 */
export class Facility {
  private constructor(
    public readonly id: FacilityId,
    public readonly tenantId: TenantId,
    public readonly name: string,
    public readonly address: string,
    public readonly timezone: string,
    public readonly totalSpots: number,
    public readonly status: FacilityStatus,
    public readonly createdAt: Date
  ) {
    this.validate();
  }

  private validate(): void {
    if (this.name.length < 3 || this.name.length > 200) {
      throw new Error('Facility name must be between 3 and 200 characters');
    }

    if (this.totalSpots <= 0) {
      throw new Error('Total spots must be a positive integer');
    }

    // Validate timezone is a valid IANA timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: this.timezone });
    } catch {
      throw new Error(`Invalid timezone: ${this.timezone}`);
    }
  }

  static create(
    id: string,
    tenantId: string,
    name: string,
    address: string,
    timezone: string,
    totalSpots: number,
    status: FacilityStatus = FacilityStatus.ACTIVE,
    createdAt: Date = new Date()
  ): Facility {
    return new Facility(
      new FacilityId(id),
      new TenantId(tenantId),
      name,
      address,
      timezone,
      totalSpots,
      status,
      createdAt
    );
  }

  isActive(): boolean {
    return this.status === FacilityStatus.ACTIVE;
  }

  belongsToTenant(tenantId: TenantId): boolean {
    return this.tenantId.equals(tenantId);
  }
}

export enum FacilityStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  CLOSED = 'CLOSED',
}
