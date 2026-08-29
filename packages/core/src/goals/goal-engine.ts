import { randomUUID } from 'node:crypto';
import type { ChaosEvent, GameAction, EventType, ActionType } from '@chaos-live/shared-protocol';
import { getPrismaClient } from '../db/client.js';
import { interpolateString } from '../engine/rule-evaluator.js';

export interface GoalConfig {
  id?: string;
  name: string;
  eventType: EventType;
  /** Optional specific gift name requirement (e.g. "Rose") if eventType is "gift". */
  giftName?: string;
  targetValue: number;
  currentValue?: number;
  actionCommand: string;
  actionType?: ActionType;
  /** If true, resets currentValue to 0 upon reaching target so the community can reach it repeatedly. Default: false. */
  repeatable?: boolean;
}

export interface GoalState extends GoalConfig {
  id: string;
  currentValue: number;
  completed: boolean;
  actionType: ActionType;
}

export interface GoalProgressUpdate {
  goalId: string;
  name: string;
  eventType: EventType;
  targetValue: number;
  currentValue: number;
  percent: number;
  completed: boolean;
  justCompleted: boolean;
  triggeredAction?: GameAction;
}

/**
 * GoalEngine
 * Tracks community contribution goals (e.g. "100 Roses -> Summon Warden")
 * across stream events with persistent SQLite state and action dispatch triggers.
 */
export class GoalEngine {
  private goals: Map<string, GoalState> = new Map();
  private isLoadedFromDb = false;

  constructor(initialGoals: GoalConfig[] = []) {
    for (const g of initialGoals) {
      const id = g.id || randomUUID();
      this.goals.set(id, {
        ...g,
        id,
        currentValue: g.currentValue ?? 0,
        completed: false,
        actionType: g.actionType ?? 'execute_command',
      });
    }
  }

  /**
   * Initializes goals from SQLite database.
   * If database contains goals, loads their persistent progress.
   * If database is empty, seeds with initial in-memory goals.
   */
  public async initFromDatabase(): Promise<void> {
    if (this.isLoadedFromDb) return;

    try {
      const prisma = getPrismaClient();
      const savedGoals = await prisma.goal.findMany();

      if (savedGoals.length > 0) {
        for (const sg of savedGoals) {
          this.goals.set(sg.id, {
            id: sg.id,
            name: sg.name,
            eventType: sg.eventType as EventType,
            targetValue: sg.targetValue,
            currentValue: sg.currentValue,
            actionCommand: sg.actionCommand,
            actionType: (sg.actionType as ActionType) || 'execute_command',
            completed: sg.completed,
          });
        }
      } else {
        // Seed initial goals to database
        for (const g of this.goals.values()) {
          await prisma.goal.create({
            data: {
              id: g.id,
              name: g.name,
              eventType: g.eventType,
              targetValue: g.targetValue,
              currentValue: g.currentValue,
              actionCommand: g.actionCommand,
              actionType: g.actionType,
              completed: g.completed,
            },
          });
        }
      }

      this.isLoadedFromDb = true;
    } catch {
      // Fallback to in-memory mode if DB is not available in test/offline environment
      this.isLoadedFromDb = true;
    }
  }

  public getGoals(): GoalState[] {
    return Array.from(this.goals.values());
  }

  public getGoal(id: string): GoalState | undefined {
    return this.goals.get(id);
  }

  /**
   * Evaluates an incoming ChaosEvent against registered goals.
   * Increments progress, updates database, and triggers GameAction upon target completion.
   */
  public async processEvent(event: ChaosEvent): Promise<GoalProgressUpdate[]> {
    const updates: GoalProgressUpdate[] = [];

    for (const goal of this.goals.values()) {
      if (goal.completed && !goal.repeatable) {
        continue;
      }

      // Check event type match
      if (goal.eventType !== event.type) {
        continue;
      }

      // If goal specifies a giftName, check metadata
      if (goal.giftName && event.type === 'gift') {
        const giftMeta = event.metadata as { giftName?: string };
        if (giftMeta.giftName !== goal.giftName) {
          continue;
        }
      }

      // Calculate contribution increment
      let increment = 1;
      if (event.type === 'gift') {
        const giftMeta = event.metadata as { repeatCount?: number };
        increment = giftMeta.repeatCount || 1;
      } else if (event.type === 'like') {
        const likeMeta = event.metadata as { likeCount?: number };
        increment = likeMeta.likeCount || 1;
      }

      goal.currentValue += increment;
      const justCompleted = goal.currentValue >= goal.targetValue;

      let triggeredAction: GameAction | undefined;

      if (justCompleted) {
        goal.completed = true;

        const command = interpolateString(goal.actionCommand, event);
        triggeredAction = {
          id: randomUUID(),
          actionType: goal.actionType,
          command,
          payload: { goalId: goal.id, goalName: goal.name },
          priority: 200, // Goal completions receive elevated priority
          timestamp: Date.now(),
        };

        if (goal.repeatable) {
          goal.currentValue = 0;
          goal.completed = false;
        }
      }

      const percent = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));

      updates.push({
        goalId: goal.id,
        name: goal.name,
        eventType: goal.eventType,
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        percent,
        completed: goal.completed,
        justCompleted,
        triggeredAction,
      });

      // Persist to SQLite in background
      void this.persistGoal(goal);
    }

    return updates;
  }

  /**
   * Resets a goal's progress.
   */
  public async resetGoal(goalId: string): Promise<void> {
    const goal = this.goals.get(goalId);
    if (!goal) return;

    goal.currentValue = 0;
    goal.completed = false;
    await this.persistGoal(goal);
  }

  private async persistGoal(goal: GoalState): Promise<void> {
    try {
      const prisma = getPrismaClient();
      await prisma.goal.upsert({
        where: { id: goal.id },
        update: {
          currentValue: goal.currentValue,
          completed: goal.completed,
        },
        create: {
          id: goal.id,
          name: goal.name,
          eventType: goal.eventType,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          actionCommand: goal.actionCommand,
          actionType: goal.actionType,
          completed: goal.completed,
        },
      });
    } catch {
      // Ignore background persistence error
    }
  }
}
