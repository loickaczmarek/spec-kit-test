import { v7 as uuidv7 } from 'uuid';

/**
 * Base class for all domain events
 * Provides common event metadata and structure
 */
export abstract class DomainEvent {
  public readonly event_id: string;
  public readonly timestamp: string;
  public readonly schema_version: string;

  constructor(schemaVersion: string) {
    this.event_id = uuidv7();
    this.timestamp = new Date().toISOString();
    this.schema_version = schemaVersion;
  }

  /**
   * Get the event type name
   */
  abstract getEventType(): string;

  /**
   * Serialize the event to JSON
   */
  abstract toJSON(): Record<string, any>;
}
