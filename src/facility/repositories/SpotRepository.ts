import { Spot, SpotStatus } from '../domain/Spot';
import { SpotId } from '../../shared/domain/SpotId';
import { FacilityId } from '../../shared/domain/FacilityId';
import { VehicleType } from '../domain/VehicleType';
import { prisma } from '../../infrastructure/database/PrismaClient';

/**
 * SpotRepository interface
 * Per tasks.md T037
 */
export interface ISpotRepository {
  findAvailableSpot(
    facilityId: FacilityId,
    vehicleType: VehicleType
  ): Promise<Spot | null>;
  updateSpotStatus(spotId: SpotId, status: SpotStatus): Promise<void>;
  countAvailableSpots(facilityId: FacilityId, vehicleType: VehicleType): Promise<number>;
}

/**
 * Prisma-based SpotRepository implementation with pessimistic locking
 * Implements SELECT FOR UPDATE NOWAIT per plan.md lines 150-178
 * Per tasks.md T037
 */
export class PrismaSpotRepository implements ISpotRepository {
  /**
   * Find and lock an available spot atomically
   * Uses pessimistic locking (SELECT FOR UPDATE NOWAIT)
   */
  async findAvailableSpot(
    facilityId: FacilityId,
    vehicleType: VehicleType
  ): Promise<Spot | null> {
    // Use $queryRaw for SELECT FOR UPDATE NOWAIT
    const spots = await prisma.$queryRaw<any[]>`
      SELECT * FROM "Spot"
      WHERE facility_id = ${facilityId.toString()}
        AND vehicle_type = ${vehicleType}::text
        AND status = 'AVAILABLE'
      ORDER BY spot_number ASC
      LIMIT 1
      FOR UPDATE NOWAIT
    `;

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
   */
  async countAvailableSpots(
    facilityId: FacilityId,
    vehicleType: VehicleType
  ): Promise<number> {
    return await prisma.spot.count({
      where: {
        facility_id: facilityId.toString(),
        vehicle_type: vehicleType,
        status: 'AVAILABLE',
      },
    });
  }
}
