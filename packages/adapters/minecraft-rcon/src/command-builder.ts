import type { GameAction } from '@chaos-live/shared-protocol';

/**
 * Commands allowed to be executed on the Minecraft server via RCON.
 * Disallowed: op, deop, ban, kick, stop, restart, save-off, execute run op, etc.
 */
export const DEFAULT_ALLOWED_COMMANDS = new Set([
  'summon',
  'effect',
  'give',
  'particle',
  'title',
  'tellraw',
  'playsound',
  'weather',
  'time',
  'gamemode',
  'difficulty',
  'say',
]);

/**
 * Sanitizes text sourced from external platforms (usernames, comments)
 * before it is embedded in Minecraft commands or JSON text components.
 * Prevents command injection and quote breakout.
 */
export function sanitizeInput(input: string, maxLength = 100): string {
  if (!input) return '';

  return (
    input
      // Strip control characters (including newlines, tabs, null bytes)
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      // Escape backslashes
      .replace(/\\/g, '\\\\')
      // Escape double quotes
      .replace(/"/g, '\\"')
      // Escape single quotes for NBT strings
      .replace(/'/g, "\\'")
      // Collapse multiple whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Limit length
      .slice(0, maxLength)
  );
}

/**
 * Checks whether a command is in the whitelist of safe Minecraft commands.
 */
export function isCommandSafe(command: string, allowedCommands = DEFAULT_ALLOWED_COMMANDS): boolean {
  const normalized = command.trim().replace(/^\//, '');
  if (!normalized) return false;

  const parts = normalized.split(/\s+/);
  const rootCommand = parts[0]?.toLowerCase();

  if (!rootCommand || !allowedCommands.has(rootCommand)) {
    return false;
  }

  // Guard against nested command injection via "execute run <dangerous_command>"
  if (rootCommand === 'execute') {
    const lower = normalized.toLowerCase();
    const dangerousSubcommands = ['op', 'deop', 'ban', 'kick', 'stop', 'whitelist'];
    for (const danger of dangerousSubcommands) {
      if (lower.includes(`run ${danger}`)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Builds the final executable RCON command from a GameAction.
 * Normalizes leading slash (RCON works best with or without slash; standard convention is without).
 */
export function buildRconCommand(action: GameAction, allowedCommands = DEFAULT_ALLOWED_COMMANDS): string {
  let command = action.command.trim();

  // If command is not directly provided in action.command, generate from payload
  if (!command && action.payload) {
    switch (action.actionType) {
      case 'spawn_mob': {
        const entity = action.payload['entityType'] ?? 'minecraft:zombie';
        const coords = action.payload['coords'] ?? '~ ~ ~';
        const nbt = action.payload['nbt'] ? ` ${action.payload['nbt']}` : '';
        command = `summon ${entity} ${coords}${nbt}`;
        break;
      }
      case 'apply_effect': {
        const target = action.payload['target'] ?? '@a';
        const effect = action.payload['effect'] ?? 'minecraft:speed';
        const duration = action.payload['duration'] ?? 10;
        const amplifier = action.payload['amplifier'] ?? 1;
        command = `effect give ${target} ${effect} ${duration} ${amplifier}`;
        break;
      }
      case 'send_title': {
        const target = action.payload['target'] ?? '@a';
        const text = sanitizeInput(String(action.payload['text'] ?? ''));
        const color = action.payload['color'] ?? 'gold';
        command = `title ${target} title {"text":"${text}","color":"${color}"}`;
        break;
      }
      case 'send_chat': {
        const target = action.payload['target'] ?? '@a';
        const sender = sanitizeInput(String(action.payload['sender'] ?? 'Stream'));
        const message = sanitizeInput(String(action.payload['message'] ?? ''));
        command = `tellraw ${target} [{"text":"[${sender}] ","color":"aqua"},{"text":"${message}","color":"white"}]`;
        break;
      }
      default:
        throw new Error(`Unsupported actionType without command: ${action.actionType}`);
    }
  }

  // Strip leading slash for RCON
  const normalizedCommand = command.replace(/^\//, '').trim();

  if (!isCommandSafe(normalizedCommand, allowedCommands)) {
    throw new Error(`Security Exception: Command "${normalizedCommand}" is not in the whitelist of safe commands.`);
  }

  return normalizedCommand;
}
