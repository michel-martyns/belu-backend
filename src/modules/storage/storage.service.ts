import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

export interface UploadResult {
  key: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface UploadOptions {
  folder?: string;
  maxSize?: number; // em bytes
  allowedMimeTypes?: string[];
}

// Configurações padrão por tipo de upload
export const UPLOAD_CONFIGS = {
  avatar: {
    folder: 'avatars',
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  document: {
    folder: 'documents',
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  photo: {
    folder: 'photos',
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  logo: {
    folder: 'logos',
    maxSize: 2 * 1024 * 1024, // 2MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
};

@Injectable()
export class StorageService {
  private s3Client: S3Client | null = null;
  private bucket: string;
  private useS3: boolean;
  private localUploadPath: string;
  private baseUrl: string;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>('S3_BUCKET') || 'belu-uploads';
    this.localUploadPath = path.join(process.cwd(), 'uploads');
    this.baseUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3001';

    // Verifica se tem configuração S3
    const s3Endpoint = this.configService.get<string>('S3_ENDPOINT');
    const s3AccessKey = this.configService.get<string>('S3_ACCESS_KEY');
    const s3SecretKey = this.configService.get<string>('S3_SECRET_KEY');

    if (s3Endpoint && s3AccessKey && s3SecretKey) {
      this.useS3 = true;
      this.s3Client = new S3Client({
        endpoint: s3Endpoint,
        region: this.configService.get<string>('S3_REGION') || 'us-east-1',
        credentials: {
          accessKeyId: s3AccessKey,
          secretAccessKey: s3SecretKey,
        },
        forcePathStyle: true, // Necessário para MinIO
      });
      console.log('✅ Storage S3/MinIO configurado');
    } else {
      this.useS3 = false;
      // Garante que o diretório de uploads existe
      this.ensureUploadDir();
      console.log('⚠️  S3 não configurado. Usando armazenamento local.');
    }
  }

  private ensureUploadDir() {
    if (!fs.existsSync(this.localUploadPath)) {
      fs.mkdirSync(this.localUploadPath, { recursive: true });
    }
  }

  private ensureLocalFolder(folder: string) {
    const folderPath = path.join(this.localUploadPath, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    return folderPath;
  }

  /**
   * Gera um nome único para o arquivo
   */
  private generateFileName(originalName: string): string {
    const ext = path.extname(originalName).toLowerCase();
    return `${uuidv4()}${ext}`;
  }

  /**
   * Valida o arquivo antes do upload
   */
  private validateFile(
    file: Express.Multer.File,
    options: UploadOptions,
  ): void {
    // Valida tamanho
    if (options.maxSize && file.size > options.maxSize) {
      const maxSizeMB = (options.maxSize / (1024 * 1024)).toFixed(1);
      throw new BadRequestException(
        `Arquivo muito grande. Tamanho máximo: ${maxSizeMB}MB`,
      );
    }

    // Valida tipo MIME
    if (
      options.allowedMimeTypes &&
      !options.allowedMimeTypes.includes(file.mimetype)
    ) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido. Tipos aceitos: ${options.allowedMimeTypes.join(', ')}`,
      );
    }
  }

  /**
   * Faz upload de um arquivo
   */
  async upload(
    file: Express.Multer.File,
    tenantId: string,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    // Valida o arquivo
    this.validateFile(file, options);

    const folder = options.folder || 'uploads';
    const fileName = this.generateFileName(file.originalname);
    const key = `${tenantId}/${folder}/${fileName}`;

    if (this.useS3 && this.s3Client) {
      return this.uploadToS3(file, key);
    } else {
      return this.uploadToLocal(file, tenantId, folder, fileName);
    }
  }

  /**
   * Upload para S3/MinIO
   */
  private async uploadToS3(
    file: Express.Multer.File,
    key: string,
  ): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
      },
    });

    await this.s3Client!.send(command);

    const url = await this.getSignedUrl(key);

    return {
      key,
      url,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Upload para armazenamento local
   */
  private async uploadToLocal(
    file: Express.Multer.File,
    tenantId: string,
    folder: string,
    fileName: string,
  ): Promise<UploadResult> {
    const tenantFolder = path.join(tenantId, folder);
    const fullPath = this.ensureLocalFolder(tenantFolder);
    const filePath = path.join(fullPath, fileName);

    // Salva o arquivo
    fs.writeFileSync(filePath, file.buffer);

    const key = `${tenantId}/${folder}/${fileName}`;
    const url = `${this.baseUrl}/uploads/${key}`;

    return {
      key,
      url,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Gera URL assinada para acesso temporário (S3)
   */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!this.useS3 || !this.s3Client) {
      // Para local, retorna URL direta
      return `${this.baseUrl}/uploads/${key}`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Deleta um arquivo
   */
  async delete(key: string): Promise<void> {
    if (this.useS3 && this.s3Client) {
      await this.deleteFromS3(key);
    } else {
      await this.deleteFromLocal(key);
    }
  }

  /**
   * Deleta do S3
   */
  private async deleteFromS3(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client!.send(command);
  }

  /**
   * Deleta do armazenamento local
   */
  private async deleteFromLocal(key: string): Promise<void> {
    const filePath = path.join(this.localUploadPath, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Verifica se um arquivo existe
   */
  async exists(key: string): Promise<boolean> {
    if (this.useS3 && this.s3Client) {
      try {
        const command = new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        });
        await this.s3Client.send(command);
        return true;
      } catch {
        return false;
      }
    } else {
      const filePath = path.join(this.localUploadPath, key);
      return fs.existsSync(filePath);
    }
  }

  /**
   * Upload de avatar
   */
  async uploadAvatar(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<UploadResult> {
    return this.upload(file, tenantId, UPLOAD_CONFIGS.avatar);
  }

  /**
   * Upload de documento
   */
  async uploadDocument(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<UploadResult> {
    return this.upload(file, tenantId, UPLOAD_CONFIGS.document);
  }

  /**
   * Upload de foto
   */
  async uploadPhoto(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<UploadResult> {
    return this.upload(file, tenantId, UPLOAD_CONFIGS.photo);
  }

  /**
   * Upload de logo
   */
  async uploadLogo(
    file: Express.Multer.File,
    tenantId: string,
  ): Promise<UploadResult> {
    return this.upload(file, tenantId, UPLOAD_CONFIGS.logo);
  }

  /**
   * Upload múltiplo de fotos
   */
  async uploadPhotos(
    files: Express.Multer.File[],
    tenantId: string,
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    for (const file of files) {
      const result = await this.uploadPhoto(file, tenantId);
      results.push(result);
    }
    return results;
  }
}
