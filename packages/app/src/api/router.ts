import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import type {
  EventEngine,
  RuleEvaluator,
  GoalEngine,
  QueuePort,
  PlatformAdapter,
} from '@chaos-live/core';
import { getPrismaClient } from '@chaos-live/core';
import type { RuleDefinition } from '@chaos-live/core';
import { isCommandSafe, DEFAULT_ALLOWED_COMMANDS } from '@chaos-live/adapter-minecraft-rcon';
import { TIKTOK_GIFTS } from '@chaos-live/shared-protocol';
import type { ChaosEvent, OverlaySettings } from '@chaos-live/shared-protocol';
import type { WebSocketHub } from '../server.js';
import { saveRules } from '../config/config.js';
import { logger } from '../logger.js';

/**
 * Almacén de los ajustes del overlay. Lo posee la raíz de composición
 * (`main.ts`), que es quien los persiste en disco; el router solo lee y
 * escribe a través de él. Antes eran una variable de módulo aquí, y todo lo
 * que el streamer configuraba se perdía en cada reinicio.
 */
export interface OverlaySettingsStore {
  get(): OverlaySettings;
  update(patch: Partial<OverlaySettings>): OverlaySettings;
}

export interface ApiContext {
  engine: EventEngine;
  ruleEvaluator: RuleEvaluator;
  goalEngine: GoalEngine;
  wsHub: WebSocketHub;
  queue: QueuePort;
  overlaySettings: OverlaySettingsStore;
  rulesFilePath?: string;
  onInjectEvent?: (event: ChaosEvent) => void;
  /**
   * Restringe el router a `PUBLIC_READONLY_ROUTES`.
   *
   * Lo usa la superficie de overlay, que es la unica que puede llegar a
   * publicarse. Sin esto, quien alcanzase ese puerto tendria tambien
   * `POST /api/rules` y `POST /api/queue/pause`, es decir el control de la
   * partida en directo.
   */
  publicOnly?: boolean;
  /**
   * Base de las URLs de widget, tal y como hay que pegarlas en TikTok LIVE
   * Studio. Viaja en `/api/status` porque el panel se sirve desde el puerto de
   * gestion y no tiene forma de adivinar el puerto publico.
   */
  overlayBaseUrl?: string;
}

/**
 * Lo unico que el overlay necesita leer, y por tanto lo unico que se sirve en
 * la superficie publica.
 *
 * Es una lista blanca por metodo y ruta exactos, no un filtro por verbo: si
 * manana se anade un GET nuevo a la API de gestion, no debe volverse publico
 * solo por ser un GET.
 */
export const PUBLIC_READONLY_ROUTES: ReadonlySet<string> = new Set([
  'GET /api/health',
  'GET /api/rules',
  'GET /api/goals',
  'GET /api/overlay-settings',
  'GET /api/gifts/presets',
]);


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

/** Error de petición del cliente: se traduce a 400, no a 500. */
class BadRequestError extends Error {}

/**
 * Lee y parsea el cuerpo JSON de la petición.
 *
 * Un cuerpo malformado es culpa de quien llama, así que debe salir como 400 con
 * un mensaje claro; antes reventaba en el `catch` general y se devolvía un 500
 * genérico que hacía parecer que el fallo era del servidor.
 */
