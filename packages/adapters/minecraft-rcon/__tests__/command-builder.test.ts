import type { GameAction } from '@chaos-live/shared-protocol';
import {
  sanitizeInput,
  isCommandSafe,
  buildRconCommand,
} from '../src/command-builder.js';

describe('Minecraft RCON Command Builder & Sanitizer', () => {
  describe('sanitizeInput', () => {
    it('escapes quotes and backslashes', () => {
      const malicious = 'Player "quoted" and \\backslashed\\ and \'single\'';
      const sanitized = sanitizeInput(malicious);
      expect(sanitized).toBe('Player \\"quoted\\" and \\\\backslashed\\\\ and \\\'single\\\'');
    });

    it('strips newlines, carriage returns, and null bytes', () => {
      const injection = 'Line 1\nLine 2\r\nLine 3\0';
      const sanitized = sanitizeInput(injection);
      expect(sanitized).toBe('Line 1 Line 2 Line 3');
      expect(sanitized).not.toContain('\n');
      expect(sanitized).not.toContain('\r');
      expect(sanitized).not.toContain('\0');
    });

    it('truncates excessively long input', () => {
      const longText = 'a'.repeat(200);
      const sanitized = sanitizeInput(longText, 50);
      expect(sanitized.length).toBe(50);
    });
  });

  describe('isCommandSafe', () => {
    it('approves safe whitelisted commands', () => {
      expect(isCommandSafe('summon zombie ~ ~ ~')).toBe(true);
      expect(isCommandSafe('/effect give @a speed 10 1')).toBe(true);
      expect(isCommandSafe('particle heart ~ ~ ~')).toBe(true);
      expect(isCommandSafe('/title @a title {"text":"Hi"}')).toBe(true);
      expect(isCommandSafe('tellraw @a "Hello"')).toBe(true);
    });

    it('blocks dangerous administrative commands', () => {
      expect(isCommandSafe('op maliciousUser')).toBe(false);
      expect(isCommandSafe('/deop streamer')).toBe(false);
      expect(isCommandSafe('ban victim')).toBe(false);
      expect(isCommandSafe('stop')).toBe(false);
      expect(isCommandSafe('kick all')).toBe(false);
    });

    it('blocks nested injection inside execute commands', () => {
      expect(isCommandSafe('execute at @a run op attacker')).toBe(false);
      expect(isCommandSafe('/execute as @p run ban victim')).toBe(false);
    });
  });

  describe('buildRconCommand', () => {
    it('strips leading slash from direct command strings', () => {
      const action: GameAction = {
        id: 'act-1',
        actionType: 'execute_command',
        command: '/summon chicken ~ ~1 ~',
        payload: {},
        priority: 10,
        timestamp: Date.now(),
      };

      const result = buildRconCommand(action);
      expect(result).toBe('summon chicken ~ ~1 ~');
    });

    it('builds command from structured spawn_mob payload', () => {
      const action: GameAction = {
        id: 'act-2',
        actionType: 'spawn_mob',
        command: '',
        payload: {
          entityType: 'minecraft:creeper',
          coords: '~ ~ ~',
          nbt: '{powered:1b}',
        },
        priority: 100,
        timestamp: Date.now(),
      };

      const result = buildRconCommand(action);
      expect(result).toBe('summon minecraft:creeper ~ ~ ~ {powered:1b}');
    });

    it('builds command from structured apply_effect payload', () => {
      const action: GameAction = {
        id: 'act-3',
        actionType: 'apply_effect',
        command: '',
        payload: {
          target: '@a',
          effect: 'minecraft:speed',
          duration: 30,
          amplifier: 2,
        },
        priority: 20,
        timestamp: Date.now(),
      };

      const result = buildRconCommand(action);
      expect(result).toBe('effect give @a minecraft:speed 30 2');
    });

    it('throws error when action specifies forbidden command', () => {
      const dangerousAction: GameAction = {
        id: 'act-4',
        actionType: 'execute_command',
        command: 'op hacker',
        payload: {},
        priority: 1000,
        timestamp: Date.now(),
      };

      expect(() => buildRconCommand(dangerousAction)).toThrow(/Security Exception/);
    });
  });
});
