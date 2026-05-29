type LogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

const explicitToggle = process.env.OBSERVABILITY_LOGS;

const isEnabled =
  explicitToggle === "true" ||
  (explicitToggle !== "false" && process.env.NODE_ENV !== "production");

const writeLog = (level: LogLevel, message: string, meta: LogMeta = {}) => {
  if (!isEnabled) return;

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
};

export const logger = {
  debug: (message: string, meta?: LogMeta) => writeLog("debug", message, meta),
  error: (message: string, meta?: LogMeta) => writeLog("error", message, meta),
  info: (message: string, meta?: LogMeta) => writeLog("info", message, meta),
  warn: (message: string, meta?: LogMeta) => writeLog("warn", message, meta),
};
