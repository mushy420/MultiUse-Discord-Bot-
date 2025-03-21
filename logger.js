
// Advanced logging system for the bot
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize } = format;
const path = require('path');
const fs = require('fs');
const config = require('./config.js');

// Create logger instance
let logger;

/**
 * Setup and configure the logger
 */
function setupLogger() {
  try {
    // Create logs directory if it doesn't exist
    const logDir = config.logging.filePath;
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Define log format
    const logFormat = printf(({ level, message, timestamp }) => {
      return `[${timestamp}] ${level}: ${message}`;
    });

    // Configure transports
    const logTransports = [];
    
    // Console transport
    if (config.logging.console) {
      logTransports.push(
        new transports.Console({
          format: combine(
            colorize(),
            logFormat
          )
        })
      );
    }
    
    // File transport
    if (config.logging.file) {
      logTransports.push(
        new transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          format: logFormat
        }),
        new transports.File({
          filename: path.join(logDir, 'combined.log'),
          format: logFormat
        })
      );
    }

    // Create logger
    logger = createLogger({
      level: config.logging.level || 'info',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        logFormat
      ),
      transports: logTransports,
      exitOnError: false
    });

    logger.info('Logger initialized');
    return logger;
  } catch (error) {
    console.error('Failed to initialize logger:', error);
    
    // Create a basic fallback logger when setup fails
    return createLogger({
      level: 'info',
      format: combine(
        timestamp(),
        printf(({ level, message, timestamp }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      ),
      transports: [new transports.Console()]
    });
  }
}

module.exports = {
  setupLogger,
  get logger() {
    if (!logger) {
      // Create a default logger if not initialized yet
      logger = createLogger({
        level: 'info',
        format: combine(
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          printf(({ level, message, timestamp }) => {
            return `[${timestamp}] ${level}: ${message}`;
          })
        ),
        transports: [new transports.Console({ format: colorize() })],
      });
    }
    return logger;
  }
};
