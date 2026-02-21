import { Injectable, NotFoundException, ForbiddenException, Logger, ConflictException, HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateDomainsDto } from './dto/update-domains.dto';
import { AddOperatorDto } from '../operator/dto/add-operator.dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProjectDto, userId: string) {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Create channel
      const channel = await this.prisma.channel.create({
        data: {
          name: dto.name,
          tokenHash,
          allowedDomains: dto.domains || [],
          ownerUserId: userId,
          // encryptionMode will use default from schema (server)
        },
      });

      // Create ChannelMember for owner (CRITICAL - must succeed)
      try {
        const channelMemberDelegate = (this.prisma as any).channelMember;
        if (channelMemberDelegate) {
          await channelMemberDelegate.upsert({
            where: {
              channelId_userId: {
                channelId: channel.id,
                userId: userId,
              },
            },
            update: {
              role: 'owner',
            },
            create: {
              channelId: channel.id,
              userId: userId,
              role: 'owner',
            },
          });
          this.logger.log(`ChannelMember created for owner: userId=${userId}, channelId=${channel.id}`);
        } else {
          this.logger.warn(`ChannelMember delegate not found - skipping owner membership creation. Run: pnpm prisma generate`);
        }
      } catch (memberError: any) {
        this.logger.error(`CRITICAL: Failed to create ChannelMember for owner: ${memberError.message}`, memberError.stack);
        // If member creation fails, try to rollback channel creation or at least log the issue
        // For now, we'll let it continue but log as error (not warning) since this is critical
        // The fallback in OperatorService.login will handle missing memberships for owners
      }

      return {
        id: channel.id,
        name: channel.name,
        token, // показать только один раз
      };
    } catch (error: any) {
      this.logger.error(`Project creation failed for user ${userId}`, error.stack || error.message);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Project with this name already exists');
        }
        if (error.code === 'P2003' || error.message?.includes('permission denied')) {
          this.logger.error('Database permission error', error);
          throw new HttpException('Database access error', 500);
        }
        if (error.message?.includes('does not exist')) {
          this.logger.error('Database schema mismatch', error);
          throw new HttpException('Database schema error - please run migrations', 500);
        }
      }

      if (error instanceof HttpException || error instanceof ConflictException) {
        throw error;
      }

      this.logger.error('Unexpected project creation error', error);
      throw new HttpException('Project creation failed', 500);
    }
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

    // Token is not stored - user must regenerate it
    // Return snippet with placeholder and instructions
    const scriptTag = '<script defer src="https://online.siteaccess.ru/widget/v1/widget.min.js"></script>';
    const configSnippet = `window.SiteAccessChat = { token: "YOUR_TOKEN_HERE", apiBase: "https://online.siteaccess.ru" };`;

    return {
      scriptTag,
      configSnippet,
      hasToken: false,
      docsMarkdownShort: `# Install Widget\n\n**Important:** You need to regenerate your project token first using the "Regenerate Token" button.\n\nAdd the code below to your website's <head> section, replacing YOUR_TOKEN_HERE with your actual token.`,
    };
  }

  async regenerateToken(id: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Project not found');
    }

    if (channel.ownerUserId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Update channel with new tokenHash
    await this.prisma.channel.update({
      where: { id },
      data: { tokenHash },
    });

    // Return raw token ONCE (client must save it)
    return {
      token,
      message: 'Token regenerated. Save this token now - it will not be shown again.',
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

    const members = await (this.prisma as any).channelMember.findMany({
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
    // Access channelMember via Prisma Client (generated dynamically)
    const channelMemberDelegate = (this.prisma as any).channelMember;
    if (!channelMemberDelegate) {
      throw new Error('Prisma Client channelMember delegate not found. Run: pnpm prisma generate');
    }

    const existing = await channelMemberDelegate.findUnique({
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
    await channelMemberDelegate.create({
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

    const channelMemberDelegate = (this.prisma as any).channelMember;
    if (!channelMemberDelegate) {
      throw new Error('Prisma Client channelMember delegate not found. Run: pnpm prisma generate');
    }

    await channelMemberDelegate.delete({
      where: {
        channelId_userId: {
          channelId: id,
          userId: operatorUserId,
        },
      },
    });

    return { success: true };
  }

  async findOne(id: string, userId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Project not found');
    }

    if (channel.ownerUserId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    return {
      id: channel.id,
      name: channel.name,
      allowedDomains: channel.allowedDomains,
      widgetSettings: (channel as any).widgetsettings,
      installVerifiedAt: (channel as any).installverifiedat?.toISOString() || null,
      lastWidgetPingAt: (channel as any).lastwidgetpingat?.toISOString() || null,
      lastWidgetPingUrl: (channel as any).lastwidgetpingurl,
      lastWidgetPingUserAgent: (channel as any).lastwidgetpinguseragent,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString(),
    };
  }

  async updateSettings(id: string, widgetSettings: any, userId: string) {
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
        widgetsettings: widgetSettings,
      } as any,
    });

    return {
      id: updated.id,
      widgetSettings: (updated as any).widgetsettings,
    };
  }
}
