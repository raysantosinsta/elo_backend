/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Interface para arquivos Multer
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// ADICIONE OS NOVOS BUCKETS
export type BucketType = 
  | 'task-images' | 'task-audios' | 'task-videos'
  | 'flow-images' | 'flow-audios' | 'flow-videos'
  | 'flow-templates';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;
  private supabasePublic: SupabaseClient;

  // ATUALIZE OS BUCKETS
  private readonly BUCKETS: Record<BucketType, string> = {
    'task-images': 'task-images',
    'task-audios': 'task-audios', 
    'task-videos': 'task-videos',
    'flow-images': 'flow-images',
    'flow-audios': 'flow-audios',
    'flow-videos': 'flow-videos',
    'flow-templates': 'flow-templates'
  };

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey || !anonKey) {
      throw new Error('Supabase URL, SERVICE_ROLE_KEY e ANON_KEY devem ser fornecidos');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.supabasePublic = createClient(supabaseUrl, anonKey);

    this.logger.log('Supabase clients criados com sucesso');
    this.ensureBucketsExist().catch(error => {
      this.logger.error('Erro ao garantir buckets:', error);
    });
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  async replaceFile(
  bucket: BucketType,
  path: string,
  fileBuffer: Buffer,
  options?: {
    contentType?: string;
    metadata?: Record<string, any>;
  }
): Promise<{ id: string; path: string; fullPath: string }> {
  return this.uploadFile(bucket, path, fileBuffer, {
    ...options,
    overwrite: true
  });
}

  async uploadFile(
  bucket: BucketType,
  path: string,
  fileBuffer: Buffer,
  options?: {
    contentType?: string;
    metadata?: Record<string, any>;
    overwrite?: boolean; // ADICIONE ESTA OPÇÃO
  }
): Promise<{ id: string; path: string; fullPath: string }> {
  try {
    this.logger.log(`📤 Uploading file to ${bucket}/${path}`);

    // Verificar tamanho do arquivo (limite de 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (fileBuffer.length > maxSize) {
      throw new BadRequestException(`Arquivo muito grande. Tamanho máximo: 50MB`);
    }

    // Verifica se o arquivo já existe e deleta se for para sobrescrever
    if (options?.overwrite) {
      try {
        await this.deleteFile(bucket, path);
      } catch (error) {
        // Ignora erro se o arquivo não existir
        this.logger.log(`Arquivo ${path} não existe para deleção`);
      }
    }

    // UPLOAD com opção de sobrescrita
    const { data: uploadData, error: uploadError } = await this.supabase.storage
      .from(bucket)
      .upload(path, fileBuffer, {
        contentType: options?.contentType || 'application/octet-stream',
        upsert: true, // IMPORTANTE: true para permitir sobrescrita
        duplex: 'half',
      });

    if (uploadError) {
      this.logger.error('❌ UPLOAD ERROR:', uploadError);
      throw new BadRequestException(`Upload falhou: ${uploadError.message}`);
    }

    this.logger.log('✅ Upload realizado com sucesso');

    // GERAR URL PÚBLICA
    const { data: publicUrlData } = this.supabasePublic.storage
      .from(bucket)
      .getPublicUrl(path);

    if (!publicUrlData?.publicUrl) {
      throw new BadRequestException('Falha ao gerar URL pública');
    }

    return {
      id: uploadData?.id || path,
      path: path,
      fullPath: publicUrlData.publicUrl
    };

  } catch (error) {
    this.logger.error('❌ Erro no upload:', error);
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException(`Falha no upload: ${error.message}`);
  }
}

  async deleteFile(bucket: BucketType, path: string): Promise<void> {
    try {
      this.logger.log(`🗑️ Deleting file from ${bucket}/${path}`);

      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        this.logger.error('❌ Delete error:', error);
        // Não lançar erro para não quebrar o fluxo principal
        this.logger.warn(`Arquivo ${path} não pôde ser deletado: ${error.message}`);
        return;
      }

      this.logger.log('✅ Arquivo deletado com sucesso');
    } catch (error) {
      this.logger.error('❌ Erro ao deletar arquivo:', error);
      // Não lançar erro para não quebrar o fluxo principal
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.storage.listBuckets();
      
      if (error) {
        this.logger.error('❌ Test connection error:', error);
        return false;
      }
      
      this.logger.log('✅ Conexão com Supabase estabelecida');
      return true;
    } catch (error) {
      this.logger.error('❌ Test connection failed:', error);
      return false;
    }
  }

   // Método auxiliar para determinar bucket
  getBucketForFlowFile(type: 'image' | 'audio' | 'video'): BucketType {
    switch (type) {
      case 'image': return 'flow-images';
      case 'audio': return 'flow-audios';
      case 'video': return 'flow-videos';
      default: throw new BadRequestException('Tipo de arquivo não suportado');
    }
  }

 // Método específico para fluxo/produção
  // Método específico para fluxo/produção
