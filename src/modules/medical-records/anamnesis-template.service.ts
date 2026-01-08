import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, CACHE_TTL } from '../../redis';
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

@Injectable()
export class AnamnesisTemplateService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // TEMPLATES - CRUD
  // ============================================================================

  /**
   * Lista todos os templates de anamnese do tenant
   */
  async findAll(tenantId: string, query?: QueryTemplatesDto) {
    const where: any = { tenantId };

    if (query?.serviceId) {
      where.serviceId = query.serviceId;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.isDefault !== undefined) {
      where.isDefault = query.isDefault;
    }

    return this.prisma.anamnesisTemplate.findMany({
      where,
      include: {
        service: {
          select: { id: true, name: true },
        },
        _count: {
          select: { questions: true, responses: true },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Busca um template por ID com todas as perguntas
   */
  async findById(id: string, tenantId: string) {
    const template = await this.prisma.anamnesisTemplate.findFirst({
      where: { id, tenantId },
      include: {
        service: {
          select: { id: true, name: true },
        },
        questions: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { responses: true },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template de anamnese não encontrado');
    }

    // Parse das opções de cada pergunta
    const questionsWithParsedOptions = template.questions.map((q) => ({
      ...q,
      options: q.options ? JSON.parse(q.options) : null,
    }));

    return {
      ...template,
      questions: questionsWithParsedOptions,
    };
  }

  /**
   * Busca template por serviço ou o template padrão
   */
  async findByServiceOrDefault(serviceId: string | null, tenantId: string) {
    // Primeiro tenta encontrar pelo serviço
    if (serviceId) {
      const byService = await this.prisma.anamnesisTemplate.findFirst({
        where: { serviceId, tenantId, isActive: true },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      });

      if (byService) {
        return this.parseTemplateOptions(byService);
      }
    }

    // Se não encontrou, busca o template padrão
    const defaultTemplate = await this.prisma.anamnesisTemplate.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (defaultTemplate) {
      return this.parseTemplateOptions(defaultTemplate);
    }

    return null;
  }

  /**
   * Cria um novo template de anamnese
   */
  async create(tenantId: string, dto: CreateAnamnesisTemplateDto) {
    // Se for marcar como padrão, desmarca os outros
    if (dto.isDefault) {
      await this.prisma.anamnesisTemplate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Se informou serviceId, verifica se existe
    if (dto.serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.serviceId, tenantId },
      });
      if (!service) {
        throw new NotFoundException('Serviço não encontrado');
      }
    }

    // Cria o template com as perguntas
    const template = await this.prisma.anamnesisTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        serviceId: dto.serviceId,
        isDefault: dto.isDefault || false,
        questions: dto.questions
          ? {
              create: dto.questions.map((q, index) => ({
                question: q.question,
                questionType: q.questionType,
                options: q.options ? JSON.stringify(q.options) : null,
                isRequired: q.isRequired || false,
                order: q.order ?? index,
                helpText: q.helpText,
                category: q.category,
              })),
            }
          : undefined,
      },
      include: {
        service: {
          select: { id: true, name: true },
        },
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return this.parseTemplateOptions(template);
  }

  /**
   * Atualiza um template
   */
  async update(id: string, tenantId: string, dto: UpdateAnamnesisTemplateDto) {
    await this.findById(id, tenantId);

    // Se for marcar como padrão, desmarca os outros
    if (dto.isDefault) {
      await this.prisma.anamnesisTemplate.updateMany({
        where: { tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    // Se informou serviceId, verifica se existe
    if (dto.serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.serviceId, tenantId },
      });
      if (!service) {
        throw new NotFoundException('Serviço não encontrado');
      }
    }

    const updated = await this.prisma.anamnesisTemplate.update({
      where: { id },
      data: dto,
      include: {
        service: {
          select: { id: true, name: true },
        },
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return this.parseTemplateOptions(updated);
  }

  /**
   * Remove um template
   */
  async delete(id: string, tenantId: string) {
    const template = await this.findById(id, tenantId);

    // Verifica se tem respostas vinculadas
    if (template._count.responses > 0) {
      throw new ConflictException(
        'Não é possível excluir um template que possui respostas vinculadas',
      );
    }

    await this.prisma.anamnesisTemplate.delete({
      where: { id },
    });

    return { message: 'Template removido com sucesso' };
  }

  /**
   * Duplica um template
   */
  async duplicate(id: string, tenantId: string, newName?: string) {
    const original = await this.findById(id, tenantId);

    const duplicate = await this.prisma.anamnesisTemplate.create({
      data: {
        tenantId,
        name: newName || `${original.name} (Cópia)`,
        description: original.description,
        serviceId: null, // Não duplica o vínculo com serviço
        isDefault: false,
        questions: {
          create: original.questions.map((q) => ({
            question: q.question,
            questionType: q.questionType,
            options: q.options ? JSON.stringify(q.options) : null,
            isRequired: q.isRequired,
            order: q.order,
            helpText: q.helpText,
            category: q.category,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return this.parseTemplateOptions(duplicate);
  }

  // ============================================================================
  // QUESTIONS - Gerenciamento de perguntas
  // ============================================================================

  /**
   * Adiciona uma pergunta ao template
   */
  async addQuestion(templateId: string, tenantId: string, dto: CreateQuestionDto) {
    await this.findById(templateId, tenantId);

    // Calcula a próxima ordem se não fornecida
    let order = dto.order;
    if (order === undefined) {
      const lastQuestion = await this.prisma.anamnesisQuestion.findFirst({
        where: { templateId },
        orderBy: { order: 'desc' },
      });
      order = (lastQuestion?.order ?? -1) + 1;
    }

    const question = await this.prisma.anamnesisQuestion.create({
      data: {
        templateId,
        question: dto.question,
        questionType: dto.questionType,
        options: dto.options ? JSON.stringify(dto.options) : null,
        isRequired: dto.isRequired || false,
        order,
        helpText: dto.helpText,
        category: dto.category,
      },
    });

    return {
      ...question,
      options: question.options ? JSON.parse(question.options) : null,
    };
  }

  /**
   * Atualiza uma pergunta
   */
  async updateQuestion(questionId: string, tenantId: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.anamnesisQuestion.findUnique({
      where: { id: questionId },
      include: {
        template: { select: { tenantId: true } },
      },
    });

    if (!question || question.template.tenantId !== tenantId) {
      throw new NotFoundException('Pergunta não encontrada');
    }

    const updated = await this.prisma.anamnesisQuestion.update({
      where: { id: questionId },
      data: {
        ...dto,
        options: dto.options ? JSON.stringify(dto.options) : undefined,
      },
    });

    return {
      ...updated,
      options: updated.options ? JSON.parse(updated.options) : null,
    };
  }

  /**
   * Remove uma pergunta
   */
  async deleteQuestion(questionId: string, tenantId: string) {
    const question = await this.prisma.anamnesisQuestion.findUnique({
      where: { id: questionId },
      include: {
        template: { select: { tenantId: true } },
        _count: { select: { answers: true } },
      },
    });

    if (!question || question.template.tenantId !== tenantId) {
      throw new NotFoundException('Pergunta não encontrada');
    }

    if (question._count.answers > 0) {
      throw new ConflictException(
        'Não é possível excluir uma pergunta que possui respostas',
      );
    }

    await this.prisma.anamnesisQuestion.delete({
      where: { id: questionId },
    });

    return { message: 'Pergunta removida com sucesso' };
  }

  /**
   * Reordena as perguntas de um template
   */
  async reorderQuestions(templateId: string, tenantId: string, dto: ReorderQuestionsDto) {
    await this.findById(templateId, tenantId);

    // Atualiza a ordem de cada pergunta
    await Promise.all(
      dto.questions.map((q) =>
        this.prisma.anamnesisQuestion.update({
          where: { id: q.id },
          data: { order: q.order },
        }),
      ),
    );

    return this.findById(templateId, tenantId);
  }

  // ============================================================================
  // RESPONSES - Preenchimento de anamnese
  // ============================================================================

  /**
   * Lista respostas de anamnese
   */
  async findResponses(tenantId: string, query?: QueryResponsesDto) {
    const where: any = {
      template: { tenantId },
    };

    if (query?.templateId) {
      where.templateId = query.templateId;
    }

    if (query?.medicalRecordId) {
      where.medicalRecordId = query.medicalRecordId;
    }

    if (query?.completed !== undefined) {
      where.completedAt = query.completed ? { not: null } : null;
    }

    return this.prisma.anamnesisResponse.findMany({
      where,
      include: {
        template: {
          select: { id: true, name: true },
        },
        medicalRecord: {
          select: {
            id: true,
            client: { select: { id: true, name: true } },
          },
        },
        _count: {
          select: { answers: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Busca uma resposta por ID com todas as respostas
   */
  async findResponseById(responseId: string, tenantId: string) {
    const response = await this.prisma.anamnesisResponse.findUnique({
      where: { id: responseId },
      include: {
        template: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        },
        medicalRecord: {
          select: {
            id: true,
            tenantId: true,
            client: { select: { id: true, name: true } },
          },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    if (!response || response.medicalRecord.tenantId !== tenantId) {
      throw new NotFoundException('Resposta de anamnese não encontrada');
    }

    // Monta a resposta com perguntas e respostas formatadas
    const questionsWithAnswers = response.template.questions.map((question) => {
      const answer = response.answers.find((a) => a.questionId === question.id);
      return {
        ...question,
        options: question.options ? JSON.parse(question.options) : null,
        answer: answer?.answer || null,
      };
    });

    return {
      id: response.id,
      templateId: response.templateId,
      templateName: response.template.name,
      medicalRecordId: response.medicalRecordId,
      client: response.medicalRecord.client,
      entryId: response.entryId,
      completedAt: response.completedAt,
      createdAt: response.createdAt,
      questions: questionsWithAnswers,
    };
  }

  /**
   * Cria uma nova resposta de anamnese
   */
  async createResponse(tenantId: string, dto: CreateAnamnesisResponseDto, createdBy?: string) {
    // Verifica se o template existe e pertence ao tenant
    const template = await this.prisma.anamnesisTemplate.findFirst({
      where: { id: dto.templateId, tenantId },
      include: {
        questions: true,
      },
    });

    if (!template) {
      throw new NotFoundException('Template de anamnese não encontrado');
    }

    // Verifica se o prontuário existe e pertence ao tenant
    const medicalRecord = await this.prisma.medicalRecord.findFirst({
      where: { id: dto.medicalRecordId, tenantId },
    });

    if (!medicalRecord) {
      throw new NotFoundException('Prontuário não encontrado');
    }

    // Valida se todas as perguntas obrigatórias foram respondidas
    const requiredQuestionIds = template.questions
      .filter((q) => q.isRequired)
      .map((q) => q.id);

    const answeredQuestionIds = dto.answers.map((a) => a.questionId);
    const missingRequired = requiredQuestionIds.filter(
      (id) => !answeredQuestionIds.includes(id),
    );

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        'Existem perguntas obrigatórias não respondidas',
      );
    }

    // Cria a resposta com as respostas
    const response = await this.prisma.anamnesisResponse.create({
      data: {
        templateId: dto.templateId,
        medicalRecordId: dto.medicalRecordId,
        entryId: dto.entryId,
        createdBy,
        completedAt: new Date(), // Marca como completado
        answers: {
          create: dto.answers.map((a) => ({
            questionId: a.questionId,
            answer: a.answer,
          })),
        },
      },
      include: {
        template: {
          select: { id: true, name: true },
        },
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    return response;
  }

  /**
   * Atualiza respostas de uma anamnese
   */
  async updateResponse(responseId: string, tenantId: string, dto: UpdateAnamnesisResponseDto) {
    const response = await this.prisma.anamnesisResponse.findUnique({
      where: { id: responseId },
      include: {
        template: {
          include: { questions: true },
        },
        medicalRecord: {
          select: { tenantId: true },
        },
      },
    });

    if (!response || response.medicalRecord.tenantId !== tenantId) {
      throw new NotFoundException('Resposta de anamnese não encontrada');
    }

    // Atualiza as respostas
    if (dto.answers) {
      for (const answer of dto.answers) {
        await this.prisma.anamnesisAnswer.upsert({
          where: {
            responseId_questionId: {
              responseId,
              questionId: answer.questionId,
            },
          },
          create: {
            responseId,
            questionId: answer.questionId,
            answer: answer.answer,
          },
          update: {
            answer: answer.answer,
          },
        });
      }
    }

    // Marca como completado se solicitado
    if (dto.markAsCompleted) {
      await this.prisma.anamnesisResponse.update({
        where: { id: responseId },
        data: { completedAt: new Date() },
      });
    }

    return this.findResponseById(responseId, tenantId);
  }

  /**
   * Remove uma resposta de anamnese
   */
  async deleteResponse(responseId: string, tenantId: string) {
    const response = await this.prisma.anamnesisResponse.findUnique({
      where: { id: responseId },
      include: {
        medicalRecord: {
          select: { tenantId: true },
        },
      },
    });

    if (!response || response.medicalRecord.tenantId !== tenantId) {
      throw new NotFoundException('Resposta de anamnese não encontrada');
    }

    await this.prisma.anamnesisResponse.delete({
      where: { id: responseId },
    });

    return { message: 'Resposta de anamnese removida com sucesso' };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private parseTemplateOptions(template: any) {
    return {
      ...template,
      questions: template.questions?.map((q: any) => ({
        ...q,
        options: q.options ? JSON.parse(q.options) : null,
      })),
    };
  }
}
