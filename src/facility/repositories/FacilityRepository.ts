import { Facility } from '../domain/Facility';
import { FacilityId } from '../../shared/domain/FacilityId';
import { TenantId } from '../../shared/domain/TenantId';
import { prisma } from '../../infrastructure/database/PrismaClient';
import { FacilityStatus } from '../domain/Facility';

/**
 * FacilityRepository interface
 * Per tasks.md T036
 */
export interface IFacilityRepository {
  findById(id: FacilityId, tenantId: TenantId): Promise<Facility | null>;
  findByTenant(tenantId: TenantId): Promise<Facility[]>;
}

/**
 * Prisma-based FacilityRepository implementation
 * Enforces tenant-scoped queries per User Story 3
 */
export class PrismaFacilityRepository implements IFacilityRepository {
  async findById(id: FacilityId, tenantId: TenantId): Promise<Facility | null> {
    const facility = await prisma.facility.findFirst({
      where: {
        id: id.toString(),
        tenant_id: tenantId.toString(),
      },
    });

    if (!facility) {
      return null;
    }

    return Facility.create(
      facility.id,
      facility.tenant_id,
      facility.name,
      facility.address,
      facility.timezone,
      facility.total_spots,
      facility.status as FacilityStatus,
      facility.created_at
    );
  }

  async findByTenant(tenantId: TenantId): Promise<Facility[]> {
    const facilities = await prisma.facility.findMany({
      where: {
        tenant_id: tenantId.toString(),
        status: 'ACTIVE',
      },
    });

    return facilities.map((facility) =>
      Facility.create(
        facility.id,
        facility.tenant_id,
        facility.name,
        facility.address,
        facility.timezone,
        facility.total_spots,
        facility.status as FacilityStatus,
        facility.created_at
      )
    );
  }
}
