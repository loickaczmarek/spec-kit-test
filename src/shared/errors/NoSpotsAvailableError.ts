import { AppError } from './AppError';
import { FacilityId } from '../domain/FacilityId';
import { VehicleType } from '../../facility/domain/VehicleType';

/**
 * NoSpotsAvailableError
 * Thrown when no parking spots are available for the requested vehicle type
 * Maps to HTTP 409 Conflict response
 * Per tasks.md T063
 */
export class NoSpotsAvailableError extends AppError {
  public readonly errorCode: string = 'NO_SPOTS_AVAILABLE';
  public readonly facilityId: string;
  public readonly vehicleType: VehicleType;

  constructor(facilityId: FacilityId, vehicleType: VehicleType, facilityName?: string) {
    const message = facilityName
      ? `Aucune place disponible pour type véhicule: ${vehicleType} à ${facilityName}`
      : `Aucune place disponible pour type véhicule: ${vehicleType}`;

    super(message, 409, true, {
      error_code: 'NO_SPOTS_AVAILABLE',
      facility_id: facilityId.toString(),
      vehicle_type: vehicleType,
    });

    this.facilityId = facilityId.toString();
    this.vehicleType = vehicleType;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}
