import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EmitNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Prisma.JsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async emit(input: EmitNotification): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data ?? undefined,
      },
    });
  }

  async list(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, ids: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId, id: { in: ids } },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
