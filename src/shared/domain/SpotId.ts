import { validate as isUUID } from 'uuid';

/**
 * SpotId value object
 * Represents a unique parking spot identifier with UUID validation
 */
export class SpotId {
  private readonly value: string;

  constructor(value: string) {
    if (!isUUID(value)) {
      throw new Error(`Invalid spot ID: ${value}. Must be a valid UUID.`);
    }
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  equals(other: SpotId): boolean {
    return this.value === other.value;
  }

  getValue(): string {
    return this.value;
  }
}
