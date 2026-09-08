import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEngine, InMemoryPriorityQueue, RuleEvaluator, GoalEngine } from '@chaos-live/core';
import { DEFAULT_OVERLAY_SETTINGS } from '@chaos-live/shared-protocol';
import type { OverlaySettings } from '@chaos-live/shared-protocol';

// Igual que en sounds-config.test.ts: el modulo de sonidos resuelve la carpeta
// contra el directorio de trabajo, asi que la prueba se muda a uno propio para
// no escribir en la configuracion real del repo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-sonidos-api-'));
const cwdOriginal = process.cwd();
process.chdir(tmp);
fs.mkdirSync(path.join(tmp, 'config'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'config', 'overlay-settings.json'), '{}');

const { WebSocketHub } = await import('../src/server.js');
const { handleApiRequest } = await import('../src/api/router.js');
const { getSoundsDir } = await import('../src/config/sounds.js');
const { PUBLIC_READONLY_ROUTES } = await import('../src/api/router.js');

type Emitido = { type: string; payload: any };

describe('API de sonidos', () => {
  const testPort = 9908 + Number(process.env.JEST_WORKER_ID || '1');
  const base = `http://localhost:${testPort}`;

  let hub: InstanceType<typeof WebSocketHub>;
  let settingsState: OverlaySettings;
  let emitidos: Emitido[];

  /** Un WAV diminuto pero valido, en data URL. */
  const wav = (bytes = 64): string =>
    `data:audio/wav;base64,${Buffer.alloc(bytes, 7).toString('base64')}`;

  const subir = async (name: string): Promise<any> => {
    const res = await fetch(`${base}/api/sounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dataUrl: wav() }),
    });
    return ((await res.json()) as any).sound;
  };

  // El servidor se levanta una sola vez para toda la suite. Arrancarlo y
  // pararlo en cada test dejaba el pool de conexiones de `fetch` con sockets
  // vivos hacia un servidor ya cerrado, y el siguiente test fallaba con
  // ECONNRESET segun el orden en que se ejecutaran.
  beforeAll(async () => {
    const ruleEvaluator = new RuleEvaluator([
      {
        id: 'rule-rosa',
        name: 'Gift: Rose',
        priority: 10,
        enabled: true,
        cooldownMs: 0,
        matcher: { eventTypes: ['gift'] },
        action: { actionType: 'execute_command', command: 'say hola' },
        viewerFeedback: { soundEffect: 'chime-diamond' },
      },
    ]);
    const queue = new InMemoryPriorityQueue();

    hub = new WebSocketHub({
      port: testPort,
      onHttpRequest: (req, res) =>
        handleApiRequest(req, res, {
          engine: new EventEngine({ ruleEvaluator, queue }),
          ruleEvaluator,
          goalEngine: new GoalEngine([]),
          wsHub: hub,
          queue,
          overlaySettings: {
            get: () => settingsState,
            update: (patch) => {
              settingsState = { ...settingsState, ...patch };
              return settingsState;
            },
          },
          onOverlayBroadcast: (type, payload) => emitidos.push({ type, payload }),
        }),
    });

    await hub.start();
  });

  beforeEach(() => {
    fs.rmSync(getSoundsDir(), { recursive: true, force: true });
    emitidos = [];
    settingsState = { ...DEFAULT_OVERLAY_SETTINGS };
  });

  afterAll(async () => {
    await hub.stop();
    process.chdir(cwdOriginal);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('lista los sonidos con su volumen y donde se usan', async () => {
    const sonido = await subir('trend.wav');
    settingsState = { ...settingsState, eventSounds: { gift: sonido.url, like: 'heart-pop' } };

    const data = (await (await fetch(`${base}/api/sounds`)).json()) as any;

    expect(data.maxBytes).toBeGreaterThan(0);
    expect(data.sounds).toHaveLength(1);
    expect(data.sounds[0].volume).toBe(1);
    expect(data.sounds[0].inUse).toEqual(['event:gift']);
  });

  it('PATCH cambia el nombre y el volumen', async () => {
    const sonido = await subir('sin-nombre.wav');

    const res = await fetch(`${base}/api/sounds/${sonido.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Trend de septiembre', volume: 0.25 }),
    });

    expect(res.status).toBe(200);
    const { sound } = (await res.json()) as any;
    expect(sound.name).toBe('Trend de septiembre');
    expect(sound.volume).toBe(0.25);
    expect(emitidos.some((e) => e.type === 'SOUNDS_UPDATED')).toBe(true);
  });

  it('PATCH sobre un sonido que ya no esta responde 404', async () => {
    const res = await fetch(`${base}/api/sounds/fantasma.mp3`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume: 0.5 }),
    });

    expect(res.status).toBe(404);
  });

  it('PATCH con un nombre vacio responde 400 y no rompe nada', async () => {
    const sonido = await subir('algo.wav');

    const res = await fetch(`${base}/api/sounds/${sonido.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });

    expect(res.status).toBe(400);
  });

  /**
   * El caso que motiva todo esto: cambiar el audio de moda por el siguiente sin
   * tener que volver a decir en que momentos suena.
   */
  it('al reemplazar, el momento asignado sigue sonando con el audio nuevo', async () => {
    const sonido = await subir('viejo.wav');
    settingsState = { ...settingsState, eventSounds: { ...settingsState.eventSounds, gift: sonido.url } };

    const res = await fetch(`${base}/api/sounds/${sonido.id}/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: `data:audio/mpeg;base64,${Buffer.alloc(40, 1).toString('base64')}` }),
    });

    expect(res.status).toBe(200);
    const { sound } = (await res.json()) as any;
    expect(sound.url).not.toBe(sonido.url);
    expect(settingsState.eventSounds.gift).toBe(sound.url);
    expect(emitidos.some((e) => e.type === 'OVERLAY_SETTINGS_UPDATED')).toBe(true);
    expect(emitidos.some((e) => e.type === 'SOUNDS_UPDATED')).toBe(true);
  });

  it('reemplazar algo que ya no esta responde 404', async () => {
    const res = await fetch(`${base}/api/sounds/fantasma.mp3/replace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: wav() }),
    });

    expect(res.status).toBe(404);
  });

  /**
   * Antes esto lo hacia el panel despues de borrar, asi que cualquier otro
   * camino dejaba los ajustes apuntando a un archivo inexistente y el evento se
   * quedaba mudo sin una sola explicacion.
   */
  it('al borrar, los momentos que lo usaban quedan en silencio', async () => {
    const sonido = await subir('efimero.wav');
    settingsState = {
      ...settingsState,
      eventSounds: { ...settingsState.eventSounds, gift: sonido.url, goal: sonido.url },
    };

    const res = await fetch(`${base}/api/sounds/${sonido.id}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(settingsState.eventSounds.gift).toBe('none');
    expect(settingsState.eventSounds.goal).toBe('none');
  });

  it('borrar no toca los momentos que usaban otro sonido', async () => {
    const sonido = await subir('uno.wav');
    settingsState = { ...settingsState, eventSounds: { gift: 'chime-diamond' } };

    await fetch(`${base}/api/sounds/${sonido.id}`, { method: 'DELETE' });

    expect(settingsState.eventSounds.gift).toBe('chime-diamond');
  });

  /**
   * La superficie publica es la unica que puede salir del PC. Leer la
   * biblioteca esta bien (el overlay necesita los volumenes); modificarla, no.
   */
  it('las rutas nuevas no son publicas', () => {
    expect(PUBLIC_READONLY_ROUTES.has('GET /api/sounds')).toBe(true);
    for (const ruta of PUBLIC_READONLY_ROUTES) {
      expect(ruta.startsWith('GET ')).toBe(true);
    }
  });
});
