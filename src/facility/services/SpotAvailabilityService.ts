import { FacilityId } from '../../shared/domain/FacilityId';
import { VehicleType } from '../domain/VehicleType';
import { ISpotRepository } from '../repositories/SpotRepository';
import { RedisClient } from '../../infrastructure/cache/RedisClient';
import { Logger } from '../../infrastructure/logging/WinstonLogger';

/**
 * SpotAvailabilityService
 * Implements write-through caching pattern per plan.md lines 279-347
 * Per tasks.md T038
 */
export class SpotAvailabilityService {
  constructor(
    private spotRepository: ISpotRepository,
    private cache: RedisClient
  ) {}

  /**
   * Get available spot count with Redis caching
   * Cache-first strategy with 30s TTL
   */
  async getAvailableSpotCount(
    facilityId: FacilityId,
    vehicleType: VehicleType
  ): Promise<number> {
    const cacheKey = `spot:avail:${facilityId.toString()}:${vehicleType}`;

    try {
      // Try cache first
      const cached = await this.cache.get(cacheKey);
      if (cached !== null) {
        Logger.debug('Cache hit for spot availability', {
          facilityId: facilityId.toString(),
          vehicleType,
          count: parseInt(cached, 10),
        });
        return parseInt(cached, 10);
      }

      // Cache miss - query database
      const count = await this.spotRepository.countAvailableSpots(
        facilityId,
        vehicleType
      );

      // Cache with 30s TTL
      await this.cache.set(cacheKey, count.toString(), 30);

      Logger.debug('Cache miss for spot availability', {
        facilityId: facilityId.toString(),
        vehicleType,
        count,
      });

      return count;
    } catch (error) {
      Logger.error('Error fetching spot availability', {
        error: error instanceof Error ? error.message : 'Unknown error',
        facilityId: facilityId.toString(),
        vehicleType,
      });

      // Fallback to database on cache error
      return await this.spotRepository.countAvailableSpots(
        facilityId,
        vehicleType
      );
    }
  }

  /**
   * Invalidate spot availability cache
   * Called after spot assignment
   */
  async invalidateAvailabilityCache(
    facilityId: FacilityId,
    vehicleType: VehicleType
  ): Promise<void> {
    const cacheKey = `spot:avail:${facilityId.toString()}:${vehicleType}`;

    try {
      await this.cache.del(cacheKey);

      Logger.debug('Invalidated spot availability cache', {
        facilityId: facilityId.toString(),
        vehicleType,
      });
    } catch (error) {
      Logger.warn('Failed to invalidate cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        cacheKey,
      });
    }
  }

  /**
   * Publish cache invalidation event via Redis Pub/Sub
   * For distributed cache invalidation across multiple instances
   */
  async publishCacheInvalidation(
    facilityId: FacilityId,
    vehicleType: VehicleType
  ): Promise<void> {
    try {
      await this.cache.publish(
        'spot:invalidate',
        JSON.stringify({
          facilityId: facilityId.toString(),
          vehicleType,
        })
      );

      Logger.debug('Published cache invalidation event', {
        facilityId: facilityId.toString(),
        vehicleType,
      });
    } catch (error) {
      Logger.warn('Failed to publish cache invalidation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
