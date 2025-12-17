import { SpotAvailabilityService } from '../../../src/facility/services/SpotAvailabilityService';
import { FacilityId } from '../../../src/shared/domain/FacilityId';
import { VehicleType } from '../../../src/facility/domain/VehicleType';
import { ISpotRepository } from '../../../src/facility/repositories/SpotRepository';
import { RedisClient } from '../../../src/infrastructure/cache/RedisClient';

/**
 * Unit test for SpotAvailabilityService (T060)
 * Tests caching behavior with mocked repository and Redis
 *
 * Verifies:
 * - Cache hit/miss behavior
 * - Fallback to database on cache failure
 * - Cache invalidation logic
 */
describe('SpotAvailabilityService', () => {
  let service: SpotAvailabilityService;
  let mockSpotRepository: jest.Mocked<ISpotRepository>;
  let mockRedisClient: jest.Mocked<RedisClient>;

  const testFacilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');

  beforeEach(() => {
    // Create mock spot repository
    mockSpotRepository = {
      findAvailableSpot: jest.fn(),
      countAvailableSpots: jest.fn(),
      updateSpotStatus: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<ISpotRepository>;

    // Create mock Redis client
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    } as unknown as jest.Mocked<RedisClient>;

    // Initialize service with mocks
    service = new SpotAvailabilityService(mockSpotRepository, mockRedisClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAvailableSpotCount - Cache behavior', () => {
    it('should return cached value on cache hit', async () => {
      // Arrange
      const cachedCount = '25';
      mockRedisClient.get.mockResolvedValue(cachedCount);

      // Act
      const result = await service.getAvailableSpotCount(testFacilityId, VehicleType.CAR);

      // Assert
      expect(result).toBe(25);
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        `spot:avail:${testFacilityId.toString()}:CAR`
      );
      // Database should NOT be queried on cache hit
      expect(mockSpotRepository.countAvailableSpots).not.toHaveBeenCalled();
      // Cache should NOT be set again
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should query database and cache result on cache miss', async () => {
      // Arrange
      mockRedisClient.get.mockResolvedValue(null); // Cache miss
      mockSpotRepository.countAvailableSpots.mockResolvedValue(42);

      // Act
      const result = await service.getAvailableSpotCount(testFacilityId, VehicleType.ELECTRIC);

      // Assert
      expect(result).toBe(42);

      // Verify cache miss
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        `spot:avail:${testFacilityId.toString()}:ELECTRIC`
      );

      // Verify database query
      expect(mockSpotRepository.countAvailableSpots).toHaveBeenCalledWith(
        testFacilityId,
        VehicleType.ELECTRIC
      );

      // Verify cache update with 30s TTL
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `spot:avail:${testFacilityId.toString()}:ELECTRIC`,
        '42',
        30
      );
    });

    it('should handle cache containing zero spots correctly', async () => {
      // Arrange - Cache has '0' (string)
      mockRedisClient.get.mockResolvedValue('0');

      // Act
      const result = await service.getAvailableSpotCount(testFacilityId, VehicleType.MOTORCYCLE);

      // Assert
      expect(result).toBe(0);
      expect(mockRedisClient.get).toHaveBeenCalled();
      // Should use cached value, not query database
      expect(mockSpotRepository.countAvailableSpots).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableSpotCount - Error handling', () => {
    it('should fallback to database when cache read fails', async () => {
      // Arrange
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection lost'));
      mockSpotRepository.countAvailableSpots.mockResolvedValue(15);

      // Act
      const result = await service.getAvailableSpotCount(testFacilityId, VehicleType.ACCESSIBLE);

      // Assert
      expect(result).toBe(15);

      // Verify database fallback
      expect(mockSpotRepository.countAvailableSpots).toHaveBeenCalledWith(
        testFacilityId,
        VehicleType.ACCESSIBLE
      );
    });

    it('should still return database result even if cache write fails', async () => {
      // Arrange
      mockRedisClient.get.mockResolvedValue(null); // Cache miss
      mockSpotRepository.countAvailableSpots.mockResolvedValue(8);
      mockRedisClient.set.mockRejectedValue(new Error('Redis write failed'));

      // Act
      const result = await service.getAvailableSpotCount(testFacilityId, VehicleType.FAMILY);

      // Assert - Result still returned despite cache write failure
      expect(result).toBe(8);
      expect(mockSpotRepository.countAvailableSpots).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalled();
    });
  });

  describe('getAvailableSpotCount - Multiple vehicle types', () => {
    it('should maintain separate cache keys for different vehicle types', async () => {
      // Arrange
      mockRedisClient.get.mockResolvedValue(null);
      mockSpotRepository.countAvailableSpots
        .mockResolvedValueOnce(50) // CAR
        .mockResolvedValueOnce(10) // MOTORCYCLE
        .mockResolvedValueOnce(5); // TRUCK_BUS

      // Act
      await service.getAvailableSpotCount(testFacilityId, VehicleType.CAR);
      await service.getAvailableSpotCount(testFacilityId, VehicleType.MOTORCYCLE);
      await service.getAvailableSpotCount(testFacilityId, VehicleType.TRUCK_BUS);

      // Assert - Different cache keys used
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `spot:avail:${testFacilityId.toString()}:CAR`,
        '50',
        30
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `spot:avail:${testFacilityId.toString()}:MOTORCYCLE`,
        '10',
        30
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `spot:avail:${testFacilityId.toString()}:TRUCK_BUS`,
        '5',
        30
      );
    });
  });

  describe('invalidateAvailabilityCache', () => {
    it('should delete the correct cache key', async () => {
      // Arrange
      mockRedisClient.del.mockResolvedValue(undefined);

      // Act
      await service.invalidateAvailabilityCache(testFacilityId, VehicleType.CAR);

      // Assert
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `spot:avail:${testFacilityId.toString()}:CAR`
      );
    });

    it('should handle cache deletion errors gracefully', async () => {
      // Arrange
      mockRedisClient.del.mockRejectedValue(new Error('Redis delete failed'));

      // Act & Assert - Should not throw
      await expect(
        service.invalidateAvailabilityCache(testFacilityId, VehicleType.ELECTRIC)
      ).resolves.not.toThrow();

      expect(mockRedisClient.del).toHaveBeenCalled();
    });

    it('should invalidate cache for specific vehicle type only', async () => {
      // Arrange
      mockRedisClient.del.mockResolvedValue(undefined);

      // Act - Invalidate only ELECTRIC spots
      await service.invalidateAvailabilityCache(testFacilityId, VehicleType.ELECTRIC);

      // Assert - Only ELECTRIC cache key deleted
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `spot:avail:${testFacilityId.toString()}:ELECTRIC`
      );
      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishCacheInvalidation', () => {
    it('should publish cache invalidation event to Redis Pub/Sub', async () => {
      // Arrange
      mockRedisClient.publish.mockResolvedValue(undefined);

      // Act
      await service.publishCacheInvalidation(testFacilityId, VehicleType.CAR);

      // Assert
      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'spot:invalidate',
        JSON.stringify({
          facilityId: testFacilityId.toString(),
          vehicleType: VehicleType.CAR,
        })
      );
    });

    it('should handle pub/sub publish errors gracefully', async () => {
      // Arrange
      mockRedisClient.publish.mockRejectedValue(new Error('Pub/Sub failed'));

      // Act & Assert - Should not throw
      await expect(
        service.publishCacheInvalidation(testFacilityId, VehicleType.MOTORCYCLE)
      ).resolves.not.toThrow();

      expect(mockRedisClient.publish).toHaveBeenCalled();
    });

    it('should serialize invalidation event correctly for all vehicle types', async () => {
      // Arrange
      mockRedisClient.publish.mockResolvedValue(undefined);

      const vehicleTypes = [
        VehicleType.CAR,
        VehicleType.MOTORCYCLE,
        VehicleType.ELECTRIC,
        VehicleType.TRUCK_BUS,
        VehicleType.ACCESSIBLE,
        VehicleType.FAMILY,
      ];

      // Act & Assert
      for (const vehicleType of vehicleTypes) {
        await service.publishCacheInvalidation(testFacilityId, vehicleType);

        expect(mockRedisClient.publish).toHaveBeenCalledWith(
          'spot:invalidate',
          JSON.stringify({
            facilityId: testFacilityId.toString(),
            vehicleType,
          })
        );
      }
    });
  });

  describe('Cache TTL behavior', () => {
    it('should always use 30 second TTL for cached values', async () => {
      // Arrange
      mockRedisClient.get.mockResolvedValue(null);
      mockSpotRepository.countAvailableSpots.mockResolvedValue(100);

      // Act
      await service.getAvailableSpotCount(testFacilityId, VehicleType.CAR);

      // Assert - TTL is 30 seconds
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.any(String),
        '100',
        30 // TTL in seconds
      );
    });
  });
});
