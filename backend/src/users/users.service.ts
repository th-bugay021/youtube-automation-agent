import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
      },
    });
  }

  listChannels(userId: string) {
    return this.prisma.channel.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        subscriberCount: true,
        videoCount: true,
        automationMode: true,
        isActive: true,
        niche: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
