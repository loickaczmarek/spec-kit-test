import { TicketIssuanceService } from '../../../src/ticketing/services/TicketIssuanceService';
import { NoSpotsAvailableError } from '../../../src/shared/errors/NoSpotsAvailableError';
import { TenantId } from '../../../src/shared/domain/TenantId';
import { FacilityId } from '../../../src/shared/domain/FacilityId';
import { VehicleType } from '../../../src/facility/domain/VehicleType';
import { IFacilityRepository } from '../../../src/facility/repositories/FacilityRepository';
import { IEventPublisher } from '../../../src/shared/events/EventPublisher';

/**
 * Unit test for NoSpotsAvailableError handling (T069)
 * Tests User Story 2: Error handling when no spots available
 *
 * Verifies:
 * - NoSpotsAvailableError is thrown with correct properties
 * - Error has status code 409
 * - Error message includes vehicle type
 * - Error code is NO_SPOTS_AVAILABLE
 */

// Mock Prisma
jest.mock('../../../src/infrastructure/database/PrismaClient', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

// Mock PrismaSpotRepository
jest.mock('../../../src/facility/repositories/SpotRepository', () => ({
  PrismaSpotRepository: jest.fn().mockImplementation(() => ({
    findAvailableSpot: jest.fn().mockResolvedValue(null), // No spots available
  })),
}));

describe('TicketIssuanceService - NoSpotsAvailableError Handling', () => {
  let service: TicketIssuanceService;
  let mockFacilityRepository: jest.Mocked<IFacilityRepository>;
  let mockEventPublisher: jest.Mocked<IEventPublisher>;
  let prisma: any;

  beforeEach(() => {
    // Setup mocks
    mockFacilityRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    } as any;

    mockEventPublisher = {
      publish: jest.fn(),
    } as any;

    // Get mocked prisma
    prisma = require('../../../src/infrastructure/database/PrismaClient').prisma;

    // Create service instance
    service = new TicketIssuanceService(mockFacilityRepository, mockEventPublisher);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('NoSpotsAvailableError properties', () => {
    it('should throw NoSpotsAvailableError with status code 409', async () => {
      // Arrange
      const tenantId = new TenantId('550e8400-e29b-41d4-a716-446655440000');
      const facilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      const vehicleType = VehicleType.CAR;

      // Mock facility exists and is active
      mockFacilityRepository.findById.mockResolvedValue({
        id: facilityId,
        tenantId,
        name: 'Test Facility',
        address: '123 Test St',
        timezone: 'Europe/Paris',
        totalSpots: 50,
        status: 'ACTIVE',
        createdAt: new Date(),
        isActive: () => true,
      } as any);

      // Mock transaction to execute callback and simulate no spots
      prisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          spot: { update: jest.fn() },
          ticket: { create: jest.fn() },
        });
      });

      // Act & Assert
      await expect(
        service.issueTicket(tenantId, facilityId, vehicleType)
      ).rejects.toThrow(NoSpotsAvailableError);

      try {
        await service.issueTicket(tenantId, facilityId, vehicleType);
      } catch (error) {
        expect(error).toBeInstanceOf(NoSpotsAvailableError);
        if (error instanceof NoSpotsAvailableError) {
          expect(error.statusCode).toBe(409);
        }
      }
    });

    it('should include correct error code NO_SPOTS_AVAILABLE', async () => {
      // Arrange
      const tenantId = new TenantId('550e8400-e29b-41d4-a716-446655440000');
      const facilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      const vehicleType = VehicleType.MOTORCYCLE;

      mockFacilityRepository.findById.mockResolvedValue({
        id: facilityId,
        tenantId,
        name: 'Test Facility',
        address: '123 Test St',
        timezone: 'Europe/Paris',
        totalSpots: 30,
        status: 'ACTIVE',
        createdAt: new Date(),
        isActive: () => true,
      } as any);

      prisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          spot: { update: jest.fn() },
          ticket: { create: jest.fn() },
        });
      });

      // Act & Assert
      try {
        await service.issueTicket(tenantId, facilityId, vehicleType);
        fail('Expected NoSpotsAvailableError to be thrown');
      } catch (error) {
        if (error instanceof NoSpotsAvailableError) {
          expect(error.errorCode).toBe('NO_SPOTS_AVAILABLE');
        }
      }
    });

    it('should include vehicle type in error message', async () => {
      // Arrange
      const tenantId = new TenantId('550e8400-e29b-41d4-a716-446655440000');
      const facilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      const vehicleType = VehicleType.ELECTRIC;

      mockFacilityRepository.findById.mockResolvedValue({
        id: facilityId,
        tenantId,
        name: 'Green Garage',
        address: '456 EV Street',
        timezone: 'Europe/Paris',
        totalSpots: 20,
        status: 'ACTIVE',
        createdAt: new Date(),
        isActive: () => true,
      } as any);

      prisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          spot: { update: jest.fn() },
          ticket: { create: jest.fn() },
        });
      });

      // Act & Assert
      try {
        await service.issueTicket(tenantId, facilityId, vehicleType);
        fail('Expected NoSpotsAvailableError to be thrown');
      } catch (error) {
        if (error instanceof NoSpotsAvailableError) {
          expect(error.message).toContain('ELECTRIC');
          expect(error.vehicleType).toBe(VehicleType.ELECTRIC);
        }
      }
    });

    it('should include facility information in error details', async () => {
      // Arrange
      const tenantId = new TenantId('550e8400-e29b-41d4-a716-446655440000');
      const facilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      const vehicleType = VehicleType.TRUCK_BUS;
      const facilityName = 'Large Vehicle Parking';

      mockFacilityRepository.findById.mockResolvedValue({
        id: facilityId,
        tenantId,
        name: facilityName,
        address: '789 Truck Ave',
        timezone: 'Europe/Paris',
        totalSpots: 15,
        status: 'ACTIVE',
        createdAt: new Date(),
        isActive: () => true,
      } as any);

      prisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          spot: { update: jest.fn() },
          ticket: { create: jest.fn() },
        });
      });

      // Act & Assert
      try {
        await service.issueTicket(tenantId, facilityId, vehicleType);
        fail('Expected NoSpotsAvailableError to be thrown');
      } catch (error) {
        if (error instanceof NoSpotsAvailableError) {
          expect(error.facilityId).toBe(facilityId.toString());
          expect(error.message).toContain(facilityName);
          expect(error.details).toHaveProperty('facility_id');
          expect(error.details?.facility_id).toBe(facilityId.toString());
        }
      }
    });
  });

  describe('Error handling behavior', () => {
    it('should not create ticket when NoSpotsAvailableError is thrown', async () => {
      // Arrange
      const tenantId = new TenantId('550e8400-e29b-41d4-a716-446655440000');
      const facilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      const vehicleType = VehicleType.CAR;

      mockFacilityRepository.findById.mockResolvedValue({
        id: facilityId,
        tenantId,
        name: 'Test Facility',
        address: '123 Test St',
        timezone: 'Europe/Paris',
        totalSpots: 50,
        status: 'ACTIVE',
        createdAt: new Date(),
        isActive: () => true,
      } as any);

      const mockTicketCreate = jest.fn();
      prisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          spot: { update: jest.fn() },
          ticket: { create: mockTicketCreate },
        });
      });

      // Act
      try {
        await service.issueTicket(tenantId, facilityId, vehicleType);
        fail('Expected NoSpotsAvailableError to be thrown');
      } catch (error) {
        // Assert - ticket.create should not be called
        expect(mockTicketCreate).not.toHaveBeenCalled();
      }
    });

    it('should not publish event when NoSpotsAvailableError is thrown', async () => {
      // Arrange
      const tenantId = new TenantId('550e8400-e29b-41d4-a716-446655440000');
      const facilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      const vehicleType = VehicleType.CAR;

      mockFacilityRepository.findById.mockResolvedValue({
        id: facilityId,
        tenantId,
        name: 'Test Facility',
        address: '123 Test St',
        timezone: 'Europe/Paris',
        totalSpots: 50,
        status: 'ACTIVE',
        createdAt: new Date(),
        isActive: () => true,
      } as any);

      prisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback({
          spot: { update: jest.fn() },
          ticket: { create: jest.fn() },
        });
      });

      // Act
      try {
        await service.issueTicket(tenantId, facilityId, vehicleType);
        fail('Expected NoSpotsAvailableError to be thrown');
      } catch (error) {
        // Assert - event should not be published
        expect(mockEventPublisher.publish).not.toHaveBeenCalled();
      }
    });
  });

  describe('Different vehicle types', () => {
    const testCases = [
      { vehicleType: VehicleType.CAR, expected: 'CAR' },
      { vehicleType: VehicleType.MOTORCYCLE, expected: 'MOTORCYCLE' },
      { vehicleType: VehicleType.ELECTRIC, expected: 'ELECTRIC' },
      { vehicleType: VehicleType.TRUCK_BUS, expected: 'TRUCK_BUS' },
      { vehicleType: VehicleType.ACCESSIBLE, expected: 'ACCESSIBLE' },
      { vehicleType: VehicleType.FAMILY, expected: 'FAMILY' },
    ];

    testCases.forEach(({ vehicleType, expected }) => {
      it(`should throw NoSpotsAvailableError for ${expected} vehicle type`, async () => {
        // Arrange
        const tenantId = new TenantId('550e8400-e29b-41d4-a716-446655440000');
        const facilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');

        mockFacilityRepository.findById.mockResolvedValue({
          id: facilityId,
          tenantId,
          name: 'Test Facility',
          address: '123 Test St',
          timezone: 'Europe/Paris',
          totalSpots: 50,
          status: 'ACTIVE',
          createdAt: new Date(),
          isActive: () => true,
        } as any);

        prisma.$transaction.mockImplementation(async (callback: any) => {
          return await callback({
            spot: { update: jest.fn() },
            ticket: { create: jest.fn() },
          });
        });

        // Act & Assert
        try {
          await service.issueTicket(tenantId, facilityId, vehicleType);
          fail(`Expected NoSpotsAvailableError to be thrown for ${expected}`);
        } catch (error) {
          expect(error).toBeInstanceOf(NoSpotsAvailableError);
          if (error instanceof NoSpotsAvailableError) {
            expect(error.vehicleType).toBe(vehicleType);
            expect(error.message).toContain(expected);
          }
        }
      });
    });
  });
});
