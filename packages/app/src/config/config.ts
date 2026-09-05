import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import type { RuleDefinition } from '@chaos-live/core';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root if available
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

export interface AppConfig {
  tiktokUsername: string;
  useMock: boolean;
  mockIntervalMs: number;
  logLevel: string;
  wsPort: number;
  wsHost: string;
  /** Puerto de la superficie publica: solo estaticos del overlay y GETs. */
  overlayPort: number;
  /** Interfaz de la superficie publica. Ver `overlayHost` en loadConfig. */
  overlayHost: string;
  rconHost: string;
  rconPort: number;
  rconPassword?: string;
  rconEnabled: boolean;
  rules: RuleDefinition[];
}

export function getRulesPath(rulesFilePath?: string): string {
  if (rulesFilePath) {
    return path.isAbsolute(rulesFilePath) ? rulesFilePath : path.resolve(process.cwd(), rulesFilePath);
  }

  const possiblePaths = [
    path.resolve(process.cwd(), 'packages/app/config/rules.json'),
    path.resolve(process.cwd(), 'config/rules.json'),
    path.resolve(__dirname, '../../config/rules.json'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return possiblePaths[0]!;
}

export function loadRules(rulesFilePath?: string): RuleDefinition[] {
  const targetPath = getRulesPath(rulesFilePath);

  if (!fs.existsSync(targetPath)) {
    logger.warn({ targetPath }, 'Rules file does not exist, starting with empty rules.');
    return [];
  }

  try {
    const raw = fs.readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const rules = Array.isArray(parsed) ? parsed : parsed.event_rules || [];
    logger.info({ count: rules.length, path: targetPath }, 'Loaded rules configuration');
    return rules as RuleDefinition[];
  } catch (err) {
    logger.error({ err, targetPath }, 'Failed to parse rules file');
    return [];
  }
}

export function saveRules(rules: RuleDefinition[], rulesFilePath?: string): void {
  const targetPath = getRulesPath(rulesFilePath);
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(rules, null, 2), 'utf-8');
    logger.info({ count: rules.length, path: targetPath }, 'Saved rules configuration');
  } catch (err) {
    logger.error({ err, targetPath }, 'Failed to save rules file');
    throw err;
  }
}

export function loadConfig(): AppConfig {
  const rawUsername = process.env.TIKTOK_USERNAME?.trim() || '';
  const isPlaceholder = !rawUsername || rawUsername === 'your_tiktok_username';
  const tiktokUsername = isPlaceholder ? '' : rawUsername;
  const useMockEnv = process.env.USE_MOCK?.toLowerCase();
  // If USE_MOCK is explicitly true or no real tiktok username is configured, default to mock
  const useMock = useMockEnv === 'true' || useMockEnv === '1' || isPlaceholder;

  const mockIntervalMs = Number(process.env.MOCK_INTERVAL_MS || 2500);
  const logLevel = process.env.LOG_LEVEL || 'info';
  const wsPort = Number(process.env.WS_PORT || 8080);
  // Por defecto solo se escucha en local: la API de gestión no tiene
  // autenticación y todo (Chaos-Live, Minecraft y OBS) corre en el mismo PC.
  const wsHost = process.env.HOST?.trim() || '127.0.0.1';

  // Superficie publica: la que TikTok LIVE Studio tiene que alcanzar para
  // cargar cada widget como fuente Link. Sigue siendo local por defecto; se
  // abre a la red con OVERLAY_HOST solo si hace falta, y es seguro hacerlo
  // porque este puerto no sirve ni la API de gestion ni el canal del mod.
  const overlayPort = Number(process.env.OVERLAY_PORT || 8081);
  const overlayHost = process.env.OVERLAY_HOST?.trim() || '127.0.0.1';

  const rconHost = process.env.RCON_HOST || '127.0.0.1';
  const rconPort = Number(process.env.RCON_PORT || 25575);
  const rconPassword = process.env.RCON_PASSWORD?.trim();
  const rconEnabled = Boolean(rconPassword && process.env.DISABLE_RCON !== 'true');

  const rules = loadRules();

  return {
    tiktokUsername,
    useMock,
    mockIntervalMs,
    overlayPort,
    overlayHost,
    logLevel,
    wsPort,
    wsHost,
    rconHost,
    rconPort,
    rconPassword,
    rconEnabled,
    rules,
  };
}
