import { Ticket } from '../domain/Ticket';
import { TicketWriter, TicketFormat, TicketWriteResult } from './TicketWriter';
import { Logger } from '../../infrastructure/logging/WinstonLogger';

/**
 * NFCWriter
 * Stub implementation for future NFC ticket format support
 * Per plan.md and tasks.md T047
 */
export class NFCWriter implements TicketWriter {
  supports(format: TicketFormat): boolean {
    return format === 'nfc';
  }

  async write(ticket: Ticket): Promise<TicketWriteResult> {
    // Stub implementation - not yet supported
    Logger.warn('NFC format not yet implemented', {
      ticket_id: ticket.id.toString(),
    });

    return {
      success: false,
      barcode: '',
      format: 'nfc',
      error: 'NFC format not yet implemented',
    };
  }
}
