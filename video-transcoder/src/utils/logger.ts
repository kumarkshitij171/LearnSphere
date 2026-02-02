import winston from "winston";

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf((info) => {
  return `${info.timestamp ?? ""} [${info.level}]: ${info.message}`;
});

const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || "warn",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    colorize({ all: true }),
    logFormat
  ),
  transports: [new winston.transports.Console()],
});

export const logger = {
  info: (message: string, meta?: object) => winstonLogger.info(message, meta),
  warn: (message: string, meta?: object) => winstonLogger.warn(message, meta),
  error: (message: string, meta?: object) => winstonLogger.error(message, meta),
  debug: (message: string, meta?: object) => winstonLogger.debug(message, meta),
};
