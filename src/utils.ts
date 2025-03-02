import { GemMetadata } from './types';

// Authentication utilities
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const calculatedHash = await hashPassword(password);
  return calculatedHash === hash;
}

// Gem utilities
export function parseGemSpec(gemspecContent: string): Partial<GemMetadata> {
  // This is a simplified parser for demonstration
  // In a real implementation, you'd need a more robust parser
  const metadata: Partial<GemMetadata> = {
    authors: [],
    requirements: [],
  };

  const nameMatch = gemspecContent.match(/\.name\s*=\s*['"](.+)['"]/);
  if (nameMatch) metadata.name = nameMatch[1];

  const versionMatch = gemspecContent.match(/\.version\s*=\s*['"](.+)['"]/);
  if (versionMatch) metadata.version = versionMatch[1];

  const summaryMatch = gemspecContent.match(/\.summary\s*=\s*['"](.+)['"]/);
  if (summaryMatch) metadata.summary = summaryMatch[1];

  const descriptionMatch = gemspecContent.match(/\.description\s*=\s*['"](.+)['"]/);
  if (descriptionMatch) metadata.info = descriptionMatch[1];

  return metadata;
}

export async function extractGemMetadata(gemFile: ArrayBuffer): Promise<GemMetadata> {
  // In a real implementation, you would extract metadata from the .gem file
  // This is a placeholder that would need to be replaced with actual gem parsing logic
  
  // Calculate SHA256 hash of the gem file
  const hash = await crypto.subtle.digest('SHA-256', gemFile);
  const sha = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return {
    name: "unknown",
    version: "0.0.0",
    platform: "ruby",
    authors: [],
    info: "",
    summary: "",
    requirements: [],
    sha,
    createdAt: new Date().toISOString(),
    downloads: 0
  };
}

// KV utilities
export async function getAllGems(kv: KVNamespace): Promise<GemMetadata[]> {
  const list = await kv.list({ prefix: 'gem:' });
  const gems: GemMetadata[] = [];
  
  for (const key of list.keys) {
    const gemData = await kv.get(key.name, 'json') as GemMetadata;
    if (gemData) {
      gems.push(gemData);
    }
  }
  
  return gems;
}

export async function getGem(kv: KVNamespace, name: string): Promise<GemMetadata | null> {
  // This gets the latest version of a gem
  const list = await kv.list({ prefix: `gem:${name}:` });
  if (list.keys.length === 0) return null;
  
  // Sort by version (this is a simplistic approach)
  list.keys.sort((a, b) => b.name.localeCompare(a.name));
  
  // Get the latest version
  const gemData = await kv.get(list.keys[0].name, 'json') as GemMetadata;
  return gemData || null;
}

export async function getGemVersion(kv: KVNamespace, name: string, version: string): Promise<GemMetadata | null> {
  const key = `gem:${name}:${version}`;
  const gemData = await kv.get(key, 'json') as GemMetadata;
  return gemData || null;
}

export async function saveGem(kv: KVNamespace, metadata: GemMetadata): Promise<void> {
  const key = `gem:${metadata.name}:${metadata.version}`;
  await kv.put(key, JSON.stringify(metadata));
}

export async function incrementDownloads(kv: KVNamespace, name: string, version: string): Promise<void> {
  const key = `gem:${name}:${version}`;
  const gemData = await kv.get(key, 'json') as GemMetadata;
  
  if (gemData) {
    gemData.downloads = (gemData.downloads || 0) + 1;
    await kv.put(key, JSON.stringify(gemData));
  }
}
