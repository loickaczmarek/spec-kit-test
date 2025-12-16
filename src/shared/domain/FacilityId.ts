import { validate as isUUID } from 'uuid';

/**
 * FacilityId value object
 * Represents a unique facility identifier with UUID validation
 */
export class FacilityId {
  private readonly value: string;

  constructor(value: string) {
    if (!isUUID(value)) {
      throw new Error(`Invalid facility ID: ${value}. Must be a valid UUID.`);
    }
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: FacilityId): boolean {
    return this.value === other.value;
  }

  getValue(): string {
    return this.value;
  }
}
