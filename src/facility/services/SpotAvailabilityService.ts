import { FacilityId } from '../../shared/domain/FacilityId';
import { TenantId } from '../../shared/domain/TenantId';
import { VehicleType } from '../domain/VehicleType';
import { ISpotRepository } from '../repositories/SpotRepository';
import { RedisClient } from '../../infrastructure/cache/RedisClient';
import { Logger } from '../../infrastructure/logging/WinstonLogger';

/**
 * SpotAvailabilityService
 * Implements write-through caching pattern per plan.md lines 279-347
 * Per tasks.md T038 and T071 (User Story 3 - tenant isolation)
 */
export class SpotAvailabilityService {
  constructor(
    private spotRepository: ISpotRepository,
    private cache: RedisClient
  ) {}

  /**
   * Get available spot count with Redis caching
   * Cache-first strategy with 30s TTL
   * Enforces tenant isolation when tenantId provided (T071)
   */
  async getAvailableSpotCount(facilityId: FacilityId, vehicleType: VehicleType, tenantId?: TenantId): Promise<number> {
    const cacheKey = tenantId
      ? `spot:avail:${tenantId.toString()}:${facilityId.toString()}:${vehicleType}`
      : `spot:avail:${facilityId.toString()}:${vehicleType}`;

    try {
      // Try cache first
      const cached = await this.cache.get(cacheKey);
      if (cached !== null) {
        Logger.debug('Cache hit for spot availability', {
          facilityId: facilityId.toString(),
          vehicleType,
          tenantId: tenantId?.toString(),
          count: parseInt(cached, 10),
        });
        return parseInt(cached, 10);
      }

      // Cache miss - query database with tenant filtering
      const count = await this.spotRepository.countAvailableSpots(facilityId, vehicleType, tenantId);

      // Cache with 30s TTL
      await this.cache.set(cacheKey, count.toString(), 30);

      Logger.debug('Cache miss for spot availability', {
        facilityId: facilityId.toString(),
        vehicleType,
        tenantId: tenantId?.toString(),
        count,
      });

      return count;
    } catch (error) {
      Logger.error('Error fetching spot availability', {
        error: error instanceof Error ? error.message : 'Unknown error',
        facilityId: facilityId.toString(),
        vehicleType,
        tenantId: tenantId?.toString(),
      });

      // Fallback to database on cache error
      return await this.spotRepository.countAvailableSpots(facilityId, vehicleType, tenantId);
    }
  }

  /**
   * Invalidate spot availability cache
   * Called after spot assignment
   * Invalidates both tenant-specific and non-tenant cache keys for compatibility
   */
  async invalidateAvailabilityCache(
    facilityId: FacilityId,
    vehicleType: VehicleType,
    tenantId?: TenantId
  ): Promise<void> {
    const cacheKeys = [
      `spot:avail:${facilityId.toString()}:${vehicleType}`, // Legacy key
    ];

    if (tenantId) {
      cacheKeys.push(`spot:avail:${tenantId.toString()}:${facilityId.toString()}:${vehicleType}`);
    }

    try {
      await Promise.all(cacheKeys.map((key) => this.cache.del(key)));

      Logger.debug('Invalidated spot availability cache', {
        facilityId: facilityId.toString(),
        vehicleType,
        tenantId: tenantId?.toString(),
        keysInvalidated: cacheKeys.length,
      });
    } catch (error) {
      Logger.warn('Failed to invalidate cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
        cacheKeys,
      });
    }
  }

  /**
   * Publish cache invalidation event via Redis Pub/Sub
   * For distributed cache invalidation across multiple instances
   */
  async publishCacheInvalidation(facilityId: FacilityId, vehicleType: VehicleType, tenantId?: TenantId): Promise<void> {
    try {
      await this.cache.publish(
        'spot:invalidate',
        JSON.stringify({
          facilityId: facilityId.toString(),
          vehicleType,
          tenantId: tenantId?.toString(),
        })
      );

      Logger.debug('Published cache invalidation event', {
        facilityId: facilityId.toString(),
        vehicleType,
        tenantId: tenantId?.toString(),
      });
    } catch (error) {
      Logger.warn('Failed to publish cache invalidation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
