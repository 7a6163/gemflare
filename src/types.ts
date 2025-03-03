export interface CloudflareBindings {
  GEMFLARE_KV: KVNamespace;
  GEMFLARE_BUCKET: R2Bucket;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
}

export interface GemDependency {
  name: string;
  requirements: string;
}

export interface GemMetadata {
  name: string;
  version: string;
  platform?: string;
  authors?: string;
  info?: string;
  created_at?: string;
  dependencies?: GemDependency[];
  sha256?: string;
  size?: number;
}

export interface User {
  username: string;
  passwordHash: string;
  isAdmin: boolean;
}
