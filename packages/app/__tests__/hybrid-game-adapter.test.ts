import { jest } from '@jest/globals';
import type { GameAdapter } from '@chaos-live/core';
import type { GameAction, ActionResult } from '@chaos-live/shared-protocol';
import { HybridGameAdapter } from '../src/adapters/hybrid-game-adapter.js';
import type { WebSocketHub } from '../src/server.js';

describe('HybridGameAdapter', () => {
  let mockWsHub: jest.Mocked<WebSocketHub>;
  let mockRcon: jest.Mocked<GameAdapter>;
  let mockConsole: jest.Mocked<GameAdapter>;
  let adapter: HybridGameAdapter;

  const sampleAction: GameAction = {
    id: 'action-test-1',
    actionType: 'execute_command',
    command: 'summon creeper ~ ~ ~',
    priority: 10,
    timestamp: Date.now(),
  };

  beforeEach(() => {
    mockWsHub = {
      isModConnected: jest.fn().mockReturnValue(false),
      sendActionToMod: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<WebSocketHub>;

    mockRcon = {
      name: 'RCON',
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(false),
      healthCheck: jest.fn().mockResolvedValue(true),
      executeAction: jest.fn().mockResolvedValue({
        actionId: 'action-test-1',
        success: true,
        durationMs: 15,
        response: 'RCON executed',
      }),
    };

    mockConsole = {
      name: 'Console',
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
      healthCheck: jest.fn().mockResolvedValue(true),
      executeAction: jest.fn().mockResolvedValue({
        actionId: 'action-test-1',
        success: true,
        durationMs: 2,
        response: 'Console executed',
      }),
    };

    adapter = new HybridGameAdapter({
      wsHub: mockWsHub,
      rconAdapter: mockRcon,
      fallbackAdapter: mockConsole,
      modTimeoutMs: 100,
    });
  });

  it('dispatches to console fallback when neither mod nor RCON are connected', async () => {
    const result = await adapter.executeAction(sampleAction);
    expect(result.response).toBe('Console executed');
    expect(mockConsole.executeAction).toHaveBeenCalledWith(sampleAction);
    expect(mockRcon.executeAction).not.toHaveBeenCalled();
    expect(mockWsHub.sendActionToMod).not.toHaveBeenCalled();
  });

  it('dispatches to RCON when RCON is connected and mod is offline', async () => {
    mockRcon.isConnected.mockReturnValue(true);

    const result = await adapter.executeAction(sampleAction);
    expect(result.response).toBe('RCON executed');
    expect(mockRcon.executeAction).toHaveBeenCalledWith(sampleAction);
    expect(mockConsole.executeAction).not.toHaveBeenCalled();
  });

  it('prioritizes Fabric mod when mod is connected and resolves upon ACK', async () => {
    mockWsHub.isModConnected.mockReturnValue(true);

    const executePromise = adapter.executeAction(sampleAction);

    expect(mockWsHub.sendActionToMod).toHaveBeenCalledWith(sampleAction);

    // Simulate mod sending ACK back
    adapter.handleModActionResult({
      correlationId: 'action-test-1',
      success: true,
      durationMs: 8,
      response: 'Fabric mod executed',
    });

    const result = await executePromise;
    expect(result.success).toBe(true);
    expect(result.durationMs).toBe(8);
    expect(result.response).toBe('Fabric mod executed');
    expect(mockRcon.executeAction).not.toHaveBeenCalled();
    expect(mockConsole.executeAction).not.toHaveBeenCalled();
  });

  it('falls back to secondary adapter if mod times out without ACK', async () => {
    mockWsHub.isModConnected.mockReturnValue(true);
    mockRcon.isConnected.mockReturnValue(true);

    // Will timeout after 100ms
    const result = await adapter.executeAction(sampleAction);
    expect(result.response).toBe('RCON executed');
    expect(mockRcon.executeAction).toHaveBeenCalledWith(sampleAction);
  });
});
