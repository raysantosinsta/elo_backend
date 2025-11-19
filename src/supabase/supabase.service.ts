// /* eslint-disable @typescript-eslint/no-unused-vars */
// /* eslint-disable @typescript-eslint/no-unsafe-assignment */
// /* eslint-disable prettier/prettier */
// // supabase.service.ts
// import { BadRequestException, Injectable } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { createClient, SupabaseClient } from '@supabase/supabase-js';

// // Interface para arquivos Multer
// interface MulterFile {
//   fieldname: string;
//   originalname: string;
//   encoding: string;
//   mimetype: string;
//   size: number;
//   buffer: Buffer;
// }

// type BucketType = 'task-images' | 'task-audios' | 'task-videos';

// @Injectable()
// export class SupabaseService {
//   private supabase: SupabaseClient;           // service_role (upload/delete)
//   private supabasePublic: SupabaseClient;     // anon key (getPublicUrl)

//   private readonly BUCKETS = {
//     'task-images': 'task-images',
//     'task-audio': 'task-audio', 
//     'task-videos': 'task-videos'
//   };

//   constructor(private configService: ConfigService) {
//     const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
//     const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
//     const anonKey = this.configService.get<string>('SUPABASE_ANON_KEY');

//     // Validação correta
//     if (!supabaseUrl || !supabaseKey || !anonKey) {
//       throw new Error('Supabase URL, SERVICE_ROLE_KEY e ANON_KEY devem ser fornecidos');
//     }

//     // Cliente com service_role (para upload/delete)
//     this.supabase = createClient(supabaseUrl, supabaseKey);

//     // Cliente com anon key (para gerar URL pública)
//     this.supabasePublic = createClient(supabaseUrl, anonKey);

//     console.log('Supabase clients criados com sucesso');

//     this.ensureBucketsExist().catch(console.error);
//   }

//   getClient(): SupabaseClient {
//     return this.supabase;
//   }

//   async uploadFile(
//     bucket: BucketType,
//     path: string,
//     fileBuffer: Buffer,
//     options?: {
//       contentType?: string;
//       metadata?: Record<string, any>;
//     }
//   ): Promise<{ id: string; path: string; fullPath: string }> {
//     try {
//       console.log(`📤 Uploading file to ${bucket}/${path}`);

//       // 1. UPLOAD
//       const { data: uploadData, error: uploadError } = await this.supabase.storage
//         .from(bucket)
//         .upload(path, fileBuffer, {
//           contentType: options?.contentType || 'application/octet-stream',
//           upsert: true,
//           duplex: 'half',
//           cacheControl: '3600',
//         });

//       if (uploadError) {
//         console.error('❌ UPLOAD ERROR:', uploadError);
//         throw new BadRequestException(`Upload falhou: ${uploadError.message}`);
//       }

//       console.log('✅ Upload realizado com sucesso');

//       // 2. GERAR URL PÚBLICA
//       const { data: publicUrlData } = this.supabasePublic.storage
//         .from(bucket)
//         .getPublicUrl(path);

//       if (!publicUrlData?.publicUrl) {
//         throw new BadRequestException('Falha ao gerar URL pública');
//       }

//       console.log('🔗 URL pública gerada:', publicUrlData.publicUrl);

//       return {
//         id: uploadData?.id || path,
//         path: path,
//         fullPath: publicUrlData.publicUrl
//       };

//     } catch (error) {
//       console.error('❌ Erro no upload:', error);
//       throw new BadRequestException(`Falha no upload: ${error.message}`);
//     }
//   }

//   async deleteFile(bucket: BucketType, path: string): Promise<void> {
//     try {
//       console.log(`🗑️ Deleting file from ${bucket}/${path}`);

//       const { error } = await this.supabase.storage
//         .from(bucket)
//         .remove([path]);

//       if (error) {
//         console.error('❌ Delete error:', error);
//         throw new BadRequestException(`Falha ao deletar: ${error.message}`);
//       }

//       console.log('✅ Arquivo deletado com sucesso');
//     } catch (error) {
//       console.error('❌ Erro ao deletar arquivo:', error);
//       throw error;
//     }
//   }

//   async testConnection(): Promise<boolean> {
//     try {
//       const { data, error } = await this.supabase.storage.listBuckets();
      
//       if (error) {
//         console.error('❌ Test connection error:', error);
//         return false;
//       }
      
