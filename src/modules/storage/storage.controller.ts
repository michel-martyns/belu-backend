import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@Controller('uploads')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StorageController {
  constructor(private storageService: StorageService) {}

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    return this.storageService.uploadAvatar(file, user.tenantId);
  }

  @Post('logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    return this.storageService.uploadLogo(file, user.tenantId);
  }

  @Post('photo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    return this.storageService.uploadPhoto(file, user.tenantId);
  }

  @Post('photos')
  @UseInterceptors(FilesInterceptor('files', 10)) // Máximo 10 fotos por vez
  async uploadPhotos(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    return this.storageService.uploadPhotos(files, user.tenantId);
  }

  @Post('document')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserData,
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    return this.storageService.uploadDocument(file, user.tenantId);
  }

  @Get('url/*key')
  async getSignedUrl(
    @Param('key') key: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Verifica se o arquivo pertence ao tenant do usuário
    if (!key.startsWith(user.tenantId)) {
      throw new BadRequestException('Acesso negado a este arquivo');
    }

    const exists = await this.storageService.exists(key);
    if (!exists) {
      throw new BadRequestException('Arquivo não encontrado');
    }

    const url = await this.storageService.getSignedUrl(key);
    return { url };
  }

  @Delete('*key')
  async deleteFile(
    @Param('key') key: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Verifica se o arquivo pertence ao tenant do usuário
    if (!key.startsWith(user.tenantId)) {
      throw new BadRequestException('Acesso negado a este arquivo');
    }

    await this.storageService.delete(key);
    return { message: 'Arquivo excluído com sucesso' };
  }
}
