import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BusinessService } from './business.service';
import { UpdateBusinessDto } from './dto/business.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@Controller('business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(private businessService: BusinessService) {}

  @Get()
  async getBusinessInfo(@CurrentUser() user: CurrentUserData) {
    return this.businessService.getBusinessInfo(user.id);
  }

  @Patch()
  async updateBusiness(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businessService.updateBusiness(user.id, dto);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, callback) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          callback(null, `logo-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException('Apenas imagens são permitidas'),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  async uploadLogo(
    @CurrentUser() user: CurrentUserData,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const logoUrl = `/uploads/${file.filename}`;
    return this.businessService.updateLogo(user.id, logoUrl);
  }

  @Post('generate-slug')
  async generateSlug(
    @CurrentUser() user: CurrentUserData,
    @Body('businessName') businessName: string,
  ) {
    if (!businessName) {
      throw new BadRequestException('Nome do negócio é obrigatório');
    }
    const slug = await this.businessService.generateSlug(businessName);
    return { slug };
  }
}