//       console.log('✅ Conexão com Supabase estabelecida');
//       return true;
//     } catch (error) {
//       console.error('❌ Test connection failed:', error);
//       return false;
//     }
//   }

//   async ensureBucketsExist(): Promise<void> {
//     const requiredBuckets: BucketType[] = ['task-images', 'task-audios', 'task-videos'];
    
//     try {
//       const { data: buckets, error } = await this.supabase.storage.listBuckets();

//       if (error) {
//         console.error('❌ Erro ao listar buckets:', error);
//         return;
//       }

//       const existingBuckets = buckets?.map(b => b.name) || [];

//       for (const bucketName of requiredBuckets) {
//         if (!existingBuckets.includes(bucketName)) {
//           console.log(`🛠️ Criando bucket: ${bucketName}`);
          
//           const { error: createError } = await this.supabase.storage.createBucket(bucketName, {
//             public: true,
//             fileSizeLimit: 104857600, // 100MB
//             allowedMimeTypes: this.getAllowedMimeTypes(bucketName),
//           });

//           if (createError) {
//             console.error(`❌ Erro ao criar ${bucketName}:`, createError);
//           } else {
//             console.log(`✅ Bucket criado: ${bucketName}`);
//           }
//         } else {
//           console.log(`✅ Bucket já existe: ${bucketName}`);
//         }
//       }
//     } catch (error) {
//       console.error('❌ Erro ao verificar buckets:', error);
//     }
//   }

//   private getAllowedMimeTypes(bucket: BucketType): string[] {
//     switch (bucket) {
//       case 'task-images':
//         return ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
//       case 'task-audios':
//         return ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'];
//       case 'task-videos':
//         return ['video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime'];
//       default:
//         return ['*/*'];
//     }
//   }

//   extractPathFromUrl(url: string): { path: string; bucket: BucketType } {
//     try {
//       // Remove parâmetros de query se existirem
//       const cleanUrl = url.split('?')[0];
      
//       // Encontra o nome do bucket na URL
//       const bucketMatch = cleanUrl.match(/\/(task-images|task-audios|task-videos)\//);
      
//       if (!bucketMatch) {
//         throw new BadRequestException('URL do Supabase inválida - bucket não encontrado');
//       }

//       const bucketName = bucketMatch[1] as BucketType;
      
//       // Extrai o path após o bucket
//       const pathStart = cleanUrl.indexOf(bucketName) + bucketName.length + 1;
//       const path = cleanUrl.substring(pathStart);

//       if (!path) {
//         throw new BadRequestException('URL do Supabase inválida - path não encontrado');
//       }

//       return { path, bucket: bucketName };
//     } catch (error) {
//       console.error('❌ Erro ao extrair path da URL:', error);
//       throw new BadRequestException('URL do Supabase inválida');
//     }
//   }

//   // Método auxiliar para obter URL pública
//   getPublicUrl(bucket: BucketType, path: string): string {
//     const { data } = this.supabasePublic.storage
//       .from(bucket)
//       .getPublicUrl(path);
    
//     return data.publicUrl;
//   }

//   // Método para listar arquivos em um bucket
//   async listFiles(bucket: BucketType, folder?: string): Promise<string[]> {
//     try {
//       const { data, error } = await this.supabase.storage
//         .from(bucket)
//         .list(folder);

//       if (error) {
//         console.error('❌ Erro ao listar arquivos:', error);
//         return [];
//       }

//       return data?.map(item => item.name) || [];
//     } catch (error) {
//       console.error('❌ Erro ao listar arquivos:', error);
//       return [];
//     }
//   }

//   // Método para verificar se um arquivo existe
//   async fileExists(bucket: BucketType, path: string): Promise<boolean> {
//     try {
//       const { data } = await this.supabase.storage
//         .from(bucket)
//         .list(path.split('/').slice(0, -1).join('/'));

//       const fileName = path.split('/').pop();
//       return data?.some(item => item.name === fileName) || false;
//     } catch (error) {
//       console.error('❌ Erro ao verificar arquivo:', error);
//       return false;
//     }
//   }

//   // Método para obter metadados do arquivo
//   async getFileMetadata(bucket: BucketType, path: string) {
//     try {
//       const { data, error } = await this.supabase.storage
//         .from(bucket)
//         .list(path.split('/').slice(0, -1).join('/'));

