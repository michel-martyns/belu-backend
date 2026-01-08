import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, CACHE_KEYS, CACHE_TTL } from '../../redis';
import {
  CreateMedicalRecordDto,
  UpdateMedicalRecordDto,
  CreateEntryDto,
  UpdateEntryDto,
  CreateAttachmentDto,
  UpdateAttachmentDto,
  QueryEntriesDto,
  QueryAttachmentsDto,
} from './dto';
import { MedicalEntryType, AttachmentCategory } from '@prisma/client';

@Injectable()
export class MedicalRecordsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // MEDICAL RECORD - CRUD Principal
  // ============================================================================

  /**
   * Busca o prontuário de um cliente (cria se não existir)
   */
  async findByClientId(clientId: string, tenantId: string) {
    // Verifica se o cliente existe e pertence ao tenant
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const cacheKey = CACHE_KEYS.MEDICAL_RECORD(tenantId, clientId);

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        let record = await this.prisma.medicalRecord.findUnique({
          where: { clientId },
          include: {
            client: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
            entries: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: {
                provider: {
                  select: { id: true, name: true },
                },
              },
            },
            attachments: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            _count: {
              select: {
                entries: true,
                attachments: true,
              },
            },
          },
        });

        // Se não existe, cria automaticamente um prontuário vazio
        if (!record) {
          record = await this.prisma.medicalRecord.create({
            data: {
              tenantId,
              clientId,
            },
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true,
                },
              },
              entries: {
                include: {
                  provider: {
                    select: { id: true, name: true },
                  },
                },
              },
              attachments: true,
              _count: {
                select: {
                  entries: true,
                  attachments: true,
                },
              },
            },
          });
        }

        return record;
      },
      CACHE_TTL.MEDIUM,
    );
  }

  /**
   * Busca prontuário por ID
   */
  async findById(id: string, tenantId: string) {
    const record = await this.prisma.medicalRecord.findFirst({
      where: { id, tenantId },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        _count: {
          select: {
            entries: true,
            attachments: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Prontuário não encontrado');
    }

    return record;
  }

  /**
   * Cria um prontuário para um cliente
   */
  async create(tenantId: string, dto: CreateMedicalRecordDto) {
    // Verifica se o cliente existe e pertence ao tenant
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // Verifica se já existe prontuário para este cliente
    const existing = await this.prisma.medicalRecord.findUnique({
      where: { clientId: dto.clientId },
    });

    if (existing) {
      throw new ConflictException('Cliente já possui prontuário');
    }

    const record = await this.prisma.medicalRecord.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        bloodType: dto.bloodType,
        allergies: dto.allergies,
        medications: dto.medications,
        medicalHistory: dto.medicalHistory,
        surgeries: dto.surgeries,
        observations: dto.observations,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    return record;
  }

  /**
   * Atualiza dados de anamnese do prontuário
   */
  async update(id: string, tenantId: string, dto: UpdateMedicalRecordDto) {
    const record = await this.findById(id, tenantId);

    const updated = await this.prisma.medicalRecord.update({
      where: { id },
      data: dto,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    // Invalida cache
    await this.redis.invalidateMedicalRecord(tenantId, record.clientId, id);

    return updated;
  }

  // ============================================================================
  // ENTRIES - Evoluções/Atendimentos
  // ============================================================================

  /**
   * Lista todas as evoluções de um prontuário
   */
  async findEntries(medicalRecordId: string, tenantId: string, query?: QueryEntriesDto) {
    const record = await this.findById(medicalRecordId, tenantId);

    const where: any = { medicalRecordId };

    if (query?.entryType) {
      where.entryType = query.entryType;
    }

    if (query?.providerId) {
      where.providerId = query.providerId;
    }

    return this.prisma.medicalRecordEntry.findMany({
      where,
      include: {
        provider: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query?.limit || 50,
      skip: query?.offset || 0,
    });
  }

  /**
   * Busca uma evolução específica
   */
  async findEntryById(entryId: string, tenantId: string) {
    const entry = await this.prisma.medicalRecordEntry.findUnique({
      where: { id: entryId },
      include: {
        medicalRecord: {
          select: { id: true, tenantId: true, clientId: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
    });

    if (!entry || entry.medicalRecord.tenantId !== tenantId) {
      throw new NotFoundException('Evolução não encontrada');
    }

    return entry;
  }

  /**
   * Cria uma nova evolução no prontuário
   */
  async createEntry(
    medicalRecordId: string,
    tenantId: string,
    dto: CreateEntryDto,
    createdBy?: string,
  ) {
    const record = await this.findById(medicalRecordId, tenantId);

    // Se informou providerId, verifica se existe no tenant
    if (dto.providerId) {
      const provider = await this.prisma.provider.findFirst({
        where: { id: dto.providerId, tenantId },
      });
      if (!provider) {
        throw new NotFoundException('Profissional não encontrado');
      }
    }

    const entry = await this.prisma.medicalRecordEntry.create({
      data: {
        medicalRecordId,
        title: dto.title,
        description: dto.description,
        procedures: dto.procedures,
        products: dto.products,
        notes: dto.notes,
        entryType: dto.entryType || MedicalEntryType.EVOLUTION,
        appointmentId: dto.appointmentId,
        providerId: dto.providerId,
        createdBy,
      },
      include: {
        provider: {
          select: { id: true, name: true },
        },
      },
    });

    // Invalida cache
    await this.redis.invalidateMedicalRecord(tenantId, record.clientId, medicalRecordId);

    return entry;
  }

  /**
   * Atualiza uma evolução
   */
  async updateEntry(entryId: string, tenantId: string, dto: UpdateEntryDto) {
    const entry = await this.findEntryById(entryId, tenantId);

    const updated = await this.prisma.medicalRecordEntry.update({
      where: { id: entryId },
      data: dto,
      include: {
        provider: {
          select: { id: true, name: true },
        },
      },
    });

    // Invalida cache
    await this.redis.invalidateMedicalRecord(
      tenantId,
      entry.medicalRecord.clientId,
      entry.medicalRecordId,
    );

    return updated;
  }

  /**
   * Remove uma evolução
   */
  async deleteEntry(entryId: string, tenantId: string) {
    const entry = await this.findEntryById(entryId, tenantId);

    await this.prisma.medicalRecordEntry.delete({
      where: { id: entryId },
    });

    // Invalida cache
    await this.redis.invalidateMedicalRecord(
      tenantId,
      entry.medicalRecord.clientId,
      entry.medicalRecordId,
    );

    return { message: 'Evolução removida com sucesso' };
  }

  // ============================================================================
  // ATTACHMENTS - Anexos (Fotos/Documentos)
  // ============================================================================

  /**
   * Lista todos os anexos de um prontuário
   */
  async findAttachments(
    medicalRecordId: string,
    tenantId: string,
    query?: QueryAttachmentsDto,
  ) {
    await this.findById(medicalRecordId, tenantId);

    const where: any = { medicalRecordId };

    if (query?.category) {
      where.category = query.category;
    }

    if (query?.entryId) {
      where.entryId = query.entryId;
    }

    return this.prisma.medicalRecordAttachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca um anexo específico
   */
  async findAttachmentById(attachmentId: string, tenantId: string) {
    const attachment = await this.prisma.medicalRecordAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        medicalRecord: {
          select: { id: true, tenantId: true, clientId: true },
        },
      },
    });

    if (!attachment || attachment.medicalRecord.tenantId !== tenantId) {
      throw new NotFoundException('Anexo não encontrado');
    }

    return attachment;
  }

  /**
   * Registra um novo anexo no prontuário
   */
  async createAttachment(
    medicalRecordId: string,
    tenantId: string,
    dto: CreateAttachmentDto,
    createdBy?: string,
  ) {
    const record = await this.findById(medicalRecordId, tenantId);

    const attachment = await this.prisma.medicalRecordAttachment.create({
      data: {
        medicalRecordId,
        fileName: dto.fileName,
        fileKey: dto.fileKey,
        fileUrl: dto.fileUrl,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        category: dto.category || AttachmentCategory.PHOTO,
        description: dto.description,
        entryId: dto.entryId,
        createdBy,
      },
    });

    // Invalida cache
    await this.redis.invalidateMedicalRecord(tenantId, record.clientId, medicalRecordId);

    return attachment;
  }

  /**
   * Atualiza metadados de um anexo
   */
  async updateAttachment(attachmentId: string, tenantId: string, dto: UpdateAttachmentDto) {
    const attachment = await this.findAttachmentById(attachmentId, tenantId);

    const updated = await this.prisma.medicalRecordAttachment.update({
      where: { id: attachmentId },
      data: dto,
    });

    // Invalida cache
    await this.redis.invalidateMedicalRecord(
      tenantId,
      attachment.medicalRecord.clientId,
      attachment.medicalRecordId,
    );

    return updated;
  }

  /**
   * Remove um anexo
   */
  async deleteAttachment(attachmentId: string, tenantId: string) {
    const attachment = await this.findAttachmentById(attachmentId, tenantId);

    await this.prisma.medicalRecordAttachment.delete({
      where: { id: attachmentId },
    });

    // Invalida cache
    await this.redis.invalidateMedicalRecord(
      tenantId,
      attachment.medicalRecord.clientId,
      attachment.medicalRecordId,
    );

    return {
      message: 'Anexo removido com sucesso',
      fileKey: attachment.fileKey, // Para o controller remover do storage
    };
  }

  // ============================================================================
  // HELPERS - Métodos auxiliares
  // ============================================================================

  /**
   * Busca histórico completo de um cliente (prontuário + atendimentos)
   */
  async getClientFullHistory(clientId: string, tenantId: string) {
    const record = await this.findByClientId(clientId, tenantId);

    if (!record) {
      throw new NotFoundException('Prontuário não encontrado');
    }

    // Busca todos os agendamentos do cliente
    const appointments = await this.prisma.appointment.findMany({
      where: { clientId, tenantId },
      include: {
        service: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });

    // Busca todas as evoluções
    const entries = await this.prisma.medicalRecordEntry.findMany({
      where: { medicalRecordId: record.id },
      include: {
        provider: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Busca todos os anexos
    const attachments = await this.prisma.medicalRecordAttachment.findMany({
      where: { medicalRecordId: record.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      medicalRecord: record,
      appointments,
      entries,
      attachments,
      summary: {
        totalAppointments: appointments.length,
        completedAppointments: appointments.filter((a) => a.status === 'COMPLETED').length,
        totalEntries: entries.length,
        totalAttachments: attachments.length,
      },
    };
  }

  /**
   * Conta prontuários de um tenant
   */
  async count(tenantId: string) {
    return this.prisma.medicalRecord.count({
      where: { tenantId },
    });
  }
}
