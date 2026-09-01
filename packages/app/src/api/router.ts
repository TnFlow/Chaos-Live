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

let currentOverlaySettings: Record<string, any> = {
  layout: 'landscape',
  theme: 'cyberpunk',
  scale: 1.0,
  masterVolume: 0.8,
  soundEnabled: true,
  goalPosition: 'top',
  feedPosition: 'left',
  leaderboardPosition: 'right',
  rewardsMode: 'both',
  marqueeSpeedSeconds: 28,
  glassIntensity: 0.75,
  glowIntensity: 0.8,
  fontFamily: 'Outfit',
  bannerDurationSeconds: 4.8,
};

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

    // GET /api/gifts/presets (TikTok gift catalog)
    if (pathname === '/api/gifts/presets' && method === 'GET') {
      const presets = [
        { name: 'Rose', coins: 1, icon: '🌹', category: 'cheap', suggestedCommand: 'summon chicken ~ ~1 ~ {CustomName:\'"${user.displayName}\"\'}', feedback: '🌹 Sent a Rose!' },
        { name: 'Ice Cream', coins: 30, icon: '🍦', category: 'cheap', suggestedCommand: 'summon zombie ~ ~ ~ {CustomName:\'"${user.displayName}\"\'}', feedback: '🍦 Sent an Ice Cream Cone!' },
        { name: 'Doughnut', coins: 30, icon: '🍩', category: 'cheap', suggestedCommand: 'summon skeleton ~ ~ ~ {HandItems:[{id:"minecraft:bow",Count:1b},{}],CustomName:\'"${user.displayName}\"\'}', feedback: '🍩 Sent a Doughnut!' },
        { name: 'Heart Me', coins: 1, icon: '💖', category: 'cheap', suggestedCommand: 'particle heart ~ ~1 ~ 0.5 0.5 0.5 0.1 10', feedback: '💖 Hearted the stream!' },
        { name: 'Finger Heart', coins: 5, icon: '🫰', category: 'cheap', suggestedCommand: 'effect give @p minecraft:speed 10 1', feedback: '🫰 Sent a Finger Heart!' },
        { name: 'Panda', coins: 5, icon: '🐼', category: 'cheap', suggestedCommand: 'summon panda ~ ~ ~', feedback: '🐼 Spawned a Panda!' },
        { name: 'Sunglasses', coins: 199, icon: '🕶️', category: 'medium', suggestedCommand: 'summon phantom ~ ~5 ~ {CustomName:\'"${user.displayName}\"\'}', feedback: '🕶️ Feeling cool with Sunglasses!' },
        { name: 'Boxing Gloves', coins: 299, icon: '🥊', category: 'medium', suggestedCommand: 'effect give @p minecraft:strength 20 2', feedback: '🥊 Knockout power active!' },
        { name: 'Money Gun', coins: 500, icon: '💸', category: 'medium', suggestedCommand: 'give @p minecraft:emerald 16', feedback: '💸 Making it rain emeralds!' },
        { name: 'Paper Crane', coins: 99, icon: '🕊️', category: 'medium', suggestedCommand: 'effect give @p minecraft:levitation 5 1', feedback: '🕊️ Floating with Paper Crane!' },
        { name: 'Confetti', coins: 100, icon: '🎉', category: 'medium', suggestedCommand: 'particle firework ~ ~1 ~ 0.5 0.5 0.5 0.1 30', feedback: '🎉 Confetti party!' },
        { name: 'Whale', coins: 2150, icon: '🐋', category: 'luxury', suggestedCommand: 'summon elder_guardian ~ ~ ~', feedback: '🐋 Deep ocean titan summoned!' },
        { name: 'Lion', coins: 29999, icon: '🦁', category: 'luxury', suggestedCommand: 'summon creeper ~ ~ ~ {powered:1b,CustomName:\'"MEGA DONATION: ${user.displayName}"\'}', feedback: '🦁 KING OF THE JUNGLE LION!' },
        { name: 'TikTok Universe', coins: 34999, icon: '🌌', category: 'luxury', suggestedCommand: 'summon warden ~ ~ ~ {CustomName:\'"UNIVERSE BOSS: ${user.displayName}"\'}', feedback: '🌌 TIKTOK UNIVERSE HAS AWOKEN!' },
        { name: 'Dragon', coins: 26999, icon: '🐉', category: 'luxury', suggestedCommand: 'summon ender_dragon ~ ~10 ~', feedback: '🐉 THE ENDER DRAGON HAS SPAWNED!' },
        { name: 'Galaxy', coins: 1000, icon: '🪐', category: 'luxury', suggestedCommand: 'summon lightning_bolt ~ ~ ~', feedback: '🪐 Galaxy cosmic strike!' },
      ];
      sendJson(res, 200, presets);
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
        icon: parsed.icon || (parsed.matcher?.metadataMatch?.giftName === 'Rose' ? '🌹' : undefined),
        imageUrl: parsed.imageUrl,
        viewerFeedback: parsed.viewerFeedback,
      };

      const currentRules = [...context.ruleEvaluator.getRules(), newRule];
      context.ruleEvaluator.setRules(currentRules);
      saveRules(currentRules, context.rulesFilePath);
      context.wsHub.broadcastToOverlay('INITIAL_RULES', currentRules);

      sendJson(res, 201, { success: true, rule: newRule });
      return true;
    }

    // POST /api/rules/:id/test (Instantly test a rule with synthetic matching event)
    if (pathname.startsWith('/api/rules/') && pathname.endsWith('/test') && method === 'POST') {
      const id = pathname.slice('/api/rules/'.length, -'/test'.length);
      const rule = context.ruleEvaluator.getRules().find((r) => r.id === id);

      if (!rule) {
        sendJson(res, 404, { error: `Rule with id "${id}" not found` });
        return true;
      }

      // Synthesize event that satisfies the rule's matcher
      const eventType = (rule.matcher.eventTypes && rule.matcher.eventTypes[0]) || 'gift';
      const giftName = (rule.matcher.metadataMatch?.giftName as string) || (rule.icon ? rule.name.split(':')[1]?.trim() : 'Rose') || 'Rose';
      const value = rule.matcher.minValue ?? (rule.matcher.maxValue ? Math.min(rule.matcher.maxValue, 100) : 50);

      const syntheticEvent: ChaosEvent = {
        id: `test-rule-${randomUUID().slice(0, 8)}`,
        platform: (rule.matcher.platforms && rule.matcher.platforms[0] as any) || 'tiktok',
        type: eventType as any,
        user: { id: 'u-tester', displayName: 'StreamerTester' },
        value,
        metadata: {
          giftName,
          giftId: 999,
          repeatCount: 1,
          diamondCount: value,
          likeCount: value,
          text: 'Testing rule!',
          ...(rule.matcher.metadataMatch || {}),
        } as any,
        raw: { isTest: true },
        timestamp: Date.now(),
      };

      // Clear any cooldown for this specific rule to ensure test executes immediately
      context.ruleEvaluator.resetCooldowns(rule.id);

      if (context.onInjectEvent) {
        context.onInjectEvent(syntheticEvent);
      }
      context.wsHub.broadcastEvent(syntheticEvent);

      sendJson(res, 200, {
        success: true,
        message: `Tested rule "${rule.name}" successfully`,
        ruleId: rule.id,
        event: syntheticEvent,
      });
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
      context.wsHub.broadcastToOverlay('INITIAL_RULES', currentRules);

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
      context.wsHub.broadcastToOverlay('INITIAL_RULES', filtered);

      sendJson(res, 200, { success: true, deletedId: id });
      return true;
    }

    // GET /api/goals
    if (pathname === '/api/goals' && method === 'GET') {
      sendJson(res, 200, context.goalEngine.getGoals());
      return true;
    }

    // POST /api/goals (Create new community goal)
    if (pathname === '/api/goals' && method === 'POST') {
      const raw = await readBody(req);
      const parsed = JSON.parse(raw);

      const newGoal = context.goalEngine.addGoal({
        name: parsed.name || 'Community Goal',
        eventType: parsed.eventType || 'gift',
        giftName: parsed.giftName,
        targetValue: Number(parsed.targetValue || 50),
        currentValue: Number(parsed.currentValue || 0),
        actionCommand: parsed.actionCommand || 'say Community Goal Completed!',
        actionType: parsed.actionType || 'execute_command',
        unit: parsed.unit,
        rewardDescription: parsed.rewardDescription,
        repeatable: parsed.repeatable ?? true,
      });

      context.wsHub.broadcastToOverlay('INITIAL_GOALS', context.goalEngine.getGoals());
      sendJson(res, 201, { success: true, goal: newGoal });
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

    // PUT /api/goals/:id (Update community goal)
    if (pathname.startsWith('/api/goals/') && method === 'PUT') {
      const id = pathname.slice('/api/goals/'.length);
      const raw = await readBody(req);
      const updates = JSON.parse(raw);

      const updated = context.goalEngine.updateGoal(id, {
        name: updates.name,
        eventType: updates.eventType,
        giftName: updates.giftName,
        targetValue: updates.targetValue !== undefined ? Number(updates.targetValue) : undefined,
        currentValue: updates.currentValue !== undefined ? Number(updates.currentValue) : undefined,
        actionCommand: updates.actionCommand,
        actionType: updates.actionType,
        unit: updates.unit,
        rewardDescription: updates.rewardDescription,
        repeatable: updates.repeatable,
      });

      if (!updated) {
        sendJson(res, 404, { error: `Goal with id "${id}" not found` });
        return true;
      }

      context.wsHub.broadcastToOverlay('INITIAL_GOALS', context.goalEngine.getGoals());
      sendJson(res, 200, { success: true, goal: updated });
      return true;
    }

    // DELETE /api/goals/:id (Delete community goal)
    if (pathname.startsWith('/api/goals/') && method === 'DELETE') {
      const id = pathname.slice('/api/goals/'.length);
      const deleted = context.goalEngine.deleteGoal(id);

      if (!deleted) {
        sendJson(res, 404, { error: `Goal with id "${id}" not found` });
        return true;
      }

      context.wsHub.broadcastToOverlay('INITIAL_GOALS', context.goalEngine.getGoals());
      sendJson(res, 200, { success: true, deletedId: id });
      return true;
    }

    // GET /api/overlay-settings
    if (pathname === '/api/overlay-settings' && method === 'GET') {
      sendJson(res, 200, currentOverlaySettings);
      return true;
    }

    // PUT /api/overlay-settings
    if (pathname === '/api/overlay-settings' && method === 'PUT') {
      const raw = await readBody(req);
      const updates = JSON.parse(raw);
      currentOverlaySettings = { ...currentOverlaySettings, ...updates };
      context.wsHub.broadcastToOverlay('OVERLAY_SETTINGS_UPDATED', currentOverlaySettings);
      sendJson(res, 200, { success: true, settings: currentOverlaySettings });
      return true;
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
