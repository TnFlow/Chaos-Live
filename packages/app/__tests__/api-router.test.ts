import http from 'node:http';
import { EventEngine, InMemoryPriorityQueue, RuleEvaluator, GoalEngine } from '@chaos-live/core';
import type { RuleDefinition } from '@chaos-live/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_OVERLAY_SETTINGS } from '@chaos-live/shared-protocol';
import type { OverlaySettings } from '@chaos-live/shared-protocol';
import { WebSocketHub } from '../src/server.js';
import { handleApiRequest } from '../src/api/router.js';
import type { OverlaySettingsStore } from '../src/api/router.js';

describe('REST Management API', () => {
  // Un puerto por worker de jest. Con uno fijo, esta suite chocaba con
  // cualquier otra tanda en paralelo y con un socket que aun no habia soltado
  // el sistema, y fallaba con EADDRINUSE de forma intermitente. Dentro de un
  // worker los tests van en serie, asi que basta con distinguir workers.
  const testPort = 9878 + Number(process.env.JEST_WORKER_ID || '1');
  let hub: WebSocketHub;
  let engine: EventEngine;
  let ruleEvaluator: RuleEvaluator;
  let goalEngine: GoalEngine;
  let queue: InMemoryPriorityQueue;
  let initialRules: RuleDefinition[];
  let overlaySettings: OverlaySettingsStore;

  // Los tests guardan reglas en disco. Antes escribian en `config/test-rules.json`,
  // que esta versionado, asi que cada ejecucion dejaba el arbol sucio y hacia
  // fallar el `git diff --exit-code` de CI. Se usa un fichero temporal del sistema.
  //
  // El directorio es unico por ejecucion: con un nombre fijo, dos workers de
  // jest a la vez escribian y leian el mismo fichero y la suite fallaba de
  // forma intermitente.
  const testRulesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-live-rules-'));
  const testRulesPath = path.join(testRulesDir, 'rules.json');
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

    // Store en memoria: los tests no deben tocar el fichero de ajustes real.
    let settingsState: OverlaySettings = { ...DEFAULT_OVERLAY_SETTINGS };
    overlaySettings = {
      get: () => settingsState,
      update: (patch) => {
        settingsState = { ...settingsState, ...patch };
        return settingsState;
      },
    };

    hub = new WebSocketHub({
      port: testPort,
      onHttpRequest: (req, res) => {
        return handleApiRequest(req, res, {
          engine,
          ruleEvaluator,
          goalEngine,
          wsHub: hub,
          queue,
          overlaySettings,
          rulesFilePath: testRulesPath,
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

  afterAll(() => {
    fs.rmSync(testRulesDir, { recursive: true, force: true });
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

  it('GET /api/health responds instead of falling through to the 404 handler', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  describe('GET /api/diagnostics', () => {
    it('reports every pre-stream check with an actionable status', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/diagnostics`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        status: string;
        checks: { id: string; status: string; detail: string; hint?: string }[];
      };

      const ids = body.checks.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining(['game', 'platform', 'overlay', 'rules', 'goals']));
      // Sin juego ni plataforma conectados el diagnóstico global debe ser de error.
      expect(body.status).toBe('error');
      expect(body.checks.find((c) => c.id === 'game')?.hint).toBeTruthy();
    });

    it('flags rules whose command the engine would reject', async () => {
      // Una regla inválida solo puede llegar aquí editando rules.json a mano,
      // que es exactamente el caso que el diagnóstico debe detectar.
      ruleEvaluator.setRules([
        {
          id: 'rule-rota',
          name: 'Regla rota',
          enabled: true,
          priority: 10,
          cooldownMs: 0,
          matcher: { eventTypes: ['gift'] },
          action: { actionType: 'execute_command', command: 'op attacker' },
        },
      ]);

      const res = await fetch(`http://localhost:${testPort}/api/diagnostics`);
      const body = (await res.json()) as { checks: { id: string; status: string; detail: string }[] };

      const rulesCheck = body.checks.find((c) => c.id === 'rules');
      expect(rulesCheck?.status).toBe('error');
      expect(rulesCheck?.detail).toContain('Regla rota');
    });

    it('warns when the engine is paused', async () => {
      await fetch(`http://localhost:${testPort}/api/queue/pause`, { method: 'POST' });

      const res = await fetch(`http://localhost:${testPort}/api/diagnostics`);
      const body = (await res.json()) as { checks: { id: string; status: string }[] };

      expect(body.checks.find((c) => c.id === 'paused')?.status).toBe('warn');
    });
  });

  it('GET /api/status reports connection state per platform adapter', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/status`);
    const data = (await res.json()) as { adapters: { platforms: unknown[] } };

    // Antes era una lista de nombres; ahora cada entrada lleva su estado.
    for (const platform of data.adapters.platforms) {
      expect(platform).toHaveProperty('name');
      expect(platform).toHaveProperty('connected');
    }
  });

  describe('write-time rule validation', () => {
    it('rejects a rule whose command is not whitelisted', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Regla peligrosa',
          matcher: { eventTypes: ['gift'] },
          action: { actionType: 'execute_command', command: 'op attacker' },
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string; details: string[] };
      expect(body.details.join(' ')).toContain('bloqueado por seguridad');

      // La regla no debe haberse guardado.
      expect(ruleEvaluator.getRules().some((r) => r.name === 'Regla peligrosa')).toBe(false);
    });

    it('rejects command chaining attempts', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Encadenada',
          matcher: { eventTypes: ['gift'] },
          action: { actionType: 'execute_command', command: 'say hola; op attacker' },
        }),
      });

      expect(res.status).toBe(400);
      expect(ruleEvaluator.getRules().some((r) => r.name === 'Encadenada')).toBe(false);
    });

    it('rejects a rule with no matcher conditions', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sin condiciones',
          matcher: {},
          action: { actionType: 'execute_command', command: 'say hola' },
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { details: string[] };
      expect(body.details.join(' ')).toContain('matcher');
    });

    it('rejects an update that would make an existing rule invalid', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/rules/rule-test-1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: { actionType: 'execute_command', command: 'stop' } }),
      });

      expect(res.status).toBe(400);
      // La regla original queda intacta.
      const rule = ruleEvaluator.getRules().find((r) => r.id === 'rule-test-1');
      expect(rule?.action.command).toBe('say Gift!');
    });

    it('still accepts a valid rule', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Regla válida',
          matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Rose' } },
          action: {
            actionType: 'execute_command',
            command: 'execute at @p run summon chicken ~ ~1 ~',
          },
        }),
      });

      expect(res.status).toBe(201);
      expect(ruleEvaluator.getRules().some((r) => r.name === 'Regla válida')).toBe(true);
    });

    it('rejects a community goal with a blocked command', async () => {
      const res = await fetch(`http://localhost:${testPort}/api/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Meta peligrosa',
          eventType: 'gift',
          targetValue: 10,
          actionCommand: 'ban @a',
        }),
      });

      expect(res.status).toBe(400);
      expect(goalEngine.getGoals().some((g) => g.name === 'Meta peligrosa')).toBe(false);
    });
  });

  it('GET /api/overlay-settings returns the settings held by the store', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/overlay-settings`);
    expect(res.status).toBe(200);

    const settings = (await res.json()) as OverlaySettings;
    expect(settings.theme).toBe(DEFAULT_OVERLAY_SETTINGS.theme);
    expect(settings.bannerDurationSeconds).toBe(DEFAULT_OVERLAY_SETTINGS.bannerDurationSeconds);
  });

  it('PUT /api/overlay-settings merges into the store instead of module state', async () => {
    const res = await fetch(`http://localhost:${testPort}/api/overlay-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'obsidian', scale: 1.25 }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { success: boolean; settings: OverlaySettings };
    expect(body.success).toBe(true);
    expect(body.settings.theme).toBe('obsidian');
    expect(body.settings.scale).toBe(1.25);
    // Los campos no enviados conservan su valor previo.
    expect(body.settings.layout).toBe(DEFAULT_OVERLAY_SETTINGS.layout);

    // El store es la fuente de verdad: una lectura posterior ve el cambio.
    expect(overlaySettings.get().theme).toBe('obsidian');
    const readBack = (await (
      await fetch(`http://localhost:${testPort}/api/overlay-settings`)
    ).json()) as OverlaySettings;
    expect(readBack.theme).toBe('obsidian');
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