async uploadFlowFile(
  flowItemId: string,
  file: MulterFile,
  type: 'image' | 'audio' | 'video',
  metadata?: Record<string, any>
): Promise<{ url: string; filename: string; size: number }> { // Removi bucketPath do retorno
  const bucket = this.getBucketForFlowFile(type);
  
  // Cria estrutura de pastas organizada
  const fileExt = file.originalname.split('.').pop();
  const timestamp = Date.now();
  const uniqueFilename = `${flowItemId}/${type}s/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  
  // Verifica tipo MIME
  const allowedTypes = this.getAllowedMimeTypes(bucket);
  if (!allowedTypes.includes(file.mimetype)) {
    throw new BadRequestException(`Tipo de arquivo não permitido para ${type}. Tipos permitidos: ${allowedTypes.join(', ')}`);
  }

  const uploadResult = await this.uploadFile(
    bucket,
    uniqueFilename,
    file.buffer,
    {
      contentType: file.mimetype,
      metadata: {
        ...metadata,
        originalFilename: file.originalname,
        uploadedAt: new Date().toISOString(),
        flowItemId,
        type
      }
    }
  );

  return {
    url: uploadResult.fullPath,
    filename: file.originalname,
    size: file.size
    // Não retorna bucketPath pois não é usado no modelo
  };
}

  // Método para deletar arquivos de fluxo
  async deleteFlowFile(url: string): Promise<void> {
    try {
      const { path, bucket } = this.extractPathFromUrl(url);
      
      // Verifica se é um bucket de flow
      if (!bucket.includes('flow-')) {
        this.logger.warn(`Tentativa de deletar arquivo de bucket não-flow: ${bucket}`);
      }
      
      await this.deleteFile(bucket as BucketType, path);
    } catch (error) {
      this.logger.error('Erro ao deletar arquivo de fluxo:', error);
      // Não lança erro para não quebrar fluxo principal
    }
  }

  // Mantenha os outros métodos existentes, apenas atualize ensureBucketsExist
  async ensureBucketsExist(): Promise<void> {
  const requiredBuckets = Object.values(this.BUCKETS); // pega os nomes reais

  try {
    const { data: buckets, error } = await this.supabase.storage.listBuckets();

    if (error) {
      this.logger.error('❌ Erro ao listar buckets:', error);
      return;
    }

    const existing = new Set(buckets?.map(b => b.name));

    for (const bucketName of requiredBuckets) {
      if (existing.has(bucketName)) {
        this.logger.log(`✔️ Bucket já existe: ${bucketName}`);
        continue; // não tenta criar → evita erro 409
      }

      this.logger.log(`🛠️ Criando bucket: ${bucketName}`);

      const config: any = {
        public: true,
        fileSizeLimit: 52_428_800, // 50MB
      };

      if (bucketName.includes('flow-')) {
        config.allowedMimeTypes = this.getAllowedMimeTypes(bucketName as BucketType);
      }

      const { error: createError } = await this.supabase.storage.createBucket(bucketName, config);

      if (createError) {
        this.logger.error(`❌ Falha ao criar bucket ${bucketName}:`, createError);
      } else {
        this.logger.log(`✅ Bucket criado: ${bucketName}`);
      }
    }
  } catch (error) {
    this.logger.error('❌ Erro ao garantir buckets:', error);
  }
}


 // Atualize também este método
  private getAllowedMimeTypes(bucket: BucketType): string[] {
    const baseConfig = {
      'task-images': ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
      'task-audios': ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'],
      'task-videos': ['video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime'],
      // ADICIONE OS NOVOS
      'flow-images': ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
      'flow-audios': ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/webm'],
      'flow-videos': ['video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
      'flow-templates': ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    };

    return baseConfig[bucket] || [];
  }

  extractPathFromUrl(url: string): { path: string; bucket: BucketType } {
    try {
      const cleanUrl = url.split('?')[0];
      // CORREÇÃO: Regex atualizado para incluir TODOS os buckets
      const bucketMatch = cleanUrl.match(
        /\/(task-images|task-audios|task-videos|flow-images|flow-audios|flow-videos|flow-templates)\//
      );
      
      if (!bucketMatch) {
        throw new BadRequestException('URL do Supabase inválida - bucket não encontrado');
      }

      const bucketName = bucketMatch[1] as BucketType;
      const pathStart = cleanUrl.indexOf(bucketName) + bucketName.length + 1;
      const path = cleanUrl.substring(pathStart);

      if (!path) {
        throw new BadRequestException('URL do Supabase inválida - path não encontrado');
      }

      return { path, bucket: bucketName };
    } catch (error) {
      this.logger.error('❌ Erro ao extrair path da URL:', error);
      throw new BadRequestException('URL do Supabase inválida');
    }
  }

  getPublicUrl(bucket: BucketType, path: string): string {
    const { data } = this.supabasePublic.storage
      .from(bucket)
      .getPublicUrl(path);
    
    return data.publicUrl;
  }

  async listFiles(bucket: BucketType, folder?: string): Promise<string[]> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .list(folder);

      if (error) {
        this.logger.error('❌ Erro ao listar arquivos:', error);
        return [];
      }

      return data?.map(item => item.name) || [];
    } catch (error) {
      this.logger.error('❌ Erro ao listar arquivos:', error);
      return [];
    }
  }

  async fileExists(bucket: BucketType, path: string): Promise<boolean> {
    try {
      const { data } = await this.supabase.storage
        .from(bucket)
        .list(path.split('/').slice(0, -1).join('/'));

      const fileName = path.split('/').pop();
      return data?.some(item => item.name === fileName) || false;
    } catch (error) {
      this.logger.error('❌ Erro ao verificar arquivo:', error);
      return false;
    }
  }
}