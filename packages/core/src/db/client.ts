import { PrismaClient } from '@prisma/client';
import type { ChaosEvent, GameAction, ActionResult } from '@chaos-live/shared-protocol';

let prismaInstance: PrismaClient | undefined;

/**
 * Returns a singleton PrismaClient instance.
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

/**
 * Closes the PrismaClient connection.
 */
export async function closePrismaClient(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = undefined;
  }
}

/**
 * Records a processed event and its dispatch outcome to SQLite for audit and session metrics.
 */
export async function recordProcessedEvent(
  event: ChaosEvent,
  action?: GameAction,
  result?: ActionResult,
  prisma = getPrismaClient(),
): Promise<void> {
  try {
    await prisma.processedEvent.create({
      data: {
        id: event.id,
        platform: event.platform,
        eventType: event.type,
        userId: event.user.id,
        userDisplayName: event.user.displayName,
        value: event.value,
        actionDispatched: !!action,
        command: action?.command,
        success: result?.success ?? false,
        error: result?.error,
        durationMs: result?.durationMs,
      },
    });
  } catch {
    // Non-critical database logging errors should not disrupt real-time stream execution
  }
}
