import { TenantManager } from '../src/tenant/tenant-manager.js';
import { PrismaTokenVault } from '../src/tenant/token-vault.js';
import type { ChaosEvent } from '@chaos-live/shared-protocol';

describe('SaaS Foundation — TenantManager & TokenVault', () => {
  let manager: TenantManager;

  beforeEach(() => {
    manager = new TenantManager('default-streamer');
  });

  it('bootstraps with initial default tenant', () => {
    const defaultTenant = manager.getTenant();
    expect(defaultTenant).toBeDefined();
    expect(defaultTenant?.tenantId).toBe('default-streamer');
    expect(defaultTenant?.plan).toBe('pro');
    expect(manager.listTenants().length).toBe(1);
  });

  it('registers new tenants with isolated queues and rule engines', () => {
    const tenantA = manager.registerTenant({
      tenantId: 'streamer-alice',
      slug: 'alice',
      name: 'Alice Plays MC',
      plan: 'creator',
      rules: [
        {
          id: 'rule-alice-rose',
          name: 'Alice Rose Rule',
          priority: 50,
          enabled: true,
          cooldownMs: 0,
          matcher: { eventTypes: ['gift'] },
          action: { actionType: 'execute_command', command: 'say Alice thanks you!' },
        },
      ],
    });

    const tenantB = manager.registerTenant({
      tenantId: 'streamer-bob',
      slug: 'bob',
      name: 'Bob Streaming',
      plan: 'free',
      rules: [
        {
          id: 'rule-bob-rose',
          name: 'Bob Rose Rule',
          priority: 10,
          enabled: true,
          cooldownMs: 0,
          matcher: { eventTypes: ['gift'] },
          action: { actionType: 'execute_command', command: 'say Bob loves gifts!' },
        },
      ],
    });

    expect(manager.listTenants().length).toBe(3);
    expect(tenantA.ruleEvaluator.getRules()[0]?.name).toBe('Alice Rose Rule');
    expect(tenantB.ruleEvaluator.getRules()[0]?.name).toBe('Bob Rose Rule');
    expect(tenantA.queue).not.toBe(tenantB.queue);
  });

  it('routes events strictly to the matching tenant pipeline', async () => {
    manager.registerTenant({
      tenantId: 'streamer-alice',
      slug: 'alice',
      name: 'Alice Plays MC',
      rules: [
        {
          id: 'rule-alice',
          name: 'Alice Rule',
          priority: 50,
          enabled: true,
          cooldownMs: 0,
          matcher: { eventTypes: ['gift'] },
          action: { actionType: 'execute_command', command: 'summon chicken ~ ~ ~' },
        },
      ],
    });

    manager.registerTenant({
      tenantId: 'streamer-bob',
      slug: 'bob',
      name: 'Bob MC',
      rules: [
        {
          id: 'rule-bob',
          name: 'Bob Rule',
          priority: 10,
          enabled: true,
          cooldownMs: 0,
          matcher: { eventTypes: ['gift'] },
          action: { actionType: 'execute_command', command: 'summon creeper ~ ~ ~' },
        },
      ],
    });

    const aliceEvent: ChaosEvent<'gift'> = {
      id: 'evt-alice-1',
      tenantId: 'streamer-alice',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'u1', displayName: 'AliceFan' },
      value: 1,
      metadata: { giftName: 'Rose', giftId: 1, repeatCount: 1, diamondCount: 1 },
      raw: {},
      timestamp: Date.now(),
    };

    const bobEvent: ChaosEvent<'gift'> = {
      id: 'evt-bob-1',
      tenantId: 'streamer-bob',
      platform: 'twitch',
      type: 'gift',
      user: { id: 'u2', displayName: 'BobFan' },
      value: 500,
      metadata: { giftName: 'Cheer 500 Bits', giftId: 500, repeatCount: 1, diamondCount: 500 },
      raw: {},
      timestamp: Date.now(),
    };

    const aliceResult = await manager.routeEvent(aliceEvent);
    const bobResult = await manager.routeEvent(bobEvent);

    // Alice verification
    expect(aliceResult.tenant.tenantId).toBe('streamer-alice');
    expect(aliceResult.action?.command).toBe('summon chicken ~ ~ ~');
    expect(aliceResult.tenant.queue.size()).toBe(1);
    const aliceItem = aliceResult.tenant.queue.dequeue();
    expect(aliceItem?.action.command).toBe('summon chicken ~ ~ ~');

    // Bob verification
    expect(bobResult.tenant.tenantId).toBe('streamer-bob');
    expect(bobResult.action?.command).toBe('summon creeper ~ ~ ~');
    expect(bobResult.tenant.queue.size()).toBe(1);
    const bobItem = bobResult.tenant.queue.dequeue();
    expect(bobItem?.action.command).toBe('summon creeper ~ ~ ~');

    // Cross-tenant bleed check
    expect(aliceResult.tenant.queue.size()).toBe(0);
    expect(bobResult.tenant.queue.size()).toBe(0);
  });

  it('stores and retrieves streamer OAuth credentials in TokenVault', async () => {
    const vault = new PrismaTokenVault();

    await vault.saveToken({
      tenantId: 'tenant-oauth-test',
      platform: 'twitch',
      accessToken: 'oauth-token-xyz123',
      refreshToken: 'refresh-token-abc987',
      channelId: 'twitch-channel-777',
      channelName: 'ProStreamer',
    });

    const retrieved = await vault.getToken('tenant-oauth-test', 'twitch');
    expect(retrieved).toBeDefined();
    expect(retrieved?.accessToken).toBe('oauth-token-xyz123');
    expect(retrieved?.channelName).toBe('ProStreamer');

    const deleted = await vault.deleteToken('tenant-oauth-test', 'twitch');
    expect(deleted).toBe(true);

    const afterDelete = await vault.getToken('tenant-oauth-test', 'twitch');
    expect(afterDelete).toBeNull();
  });
});
