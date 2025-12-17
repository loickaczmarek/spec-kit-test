import winston from 'winston';

/**
 * Winston logger configuration with structured JSON logging
 * Configured per plan.md Implementation Guidelines
 */
const logLevel = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'ticketing-service' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
          }
          return msg;
        })
      ),
    }),
    // Write all logs to file in production
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: winston.format.json(),
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            format: winston.format.json(),
          }),
        ]
      : []),
  ],
});

/**
 * Structured logger with correlation ID support
 */
export class Logger {
  /**
   * Log an error message
   */
  static error(message: string, meta?: Record<string, any>): void {
    logger.error(message, meta);
  }

  /**
   * Log a warning message
   */
  static warn(message: string, meta?: Record<string, any>): void {
    logger.warn(message, meta);
  }

  /**
   * Log an info message
   */
  static info(message: string, meta?: Record<string, any>): void {
    logger.info(message, meta);
  }

  /**
   * Log a debug message
   */
  static debug(message: string, meta?: Record<string, any>): void {
    logger.debug(message, meta);
  }

  /**
   * Create a child logger with additional context
   */
  static child(context: Record<string, any>): winston.Logger {
    return logger.child(context);
  }
}

export default logger;
