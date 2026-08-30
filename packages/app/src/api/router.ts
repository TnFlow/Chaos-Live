import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import type { EventEngine, RuleEvaluator, GoalEngine, QueuePort } from '@chaos-live/core';
import { getPrismaClient } from '@chaos-live/core';
import type { RuleDefinition } from '@chaos-live/core';
import type { ChaosEvent } from '@chaos-live/shared-protocol';
import type { WebSocketHub } from '../server.js';
import { saveRules } from '../config/config.js';
import { logger } from '../logger.js';

export interface ApiContext {
  engine: EventEngine;
  ruleEvaluator: RuleEvaluator;
  goalEngine: GoalEngine;
  wsHub: WebSocketHub;
  queue: QueuePort;
  rulesFilePath?: string;
  onInjectEvent?: (event: ChaosEvent) => void;
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Handles REST management API requests.
 * Returns true if the request was an /api route and was handled.
 */
export async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  context: ApiContext,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = url.pathname;
  const method = (req.method || 'GET').toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  if (!pathname.startsWith('/api')) {
    return false;
  }

  try {
    // GET /api/status
    if (pathname === '/api/status' && method === 'GET') {
      const queue = context.queue;
      const wsHub = context.wsHub;
      const gameAdapter = context.engine.getGameAdapter();

      sendJson(res, 200, {
        status: 'ok',
        uptime: process.uptime(),
        isPaused: context.engine.isPaused(),
        queue: {
          size: queue.size(),
          isEmpty: queue.isEmpty(),
        },
        adapters: {
          game: gameAdapter?.name || 'None',
          gameConnected: gameAdapter?.isConnected() ?? false,
          platforms: context.engine.getPlatformAdapters().map((p) => p.name),
          clients: {
            total: wsHub.getConnectedCount(),
            overlay: wsHub.getConnectedCount('overlay'),
            mod: wsHub.getConnectedCount('mod'),
          },
        },
        rulesCount: context.ruleEvaluator.getRules().length,
        goalsCount: context.goalEngine.getGoals().length,
      });
      return true;
    }

    // GET /api/rules
    if (pathname === '/api/rules' && method === 'GET') {
      sendJson(res, 200, context.ruleEvaluator.getRules());
      return true;
    }

    // POST /api/rules (Create new rule)
    if (pathname === '/api/rules' && method === 'POST') {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);

      const newRule: RuleDefinition = {
        id: parsed.id || `rule-${randomUUID().slice(0, 8)}`,
        name: parsed.name || 'Unnamed Rule',
        enabled: parsed.enabled ?? true,
        priority: Number(parsed.priority ?? 10),
        cooldownMs: Number(parsed.cooldownMs ?? (parsed.cooldownSeconds ? Number(parsed.cooldownSeconds) * 1000 : 0)),
        matcher: parsed.matcher || {},
        action: parsed.action || { actionType: 'execute_command', command: 'say Hi' },
      };

      const currentRules = [...context.ruleEvaluator.getRules(), newRule];
      context.ruleEvaluator.setRules(currentRules);
      saveRules(currentRules, context.rulesFilePath);

      sendJson(res, 201, { success: true, rule: newRule });
      return true;
    }

    // PUT /api/rules/:id (Update existing rule)
    if (pathname.startsWith('/api/rules/') && method === 'PUT') {
      const id = pathname.slice('/api/rules/'.length);
      const raw = await readBody(req);
      const updates = JSON.parse(raw);

      const currentRules = [...context.ruleEvaluator.getRules()];
      const index = currentRules.findIndex((r) => r.id === id);

      if (index === -1) {
        sendJson(res, 404, { error: `Rule with id "${id}" not found` });
        return true;
      }

      const updatedRule: RuleDefinition = {
        ...currentRules[index]!,
        ...updates,
        id, // preserve ID
      };

      currentRules[index] = updatedRule;
      context.ruleEvaluator.setRules(currentRules);
      saveRules(currentRules, context.rulesFilePath);

      sendJson(res, 200, { success: true, rule: updatedRule });
      return true;
    }

    // DELETE /api/rules/:id (Delete rule)
    if (pathname.startsWith('/api/rules/') && method === 'DELETE') {
      const id = pathname.slice('/api/rules/'.length);
      const currentRules = [...context.ruleEvaluator.getRules()];
      const filtered = currentRules.filter((r) => r.id !== id);

      if (filtered.length === currentRules.length) {
        sendJson(res, 404, { error: `Rule with id "${id}" not found` });
        return true;
      }

      context.ruleEvaluator.setRules(filtered);
      saveRules(filtered, context.rulesFilePath);

      sendJson(res, 200, { success: true, deletedId: id });
      return true;
    }

    // GET /api/goals
    if (pathname === '/api/goals' && method === 'GET') {
      sendJson(res, 200, context.goalEngine.getGoals());
      return true;
    }

    // POST /api/goals/:id/reset
    if (pathname.match(/^\/api\/goals\/[^/]+\/reset$/) && method === 'POST') {
      const segments = pathname.split('/');
      const id = segments[3];
      if (id) {
        await context.goalEngine.resetGoal(id);
        const updated = context.goalEngine.getGoal(id);
        if (updated) {
          context.wsHub.broadcastToOverlay('GOAL_PROGRESS', updated);
        }
        sendJson(res, 200, { success: true, goal: updated });
        return true;
      }
    }

    // GET /api/history (Audit trail from SQLite)
    if (pathname === '/api/history' && method === 'GET') {
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);
      const offset = Number(url.searchParams.get('offset') || 0);

      try {
        const prisma = getPrismaClient();
        const items = await prisma.processedEvent.findMany({
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
        });
        const total = await prisma.processedEvent.count();

        sendJson(res, 200, {
          total,
          limit,
          offset,
          events: items,
        });
      } catch (err) {
        logger.warn({ err }, 'Failed to query history from database');
        sendJson(res, 200, { total: 0, limit, offset, events: [] });
      }
      return true;
    }

    // POST /api/test/event (Inject synthetic event)
    if (pathname === '/api/test/event' && method === 'POST') {
      const raw = await readBody(req);
      const data = JSON.parse(raw);

      const event: ChaosEvent = {
        id: data.id || `test-evt-${randomUUID()}`,
        platform: data.platform || 'mock',
        type: data.type || 'gift',
        user: data.user || { id: 'u-test', displayName: 'StreamerTester' },
        value: Number(data.value ?? 10),
        metadata: data.metadata || { giftName: 'Rose', repeatCount: 1, diamondCount: 10 },
        raw: data.raw || {},
        timestamp: Date.now(),
      };

      if (context.onInjectEvent) {
        context.onInjectEvent(event);
      }
      context.wsHub.broadcastEvent(event);

      sendJson(res, 200, { success: true, event });
      return true;
    }

    // POST /api/queue/clear (Purge queue)
    if (pathname === '/api/queue/clear' && method === 'POST') {
      context.queue.clear();
      sendJson(res, 200, { success: true, message: 'Queue cleared' });
      return true;
    }

    // POST /api/queue/pause
    if (pathname === '/api/queue/pause' && method === 'POST') {
      context.engine.pause();
      sendJson(res, 200, { success: true, isPaused: true });
      return true;
    }

    // POST /api/queue/resume
    if (pathname === '/api/queue/resume' && method === 'POST') {
      context.engine.resume();
      sendJson(res, 200, { success: true, isPaused: false });
      return true;
    }

    sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
    return true;
  } catch (err) {
    logger.error({ err, pathname, method }, 'Error handling API request');
    sendJson(res, 500, {
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}
