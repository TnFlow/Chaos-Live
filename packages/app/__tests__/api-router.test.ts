import http from 'node:http';
import { EventEngine, InMemoryPriorityQueue, RuleEvaluator, GoalEngine } from '@chaos-live/core';
import type { RuleDefinition } from '@chaos-live/core';
import { WebSocketHub } from '../src/server.js';
import { handleApiRequest } from '../src/api/router.js';

describe('REST Management API', () => {
  const testPort = 9878;
  let hub: WebSocketHub;
  let engine: EventEngine;
  let ruleEvaluator: RuleEvaluator;
  let goalEngine: GoalEngine;
  let queue: InMemoryPriorityQueue;
  let initialRules: RuleDefinition[];
  let currentOnInject: ((e: any) => void) | undefined = undefined;

  beforeEach(async () => {
    currentOnInject = undefined;
    initialRules = [
      {
        id: 'rule-test-1',
        name: 'Test Rule 1',
        priority: 10,
        enabled: true,
        cooldownMs: 0,
        matcher: { eventTypes: ['gift'] },
        action: { actionType: 'execute_command', command: 'say Gift!' },
      },
    ];

    ruleEvaluator = new RuleEvaluator(initialRules);
    goalEngine = new GoalEngine([]);
    queue = new InMemoryPriorityQueue();

    engine = new EventEngine({
      ruleEvaluator,
      queue,
    });

    hub = new WebSocketHub({
      port: testPort,
      onHttpRequest: (req, res) => {
        return handleApiRequest(req, res, {
          engine,
          ruleEvaluator,
          goalEngine,
          wsHub: hub,
          queue,
          rulesFilePath: 'config/test-rules.json',
          onInjectEvent: (e) => {
            currentOnInject?.(e);
          },
        });
      },
    });

    await hub.start();
  });

  afterEach(async () => {
    await hub.stop();
  });

  it('GET /api/status returns current system status', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/status`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.status).toBe('ok');
    expect(data.isPaused).toBe(false);
    expect(data.queue.size).toBe(0);
    expect(data.rulesCount).toBe(1);
  });

  it('GET /api/rules returns active rules', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/rules`);
    expect(res.status).toBe(200);

    const rules = (await res.json()) as any[];
    expect(rules.length).toBe(1);
    expect(rules[0].id).toBe('rule-test-1');
  });

  it('POST /api/rules adds a new rule with hot reload', async () => {
    const newRule = {
      name: 'Dynamic New Rule',
      priority: 25,
      enabled: true,
      matcher: { eventTypes: ['like'] },
      action: { actionType: 'execute_command', command: 'particle heart' },
    };

    const res = await fetch(`http://localhost:${testPort}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRule),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.rule.name).toBe('Dynamic New Rule');

    // Verify in-memory RuleEvaluator was hot-reloaded
    expect(ruleEvaluator.getRules().length).toBe(2);
    expect(ruleEvaluator.getRules()[0]?.name).toBe('Dynamic New Rule'); // priority 25 > 10
  });

  it('PUT /api/rules/:id updates an existing rule with hot reload', async () => {
    const updates = {
      name: 'Renamed Test Rule 1',
      enabled: false,
    };

    const res = await fetch(`http://localhost:${testPort}/api/rules/rule-test-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.rule.name).toBe('Renamed Test Rule 1');
    expect(data.rule.enabled).toBe(false);

    expect(ruleEvaluator.getRules()[0]?.enabled).toBe(false);
  });

  it('DELETE /api/rules/:id deletes a rule with hot reload', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/rules/rule-test-1`, {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.deletedId).toBe('rule-test-1');

    expect(ruleEvaluator.getRules().length).toBe(0);
  });

  it('controls queue pause, resume, and clear', async () => {
    // Pause
    const pauseRes = await fetch(`http://localhost:${testPort}/api/queue/pause`, { method: 'POST' });
    expect(pauseRes.status).toBe(200);
    expect(engine.isPaused()).toBe(true);

    // Resume
    const resumeRes = await fetch(`http://localhost:${testPort}/api/queue/resume`, { method: 'POST' });
    expect(resumeRes.status).toBe(200);
    expect(engine.isPaused()).toBe(false);

    // Clear
    const clearRes = await fetch(`http://localhost:${testPort}/api/queue/clear`, { method: 'POST' });
    expect(clearRes.status).toBe(200);
  });

  it('POST /api/test/event injects a synthetic event', async () => {
    let injected: any = null;
    currentOnInject = (e: any) => {
      injected = e;
    };

    const res = await fetch(`http://localhost:${testPort}/api/test/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'mock',
        type: 'gift',
        value: 50,
        user: { id: 'api-user', displayName: 'ApiTester' },
        metadata: { giftName: 'Rose', repeatCount: 50 },
      }),
    });

    expect(res.status).toBe(200);
    expect(injected).toBeDefined();
    expect(injected.value).toBe(50);
    expect(injected.user.displayName).toBe('ApiTester');
  });

  it('GET /api/gifts/presets returns TikTok gift catalog with suggested commands', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/gifts/presets`);
    expect(res.status).toBe(200);

    const presets = (await res.json()) as any[];
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThanOrEqual(10);
    expect(presets.some((p) => p.name === 'Rose' && p.icon === '🌹')).toBe(true);
    expect(presets.some((p) => p.name === 'Lion' && p.icon === '🦁')).toBe(true);
  });

  it('POST /api/rules/:id/test synthesizes and injects a matching event for the rule', async () => {
    let capturedEvent: any = null;
    currentOnInject = (e: any) => {
      capturedEvent = e;
    };

    const res = await fetch(`http://localhost:${testPort}/api/rules/rule-test-1/test`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.ruleId).toBe('rule-test-1');
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.type).toBe('gift');
  });
});