// El cuerpo de una peticion HTTP es dato sin verificar: cada handler valida los
// campos que le interesan. Tiparlo como `unknown` obligaria a coaccionar cada
// campo en todos los handlers, asi que se mantiene el `any` deliberado que ya
// usaba el resto del fichero.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  const raw = await readBody(req);
  if (!raw.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestError('El cuerpo de la petición debe ser un objeto JSON.');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return parsed as Record<string, any>;
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError(
      `El cuerpo de la petición no es JSON válido: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Valida un comando de Minecraft antes de persistirlo.
 *
 * Hasta ahora el comando solo se comprobaba en el momento de ejecutarlo, dentro
 * del `HybridGameAdapter`. Eso permitía guardar una regla que se veía activa en
 * el panel y que en directo no hacía nada, sin explicación visible. Validar al
 * escribir convierte ese fallo silencioso en un error inmediato y comprensible.
 *
 * Devuelve el motivo del rechazo, o `null` si el comando es válido.
 */
function validateCommand(command: unknown, fieldName: string): string | null {
  if (typeof command !== 'string' || command.trim() === '') {
    return `El campo "${fieldName}" es obligatorio y debe ser un comando de Minecraft.`;
  }

  if (!isCommandSafe(command)) {
    return (
      `El comando "${command}" está bloqueado por seguridad. ` +
      `Solo se permiten estos comandos: ${[...DEFAULT_ALLOWED_COMMANDS].sort().join(', ')}. ` +
      `Tampoco se admiten los caracteres ";", los saltos de línea ni subcomandos peligrosos tras "execute ... run".`
    );
  }

  return null;
}

/**
 * Comprueba la forma mínima de una regla antes de guardarla.
 * Devuelve la lista de problemas encontrados (vacía si la regla es válida).
 */
function validateRulePayload(parsed: Record<string, unknown>): string[] {
  const errors: string[] = [];

  const matcher = parsed['matcher'] as Record<string, unknown> | undefined;
  if (!matcher || typeof matcher !== 'object' || Object.keys(matcher).length === 0) {
    errors.push(
      'La regla necesita al menos una condición en "matcher" (tipo de evento, plataforma, valor mínimo o nombre del regalo). ' +
        'Una regla sin condiciones se dispararía con cualquier evento.',
    );
  }

  const action = parsed['action'] as Record<string, unknown> | undefined;
  if (!action || typeof action !== 'object') {
    errors.push('La regla necesita un bloque "action" con el comando a ejecutar.');
  } else {
    const commandError = validateCommand(action['command'], 'action.command');
    if (commandError) errors.push(commandError);
  }

  for (const field of ['priority', 'cooldownMs'] as const) {
    const value = parsed[field];
    if (value !== undefined && Number.isNaN(Number(value))) {
      errors.push(`El campo "${field}" debe ser un número.`);
    }
  }

  return errors;
}

/**
 * Resume el estado de un adapter de plataforma para el panel.
 *
 * El estado del cortocircuito (`circuitState`) solo lo expone el adapter de
 * TikTok, así que se consulta de forma opcional en lugar de exigirlo en el
 * puerto `PlatformAdapter`.
 */
function describePlatformAdapter(adapter: PlatformAdapter): Record<string, unknown> {
  const maybeCircuit = adapter as PlatformAdapter & { getCircuitState?: () => string };
  return {
    name: adapter.name,
    connected: adapter.isConnected(),
    circuitState: maybeCircuit.getCircuitState?.(),
  };
}

/**
 * Comprobación previa al directo.
 *
 * Reúne en un solo sitio todo lo que suele fallar justo antes de empezar a
 * transmitir, para no tener que descubrirlo en vivo: que el juego esté
 * conectado, que la plataforma esté enlazada, que ninguna regla o meta guardada
 * tenga un comando que el motor vaya a rechazar, y que la base de datos sea
 * escribible.
 */
interface DiagnosticCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  hint?: string;
}

async function buildDiagnostics(context: ApiContext): Promise<{
  status: 'ok' | 'warn' | 'error';
  checks: DiagnosticCheck[];
}> {
  const checks: DiagnosticCheck[] = [];
  const { wsHub, engine, ruleEvaluator, goalEngine } = context;

  // 1. Destino en el juego
  const modConnected = wsHub.isModConnected();
  const gameAdapter = engine.getGameAdapter();
  if (modConnected) {
    checks.push({
      id: 'game',
      label: 'Minecraft',
      status: 'ok',
      detail: 'El mod de Fabric está conectado. Los comandos se ejecutarán en tu partida.',
    });
  } else if (gameAdapter?.isConnected()) {
    checks.push({
      id: 'game',
      label: 'Minecraft',
      status: 'warn',
      detail: 'El mod de Fabric no está conectado; se usará RCON o la consola de respaldo.',
      hint: 'Abre Minecraft con el mod Chaos-Live instalado. Si juegas en solitario, entra a un mundo.',
    });
  } else {
    checks.push({
      id: 'game',
      label: 'Minecraft',
      status: 'error',
      detail: 'No hay ninguna conexión con el juego. Los comandos no llegarán a Minecraft.',
      hint: 'Arranca Minecraft con el mod instalado, o configura RCON_PASSWORD en el archivo .env.',
    });
  }

  // 2. Plataforma de streaming
  const platforms = engine.getPlatformAdapters();
  const connectedPlatforms = platforms.filter((p) => p.isConnected());
  if (platforms.length === 0) {
    checks.push({
      id: 'platform',
      label: 'Plataforma',
      status: 'error',
      detail: 'No hay ningún adapter de plataforma registrado.',
    });
  } else if (connectedPlatforms.length > 0) {
    checks.push({
      id: 'platform',
      label: 'Plataforma',
      status: 'ok',
      detail: `Conectado a: ${connectedPlatforms.map((p) => p.name).join(', ')}.`,
    });
  } else {
    checks.push({
      id: 'platform',
      label: 'Plataforma',
      status: 'error',
      detail: `Sin conexión con ${platforms.map((p) => p.name).join(', ')}.`,
      hint: 'Comprueba que TIKTOK_USERNAME esté bien escrito en .env y que la cuenta esté transmitiendo en directo ahora mismo.',
    });
  }

  // 3. Overlay en OBS
  const overlayCount = wsHub.getConnectedCount('overlay');
  checks.push({
    id: 'overlay',
    label: 'Overlay en OBS',
    status: overlayCount > 0 ? 'ok' : 'warn',
    detail:
      overlayCount > 0
        ? `${overlayCount} overlay(s) conectados.`
        : 'Ningún overlay conectado. La audiencia no verá las alertas.',
    hint:
      overlayCount > 0
        ? undefined
        : `Añade una fuente "Navegador" en OBS apuntando a http://localhost:${wsHub.port}/overlay`,
  });

  // 4. Reglas
  const allRules = ruleEvaluator.getRules();
  const enabledRules = allRules.filter((r) => r.enabled);
  const brokenRules = allRules.filter((r) => !isCommandSafe(r.action?.command ?? ''));
  if (brokenRules.length > 0) {
    checks.push({
      id: 'rules',
      label: 'Reglas',
      status: 'error',
      detail: `${brokenRules.length} regla(s) tienen un comando que el motor rechazará: ${brokenRules
        .map((r) => r.name)
        .join(', ')}.`,
      hint: 'Edita esas reglas y usa solo comandos permitidos. Nunca se dispararán tal y como están.',
    });
  } else if (enabledRules.length === 0) {
    checks.push({
      id: 'rules',
      label: 'Reglas',
      status: 'warn',
      detail: 'No hay ninguna regla activa. Los regalos no provocarán nada en el juego.',
      hint: 'Activa al menos una regla en la pestaña Reglas.',
    });
  } else {
    checks.push({
      id: 'rules',
      label: 'Reglas',
      status: 'ok',
      detail: `${enabledRules.length} regla(s) activas de ${allRules.length}.`,
    });
  }

  // 5. Metas comunitarias
  const goals = goalEngine.getGoals();
  const brokenGoals = goals.filter((g) => !isCommandSafe(g.actionCommand ?? ''));
  if (brokenGoals.length > 0) {
    checks.push({
      id: 'goals',
      label: 'Metas',
      status: 'error',
      detail: `${brokenGoals.length} meta(s) tienen un comando bloqueado: ${brokenGoals
        .map((g) => g.name)
        .join(', ')}.`,
      hint: 'Al completarse, su recompensa no se ejecutaría.',
    });
  } else {
    checks.push({
      id: 'goals',
      label: 'Metas',
      status: 'ok',
      detail: `${goals.length} meta(s) configuradas.`,
    });
  }

  // 6. Base de datos
  try {
    const prisma = getPrismaClient();
    await prisma.processedEvent.count();
    checks.push({
      id: 'database',
      label: 'Historial',
      status: 'ok',
      detail: 'La base de datos responde y se está guardando el historial.',
    });
  } catch (err) {
    checks.push({
      id: 'database',
      label: 'Historial',
      status: 'warn',
      detail: `La base de datos no responde: ${err instanceof Error ? err.message : String(err)}`,
      hint: 'El directo funcionará igual, pero no se guardará el historial ni el progreso de las metas.',
    });
  }

  // 7. Motor en pausa
  if (engine.isPaused()) {
    checks.push({
      id: 'paused',
      label: 'Motor',
      status: 'warn',
      detail: 'El motor está EN PAUSA: los eventos se acumulan sin ejecutarse.',
      hint: 'Pulsa Reanudar en el panel antes de empezar.',
    });
  }

  const status = checks.some((c) => c.status === 'error')
    ? 'error'
    : checks.some((c) => c.status === 'warn')
      ? 'warn'
      : 'ok';

  return { status, checks };
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

  if (context.publicOnly && !PUBLIC_READONLY_ROUTES.has(`${method} ${pathname}`)) {
    // 404 y no 403: la superficie publica no debe ni confirmar que estas rutas
    // existen en otro puerto.
    sendJson(res, 404, { error: 'Not found' });
    return true;
  }

  try {
    // GET /api/health
    // El servidor estático también responde /health, pero este router captura
    // todo lo que empieza por /api, así que /api/health caía en el 404 final.
    // El lanzador lo consulta para saber cuándo el servidor está listo.
    if (pathname === '/api/health' && method === 'GET') {
      sendJson(res, 200, {
        status: 'ok',
        uptime: process.uptime(),
      });
      return true;
    }

    // GET /api/status
    if (pathname === '/api/status' && method === 'GET') {
      const queue = context.queue;
      const wsHub = context.wsHub;
      const gameAdapter = context.engine.getGameAdapter();

      sendJson(res, 200, {
        status: 'ok',
        uptime: process.uptime(),
        overlayBaseUrl: context.overlayBaseUrl,
        isPaused: context.engine.isPaused(),
        queue: {
          size: queue.size(),
          isEmpty: queue.isEmpty(),
        },
        adapters: {
          game: gameAdapter?.name || 'None',
          gameConnected: gameAdapter?.isConnected() ?? false,
          // Antes solo se listaba el nombre, así que desde el panel era
          // imposible saber si TikTok estaba realmente conectado.
          platforms: context.engine.getPlatformAdapters().map(describePlatformAdapter),
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

    // GET /api/diagnostics (comprobación previa al directo)
    if (pathname === '/api/diagnostics' && method === 'GET') {
      sendJson(res, 200, await buildDiagnostics(context));
      return true;
    }

    // GET /api/rules
    if (pathname === '/api/rules' && method === 'GET') {
      sendJson(res, 200, context.ruleEvaluator.getRules());
      return true;
    }

    // GET /api/gifts/presets (catálogo canónico de regalos de TikTok)
    if (pathname === '/api/gifts/presets' && method === 'GET') {
      sendJson(res, 200, TIKTOK_GIFTS);
      return true;
    }

    // POST /api/rules (Create new rule)
    if (pathname === '/api/rules' && method === 'POST') {
      const parsed = await readJsonBody(req);

      const errors = validateRulePayload(parsed);
      if (errors.length > 0) {
        sendJson(res, 400, { error: 'La regla no es válida', details: errors });
        return true;
      }

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
      const updates = await readJsonBody(req);

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

      // Se valida la regla ya fusionada, no solo el parche: una actualización
      // parcial puede dejar la regla en un estado inválido.
      const errors = validateRulePayload(updatedRule as unknown as Record<string, unknown>);
      if (errors.length > 0) {
        sendJson(res, 400, { error: 'La regla no es válida', details: errors });
        return true;
      }

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
      const parsed = await readJsonBody(req);

      const commandError = validateCommand(
        parsed.actionCommand ?? 'say Community Goal Completed!',
        'actionCommand',
      );
      if (commandError) {
        sendJson(res, 400, { error: 'La meta no es válida', details: [commandError] });
        return true;
      }

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
      const updates = await readJsonBody(req);

      if (updates.actionCommand !== undefined) {
        const commandError = validateCommand(updates.actionCommand, 'actionCommand');
        if (commandError) {
          sendJson(res, 400, { error: 'La meta no es válida', details: [commandError] });
          return true;
        }
      }

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
      sendJson(res, 200, context.overlaySettings.get());
      return true;
    }

    // PUT /api/overlay-settings
    if (pathname === '/api/overlay-settings' && method === 'PUT') {
      const updates = await readJsonBody(req);
      const settings = context.overlaySettings.update(updates);
      context.wsHub.broadcastToOverlay('OVERLAY_SETTINGS_UPDATED', settings);
      sendJson(res, 200, { success: true, settings });
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
      const data = await readJsonBody(req);

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
    if (err instanceof BadRequestError) {
      sendJson(res, 400, { error: 'Petición no válida', details: [err.message] });
      return true;
    }
    logger.error({ err, pathname, method }, 'Error handling API request');
    sendJson(res, 500, {
      error: 'Error interno del servidor',
      message: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}
