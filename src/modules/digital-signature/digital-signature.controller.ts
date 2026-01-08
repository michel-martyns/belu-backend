import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Ip,
  Headers,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DigitalSignatureService } from './digital-signature.service';
import {
  CreateSignatureTemplateDto,
  UpdateSignatureTemplateDto,
  QuerySignatureTemplatesDto,
  CreateSignatureRequestDto,
  QuerySignatureRequestsDto,
  SignDocumentDto,
  SignWitnessDto,
  RejectDocumentDto,
  VerifySignatureDto,
} from './dto/digital-signature.dto';

// ============================================================================
// Controller de Templates de Assinatura (Autenticado)
// ============================================================================
@ApiTags('Digital Signature')
@ApiBearerAuth('access-token')
@Controller('signature-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SignatureTemplatesController {
  constructor(private readonly signatureService: DigitalSignatureService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  async create(@Request() req, @Body() dto: CreateSignatureTemplateDto) {
    return this.signatureService.createTemplate(req.user.tenantId, dto);
  }

  @Get()
  async findAll(@Request() req, @Query() query: QuerySignatureTemplatesDto) {
    return this.signatureService.listTemplates(req.user.tenantId, query);
  }

  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.signatureService.getTemplate(req.user.tenantId, id);
  }

  @Put(':id')
  @Roles('ADMIN', 'MANAGER')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSignatureTemplateDto,
  ) {
    return this.signatureService.updateTemplate(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.signatureService.deleteTemplate(req.user.tenantId, id);
    return { message: 'Template removido com sucesso' };
  }

  @Post('seed-defaults')
  @Roles('ADMIN')
  async seedDefaults(@Request() req) {
    await this.signatureService.seedDefaultTemplates(req.user.tenantId);
    return { message: 'Templates padrão criados com sucesso' };
  }
}

// ============================================================================
// Controller de Solicitações de Assinatura (Autenticado)
// ============================================================================
@Controller('signature-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SignatureRequestsController {
  constructor(private readonly signatureService: DigitalSignatureService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER', 'OPERATOR', 'PROVIDER')
  async create(@Request() req, @Body() dto: CreateSignatureRequestDto) {
    return this.signatureService.createSignatureRequest(
      req.user.tenantId,
      req.user.userId,
      dto,
    );
  }

  @Get()
  async findAll(@Request() req, @Query() query: QuerySignatureRequestsDto) {
    return this.signatureService.listSignatureRequests(req.user.tenantId, query);
  }

  @Get('pending')
  async findPending(@Request() req) {
    return this.signatureService.listSignatureRequests(req.user.tenantId, {
      pending: true,
    });
  }

  @Get('expiring-soon')
  async findExpiringSoon(@Request() req) {
    return this.signatureService.listSignatureRequests(req.user.tenantId, {
      expiringSoon: true,
    });
  }

  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.signatureService.getSignatureRequest(req.user.tenantId, id);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'MANAGER')
  async cancel(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.signatureService.cancelSignatureRequest(
      req.user.tenantId,
      id,
      req.user.userId,
    );
  }

  @Post(':id/resend')
  @Roles('ADMIN', 'MANAGER', 'OPERATOR')
  async resend(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.signatureService.resendSignatureRequest(
      req.user.tenantId,
      id,
      req.user.userId,
    );
  }
}

// ============================================================================
// Controller Público de Assinatura (Sem autenticação)
// ============================================================================
@Controller('sign')
export class PublicSignatureController {
  constructor(private readonly signatureService: DigitalSignatureService) {}

  @Get(':code')
  async getDocument(@Param('code') code: string) {
    return this.signatureService.getPublicSignatureRequest(code);
  }

  @Post(':code')
  async signDocument(
    @Param('code') code: string,
    @Body() dto: SignDocumentDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.signatureService.signDocument(code, dto, ip, userAgent);
  }

  @Post(':code/reject')
  async rejectDocument(
    @Param('code') code: string,
    @Body() dto: RejectDocumentDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.signatureService.rejectDocument(code, dto, ip, userAgent);
  }

  @Post(':code/witness/:witnessId')
  async signAsWitness(
    @Param('code') code: string,
    @Param('witnessId', ParseUUIDPipe) witnessId: string,
    @Body() dto: SignWitnessDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.signatureService.signAsWitness(
      code,
      witnessId,
      dto,
      ip,
      userAgent,
    );
  }
}

// ============================================================================
// Controller de Verificação (Sem autenticação)
// ============================================================================
@Controller('verify-signature')
export class VerifySignatureController {
  constructor(private readonly signatureService: DigitalSignatureService) {}

  @Get(':verificationCode')
  async verify(@Param('verificationCode') verificationCode: string) {
    return this.signatureService.verifySignature(verificationCode);
  }

  @Post()
  async verifyPost(@Body() dto: VerifySignatureDto) {
    return this.signatureService.verifySignature(dto.verificationCode);
  }
}

// ============================================================================
// Controller de Relatórios de Assinaturas
// ============================================================================
@Controller('reports/signatures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SignatureReportsController {
  constructor(private readonly signatureService: DigitalSignatureService) {}

  @Get('summary')
  @Roles('ADMIN', 'MANAGER')
  async getSummary(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.signatureService.getSignaturesSummary(
      req.user.tenantId,
      new Date(startDate),
      new Date(endDate),
    );
  }
}
