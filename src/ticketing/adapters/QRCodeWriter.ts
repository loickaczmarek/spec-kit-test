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
    // Stub implementation - not yet supported
    Logger.warn('QR code format not yet implemented', {
      ticket_id: ticket.id.toString(),
    });

    return {
      success: false,
      barcode: '',
      format: 'qr_code',
      error: 'QR code format not yet implemented',
    };
  }
}
