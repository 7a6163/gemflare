export interface CloudflareBindings {
  GEMFLARE_KV: KVNamespace;
  GEMFLARE_BUCKET: R2Bucket;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD_HASH: string;
}

export interface GemMetadata {
  name: string;
  version: string;
  platform: string;
  authors: string[];
  info: string;
  summary: string;
  requirements: {
    name: string;
    version: string;
  }[];
  sha: string;
  createdAt: string;
  downloads: number;
}

export interface User {
  username: string;
  passwordHash: string;
  isAdmin: boolean;
}
