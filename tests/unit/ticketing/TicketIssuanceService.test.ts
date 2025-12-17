import { TicketIssuanceService } from '../../../src/ticketing/services/TicketIssuanceService';
import { TenantId } from '../../../src/shared/domain/TenantId';
import { FacilityId } from '../../../src/shared/domain/FacilityId';
import { VehicleType } from '../../../src/facility/domain/VehicleType';
import { IFacilityRepository } from '../../../src/facility/repositories/FacilityRepository';
import { IEventPublisher } from '../../../src/shared/events/EventPublisher';
import { Facility, FacilityStatus } from '../../../src/facility/domain/Facility';
import { AppError } from '../../../src/shared/errors/AppError';
import { prisma } from '../../../src/infrastructure/database/PrismaClient';

/**
 * Unit test for TicketIssuanceService (T059)
 * Tests business logic with mocked repositories
 *
 * Verifies:
 * - Transaction logic for spot assignment + ticket creation
 * - Event publishing after successful ticket issuance
 * - Error handling for facility validation and spot availability
 */
describe('TicketIssuanceService', () => {
  let service: TicketIssuanceService;
  let mockFacilityRepository: jest.Mocked<IFacilityRepository>;
  let mockEventPublisher: jest.Mocked<IEventPublisher>;

  const testTenantId = new TenantId('550e8400-e29b-41d4-a716-446655440000');
  const testFacilityId = new FacilityId('7c9e6679-7425-40de-944b-e07fc1f90ae7');

  beforeEach(() => {
    // Create mock facility repository
    mockFacilityRepository = {
      findById: jest.fn(),
      findByTenant: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<IFacilityRepository>;

    // Create mock event publisher
    mockEventPublisher = {
      publish: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as jest.Mocked<IEventPublisher>;

    // Initialize service with mocks
    service = new TicketIssuanceService(mockFacilityRepository, mockEventPublisher);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('issueTicket - Success scenarios', () => {
    it('should issue a ticket when facility exists and spot is available', async () => {
      // Arrange
      const mockFacility = Facility.create(
        testFacilityId.toString(),
        testTenantId.toString(),
        'Test Garage',
        '123 Test St',
        'Europe/Paris',
        100
      );

      mockFacilityRepository.findById.mockResolvedValue(mockFacility);

      // Mock $queryRaw to return an available spot
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          facility_id: testFacilityId.toString(),
          spot_number: 'A-001',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      // Mock Prisma transaction (simplified for unit test)
      // In real scenario, we'd use a test database or more sophisticated mocking
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          spot: {
            update: jest.fn().mockResolvedValue({}),
          },
          ticket: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        return await callback(mockTx);
      });

      mockEventPublisher.publish.mockResolvedValue();

      // Act
      const ticket = await service.issueTicket(testTenantId, testFacilityId, VehicleType.CAR);

      // Assert
      expect(ticket).toBeTruthy();
      expect(ticket.tenantId.toString()).toBe(testTenantId.toString());
      expect(ticket.facilityId.toString()).toBe(testFacilityId.toString());
      expect(ticket.vehicleType).toBe(VehicleType.CAR);
      expect(ticket.status).toBe('ISSUED');

      // Verify facility lookup
      expect(mockFacilityRepository.findById).toHaveBeenCalledWith(testFacilityId, testTenantId);

      // Verify event published
      expect(mockEventPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: testTenantId.toString(),
          facility_id: testFacilityId.toString(),
        }),
        'tickets.issued.v1'
      );
    });

    it('should continue ticket issuance even if event publishing fails', async () => {
      // Arrange
      const mockFacility = Facility.create(
        testFacilityId.toString(),
        testTenantId.toString(),
        'Test Garage',
        '123 Test St',
        'Europe/Paris',
        100
      );

      mockFacilityRepository.findById.mockResolvedValue(mockFacility);

      // Mock $queryRaw to return an available spot
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([
        {
          id: 'c3d4e5f6-a7b8-4012-9def-012345678901',
          facility_id: testFacilityId.toString(),
          spot_number: 'A-001',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          spot: {
            update: jest.fn().mockResolvedValue({}),
          },
          ticket: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        return await callback(mockTx);
      });

      // Event publishing fails
      mockEventPublisher.publish.mockRejectedValue(new Error('Kafka unavailable'));

      // Act
      const ticket = await service.issueTicket(testTenantId, testFacilityId, VehicleType.CAR);

      // Assert - Ticket still issued successfully
      expect(ticket).toBeTruthy();
      expect(ticket.status).toBe('ISSUED');

      // Event publishing was attempted
      expect(mockEventPublisher.publish).toHaveBeenCalled();
    });
  });

  describe('issueTicket - Error scenarios', () => {
    it('should throw 404 error when facility does not exist', async () => {
      // Arrange
      mockFacilityRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.issueTicket(testTenantId, testFacilityId, VehicleType.CAR)
      ).rejects.toThrow(AppError);

      await expect(
        service.issueTicket(testTenantId, testFacilityId, VehicleType.CAR)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringContaining('does not exist'),
      });

      expect(mockFacilityRepository.findById).toHaveBeenCalled();
    });

    it('should throw 409 error when facility is not active', async () => {
      // Arrange
      const inactiveFacility = Facility.create(
        testFacilityId.toString(),
        testTenantId.toString(),
        'Closed Garage',
        '456 Closed St',
        'Europe/Paris',
        50,
        FacilityStatus.CLOSED
      );

      mockFacilityRepository.findById.mockResolvedValue(inactiveFacility);

      // Act & Assert
      await expect(
        service.issueTicket(testTenantId, testFacilityId, VehicleType.CAR)
      ).rejects.toThrow(AppError);

      await expect(
        service.issueTicket(testTenantId, testFacilityId, VehicleType.CAR)
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('not currently accepting'),
      });
    });

    it('should throw 409 error when no spots available for vehicle type', async () => {
      // Arrange
      const mockFacility = Facility.create(
        testFacilityId.toString(),
        testTenantId.toString(),
        'Full Garage',
        '789 Full St',
        'Europe/Paris',
        100
      );

      mockFacilityRepository.findById.mockResolvedValue(mockFacility);

      // Mock $queryRaw to return no available spots
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([]);

      // Mock transaction with no available spots
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          spot: {
            update: jest.fn(),
          },
          ticket: {
            create: jest.fn(),
          },
        };

        return await callback(mockTx);
      });

      // Act & Assert
      await expect(
        service.issueTicket(testTenantId, testFacilityId, VehicleType.ELECTRIC)
      ).rejects.toThrow(AppError);

      await expect(
        service.issueTicket(testTenantId, testFacilityId, VehicleType.ELECTRIC)
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('No available parking spots'),
      });
    });
  });

  describe('issueTicket - Vehicle type validation', () => {
    it('should correctly handle different vehicle types', async () => {
      // Arrange
      const mockFacility = Facility.create(
        testFacilityId.toString(),
        testTenantId.toString(),
        'Multi-Type Garage',
        '101 Variety Blvd',
        'Europe/Paris',
        200
      );

      mockFacilityRepository.findById.mockResolvedValue(mockFacility);

      // Mock $queryRaw to return an available spot for any vehicle type
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([
        {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          facility_id: testFacilityId.toString(),
          spot_number: 'M-001',
          vehicle_type: 'CAR', // Will be called multiple times with different types
          status: 'AVAILABLE',
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as any);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          spot: {
            update: jest.fn().mockResolvedValue({}),
          },
          ticket: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        return await callback(mockTx);
      });

      mockEventPublisher.publish.mockResolvedValue();

      // Test each vehicle type
      const vehicleTypes = [
        VehicleType.CAR,
        VehicleType.MOTORCYCLE,
        VehicleType.ELECTRIC,
        VehicleType.TRUCK_BUS,
        VehicleType.ACCESSIBLE,
        VehicleType.FAMILY,
      ];

      for (const vehicleType of vehicleTypes) {
        // Act
        const ticket = await service.issueTicket(testTenantId, testFacilityId, vehicleType);

        // Assert
        expect(ticket.vehicleType).toBe(vehicleType);
      }
    });
  });

  describe('issueTicket - Barcode handling', () => {
    it('should accept optional barcode parameter', async () => {
      // Arrange
      const mockFacility = Facility.create(
        testFacilityId.toString(),
        testTenantId.toString(),
        'Test Garage',
        '123 Test St',
        'Europe/Paris',
        100
      );

      mockFacilityRepository.findById.mockResolvedValue(mockFacility);

      // Mock $queryRaw to return an available spot
      jest.spyOn(prisma, '$queryRaw').mockResolvedValue([
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          facility_id: testFacilityId.toString(),
          spot_number: 'A-001',
          vehicle_type: 'CAR',
          status: 'AVAILABLE',
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const mockTx = {
          spot: {
            update: jest.fn().mockResolvedValue({}),
          },
          ticket: {
            create: jest.fn().mockResolvedValue({}),
          },
        };

        return await callback(mockTx);
      });

      mockEventPublisher.publish.mockResolvedValue();

      const customBarcode = 'MAG|123456789|A-001';

      // Act
      const ticket = await service.issueTicket(
        testTenantId,
        testFacilityId,
        VehicleType.CAR,
        customBarcode
      );

      // Assert
      expect(ticket.barcode).toBe(customBarcode);
    });
  });
});
