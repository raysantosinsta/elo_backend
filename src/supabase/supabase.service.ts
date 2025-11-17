import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL');
    if (!url) {
      throw new Error('SUPABASE_URL is not defined in environment variables');
    }
    
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'); // usar service role no server
    if(!key) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables');
    }
    this.supabase = createClient(url, key);
  }

  get client() {
    return this.supabase;
  }

  // exemplo: upload de arquivo
  async uploadFile(bucket: string, path: string, file: Buffer | Blob, options = {}) {
    const { data, error } = await this.supabase.storage.from(bucket).upload(path, file, options);
    if (error) throw error;
    return data;
  }

  // exemplo: gerar URL pública
  async getPublicUrl(bucket: string, path: string) {
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}
