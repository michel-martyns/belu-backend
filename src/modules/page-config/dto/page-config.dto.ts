import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// Tipos de seção disponíveis
export type SectionType = 'hero' | 'stats' | 'services' | 'providers' | 'cta' | 'testimonials' | 'gallery' | 'map';

// Configuração de cada tipo de seção
export interface HeroConfig {
  showLogo: boolean;
  showDescription: boolean;
  showContacts: boolean;
  backgroundType: 'gradient' | 'image' | 'solid';
  gradientFrom?: string;
  gradientTo?: string;
}

export interface StatsConfig {
  showServices: boolean;
  showProviders: boolean;
  showRating: boolean;
  ratingValue: number;
}

export interface ServicesConfig {
  title: string;
  maxItems: number;
  layout: 'list' | 'grid';
  showPrices: boolean;
  showDuration: boolean;
}

export interface ProvidersConfig {
  title: string;
  layout: 'horizontal' | 'grid';
  showServiceCount: boolean;
}

export interface CtaConfig {
  buttonText: string;
  buttonColor?: string;
}

export type SectionConfig = HeroConfig | StatsConfig | ServicesConfig | ProvidersConfig | CtaConfig | Record<string, unknown>;

// Estrutura de uma seção
export interface PageSection {
  id: string;
  type: SectionType;
  order: number;
  isVisible: boolean;
  config: SectionConfig;
}

// DTOs
export class UpdatePageConfigDto {
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsArray()
  sections?: PageSection[];

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor primária deve ser um hex válido (#RRGGBB)' })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Cor secundária deve ser um hex válido (#RRGGBB)' })
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  heroBackgroundImage?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class UpdateSectionsDto {
  @IsArray()
  sections: PageSection[];
}

export class ApplyTemplateDto {
  @IsString()
  templateId: string;
}

// Templates pré-definidos
export const PAGE_TEMPLATES = {
  default: {
    id: 'default',
    name: 'Padrão',
    description: 'Todas as seções visíveis com layout clássico',
    sections: [
      {
        id: 'hero-1',
        type: 'hero' as SectionType,
        order: 0,
        isVisible: true,
        config: {
          showLogo: true,
          showDescription: true,
          showContacts: true,
          backgroundType: 'gradient',
          gradientFrom: '#db2777',
          gradientTo: '#7c3aed',
        } as HeroConfig,
      },
      {
        id: 'stats-1',
        type: 'stats' as SectionType,
        order: 1,
        isVisible: true,
        config: {
          showServices: true,
          showProviders: true,
          showRating: true,
          ratingValue: 5.0,
        } as StatsConfig,
      },
      {
        id: 'services-1',
        type: 'services' as SectionType,
        order: 2,
        isVisible: true,
        config: {
          title: 'Nossos Serviços',
          maxItems: 4,
          layout: 'list',
          showPrices: true,
          showDuration: true,
        } as ServicesConfig,
      },
      {
        id: 'providers-1',
        type: 'providers' as SectionType,
        order: 3,
        isVisible: true,
        config: {
          title: 'Nossa Equipe',
          layout: 'horizontal',
          showServiceCount: true,
        } as ProvidersConfig,
      },
      {
        id: 'cta-1',
        type: 'cta' as SectionType,
        order: 4,
        isVisible: true,
        config: {
          buttonText: 'Agendar horário',
        } as CtaConfig,
      },
    ],
    primaryColor: '#ec4899',
    secondaryColor: '#7c3aed',
  },
  minimalist: {
    id: 'minimalist',
    name: 'Minimalista',
    description: 'Apenas hero e botão de agendamento',
    sections: [
      {
        id: 'hero-1',
        type: 'hero' as SectionType,
        order: 0,
        isVisible: true,
        config: {
          showLogo: true,
          showDescription: true,
          showContacts: false,
          backgroundType: 'solid',
        } as HeroConfig,
      },
      {
        id: 'cta-1',
        type: 'cta' as SectionType,
        order: 1,
        isVisible: true,
        config: {
          buttonText: 'Agendar agora',
        } as CtaConfig,
      },
    ],
    primaryColor: '#1f2937',
    secondaryColor: '#6b7280',
  },
  modern: {
    id: 'modern',
    name: 'Moderno',
    description: 'Layout moderno com cores vibrantes',
    sections: [
      {
        id: 'hero-1',
        type: 'hero' as SectionType,
        order: 0,
        isVisible: true,
        config: {
          showLogo: true,
          showDescription: true,
          showContacts: true,
          backgroundType: 'gradient',
          gradientFrom: '#8b5cf6',
          gradientTo: '#ec4899',
        } as HeroConfig,
      },
      {
        id: 'services-1',
        type: 'services' as SectionType,
        order: 1,
        isVisible: true,
        config: {
          title: 'Tratamentos',
          maxItems: 6,
          layout: 'grid',
          showPrices: true,
          showDuration: false,
        } as ServicesConfig,
      },
      {
        id: 'providers-1',
        type: 'providers' as SectionType,
        order: 2,
        isVisible: true,
        config: {
          title: 'Especialistas',
          layout: 'grid',
          showServiceCount: false,
        } as ProvidersConfig,
      },
      {
        id: 'cta-1',
        type: 'cta' as SectionType,
        order: 3,
        isVisible: true,
        config: {
          buttonText: 'Reserve seu horário',
        } as CtaConfig,
      },
    ],
    primaryColor: '#8b5cf6',
    secondaryColor: '#ec4899',
  },
  complete: {
    id: 'complete',
    name: 'Completo',
    description: 'Todas as seções com estatísticas destacadas',
    sections: [
      {
        id: 'hero-1',
        type: 'hero' as SectionType,
        order: 0,
        isVisible: true,
        config: {
          showLogo: true,
          showDescription: true,
          showContacts: true,
          backgroundType: 'gradient',
          gradientFrom: '#059669',
          gradientTo: '#0891b2',
        } as HeroConfig,
      },
      {
        id: 'stats-1',
        type: 'stats' as SectionType,
        order: 1,
        isVisible: true,
        config: {
          showServices: true,
          showProviders: true,
          showRating: true,
          ratingValue: 5.0,
        } as StatsConfig,
      },
      {
        id: 'services-1',
        type: 'services' as SectionType,
        order: 2,
        isVisible: true,
        config: {
          title: 'Nossos Serviços',
          maxItems: -1,
          layout: 'grid',
          showPrices: true,
          showDuration: true,
        } as ServicesConfig,
      },
      {
        id: 'providers-1',
        type: 'providers' as SectionType,
        order: 3,
        isVisible: true,
        config: {
          title: 'Conheça Nossa Equipe',
          layout: 'grid',
          showServiceCount: true,
        } as ProvidersConfig,
      },
      {
        id: 'cta-1',
        type: 'cta' as SectionType,
        order: 4,
        isVisible: true,
        config: {
          buttonText: 'Agendar consulta',
        } as CtaConfig,
      },
    ],
    primaryColor: '#059669',
    secondaryColor: '#0891b2',
  },
};
