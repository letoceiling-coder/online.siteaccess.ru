import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateDomainsDto } from './dto/update-domains.dto';
import * as crypto from 'crypto';

@Injectable()
export class ChannelsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateChannelDto) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const channel = await this.prisma.channel.create({
      data: {
        name: dto.name,
        tokenHash,
      },
    });

    return {
      id: channel.id,
      name: channel.name,
      token, // РІРµСЂРЅСѓС‚СЊ РўРћР›Р¬РљРћ РѕРґРёРЅ СЂР°Р·
    };
  }

  async updateDomains(id: string, dto: UpdateDomainsDto) {
    const channel = await this.prisma.channel.update({
      where: { id },
      data: {
        allowedDomains: dto.domains,
      },
    });

    return {
      id: channel.id,
      allowedDomains: channel.allowedDomains,
    };
  }

  async findByTokenHash(tokenHash: string) {
    return this.prisma.channel.findUnique({
      where: { tokenHash },
    });
  }
}
