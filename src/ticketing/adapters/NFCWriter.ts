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
    // Stub implementation - generates a simple NFC format barcode
    // Format: NFC|{ticket_id}|{spot_id}
    const barcode = `NFC|${ticket.id.toString().substring(0, 8)}|${ticket.spotId.toString().substring(0, 8)}`;

    Logger.info('NFC ticket generated', {
      ticket_id: ticket.id.toString(),
      barcode,
    });

    return {
      success: true,
      barcode,
      format: 'nfc',
    };
  }
}
