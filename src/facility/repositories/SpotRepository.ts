import { Spot, SpotStatus } from '../domain/Spot';
import { SpotId } from '../../shared/domain/SpotId';
import { FacilityId } from '../../shared/domain/FacilityId';
import { TenantId } from '../../shared/domain/TenantId';
import { VehicleType } from '../domain/VehicleType';
import { prisma } from '../../infrastructure/database/PrismaClient';

/**
 * SpotRepository interface
 * Per tasks.md T037 and T071 (User Story 3 - tenant isolation)
 */
export interface ISpotRepository {
  findAvailableSpot(facilityId: FacilityId, vehicleType: VehicleType, tenantId?: TenantId): Promise<Spot | null>;
  updateSpotStatus(spotId: SpotId, status: SpotStatus): Promise<void>;
  countAvailableSpots(facilityId: FacilityId, vehicleType: VehicleType, tenantId?: TenantId): Promise<number>;
}

/**
 * Prisma-based SpotRepository implementation with pessimistic locking
 * Implements SELECT FOR UPDATE NOWAIT per plan.md lines 150-178
 * Per tasks.md T037 and T071 (User Story 3 - tenant isolation)
 */
export class PrismaSpotRepository implements ISpotRepository {
  /**
   * Find and lock an available spot atomically
   * Uses pessimistic locking (SELECT FOR UPDATE NOWAIT)
   * Enforces tenant isolation by joining through Facility table (T071)
   */
  async findAvailableSpot(facilityId: FacilityId, vehicleType: VehicleType, tenantId?: TenantId): Promise<Spot | null> {
    // Use $queryRaw for SELECT FOR UPDATE NOWAIT with tenant isolation
    const query = tenantId
      ? prisma.$queryRaw<any[]>`
          SELECT s.* FROM "facility_spots" s
          INNER JOIN "facilities" f ON s.facility_id = f.id
          WHERE s.facility_id = ${facilityId.toString()}
            AND f.tenant_id = ${tenantId.toString()}
            AND s.vehicle_type::text = ${vehicleType}
            AND s.status = 'AVAILABLE'
          ORDER BY s.spot_number ASC
          LIMIT 1
          FOR UPDATE NOWAIT
        `
      : prisma.$queryRaw<any[]>`
          SELECT * FROM "facility_spots"
          WHERE facility_id = ${facilityId.toString()}
            AND vehicle_type::text = ${vehicleType}
            AND status = 'AVAILABLE'
          ORDER BY spot_number ASC
          LIMIT 1
          FOR UPDATE NOWAIT
        `;

    const spots = await query;

    if (!spots || spots.length === 0) {
      return null;
    }

    const spot = spots[0];

    return Spot.create(
      spot.id,
      spot.facility_id,
      spot.spot_number,
      spot.vehicle_type as VehicleType,
      spot.status as SpotStatus,
      spot.version,
      spot.created_at,
      spot.updated_at
    );
  }

  /**
   * Update spot status
   * Should be called within the same transaction as findAvailableSpot
   */
  async updateSpotStatus(spotId: SpotId, status: SpotStatus): Promise<void> {
    await prisma.spot.update({
      where: { id: spotId.toString() },
      data: {
        status: status,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Count available spots for a facility and vehicle type
   * Used for availability queries (not transactional)
   * Enforces tenant isolation when tenantId provided (T071)
   */
  async countAvailableSpots(facilityId: FacilityId, vehicleType: VehicleType, tenantId?: TenantId): Promise<number> {
    if (tenantId) {
      // Join through Facility to enforce tenant isolation
      return await prisma.spot.count({
        where: {
          facility_id: facilityId.toString(),
          vehicle_type: vehicleType,
          status: 'AVAILABLE',
          facility: {
            tenant_id: tenantId.toString(),
          },
        },
      });
    } else {
      // Legacy behavior without tenant filtering
      return await prisma.spot.count({
        where: {
          facility_id: facilityId.toString(),
          vehicle_type: vehicleType,
          status: 'AVAILABLE',
        },
      });
    }
  }
}
