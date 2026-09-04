import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import type { DestinationStream, Level, StreamEntry } from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || 'info';

/**
 * Escribir a archivo está activado por defecto: cuando algo falla a mitad de un
 * directo, la consola ya se ha cerrado o se ha llenado, y sin rastro en disco
 * no hay forma de averiguar qué pasó. Se desactiva con `LOG_TO_FILE=false`.
 */
const isTestRun = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const logToFile = process.env.LOG_TO_FILE?.toLowerCase() !== 'false' && !isTestRun;
const logDir = process.env.LOG_DIR?.trim() || path.resolve(process.cwd(), 'logs');

/** Fecha local en formato AAAA-MM-DD, para un archivo por día. */
function todayStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function buildConsoleStream(): DestinationStream {
  if (isProduction) {
    return pino.destination(1);
  }
  return pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  }) as DestinationStream;
}

function buildStreams(): StreamEntry[] | DestinationStream {
  const consoleStream = buildConsoleStream();

  if (!logToFile) {
    return consoleStream;
  }

  try {
    fs.mkdirSync(logDir, { recursive: true });
    const filePath = path.join(logDir, `chaos-live-${todayStamp()}.log`);
    return [
      { level: logLevel as Level, stream: consoleStream },
      // A archivo siempre en JSON, para poder filtrarlo después con jq o grep.
      { level: logLevel as Level, stream: pino.destination({ dest: filePath, sync: false }) },
    ];
  } catch (err) {
    // No poder escribir el log nunca debe impedir que arranque el directo.
    console.warn(
      `[Chaos-Live] No se pudo abrir el archivo de log en "${logDir}", se seguirá solo por consola:`,
      err instanceof Error ? err.message : err,
    );
    return consoleStream;
  }
}

const streams = buildStreams();

export const logger = Array.isArray(streams)
  ? pino({ level: logLevel }, pino.multistream(streams))
  : pino({ level: logLevel }, streams);

/** Ruta del archivo de log activo, o `undefined` si solo se registra por consola. */
export const logFilePath = logToFile ? path.join(logDir, `chaos-live-${todayStamp()}.log`) : undefined;

export function createChildLogger(correlationId: string, extra: Record<string, unknown> = {}) {
  return logger.child({ correlationId, ...extra });
}
