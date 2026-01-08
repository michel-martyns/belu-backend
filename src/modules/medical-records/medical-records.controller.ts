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
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { MedicalRecordsService } from './medical-records.service';
import { StorageService, UPLOAD_CONFIGS } from '../storage/storage.service';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  CreateEntryDto,
  UpdateEntryDto,
  UpdateAttachmentDto,
  QueryEntriesDto,
  QueryAttachmentsDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { AttachmentCategory } from '@prisma/client';

@ApiTags('Medical Records')
@ApiBearerAuth('access-token')
@Controller('medical-records')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MedicalRecordsController {
  constructor(
    private medicalRecordsService: MedicalRecordsService,
    private storageService: StorageService,
  ) {}

  // ============================================================================
  // PRONTUÁRIO - Endpoints principais
  // ============================================================================

  /**
   * Busca prontuário por ID do cliente
   * GET /api/medical-records/client/:clientId
   */
  @Get('client/:clientId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findByClientId(
    @Param('clientId') clientId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.findByClientId(clientId, user.tenantId);
  }

  /**
   * Busca histórico completo do cliente
   * GET /api/medical-records/client/:clientId/history
   */
  @Get('client/:clientId/history')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async getClientFullHistory(
    @Param('clientId') clientId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.getClientFullHistory(clientId, user.tenantId);
  }

  /**
   * Busca prontuário por ID
   * GET /api/medical-records/:id
   */
  @Get(':id')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.findById(id, user.tenantId);
  }

  /**
   * Cria um novo prontuário
   * POST /api/medical-records
   */
  @Post()
  @RequirePermissions(Permission.MEDICAL_RECORDS_CREATE)
  async create(
    @Body() dto: CreateMedicalRecordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.create(user.tenantId, dto);
  }

  /**
   * Atualiza dados de anamnese
   * PATCH /api/medical-records/:id
   */
  @Patch(':id')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMedicalRecordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.update(id, user.tenantId, dto);
  }

  // ============================================================================
  // EVOLUÇÕES - Entradas no prontuário
  // ============================================================================

  /**
   * Lista evoluções de um prontuário
   * GET /api/medical-records/:id/entries
   */
  @Get(':id/entries')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findEntries(
    @Param('id') id: string,
    @Query() query: QueryEntriesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.findEntries(id, user.tenantId, query);
  }

  /**
   * Busca uma evolução específica
   * GET /api/medical-records/entries/:entryId
   */
  @Get('entries/:entryId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findEntryById(
    @Param('entryId') entryId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.findEntryById(entryId, user.tenantId);
  }

  /**
   * Cria uma nova evolução
   * POST /api/medical-records/:id/entries
   */
  @Post(':id/entries')
  @RequirePermissions(Permission.MEDICAL_RECORDS_CREATE)
  async createEntry(
    @Param('id') id: string,
    @Body() dto: CreateEntryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.createEntry(id, user.tenantId, dto, user.id);
  }

  /**
   * Atualiza uma evolução
   * PATCH /api/medical-records/entries/:entryId
   */
  @Patch('entries/:entryId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async updateEntry(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateEntryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.updateEntry(entryId, user.tenantId, dto);
  }

  /**
   * Remove uma evolução
   * DELETE /api/medical-records/entries/:entryId
   */
  @Delete('entries/:entryId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async deleteEntry(
    @Param('entryId') entryId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.deleteEntry(entryId, user.tenantId);
  }

  // ============================================================================
  // ANEXOS - Fotos e documentos
  // ============================================================================

  /**
   * Lista anexos de um prontuário
   * GET /api/medical-records/:id/attachments
   */
  @Get(':id/attachments')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findAttachments(
    @Param('id') id: string,
    @Query() query: QueryAttachmentsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.findAttachments(id, user.tenantId, query);
  }

  /**
   * Busca um anexo específico
   * GET /api/medical-records/attachments/:attachmentId
   */
  @Get('attachments/:attachmentId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_VIEW)
  async findAttachmentById(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.findAttachmentById(attachmentId, user.tenantId);
  }

  /**
   * Faz upload de foto para o prontuário
   * POST /api/medical-records/:id/attachments/photo
   */
  @Post(':id/attachments/photo')
  @RequirePermissions(Permission.MEDICAL_RECORDS_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description: string,
    @Body('entryId') entryId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Primeiro verifica se o prontuário existe
    await this.medicalRecordsService.findById(id, user.tenantId);

    // Faz upload do arquivo
    const uploadResult = await this.storageService.upload(file, user.tenantId, {
      ...UPLOAD_CONFIGS.photo,
      folder: 'medical-records/photos',
    });

    // Registra o anexo no prontuário
    return this.medicalRecordsService.createAttachment(
      id,
      user.tenantId,
      {
        fileName: uploadResult.originalName,
        fileKey: uploadResult.key,
        fileUrl: uploadResult.url,
        fileType: uploadResult.mimeType,
        fileSize: uploadResult.size,
        category: AttachmentCategory.PHOTO,
        description,
        entryId,
      },
      user.id,
    );
  }

  /**
   * Faz upload de documento para o prontuário
   * POST /api/medical-records/:id/attachments/document
   */
  @Post(':id/attachments/document')
  @RequirePermissions(Permission.MEDICAL_RECORDS_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('description') description: string,
    @Body('category') category: AttachmentCategory,
    @Body('entryId') entryId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Primeiro verifica se o prontuário existe
    await this.medicalRecordsService.findById(id, user.tenantId);

    // Faz upload do arquivo
    const uploadResult = await this.storageService.upload(file, user.tenantId, {
      ...UPLOAD_CONFIGS.document,
      folder: 'medical-records/documents',
    });

    // Registra o anexo no prontuário
    return this.medicalRecordsService.createAttachment(
      id,
      user.tenantId,
      {
        fileName: uploadResult.originalName,
        fileKey: uploadResult.key,
        fileUrl: uploadResult.url,
        fileType: uploadResult.mimeType,
        fileSize: uploadResult.size,
        category: category || AttachmentCategory.DOCUMENT,
        description,
        entryId,
      },
      user.id,
    );
  }

  /**
   * Faz upload de múltiplas fotos
   * POST /api/medical-records/:id/attachments/photos
   */
  @Post(':id/attachments/photos')
  @RequirePermissions(Permission.MEDICAL_RECORDS_CREATE)
  @UseInterceptors(FilesInterceptor('files', 10)) // Máximo 10 fotos
  async uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('description') description: string,
    @Body('entryId') entryId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Primeiro verifica se o prontuário existe
    await this.medicalRecordsService.findById(id, user.tenantId);

    const results: any[] = [];
    for (const file of files) {
      // Faz upload do arquivo
      const uploadResult = await this.storageService.upload(file, user.tenantId, {
        ...UPLOAD_CONFIGS.photo,
        folder: 'medical-records/photos',
      });

      // Registra o anexo no prontuário
      const attachment = await this.medicalRecordsService.createAttachment(
        id,
        user.tenantId,
        {
          fileName: uploadResult.originalName,
          fileKey: uploadResult.key,
          fileUrl: uploadResult.url,
          fileType: uploadResult.mimeType,
          fileSize: uploadResult.size,
          category: AttachmentCategory.PHOTO,
          description,
          entryId,
        },
        user.id,
      );
      results.push(attachment);
    }

    return results;
  }

  /**
   * Atualiza metadados de um anexo
   * PATCH /api/medical-records/attachments/:attachmentId
   */
  @Patch('attachments/:attachmentId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async updateAttachment(
    @Param('attachmentId') attachmentId: string,
    @Body() dto: UpdateAttachmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.medicalRecordsService.updateAttachment(attachmentId, user.tenantId, dto);
  }

  /**
   * Remove um anexo
   * DELETE /api/medical-records/attachments/:attachmentId
   */
  @Delete('attachments/:attachmentId')
  @RequirePermissions(Permission.MEDICAL_RECORDS_EDIT)
  async deleteAttachment(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.medicalRecordsService.deleteAttachment(
      attachmentId,
      user.tenantId,
    );

    // Remove o arquivo do storage
    if (result.fileKey) {
      try {
        await this.storageService.delete(result.fileKey);
      } catch (error) {
        console.warn('Erro ao remover arquivo do storage:', error);
      }
    }

    return { message: result.message };
  }
}
