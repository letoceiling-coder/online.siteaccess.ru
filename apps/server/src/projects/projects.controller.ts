import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateDomainsDto } from './dto/update-domains.dto';
import { AddOperatorDto } from '../operator/dto/add-operator.dto';

@Controller('api/projects')
@UseGuards(AuthGuard('jwt'))
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  async create(@Body() dto: CreateProjectDto, @Request() req: any) {
    return this.projectsService.create(dto, req.user.id);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.projectsService.findAll(req.user.id);
  }

  @Put(':id/domains')
  async updateDomains(
    @Param('id') id: string,
    @Body() dto: UpdateDomainsDto,
    @Request() req: any,
  ) {
    return this.projectsService.updateDomains(id, dto, req.user.id);
  }

  @Get(':id/install')
  async getInstallData(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.getInstallData(id, req.user.id);
  }

  @Get(':id/operators')
  async getOperators(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.getOperators(id, req.user.id);
  }

  @Post(':id/operators')
  async addOperator(
    @Param('id') id: string,
    @Body() dto: AddOperatorDto,
    @Request() req: any,
  ) {
    return this.projectsService.addOperator(id, dto, req.user.id);
  }

  @Delete(':id/operators/:userId')
  async removeOperator(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    return this.projectsService.removeOperator(id, userId, req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.findOne(id, req.user.id);
  }

  @Put(':id/settings')
  async updateSettings(
    @Param('id') id: string,
    @Body() dto: { widgetSettings: any },
    @Request() req: any,
  ) {
    return this.projectsService.updateSettings(id, dto.widgetSettings, req.user.id);
  }

  @Post(':id/token')
  async regenerateToken(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.regenerateToken(id, req.user.id);
  }
}
