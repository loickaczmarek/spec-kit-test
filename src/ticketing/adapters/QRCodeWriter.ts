import { Ticket } from '../domain/Ticket';
import { TicketWriter, TicketFormat, TicketWriteResult } from './TicketWriter';
import { Logger } from '../../infrastructure/logging/WinstonLogger';

/**
 * QRCodeWriter
 * Stub implementation for future QR code ticket format support
 * Per plan.md and tasks.md T046
 */
export class QRCodeWriter implements TicketWriter {
  supports(format: TicketFormat): boolean {
    return format === 'qr_code';
  }

  async write(ticket: Ticket): Promise<TicketWriteResult> {
    // Stub implementation - generates a simple QR code format barcode
    // Format: QR|{ticket_id}|{spot_id}
    const barcode = `QR|${ticket.id.toString().substring(0, 8)}|${ticket.spotId.toString().substring(0, 8)}`;

    Logger.info('QR code ticket generated', {
      ticket_id: ticket.id.toString(),
      barcode,
    });

    return {
      success: true,
      barcode,
      format: 'qr_code',
    };
  }
}
