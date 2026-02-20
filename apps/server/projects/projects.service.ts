import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateDomainsDto } from './dto/update-domains.dto';
import { AddOperatorDto } from '../operator/dto/add-operator.dto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProjectDto, userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const channel = await this.prisma.channel.create({
      data: {
        name: dto.name,
        tokenHash,
        allowedDomains: dto.domains || [],
        ownerUserId: userId,
      },
    });

    return {
      id: channel.id,
      name: channel.name,
      token, // показать только один раз
    };
  }

  async findAll(userId: string) {
    const channels = await this.prisma.channel.findMany({
      where: { ownerUserId: userId },
      select: {
        id: true,
        name: true,
        allowedDomains: true,
        ownerUserId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return channels;
  }

  async updateDomains(id: string, dto: UpdateDomainsDto, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Project not found');
    }

    if (channel.ownerUserId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const updated = await this.prisma.channel.update({
      where: { id },
      data: {
        allowedDomains: dto.domains,
      },
    });

    return {
      id: updated.id,
      allowedDomains: updated.allowedDomains,
    };
  }

  async getInstallData(id: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!channel) {
      throw new NotFoundException('Project not found');
    }

    if (channel.ownerUserId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // Найти token - нужно получить из базы или регенерировать
    // Для MVP: вернем placeholder, так как token не хранится
    // В реальности нужно либо хранить token (небезопасно), либо регенерировать и показывать только один раз
    // Для STEP_03 используем placeholder

    const scriptTag = '<script async src="https://online.siteaccess.ru/widget/v1/widget.min.js"></script>';
    const configSnippet = `window.SiteAccessChat = { token: "YOUR_TOKEN_HERE", apiBase: "https://online.siteaccess.ru" };`;

    return {
      scriptTag,
      configSnippet,
      docsMarkdownShort: `# Install Widget\n\nAdd the code below to your website's <head> section.\n\n**Note:** Replace YOUR_TOKEN_HERE with your project token (shown only once when creating the project).`,
    };
  }

  async getOperators(id: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Project not found');
    }

    if (channel.ownerUserId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    const members = await this.prisma.channelMember.findMany({
      where: { channelId: id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async addOperator(id: string, dto: AddOperatorDto, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Project not found');
    }

    if (channel.ownerUserId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    let tempPassword: string | undefined;

    if (!user) {
      // Generate password if not provided
      const password = dto.password || crypto.randomBytes(12).toString('base64');
      tempPassword = dto.password ? undefined : password;

      const passwordHash = await bcrypt.hash(password, 10);

      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
        },
      });
    }

    // Check if already a member
    const existing = await this.prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId: id,
          userId: user.id,
        },
      },
    });

    if (existing) {
      return {
        userId: user.id,
        email: user.email,
        tempPassword: undefined,
      };
    }

    // Add as operator
    await this.prisma.channelMember.create({
      data: {
        channelId: id,
        userId: user.id,
        role: 'operator',
      },
    });

    return {
      userId: user.id,
      email: user.email,
      tempPassword,
    };
  }

  async removeOperator(id: string, operatorUserId: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Project not found');
    }

    if (channel.ownerUserId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    await this.prisma.channelMember.delete({
      where: {
        channelId_userId: {
          channelId: id,
          userId: operatorUserId,
        },
      },
    });

    return { success: true };
  }
}
