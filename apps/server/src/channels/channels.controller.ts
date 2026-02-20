import { Controller, Post, Put, Body, Param, Get } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateDomainsDto } from './dto/update-domains.dto';

@Controller('api/channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  async create(@Body() dto: CreateChannelDto) {
    return this.channelsService.create(dto);
  }

  @Put(':id/domains')
  async updateDomains(@Param('id') id: string, @Body() dto: UpdateDomainsDto) {
    return this.channelsService.updateDomains(id, dto);
  }
}