//       if (error) {
//         throw error;
//       }

//       const fileName = path.split('/').pop();
//       return data?.find(item => item.name === fileName);
//     } catch (error) {
//       console.error('❌ Erro ao obter metadados:', error);
//       return null;
//     }
//   }
// }
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
// supabase.service.ts
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

type BucketType = 'task-images' | 'task-audio' | 'task-videos';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private supabase: SupabaseClient;
  private supabasePublic: SupabaseClient;

  private readonly BUCKETS = {
    'task-images': 'task-images',
    'task-audio': 'task-audio', 
    'task-videos': 'task-videos'
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

  async uploadFile(
    bucket: BucketType,
    path: string,
    fileBuffer: Buffer,
    options?: {
      contentType?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<{ id: string; path: string; fullPath: string }> {
    try {
      this.logger.log(`📤 Uploading file to ${bucket}/${path}`);

      // Verificar tamanho do arquivo (limite de 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (fileBuffer.length > maxSize) {
        throw new BadRequestException(`Arquivo muito grande. Tamanho máximo: 50MB`);
      }

      // 1. UPLOAD
      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from(bucket)
        .upload(path, fileBuffer, {
          contentType: options?.contentType || 'application/octet-stream',
          upsert: true,
          duplex: 'half',
        });

      if (uploadError) {
        this.logger.error('❌ UPLOAD ERROR:', uploadError);
        throw new BadRequestException(`Upload falhou: ${uploadError.message}`);
      }

      this.logger.log('✅ Upload realizado com sucesso');

      // 2. GERAR URL PÚBLICA
      const { data: publicUrlData } = this.supabasePublic.storage
        .from(bucket)
        .getPublicUrl(path);

      if (!publicUrlData?.publicUrl) {
        throw new BadRequestException('Falha ao gerar URL pública');
      }

      this.logger.log('🔗 URL pública gerada');

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

  async ensureBucketsExist(): Promise<void> {
    const requiredBuckets: BucketType[] = ['task-images', 'task-audio', 'task-videos'];
    
    try {
      const { data: buckets, error } = await this.supabase.storage.listBuckets();

      if (error) {
        this.logger.error('❌ Erro ao listar buckets:', error);
        return;
      }

      const existingBuckets = buckets?.map(b => b.name) || [];

      for (const bucketName of requiredBuckets) {
        if (!existingBuckets.includes(bucketName)) {
          this.logger.log(`🛠️ Tentando criar bucket: ${bucketName}`);
          
          try {
            // Configurações mais simples para evitar erro 413
            const { error: createError } = await this.supabase.storage.createBucket(bucketName, {
              public: true,
              fileSizeLimit: 52428800, // 50MB - mais conservador
            });

            if (createError) {
              // Se der erro 413, tentar com configuração mínima
              if (createError.message.includes('413') || createError.message.includes('exceeded')) {
                this.logger.warn(`Erro 413 ao criar ${bucketName}, tentando configuração mínima...`);
                
                const { error: retryError } = await this.supabase.storage.createBucket(bucketName, {
                  public: true,
                });

                if (retryError) {
                  this.logger.error(`❌ Falha ao criar ${bucketName} mesmo com configuração mínima:`, retryError);
                } else {
                  this.logger.log(`✅ Bucket ${bucketName} criado com configuração mínima`);
                }
              } else {
                this.logger.error(`❌ Erro ao criar ${bucketName}:`, createError);
              }
            } else {
              this.logger.log(`✅ Bucket ${bucketName} criado com sucesso`);
            }
          } catch (bucketError) {
            this.logger.error(`❌ Exceção ao criar ${bucketName}:`, bucketError);
          }
        } else {
          this.logger.log(`✅ Bucket já existe: ${bucketName}`);
        }
      }
    } catch (error) {
      this.logger.error('❌ Erro ao verificar buckets:', error);
    }
  }

  private getAllowedMimeTypes(bucket: BucketType): string[] {
    switch (bucket) {
      case 'task-images':
        return ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      case 'task-audio':
        return ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'];
      case 'task-videos':
        return ['video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/quicktime'];
      default:
        return [];
    }
  }

  extractPathFromUrl(url: string): { path: string; bucket: BucketType } {
    try {
      const cleanUrl = url.split('?')[0];
      const bucketMatch = cleanUrl.match(/\/(task-images|task-audios|task-videos)\//);
      
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