import { Ticket } from '../domain/Ticket';

/**
 * TicketWriter interface
 * Hardware abstraction for ticket encoding
 * Per plan.md lines 188-213 and tasks.md T044
 */
export interface TicketWriter {
  /**
   * Write ticket data to physical medium
   */
  write(ticket: Ticket): Promise<TicketWriteResult>;

  /**
   * Check if this writer supports the given format
   */
  supports(format: TicketFormat): boolean;
}

export type TicketFormat = 'magnetic_stripe' | 'qr_code' | 'nfc';

export interface TicketWriteResult {
  success: boolean;
  barcode: string;
  format: TicketFormat;
  error?: string;
}
