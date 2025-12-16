import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { DomainEvent } from './DomainEvent';

/**
 * EventPublisher interface for publishing domain events
 */
export interface IEventPublisher {
  publish(event: DomainEvent, topic: string): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Kafka-based event publisher with idempotent producer configuration
 * Implements exactly-once semantics per plan.md Implementation Guidelines
 */
export class KafkaEventPublisher implements IEventPublisher {
  private kafka: Kafka;
  private producer: Producer;
  private connected: boolean = false;

  constructor(brokers: string[], clientId: string = 'ticketing-service') {
    this.kafka = new Kafka({
      clientId,
      brokers,
    });

    // Configure producer for exactly-once semantics
    this.producer = this.kafka.producer({
      transactionalId: 'ticketing-producer-001',
      maxInFlightRequests: 1,
      idempotent: true,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
    }
  }

  async publish(event: DomainEvent, topic: string): Promise<void> {
    if (!this.connected) {
      throw new Error('EventPublisher not connected. Call connect() first.');
    }

    const message: ProducerRecord = {
      topic,
      messages: [
        {
          key: event.event_id,
          value: JSON.stringify(event.toJSON()),
          headers: {
            'event-type': event.getEventType(),
          },
        },
      ],
    };

    await this.producer.send(message);
  }
}
