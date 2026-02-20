import { Controller, Post, Get, Put, Body, Param, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateDomainsDto } from './dto/update-domains.dto';

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
}
