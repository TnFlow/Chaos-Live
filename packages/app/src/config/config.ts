import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { RuleDefinition } from '@chaos-live/core';
import { logger } from '../logger.js';

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
  rules: RuleDefinition[];
}

export function loadRules(rulesFilePath?: string): RuleDefinition[] {
  const defaultPath = path.resolve(process.cwd(), 'packages/app/config/rules.json');
  const targetPath = rulesFilePath || defaultPath;

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

export function loadConfig(): AppConfig {
  const tiktokUsername = process.env.TIKTOK_USERNAME?.trim() || '';
  const useMockEnv = process.env.USE_MOCK?.toLowerCase();
  // If USE_MOCK is explicitly true or no tiktok username is configured, default to mock
  const useMock = useMockEnv === 'true' || useMockEnv === '1' || !tiktokUsername;

  const mockIntervalMs = Number(process.env.MOCK_INTERVAL_MS || 2500);
  const logLevel = process.env.LOG_LEVEL || 'info';
  const wsPort = Number(process.env.WS_PORT || 8080);
  const rules = loadRules();

  return {
    tiktokUsername,
    useMock,
    mockIntervalMs,
    logLevel,
    wsPort,
    rules,
  };
}
