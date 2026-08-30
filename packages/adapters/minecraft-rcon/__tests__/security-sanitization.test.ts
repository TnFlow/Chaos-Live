import { isCommandSafe, sanitizeInput } from '../src/command-builder.js';

describe('Security & Sanitization Audit', () => {
  describe('isCommandSafe — Command Whitelist & Injection Defenses', () => {
    it('permits safe whitelisted commands', () => {
      expect(isCommandSafe('summon minecraft:zombie ~ ~ ~')).toBe(true);
      expect(isCommandSafe('/summon minecraft:creeper ~ ~ ~ {powered:1b}')).toBe(true);
      expect(isCommandSafe('effect give @a minecraft:speed 10 1')).toBe(true);
      expect(isCommandSafe('give @a minecraft:diamond 5')).toBe(true);
      expect(isCommandSafe('particle heart ~ ~1 ~ 0.5 0.5 0.5 0.1 20')).toBe(true);
      expect(isCommandSafe('title @a title {"text":"Hello World"}')).toBe(true);
      expect(isCommandSafe('tellraw @a {"text":"Chaos-Live"}')).toBe(true);
      expect(isCommandSafe('weather thunder')).toBe(true);
      expect(isCommandSafe('say Welcome to the stream!')).toBe(true);
    });

    it('blocks dangerous server admin commands', () => {
      expect(isCommandSafe('op evil_user')).toBe(false);
      expect(isCommandSafe('/op evil_user')).toBe(false);
      expect(isCommandSafe('/deop streamer')).toBe(false);
      expect(isCommandSafe('/ban streamer')).toBe(false);
      expect(isCommandSafe('/ban-ip 127.0.0.1')).toBe(false);
      expect(isCommandSafe('/kick streamer')).toBe(false);
      expect(isCommandSafe('/stop')).toBe(false);
      expect(isCommandSafe('/restart')).toBe(false);
      expect(isCommandSafe('/save-off')).toBe(false);
      expect(isCommandSafe('/whitelist off')).toBe(false);
      expect(isCommandSafe('/kill @a')).toBe(false);
    });

    it('blocks command chaining via semicolons and newlines', () => {
      expect(isCommandSafe('say Hello; op attacker')).toBe(false);
      expect(isCommandSafe('summon zombie ~ ~ ~\nop attacker')).toBe(false);
      expect(isCommandSafe('summon zombie ~ ~ ~\r\nstop')).toBe(false);
      expect(isCommandSafe('give @a diamond 1\x00op attacker')).toBe(false);
    });

    it('blocks nested command injection via execute run', () => {
      expect(isCommandSafe('execute as @a run op evil_user')).toBe(false);
      expect(isCommandSafe('execute at @s run ban streamer')).toBe(false);
      expect(isCommandSafe('execute run stop')).toBe(false);
      expect(isCommandSafe('execute run kill @e')).toBe(false);
      expect(isCommandSafe('execute as @e run deop admin')).toBe(false);
    });

    it('rejects empty, null, or malformed commands', () => {
      expect(isCommandSafe('')).toBe(false);
      expect(isCommandSafe('   ')).toBe(false);
      expect(isCommandSafe(null as any)).toBe(false);
      expect(isCommandSafe(undefined as any)).toBe(false);
    });
  });

  describe('sanitizeInput — Input Cleansing', () => {
    it('escapes double quotes to prevent string literal breakout', () => {
      const dirty = 'Streamer" OR 1=1 --';
      const clean = sanitizeInput(dirty);
      expect(clean).not.toContain('""');
      expect(clean).toContain('\\"');
    });

    it('escapes single quotes to protect NBT string encapsulation', () => {
      const dirty = "User's Custom Title";
      const clean = sanitizeInput(dirty);
      expect(clean).toContain("\\'");
    });

    it('strips non-printable ASCII control characters and newlines', () => {
      const dirty = "Hello\x00World\nNew\rLine\tTab\x1FEnd";
      const clean = sanitizeInput(dirty);
      expect(clean).not.toMatch(/[\x00-\x1F\x7F]/);
      expect(clean).toBe('Hello World New Line Tab End');
    });

    it('enforces maximum length truncation', () => {
      const longInput = 'A'.repeat(250);
      const clean = sanitizeInput(longInput, 50);
      expect(clean.length).toBe(50);
    });
  });
});
