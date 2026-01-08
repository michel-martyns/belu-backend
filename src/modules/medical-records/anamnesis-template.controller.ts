import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnamnesisTemplateService } from './anamnesis-template.service';
import {
  CreateAnamnesisTemplateDto,
  UpdateAnamnesisTemplateDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  ReorderQuestionsDto,
  CreateAnamnesisResponseDto,
  UpdateAnamnesisResponseDto,
  QueryTemplatesDto,
  QueryResponsesDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@Controller('anamnesis-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnamnesisTemplateController {
  constructor(private anamnesisTemplateService: AnamnesisTemplateService) {}

  // ============================================================================
  // TEMPLATES - Endpoints
  // ============================================================================

  /**
   * Lista todos os templates do tenant
   * GET /api/anamnesis-templates
   */
  @Get()
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findAll(
    @Query() query: QueryTemplatesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.findAll(user.tenantId, query);
  }

  /**
   * Busca template por ID
   * GET /api/anamnesis-templates/:id
   */
  @Get(':id')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.findById(id, user.tenantId);
  }

  /**
   * Busca template por serviço ou padrão
   * GET /api/anamnesis-templates/by-service/:serviceId
   */
  @Get('by-service/:serviceId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findByService(
    @Param('serviceId') serviceId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.findByServiceOrDefault(
      serviceId,
      user.tenantId,
    );
  }

  /**
   * Cria um novo template
   * POST /api/anamnesis-templates
   */
  @Post()
  @RequirePermissions(Permission.MEDICAL_RECORDS_CREATE)
  async create(
    @Body() dto: CreateAnamnesisTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.create(user.tenantId, dto);
  }

  /**
   * Atualiza um template
   * PATCH /api/anamnesis-templates/:id
   */
  @Patch(':id')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAnamnesisTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.update(id, user.tenantId, dto);
  }

  /**
   * Remove um template
   * DELETE /api/anamnesis-templates/:id
   */
  @Delete(':id')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.delete(id, user.tenantId);
  }

  /**
   * Duplica um template
   * POST /api/anamnesis-templates/:id/duplicate
   */
  @Post(':id/duplicate')
  @RequirePermissions(Permission.MEDICAL_RECORDS_CREATE)
  async duplicate(
    @Param('id') id: string,
    @Body('name') name: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.duplicate(id, user.tenantId, name);
  }

  // ============================================================================
  // QUESTIONS - Endpoints
  // ============================================================================

  /**
   * Adiciona uma pergunta ao template
   * POST /api/anamnesis-templates/:id/questions
   */
  @Post(':id/questions')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async addQuestion(
    @Param('id') id: string,
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.addQuestion(id, user.tenantId, dto);
  }

  /**
   * Atualiza uma pergunta
   * PATCH /api/anamnesis-templates/questions/:questionId
   */
  @Patch('questions/:questionId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async updateQuestion(
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.updateQuestion(
      questionId,
      user.tenantId,
      dto,
    );
  }

  /**
   * Remove uma pergunta
   * DELETE /api/anamnesis-templates/questions/:questionId
   */
  @Delete('questions/:questionId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async deleteQuestion(
    @Param('questionId') questionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.deleteQuestion(
      questionId,
      user.tenantId,
    );
  }

  /**
   * Reordena perguntas de um template
   * POST /api/anamnesis-templates/:id/questions/reorder
   */
  @Post(':id/questions/reorder')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async reorderQuestions(
    @Param('id') id: string,
    @Body() dto: ReorderQuestionsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.reorderQuestions(
      id,
      user.tenantId,
      dto,
    );
  }

  // ============================================================================
  // RESPONSES - Preenchimento de anamnese
  // ============================================================================

  /**
   * Lista respostas de anamnese
   * GET /api/anamnesis-templates/responses
   */
  @Get('responses/list')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findResponses(
    @Query() query: QueryResponsesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.findResponses(user.tenantId, query);
  }

  /**
   * Busca uma resposta por ID
   * GET /api/anamnesis-templates/responses/:responseId
   */
  @Get('responses/:responseId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findResponseById(
    @Param('responseId') responseId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.findResponseById(
      responseId,
      user.tenantId,
    );
  }

  /**
   * Cria uma nova resposta de anamnese
   * POST /api/anamnesis-templates/responses
   */
  @Post('responses')
  @RequirePermissions(Permission.MEDICAL_RECORDS_CREATE)
  async createResponse(
    @Body() dto: CreateAnamnesisResponseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.createResponse(
      user.tenantId,
      dto,
      user.id,
    );
  }

  /**
   * Atualiza uma resposta de anamnese
   * PATCH /api/anamnesis-templates/responses/:responseId
   */
  @Patch('responses/:responseId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async updateResponse(
    @Param('responseId') responseId: string,
    @Body() dto: UpdateAnamnesisResponseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.updateResponse(
      responseId,
      user.tenantId,
      dto,
    );
  }

  /**
   * Remove uma resposta de anamnese
   * DELETE /api/anamnesis-templates/responses/:responseId
   */
  @Delete('responses/:responseId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async deleteResponse(
    @Param('responseId') responseId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.anamnesisTemplateService.deleteResponse(
      responseId,
      user.tenantId,
    );
  }
}
