import { validate as isUUID } from 'uuid';
import { v7 as uuidv7 } from 'uuid';

/**
 * TicketId value object
 * Represents a unique ticket identifier with UUIDv7 support (time-sortable)
 */
export class TicketId {
  private readonly value: string;

  constructor(value: string) {
    if (!isUUID(value)) {
      throw new Error(`Invalid ticket ID: ${value}. Must be a valid UUID.`);
    }
    this.value = value;
  }

  /**
   * Generate a new time-sortable UUIDv7 ticket ID
   */
  static generate(): TicketId {
    return new TicketId(uuidv7());
  }

  toString(): string {
    return this.value;
  }

  equals(other: TicketId): boolean {
    return this.value === other.value;
  }

  getValue(): string {
    return this.value;
  }
}
