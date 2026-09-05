import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEngine, InMemoryPriorityQueue, RuleEvaluator, GoalEngine } from '@chaos-live/core';
import type { RuleDefinition } from '@chaos-live/core';
import { DEFAULT_OVERLAY_SETTINGS } from '@chaos-live/shared-protocol';
import type { OverlaySettings } from '@chaos-live/shared-protocol';
import { WebSocketHub } from '../src/server.js';
import { handleApiRequest, PUBLIC_READONLY_ROUTES } from '../src/api/router.js';
import type { OverlaySettingsStore } from '../src/api/router.js';

/**
 * La superficie publica es la unica parte del servidor que puede salir del PC:
 * TikTok LIVE Studio necesita alcanzarla para cargar cada widget como fuente
 * Link. La API de gestion no tiene autenticacion, asi que lo que se sirva ahi
 * es exactamente lo que quedaria expuesto.
 *
 * Estos tests fijan esa frontera. Si alguien anade una ruta de escritura y
 * acaba siendo alcanzable desde el puerto publico, aqui se rompe.
 */
describe('Superficie publica del overlay', () => {
  const port = 9900 + Number(process.env.JEST_WORKER_ID || '1');
  let hub: WebSocketHub;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-live-public-'));

  const rules: RuleDefinition[] = [
    {
      id: 'rule-1',
      name: 'Regla de prueba',
      priority: 10,
      enabled: true,
      cooldownMs: 0,
      matcher: { eventTypes: ['gift'] },
      action: { actionType: 'execute_command', command: 'say hola' },
    },
  ];

  beforeAll(async () => {
    const ruleEvaluator = new RuleEvaluator(rules);
    const goalEngine = new GoalEngine([]);
    const queue = new InMemoryPriorityQueue();
    const engine = new EventEngine({ ruleEvaluator, queue });

    let settingsState: OverlaySettings = { ...DEFAULT_OVERLAY_SETTINGS };
    const overlaySettings: OverlaySettingsStore = {
      get: () => settingsState,
      update: (patch) => {
        settingsState = { ...settingsState, ...patch };
        return settingsState;
      },
    };

    hub = new WebSocketHub({
      port,
      readOnly: true,
      onHttpRequest: (req, res) =>
        handleApiRequest(req, res, {
          engine,
          ruleEvaluator,
          goalEngine,
          wsHub: hub,
          queue,
          overlaySettings,
          rulesFilePath: path.join(tmpDir, 'rules.json'),
          publicOnly: true,
        }),
    });

    await hub.start();
  });

  afterAll(async () => {
    await hub.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const call = (method: string, route: string) =>
    fetch(`http://127.0.0.1:${port}${route}`, { method });

  it('sirve lo que el overlay necesita leer', async () => {
    for (const entry of PUBLIC_READONLY_ROUTES) {
      const [method, route] = entry.split(' ');
      const res = await call(method as string, route as string);
      expect([res.status, entry]).toEqual([200, entry]);
    }
  });

  it.each([
    ['POST', '/api/rules'],
    ['PUT', '/api/rules/rule-1'],
    ['DELETE', '/api/rules/rule-1'],
    ['POST', '/api/goals'],
    ['POST', '/api/test/event'],
    ['POST', '/api/queue/pause'],
    ['POST', '/api/queue/resume'],
    ['POST', '/api/queue/clear'],
    ['PUT', '/api/overlay-settings'],
  ])('no expone %s %s', async (method, route) => {
    const res = await call(method, route);
    // 404 y no 403: la superficie publica no confirma que la ruta exista.
    expect(res.status).toBe(404);
  });

  it('tampoco expone lecturas de gestion', async () => {
    for (const route of ['/api/history', '/api/diagnostics', '/api/status']) {
      const res = await call('GET', route);
      expect([res.status, route]).toEqual([404, route]);
    }
  });

  it('no deja que un cliente se haga pasar por el mod', () => {
    // El canal del mod transporta cada comando que sale hacia la partida, y
    // acepta resultados de vuelta. En un hub de solo lectura no debe existir:
    // el tipo se fuerza a `overlay` pase lo que pase por el query param.
    expect(hub.readOnly).toBe(true);
    expect(hub.getConnectedCount('mod')).toBe(0);
  });
});
