import type { Platform } from '@chaos-live/shared-protocol';
import { getPrismaClient } from '../db/client.js';

export interface OAuthTokenRecord {
  id?: string;
  tenantId: string;
  platform: Platform;
  accessToken: string;
  refreshToken?: string;
  tokenExpires?: Date;
  channelId?: string;
  channelName?: string;
}

export interface TokenVault {
  saveToken(record: OAuthTokenRecord): Promise<void>;
  getToken(tenantId: string, platform: Platform): Promise<OAuthTokenRecord | null>;
  deleteToken(tenantId: string, platform: Platform): Promise<boolean>;
}

/**
 * PrismaTokenVault
 * Database-backed OAuth credential store with tenant isolation.
 */
export class PrismaTokenVault implements TokenVault {
  public async saveToken(record: OAuthTokenRecord): Promise<void> {
    const prisma = getPrismaClient();

    // Ensure tenant exists
    await prisma.tenant.upsert({
      where: { slug: record.tenantId },
      update: {},
      create: {
        id: record.tenantId,
        slug: record.tenantId,
        name: record.channelName || `Streamer ${record.tenantId}`,
      },
    });

    const existing = await prisma.streamerCredential.findFirst({
      where: {
        tenantId: record.tenantId,
        platform: record.platform,
      },
    });

    if (existing) {
      await prisma.streamerCredential.update({
        where: { id: existing.id },
        data: {
          accessToken: record.accessToken,
          refreshToken: record.refreshToken,
          tokenExpires: record.tokenExpires,
          channelId: record.channelId,
          channelName: record.channelName,
        },
      });
    } else {
      await prisma.streamerCredential.create({
        data: {
          tenantId: record.tenantId,
          platform: record.platform,
          accessToken: record.accessToken,
          refreshToken: record.refreshToken,
          tokenExpires: record.tokenExpires,
          channelId: record.channelId,
          channelName: record.channelName,
        },
      });
    }
  }

  public async getToken(tenantId: string, platform: Platform): Promise<OAuthTokenRecord | null> {
    const prisma = getPrismaClient();
    const cred = await prisma.streamerCredential.findFirst({
      where: {
        tenantId,
        platform,
      },
    });

    if (!cred) return null;

    return {
      id: cred.id,
      tenantId: cred.tenantId,
      platform: cred.platform as Platform,
      accessToken: cred.accessToken,
      refreshToken: cred.refreshToken ?? undefined,
      tokenExpires: cred.tokenExpires ?? undefined,
      channelId: cred.channelId ?? undefined,
      channelName: cred.channelName ?? undefined,
    };
  }

  public async deleteToken(tenantId: string, platform: Platform): Promise<boolean> {
    const prisma = getPrismaClient();
    const result = await prisma.streamerCredential.deleteMany({
      where: {
        tenantId,
        platform,
      },
    });
    return result.count > 0;
  }
}
