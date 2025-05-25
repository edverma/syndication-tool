import * as winston from 'winston';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export class Logger {
  private winston: winston.Logger;

  constructor(private context: string = 'App') {
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
          const ctx = context || this.context;
          let output = `${timestamp} [${level.toUpperCase()}] [${ctx}] ${message}`;
          
          if (Object.keys(meta).length > 0) {
            output += ` ${JSON.stringify(meta)}`;
          }
          
          return output;
        })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    // Add file transport in non-development environments
    if (process.env.NODE_ENV !== 'development') {
      this.winston.add(new winston.transports.File({
        filename: 'syndication.log',
        level: 'info'
      }));

      this.winston.add(new winston.transports.File({
        filename: 'syndication-error.log',
        level: 'error'
      }));
    }
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, { context: this.context, ...meta });
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, { context: this.context, ...meta });
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, { context: this.context, ...meta });
  }

  error(message: string, error?: Error | any, meta?: any): void {
    const errorMeta = error instanceof Error 
      ? { error: error.message, stack: error.stack, ...meta }
      : { error, ...meta };
    
    this.winston.error(message, { context: this.context, ...errorMeta });
  }

  setLevel(level: LogLevel): void {
    this.winston.level = level;
  }

  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`);
  }
}