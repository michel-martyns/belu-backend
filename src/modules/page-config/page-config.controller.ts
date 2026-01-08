import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { PageConfigService } from './page-config.service';
import {
  UpdatePageConfigDto,
  UpdateSectionsDto,
  ApplyTemplateDto,
} from './dto/page-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@Controller('page-config')
@UseGuards(JwtAuthGuard)
export class PageConfigController {
  constructor(private pageConfigService: PageConfigService) {}

  // GET /api/page-config - Buscar configuração atual
  @Get()
  async getConfig(@CurrentUser() user: CurrentUserData) {
    return this.pageConfigService.getConfig(user.tenantId);
  }

  // PUT /api/page-config - Atualizar configuração completa
  @Put()
  async updateConfig(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdatePageConfigDto,
  ) {
    return this.pageConfigService.updateConfig(user.tenantId, dto);
  }

  // PATCH /api/page-config/sections - Atualizar apenas seções
  @Patch('sections')
  async updateSections(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateSectionsDto,
  ) {
    return this.pageConfigService.updateSections(user.tenantId, dto);
  }

  // POST /api/page-config/apply-template - Aplicar template
  @Post('apply-template')
  async applyTemplate(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ApplyTemplateDto,
  ) {
    return this.pageConfigService.applyTemplate(user.tenantId, dto.templateId);
  }

  // GET /api/page-config/templates - Listar templates disponíveis
  @Get('templates')
  async getTemplates() {
    return this.pageConfigService.getTemplates();
  }
}
