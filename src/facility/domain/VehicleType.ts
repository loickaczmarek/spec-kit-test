/**
 * VehicleType value object
 * Supported vehicle types for spot compatibility
 * Per data-model.md lines 110-129
 */
export enum VehicleType {
  MOTORCYCLE = 'MOTORCYCLE',
  CAR = 'CAR',
  ELECTRIC = 'ELECTRIC',
  TRUCK_BUS = 'TRUCK_BUS',
  ACCESSIBLE = 'ACCESSIBLE',
  FAMILY = 'FAMILY',
}

/**
 * Map French user input to VehicleType enum
 * Per spec.md FR-001 and data-model.md lines 122-129
 */
export function mapFrenchToVehicleType(frenchInput: string): VehicleType {
  const mapping: Record<string, VehicleType> = {
    moto: VehicleType.MOTORCYCLE,
    voiture: VehicleType.CAR,
    électrique: VehicleType.ELECTRIC,
    'camion/bus': VehicleType.TRUCK_BUS,
    handicapé: VehicleType.ACCESSIBLE,
    familial: VehicleType.FAMILY,
  };

  const normalized = frenchInput.toLowerCase().trim();
  const vehicleType = mapping[normalized];

  if (!vehicleType) {
    throw new Error(
      `Invalid vehicle type: "${frenchInput}". Must be one of: ${Object.keys(mapping).join(', ')}`
    );
  }

  return vehicleType;
}

/**
 * Validate if a string is a valid VehicleType enum value
 */
export function isValidVehicleType(value: string): value is VehicleType {
  return Object.values(VehicleType).includes(value as VehicleType);
}
