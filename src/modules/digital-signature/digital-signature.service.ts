import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DocumentType,
  SignatureStatus,
  SignatureType,
  SignatureAuditAction,
  WitnessStatus,
  Prisma,
} from '@prisma/client';
import * as crypto from 'crypto';
import {
  CreateSignatureTemplateDto,
  UpdateSignatureTemplateDto,
  QuerySignatureTemplatesDto,
  CreateSignatureRequestDto,
  QuerySignatureRequestsDto,
  SignDocumentDto,
  SignWitnessDto,
  RejectDocumentDto,
  SignatureTemplateResponseDto,
  SignatureRequestResponseDto,
  SignatureRequestDetailDto,
  PublicSignatureRequestDto,
  SignatureVerificationResultDto,
  SignaturesSummaryDto,
} from './dto/digital-signature.dto';

@Injectable()
export class DigitalSignatureService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // Signature Templates
  // ============================================================================

  async createTemplate(
    tenantId: string,
    dto: CreateSignatureTemplateDto,
  ): Promise<SignatureTemplateResponseDto> {
    const template = await this.prisma.signatureTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        documentType: dto.documentType,
        category: dto.category,
        content: dto.content,
        headerText: dto.headerText,
        footerText: dto.footerText,
        requiresWitness: dto.requiresWitness ?? false,
        requiresPhoto: dto.requiresPhoto ?? false,
        requiresLocation: dto.requiresLocation ?? false,
        expirationHours: dto.expirationHours ?? 48,
        allowTypedSignature: dto.allowTypedSignature ?? true,
        allowDrawnSignature: dto.allowDrawnSignature ?? true,
        variables: dto.variables ?? [],
      },
    });

    return this.mapTemplateToResponse(template);
  }

  async updateTemplate(
    tenantId: string,
    templateId: string,
    dto: UpdateSignatureTemplateDto,
  ): Promise<SignatureTemplateResponseDto> {
    const template = await this.prisma.signatureTemplate.findFirst({
      where: { id: templateId, tenantId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundException('Template não encontrado');
    }

    const updated = await this.prisma.signatureTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name,
        description: dto.description,
        documentType: dto.documentType,
        category: dto.category,
        content: dto.content,
        headerText: dto.headerText,
        footerText: dto.footerText,
        requiresWitness: dto.requiresWitness,
        requiresPhoto: dto.requiresPhoto,
        requiresLocation: dto.requiresLocation,
        expirationHours: dto.expirationHours,
        allowTypedSignature: dto.allowTypedSignature,
        allowDrawnSignature: dto.allowDrawnSignature,
        variables: dto.variables,
        isActive: dto.isActive,
      },
    });

    return this.mapTemplateToResponse(updated);
  }

  async getTemplate(
    tenantId: string,
    templateId: string,
  ): Promise<SignatureTemplateResponseDto> {
    const template = await this.prisma.signatureTemplate.findFirst({
      where: { id: templateId, tenantId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundException('Template não encontrado');
    }

    return this.mapTemplateToResponse(template);
  }

  async listTemplates(
    tenantId: string,
    query: QuerySignatureTemplatesDto,
  ): Promise<SignatureTemplateResponseDto[]> {
    const where: Prisma.SignatureTemplateWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.documentType && { documentType: query.documentType }),
      ...(query.category && { category: query.category }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { description: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const templates = await this.prisma.signatureTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return templates.map((t) => this.mapTemplateToResponse(t));
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    const template = await this.prisma.signatureTemplate.findFirst({
      where: { id: templateId, tenantId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundException('Template não encontrado');
    }

    await this.prisma.signatureTemplate.update({
      where: { id: templateId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ============================================================================
  // Signature Requests
  // ============================================================================

  async createSignatureRequest(
    tenantId: string,
    userId: string,
    dto: CreateSignatureRequestDto,
  ): Promise<SignatureRequestResponseDto> {
    // Validar cliente
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    let documentContent = dto.documentContent;
    let documentType = dto.documentType;
    let expirationHours = 48;
    let requiresWitness = false;
    let requiresPhoto = false;
    let requiresLocation = false;
    let allowTypedSignature = true;
    let allowDrawnSignature = true;

    // Se tem template, usar dados do template
    if (dto.templateId) {
      const template = await this.prisma.signatureTemplate.findFirst({
        where: { id: dto.templateId, tenantId, isActive: true, deletedAt: null },
      });

      if (!template) {
        throw new NotFoundException('Template não encontrado ou inativo');
      }

      documentType = template.documentType;
      expirationHours = template.expirationHours;
      requiresWitness = template.requiresWitness;
      requiresPhoto = template.requiresPhoto;
      requiresLocation = template.requiresLocation;
      allowTypedSignature = template.allowTypedSignature;
      allowDrawnSignature = template.allowDrawnSignature;

      // Processar conteúdo com variáveis
      documentContent = this.processTemplateContent(
        template.content,
        template.headerText || '',
        template.footerText || '',
        {
          ...dto.variables,
          client_name: client.name,
          client_email: client.email || '',
          client_phone: client.phone,
          date: new Date().toLocaleDateString('pt-BR'),
          datetime: new Date().toLocaleString('pt-BR'),
        },
      );
    } else {
      // Documento customizado
      if (!documentContent) {
        throw new BadRequestException(
          'Conteúdo do documento é obrigatório para documentos customizados',
        );
      }
      if (!documentType) {
        throw new BadRequestException(
          'Tipo de documento é obrigatório para documentos customizados',
        );
      }
    }

    // Validar testemunhas se requerido
    if (requiresWitness && (!dto.witnesses || dto.witnesses.length === 0)) {
      throw new BadRequestException(
        'Este documento requer pelo menos uma testemunha',
      );
    }

    // Gerar código único
    const code = this.generateSignatureCode();

    // Calcular data de expiração
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);

    // Criar solicitação
    const signatureRequest = await this.prisma.signatureRequest.create({
      data: {
        tenantId,
        templateId: dto.templateId,
        clientId: dto.clientId,
        code,
        title: dto.title,
        documentContent: documentContent!,
        documentType: documentType!,
        expiresAt,
        requestedById: userId,
        notes: dto.notes,
        medicalRecordId: dto.medicalRecordId,
        medicalRecordEntryId: dto.medicalRecordEntryId,
        appointmentId: dto.appointmentId,
        witnesses: dto.witnesses
          ? {
              create: dto.witnesses.map((w) => ({
                name: w.name,
                email: w.email,
                phone: w.phone,
                document: w.document,
              })),
            }
          : undefined,
      },
      include: {
        client: true,
        template: true,
        witnesses: true,
      },
    });

    // Registrar log de auditoria
    await this.createAuditLog(
      signatureRequest.id,
      SignatureAuditAction.CREATED,
      'Solicitação de assinatura criada',
      userId,
    );

    // TODO: Enviar notificação se solicitado
    if (dto.sendNotification) {
      // Implementar envio de notificação (WhatsApp/Email)
    }

    return this.mapRequestToResponse(signatureRequest);
  }

  async getSignatureRequest(
    tenantId: string,
    requestId: string,
  ): Promise<SignatureRequestDetailDto> {
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        client: true,
        template: true,
        signature: true,
        witnesses: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    const auditLog = await this.prisma.signatureAuditLog.findMany({
      where: { signatureRequestId: requestId },
      orderBy: { createdAt: 'desc' },
    });

    return this.mapRequestToDetailResponse(request, auditLog);
  }

  async listSignatureRequests(
    tenantId: string,
    query: QuerySignatureRequestsDto,
  ): Promise<{ requests: SignatureRequestResponseDto[]; total: number }> {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now);
    twentyFourHoursFromNow.setHours(twentyFourHoursFromNow.getHours() + 24);

    const where: Prisma.SignatureRequestWhereInput = {
      tenantId,
      ...(query.clientId && { clientId: query.clientId }),
      ...(query.status && { status: query.status }),
      ...(query.documentType && { documentType: query.documentType }),
      ...(query.pending && { status: SignatureStatus.PENDING }),
      ...(query.expiringSoon && {
        status: SignatureStatus.PENDING,
        expiresAt: { gte: now, lte: twentyFourHoursFromNow },
      }),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate && { gte: new Date(query.startDate) }),
              ...(query.endDate && { lte: new Date(query.endDate) }),
            },
          }
        : {}),
    };

    const [requests, total] = await Promise.all([
      this.prisma.signatureRequest.findMany({
        where,
        include: {
          client: true,
          template: true,
          witnesses: true,
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
      }),
      this.prisma.signatureRequest.count({ where }),
    ]);

    return {
      requests: requests.map((r) => this.mapRequestToResponse(r)),
      total,
    };
  }

  async cancelSignatureRequest(
    tenantId: string,
    requestId: string,
    userId: string,
  ): Promise<SignatureRequestResponseDto> {
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { client: true, template: true, witnesses: true },
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    if (request.status !== SignatureStatus.PENDING) {
      throw new BadRequestException(
        'Apenas solicitações pendentes podem ser canceladas',
      );
    }

    const updated = await this.prisma.signatureRequest.update({
      where: { id: requestId },
      data: {
        status: SignatureStatus.CANCELLED,
        cancelledAt: new Date(),
      },
      include: { client: true, template: true, witnesses: true },
    });

    await this.createAuditLog(
      requestId,
      SignatureAuditAction.CANCELLED,
      'Solicitação cancelada pelo solicitante',
      userId,
    );

    return this.mapRequestToResponse(updated);
  }

  async resendSignatureRequest(
    tenantId: string,
    requestId: string,
    userId: string,
  ): Promise<SignatureRequestResponseDto> {
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { client: true, template: true, witnesses: true },
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    if (request.status !== SignatureStatus.PENDING) {
      throw new BadRequestException(
        'Apenas solicitações pendentes podem ser reenviadas',
      );
    }

    // Atualizar data de expiração
    const expirationHours = request.template?.expirationHours ?? 48;
    const newExpiresAt = new Date();
    newExpiresAt.setHours(newExpiresAt.getHours() + expirationHours);

    const updated = await this.prisma.signatureRequest.update({
      where: { id: requestId },
      data: { expiresAt: newExpiresAt },
      include: { client: true, template: true, witnesses: true },
    });

    await this.createAuditLog(
      requestId,
      SignatureAuditAction.SENT,
      'Solicitação reenviada',
      userId,
    );

    // TODO: Reenviar notificação

    return this.mapRequestToResponse(updated);
  }

  // ============================================================================
  // Public Signing (Para o cliente assinar)
  // ============================================================================

  async getPublicSignatureRequest(
    code: string,
  ): Promise<PublicSignatureRequestDto> {
    const request = await this.prisma.signatureRequest.findUnique({
      where: { code },
      include: {
        template: true,
        witnesses: {
          select: { name: true, status: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Documento não encontrado');
    }

    // Buscar tenant para exibir nome/logo
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: request.tenantId },
    });

    const now = new Date();
    const isExpired =
      request.expiresAt < now ||
      request.status === SignatureStatus.EXPIRED;

    // Marcar como visualizado se for a primeira vez
    if (!request.viewedAt && request.status === SignatureStatus.PENDING) {
      await this.prisma.signatureRequest.update({
        where: { id: request.id },
        data: {
          viewedAt: new Date(),
          status: SignatureStatus.VIEWED,
        },
      });

      await this.createAuditLog(
        request.id,
        SignatureAuditAction.VIEWED,
        'Documento visualizado pelo cliente',
        'client',
      );
    }

    return {
      id: request.id,
      code: request.code,
      title: request.title,
      documentType: request.documentType,
      documentContent: request.documentContent,
      status: request.status,
      expiresAt: request.expiresAt,
      isExpired,
      requiresPhoto: request.template?.requiresPhoto ?? false,
      requiresLocation: request.template?.requiresLocation ?? false,
      allowTypedSignature: request.template?.allowTypedSignature ?? true,
      allowDrawnSignature: request.template?.allowDrawnSignature ?? true,
      requiresWitness: request.template?.requiresWitness ?? false,
      witnesses: request.witnesses.map((w) => ({
        name: w.name,
        status: w.status,
      })),
      tenantName: tenant?.name ?? '',
      tenantLogo: undefined, // TODO: Adicionar logo do tenant
    };
  }

  async signDocument(
    code: string,
    dto: SignDocumentDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ success: boolean; verificationCode: string }> {
    const request = await this.prisma.signatureRequest.findUnique({
      where: { code },
      include: { template: true },
    });

    if (!request) {
      throw new NotFoundException('Documento não encontrado');
    }

    // Validações
    if (request.status === SignatureStatus.SIGNED) {
      throw new BadRequestException('Documento já foi assinado');
    }

    if (request.status === SignatureStatus.CANCELLED) {
      throw new BadRequestException('Documento foi cancelado');
    }

    if (request.status === SignatureStatus.EXPIRED || request.expiresAt < new Date()) {
      throw new BadRequestException('Documento expirado');
    }

    // Validar tipo de assinatura permitido
    if (
      dto.signatureType === SignatureType.TYPED &&
      !request.template?.allowTypedSignature
    ) {
      throw new BadRequestException('Assinatura digitada não é permitida');
    }

    if (
      dto.signatureType === SignatureType.DRAWN &&
      !request.template?.allowDrawnSignature
    ) {
      throw new BadRequestException('Assinatura desenhada não é permitida');
    }

    // Validar foto se requerido
    if (request.template?.requiresPhoto && !dto.signerPhotoBase64) {
      throw new BadRequestException('Foto do signatário é obrigatória');
    }

    // Validar localização se requerido
    if (
      request.template?.requiresLocation &&
      (dto.latitude === undefined || dto.longitude === undefined)
    ) {
      throw new BadRequestException('Localização é obrigatória');
    }

    // Gerar hash do documento
    const signatureHash = this.generateDocumentHash(
      request.documentContent,
      dto.signatureData,
      dto.signerName,
      new Date().toISOString(),
    );

    // Gerar código de verificação
    const verificationCode = this.generateVerificationCode();

    // Salvar foto se fornecida
    let signerPhotoUrl: string | undefined;
    if (dto.signerPhotoBase64) {
      // TODO: Upload para S3 e obter URL
      signerPhotoUrl = undefined;
    }

    // Criar assinatura
    await this.prisma.digitalSignature.create({
      data: {
        signatureRequestId: request.id,
        signatureType: dto.signatureType,
        signatureData: dto.signatureData,
        signatureHash,
        signerName: dto.signerName,
        signerEmail: dto.signerEmail,
        signerPhone: dto.signerPhone,
        signerDocument: dto.signerDocument,
        ipAddress,
        userAgent,
        deviceInfo: dto.deviceInfo,
        latitude: dto.latitude,
        longitude: dto.longitude,
        signerPhotoUrl,
        verificationCode,
      },
    });

    // Atualizar status da solicitação
    await this.prisma.signatureRequest.update({
      where: { id: request.id },
      data: {
        status: SignatureStatus.SIGNED,
        signedAt: new Date(),
      },
    });

    // Registrar log
    await this.createAuditLog(
      request.id,
      SignatureAuditAction.SIGNED,
      `Documento assinado por ${dto.signerName}`,
      'client',
      ipAddress,
      userAgent,
    );

    // TODO: Gerar PDF assinado e fazer upload para S3

    return { success: true, verificationCode };
  }

  async rejectDocument(
    code: string,
    dto: RejectDocumentDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ success: boolean }> {
    const request = await this.prisma.signatureRequest.findUnique({
      where: { code },
    });

    if (!request) {
      throw new NotFoundException('Documento não encontrado');
    }

    if (request.status !== SignatureStatus.PENDING && request.status !== SignatureStatus.VIEWED) {
      throw new BadRequestException('Documento não pode ser rejeitado');
    }

    await this.prisma.signatureRequest.update({
      where: { id: request.id },
      data: {
        status: SignatureStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      },
    });

    await this.createAuditLog(
      request.id,
      SignatureAuditAction.REJECTED,
      `Documento rejeitado. Motivo: ${dto.reason}`,
      'client',
      ipAddress,
      userAgent,
    );

    return { success: true };
  }

  // ============================================================================
  // Witness Signing
  // ============================================================================

  async signAsWitness(
    code: string,
    witnessId: string,
    dto: SignWitnessDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ success: boolean }> {
    const request = await this.prisma.signatureRequest.findUnique({
      where: { code },
      include: { witnesses: true },
    });

    if (!request) {
      throw new NotFoundException('Documento não encontrado');
    }

    const witness = request.witnesses.find((w) => w.id === witnessId);
    if (!witness) {
      throw new NotFoundException('Testemunha não encontrada');
    }

    if (witness.status === WitnessStatus.SIGNED) {
      throw new BadRequestException('Testemunha já assinou');
    }

    await this.prisma.signatureWitness.update({
      where: { id: witnessId },
      data: {
        signatureType: dto.signatureType,
        signatureData: dto.signatureData,
        signedAt: new Date(),
        status: WitnessStatus.SIGNED,
        ipAddress,
        userAgent,
      },
    });

    await this.createAuditLog(
      request.id,
      SignatureAuditAction.WITNESS_SIGNED,
      `Testemunha ${witness.name} assinou o documento`,
      'witness',
      ipAddress,
      userAgent,
    );

    return { success: true };
  }

  // ============================================================================
  // Verification
  // ============================================================================

  async verifySignature(
    verificationCode: string,
  ): Promise<SignatureVerificationResultDto> {
    const signature = await this.prisma.digitalSignature.findUnique({
      where: { verificationCode },
      include: {
        signatureRequest: true,
      },
    });

    if (!signature) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: signature.signatureRequest.tenantId },
    });

    // Registrar log de verificação
    await this.createAuditLog(
      signature.signatureRequestId,
      SignatureAuditAction.VERIFIED,
      'Verificação de autenticidade realizada',
      'system',
    );

    return {
      isValid: signature.isVerified,
      documentTitle: signature.signatureRequest.title,
      documentType: signature.signatureRequest.documentType,
      signerName: signature.signerName,
      signedAt: signature.signedAt,
      verificationCode: signature.verificationCode,
      signatureHash: signature.signatureHash,
      tenantName: tenant?.name ?? '',
    };
  }

  // ============================================================================
  // Reports
  // ============================================================================

  async getSignaturesSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<SignaturesSummaryDto> {
    const requests = await this.prisma.signatureRequest.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        signature: true,
      },
    });

    const byStatus = Object.values(SignatureStatus).map((status) => ({
      status,
      count: requests.filter((r) => r.status === status).length,
    }));

    const byDocumentType = Object.values(DocumentType).map((type) => ({
      type,
      count: requests.filter((r) => r.documentType === type).length,
    }));

    // Calcular tempo médio para assinar
    const signedRequests = requests.filter(
      (r) => r.status === SignatureStatus.SIGNED && r.signedAt,
    );
    let averageTimeToSign = 0;
    if (signedRequests.length > 0) {
      const totalHours = signedRequests.reduce((sum, r) => {
        const diff = r.signedAt!.getTime() - r.createdAt.getTime();
        return sum + diff / (1000 * 60 * 60);
      }, 0);
      averageTimeToSign = totalHours / signedRequests.length;
    }

    return {
      period: { start: startDate, end: endDate },
      total: requests.length,
      pending: requests.filter(
        (r) => r.status === SignatureStatus.PENDING || r.status === SignatureStatus.VIEWED,
      ).length,
      signed: requests.filter((r) => r.status === SignatureStatus.SIGNED).length,
      expired: requests.filter((r) => r.status === SignatureStatus.EXPIRED).length,
      rejected: requests.filter((r) => r.status === SignatureStatus.REJECTED).length,
      cancelled: requests.filter((r) => r.status === SignatureStatus.CANCELLED).length,
      averageTimeToSign,
      byDocumentType: byDocumentType.filter((d) => d.count > 0),
      byStatus: byStatus.filter((s) => s.count > 0),
    };
  }

  // ============================================================================
  // Scheduled Jobs
  // ============================================================================

  async expireSignatureRequests(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.signatureRequest.updateMany({
      where: {
        status: { in: [SignatureStatus.PENDING, SignatureStatus.VIEWED] },
        expiresAt: { lt: now },
      },
      data: {
        status: SignatureStatus.EXPIRED,
      },
    });

    // Registrar logs para cada expirado
    if (result.count > 0) {
      const expiredRequests = await this.prisma.signatureRequest.findMany({
        where: {
          status: SignatureStatus.EXPIRED,
          expiresAt: { lt: now },
        },
        select: { id: true },
      });

      for (const req of expiredRequests) {
        await this.createAuditLog(
          req.id,
          SignatureAuditAction.EXPIRED,
          'Solicitação expirada automaticamente',
          'system',
        );
      }
    }

    return result.count;
  }

  // ============================================================================
  // Default Templates
  // ============================================================================

  async seedDefaultTemplates(tenantId: string): Promise<void> {
    const existingTemplates = await this.prisma.signatureTemplate.count({
      where: { tenantId },
    });

    if (existingTemplates > 0) {
      return; // Já possui templates
    }

    const defaultTemplates = [
      {
        name: 'Termo de Consentimento',
        documentType: DocumentType.CONSENT_FORM,
        content: `
<h1>TERMO DE CONSENTIMENTO INFORMADO</h1>

<p>Eu, <strong>{{client_name}}</strong>, declaro que fui devidamente informado(a) sobre o procedimento que será realizado, seus riscos, benefícios e alternativas.</p>

<p>Autorizo a realização do procedimento estético proposto, estando ciente de que:</p>

<ul>
  <li>O resultado pode variar de pessoa para pessoa;</li>
  <li>Podem ocorrer efeitos colaterais temporários;</li>
  <li>É importante seguir todas as orientações pós-procedimento;</li>
  <li>Dúvidas foram esclarecidas antes da assinatura deste termo.</li>
</ul>

<p>Data: {{date}}</p>
        `,
        expirationHours: 24,
        requiresWitness: false,
        variables: ['client_name', 'date'],
      },
      {
        name: 'Autorização de Tratamento',
        documentType: DocumentType.TREATMENT_AUTHORIZATION,
        content: `
<h1>AUTORIZAÇÃO DE TRATAMENTO</h1>

<p>Eu, <strong>{{client_name}}</strong>, autorizo o profissional responsável a realizar o tratamento proposto conforme acordado em consulta.</p>

<p>Declaro estar ciente das condições, riscos e benefícios do tratamento.</p>

<p>Data: {{date}}</p>
        `,
        expirationHours: 48,
        requiresWitness: false,
        variables: ['client_name', 'date'],
      },
      {
        name: 'Autorização de Uso de Imagem',
        documentType: DocumentType.PHOTO_AUTHORIZATION,
        content: `
<h1>TERMO DE AUTORIZAÇÃO DE USO DE IMAGEM</h1>

<p>Eu, <strong>{{client_name}}</strong>, autorizo o uso de fotografias e vídeos realizados durante meu tratamento para fins de:</p>

<ul>
  <li>Acompanhamento e evolução do tratamento;</li>
  <li>Documentação em prontuário;</li>
  <li>Material educativo e científico (sem identificação);</li>
  <li>Divulgação em redes sociais e site (sem identificação, mediante aprovação prévia).</li>
</ul>

<p>Esta autorização é válida por tempo indeterminado, podendo ser revogada a qualquer momento mediante solicitação por escrito.</p>

<p>Data: {{date}}</p>
        `,
        expirationHours: 72,
        requiresWitness: false,
        variables: ['client_name', 'date'],
      },
    ];

    for (const template of defaultTemplates) {
      await this.prisma.signatureTemplate.create({
        data: {
          tenantId,
          ...template,
        },
      });
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateSignatureCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private generateVerificationCode(): string {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
  }

  private generateDocumentHash(
    content: string,
    signatureData: string,
    signerName: string,
    timestamp: string,
  ): string {
    const data = `${content}|${signatureData}|${signerName}|${timestamp}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private processTemplateContent(
    content: string,
    headerText: string,
    footerText: string,
    variables: Record<string, string>,
  ): string {
    let processed = content;

    // Adicionar header e footer
    if (headerText) {
      processed = `<div class="header">${headerText}</div>${processed}`;
    }
    if (footerText) {
      processed = `${processed}<div class="footer">${footerText}</div>`;
    }

    // Substituir variáveis
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, value || '');
    }

    return processed;
  }

  private async createAuditLog(
    signatureRequestId: string,
    action: SignatureAuditAction,
    description: string,
    performedBy?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.prisma.signatureAuditLog.create({
      data: {
        signatureRequestId,
        action,
        description,
        performedBy,
        ipAddress,
        userAgent,
      },
    });
  }

  private mapTemplateToResponse(template: any): SignatureTemplateResponseDto {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      documentType: template.documentType,
      category: template.category,
      content: template.content,
      headerText: template.headerText,
      footerText: template.footerText,
      requiresWitness: template.requiresWitness,
      requiresPhoto: template.requiresPhoto,
      requiresLocation: template.requiresLocation,
      expirationHours: template.expirationHours,
      allowTypedSignature: template.allowTypedSignature,
      allowDrawnSignature: template.allowDrawnSignature,
      variables: template.variables,
      isActive: template.isActive,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private mapRequestToResponse(request: any): SignatureRequestResponseDto {
    const signedWitnesses = request.witnesses?.filter(
      (w: any) => w.status === WitnessStatus.SIGNED,
    );

    return {
      id: request.id,
      code: request.code,
      title: request.title,
      documentType: request.documentType,
      status: request.status,
      clientId: request.clientId,
      clientName: request.client?.name ?? '',
      clientEmail: request.client?.email,
      clientPhone: request.client?.phone,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt,
      viewedAt: request.viewedAt,
      signedAt: request.signedAt,
      requestedByName: undefined, // Would need to join with User
      notes: request.notes,
      templateName: request.template?.name,
      requiresWitness: request.template?.requiresWitness ?? false,
      witnessesCount: request.witnesses?.length ?? 0,
      signedWitnessesCount: signedWitnesses?.length ?? 0,
      signatureUrl: `/sign/${request.code}`,
    };
  }

  private mapRequestToDetailResponse(
    request: any,
    auditLog: any[],
  ): SignatureRequestDetailDto {
    const base = this.mapRequestToResponse(request);

    return {
      ...base,
      documentContent: request.documentContent,
      signature: request.signature
        ? {
            id: request.signature.id,
            signatureType: request.signature.signatureType,
            signerName: request.signature.signerName,
            signerEmail: request.signature.signerEmail,
            signerDocument: request.signature.signerDocument,
            signedAt: request.signature.signedAt,
            ipAddress: request.signature.ipAddress,
            latitude: request.signature.latitude?.toNumber(),
            longitude: request.signature.longitude?.toNumber(),
            verificationCode: request.signature.verificationCode,
            signedDocumentUrl: request.signature.signedDocumentUrl,
          }
        : undefined,
      witnesses: request.witnesses?.map((w: any) => ({
        id: w.id,
        name: w.name,
        email: w.email,
        phone: w.phone,
        status: w.status,
        signedAt: w.signedAt,
      })),
      auditLog: auditLog.map((log) => ({
        id: log.id,
        action: log.action,
        description: log.description,
        performerName: log.performerName,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
      })),
    };
  }
}
