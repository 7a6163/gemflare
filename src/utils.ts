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

// TAR file format constants
const TAR_BLOCK_SIZE = 512;
const TAR_TYPE_FILE = '0';
const TAR_TYPE_NORMAL_FILE = '\0';

// TAR header structure
interface TarHeader {
  fileName: string;
  fileSize: number;
  fileType: string;
  content?: Uint8Array;
}

/**
 * Parse a TAR file header block
 */
function parseTarHeader(block: Uint8Array): TarHeader | null {
  // Check for empty block (end of archive)
  if (block.every(byte => byte === 0)) {
    return null;
  }

  // Extract filename (100 bytes)
  const fileNameBytes = block.slice(0, 100);
  let fileNameLength = 0;
  while (fileNameLength < 100 && fileNameBytes[fileNameLength] !== 0) {
    fileNameLength++;
  }
  const fileName = new TextDecoder().decode(fileNameBytes.slice(0, fileNameLength));

  // Extract file size (12 bytes, octal string)
  const fileSizeBytes = block.slice(124, 136);
  let fileSizeStr = '';
  for (let i = 0; i < 12; i++) {
    if (fileSizeBytes[i] === 0 || fileSizeBytes[i] === 32) break; // Stop at NUL or space
    fileSizeStr += String.fromCharCode(fileSizeBytes[i]);
  }
  const fileSize = parseInt(fileSizeStr, 8);

  // Extract file type (1 byte at offset 156)
  const fileType = String.fromCharCode(block[156]);

  return { fileName, fileSize, fileType };
}

/**
 * Extract files from a TAR archive
 */
function extractTarFiles(data: Uint8Array): TarHeader[] {
  const files: TarHeader[] = [];
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= data.length) {
    const headerBlock = data.slice(offset, offset + TAR_BLOCK_SIZE);
    const header = parseTarHeader(headerBlock);

    if (!header) {
      break; // End of archive
    }

    offset += TAR_BLOCK_SIZE;

    if (header.fileSize > 0 && (header.fileType === TAR_TYPE_FILE || header.fileType === TAR_TYPE_NORMAL_FILE)) {
      // Extract file content
      const contentBlocks = Math.ceil(header.fileSize / TAR_BLOCK_SIZE);
      const contentSize = header.fileSize;
      const content = data.slice(offset, offset + contentSize);

      files.push({
        ...header,
        content
      });

      offset += contentBlocks * TAR_BLOCK_SIZE;
    }
  }

  return files;
}

/**
 * Extract metadata from a gunzipped gem file
 */
async function extractMetadataFromGunzippedGem(data: Uint8Array): Promise<Partial<GemMetadata> | null> {
  try {
    // Extract files from the tar archive
    const files = extractTarFiles(data);
    console.log(`Extracted ${files.length} files from tar archive`);

    // Look for metadata.gz file
    const metadataFile = files.find(file => file.fileName.includes('metadata.gz'));
    if (metadataFile && metadataFile.content) {
      console.log('Found metadata.gz file, attempting to decompress');

      // Try to decompress the metadata.gz file
      return await decompressAndParseMetadataGz(metadataFile.content);
    }

    // Look for .gemspec file
    const gemspecFile = files.find(file => file.fileName.endsWith('.gemspec'));
    if (gemspecFile && gemspecFile.content) {
      console.log(`Found gemspec file: ${gemspecFile.fileName}`);
      return parseGemspec(gemspecFile.content);
    }

    // Look for metadata file
    const metadataYamlFile = files.find(file => file.fileName.includes('metadata') && !file.fileName.endsWith('.gz'));
    if (metadataYamlFile && metadataYamlFile.content) {
      console.log(`Found metadata file: ${metadataYamlFile.fileName}`);
      // Parse YAML metadata (simplified)
      const text = new TextDecoder().decode(metadataYamlFile.content);
      return parseMetadataYaml(text);
    }

    return null;
  } catch (error) {
    console.error('Error parsing gunzipped gem:', error);
    return null;
  }
}

/**
 * Decompress and parse metadata.gz file
 */
async function decompressAndParseMetadataGz(compressedData: Uint8Array): Promise<Partial<GemMetadata> | null> {
  try {
    // Check for gzip magic number
    if (compressedData[0] !== 0x1F || compressedData[1] !== 0x8B) {
      console.log('metadata.gz does not have gzip magic number');
      return null;
    }

    console.log('Decompressing metadata.gz using DecompressionStream');

    // Use DecompressionStream to decompress the data
    const ds = new DecompressionStream('gzip');
    const blob = new Blob([compressedData]);
    const decompressedStream = blob.stream().pipeThrough(ds);
    const decompressedResponse = new Response(decompressedStream);
    const decompressedData = await decompressedResponse.arrayBuffer();

    console.log('Successfully decompressed metadata.gz, size:', decompressedData.byteLength);

    // Convert to text and parse as YAML
    const text = new TextDecoder().decode(decompressedData);
    console.log('Metadata content (first 200 chars):', text.substring(0, 200));

    return parseMetadataYaml(text);
  } catch (error) {
    console.error('Error decompressing metadata.gz:', error);
    return null;
  }
}

/**
 * Parse metadata YAML content
 */
function parseMetadataYaml(yamlText: string): Partial<GemMetadata> {
  console.log('Parsing metadata YAML');

  const metadata: Partial<GemMetadata> = {
    name: "unknown",
    version: "0.0.0",
    platform: "ruby",
    authors: ["Unknown"],
    info: "",
    summary: "",
    requirements: []
  };

  try {
    // Extract name
    const nameMatch = yamlText.match(/^name: (.+)$/m);
    if (nameMatch) {
      metadata.name = nameMatch[1].trim();
      console.log('Extracted name from metadata:', metadata.name);
    }

    // Extract version - handle Ruby object format
    const versionMatch = yamlText.match(/version:.*?version: ([0-9.]+)/s);
    if (versionMatch) {
      metadata.version = versionMatch[1].trim();
      console.log('Extracted version from metadata:', metadata.version);
    } else {
      // Try simple version format
      const simpleVersionMatch = yamlText.match(/^version: (.+)$/m);
      if (simpleVersionMatch) {
        metadata.version = simpleVersionMatch[1].trim();
        // Clean up Ruby object notation if present
        if (metadata.version.includes('!ruby/object')) {
          const versionNumberMatch = metadata.version.match(/([0-9.]+)/);
          if (versionNumberMatch) {
            metadata.version = versionNumberMatch[1];
          }
        }
        console.log('Extracted version from metadata:', metadata.version);
      }
    }

    // Extract platform
    const platformMatch = yamlText.match(/^platform: (.+)$/m);
    if (platformMatch) {
      metadata.platform = platformMatch[1].trim();
    }

    // Extract authors
    const authorsSection = yamlText.match(/^authors:$([\s\S]*?)^[a-z]+:/m);
    if (authorsSection) {
      const authorLines = authorsSection[1].match(/- (.+)$/gm);
      if (authorLines) {
        metadata.authors = authorLines.map(line => line.replace(/^- /, '').trim());
        console.log('Extracted authors from metadata:', metadata.authors);
      }
    }

    // Extract summary
    const summaryMatch = yamlText.match(/^summary: (.+)$/m);
    if (summaryMatch) {
      metadata.summary = summaryMatch[1].trim();
      console.log('Extracted summary from metadata:', metadata.summary);
    }

    // Extract description/info
    const descriptionMatch = yamlText.match(/^description: (.+)$/m);
    if (descriptionMatch) {
      metadata.info = descriptionMatch[1].trim();
    } else {
      // Try multiline description
      const descriptionSection = yamlText.match(/^description: \|-$([\s\S]*?)^[a-z]+:/m);
      if (descriptionSection) {
        metadata.info = descriptionSection[1].trim();
      }
    }

    // Extract requirements - parse dependencies section
    try {
      const dependenciesSection = yamlText.match(/^dependencies:$([\s\S]*?)^[a-z]+:/m);
      if (dependenciesSection) {
        // Find all dependency blocks
        const depBlocks = dependenciesSection[1].split('!ruby/object:Gem::Dependency');

        // Skip the first empty element
        const dependencies = [];

        for (let i = 1; i < depBlocks.length; i++) {
          const block = depBlocks[i];

          // Extract dependency name
          const nameMatch = block.match(/name: ([^\n]+)/);
          const name = nameMatch ? nameMatch[1].trim() : 'unknown';

          // Extract requirement operator and version
          const reqMatch = block.match(/requirement:.*?- ["']([<>=~]+)["']/s);
          const operator = reqMatch ? reqMatch[1] : '=';

          const versionMatch = block.match(/version: ([0-9.]+)/);
          const version = versionMatch ? versionMatch[1] : '0.0.0';

          dependencies.push(`${name} (${operator} ${version})`);
        }

        metadata.requirements = dependencies;
        console.log('Extracted dependencies from metadata:', dependencies);
      }
    } catch (error) {
      console.error('Error parsing dependencies:', error);
    }

    return metadata;
  } catch (error) {
    console.error('Error parsing metadata YAML:', error);
    return metadata;
  }
}

/**
 * Extract gem metadata from a gemspec file content
 */
function parseGemspec(content: Uint8Array): Partial<GemMetadata> {
  const text = new TextDecoder().decode(content);
  const metadata: Partial<GemMetadata> = {
    name: "unknown",
    version: "0.0.0",
    platform: "ruby",
    authors: ["Unknown"],
    info: "",
    summary: "",
    requirements: []
  };

  // Extract name
  const nameMatch = text.match(/\.name\s*=\s*['"]([^'"]+)['"]/);
  if (nameMatch) {
    metadata.name = nameMatch[1];
  }

  // Extract version
  const versionMatch = text.match(/\.version\s*=\s*['"]([^'"]+)['"]/);
  if (versionMatch) {
    metadata.version = versionMatch[1];
  }

  // Extract summary
  const summaryMatch = text.match(/\.summary\s*=\s*['"]([^'"]+)['"]/);
  if (summaryMatch) {
    metadata.summary = summaryMatch[1];
  }

  // Extract description/info
  const descriptionMatch = text.match(/\.description\s*=\s*['"]([^'"]+)['"]/);
  if (descriptionMatch) {
    metadata.info = descriptionMatch[1];
  }

  // Extract authors (simplified)
  const authorsMatch = text.match(/\.authors\s*=\s*\[(.*?)\]/s);
  if (authorsMatch) {
    const authorsText = authorsMatch[1];
    const authorsList = authorsText.match(/['"]([^'"]+)['"]/g);
    if (authorsList) {
      metadata.authors = authorsList.map(author => author.replace(/['"]/g, ''));
    }
  }

  return metadata;
}

/**
 * Identify file format based on magic numbers
 */
function identifyFileFormat(data: Uint8Array): string {
  // Check file signatures (magic numbers)
  if (data.length < 4) return 'Unknown (too small)';

  // Log the first few bytes for debugging
  const firstBytes = Array.from(data.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
  console.log('First 16 bytes of file:', firstBytes);

  // GZIP: 1F 8B
  if (data[0] === 0x1F && data[1] === 0x8B) {
    return 'gzip';
  }

  // ZIP: 50 4B 03 04
  if (data[0] === 0x50 && data[1] === 0x4B && data[2] === 0x03 && data[3] === 0x04) {
    return 'zip';
  }

  // TAR: 'ustar' at offset 257
  if (data.length > 262) {
    const ustarCheck = new TextDecoder().decode(data.slice(257, 262));
    if (ustarCheck === 'ustar') {
      return 'tar';
    }
  }

  // Check for YAML or JSON
  const textCheck = new TextDecoder().decode(data.slice(0, Math.min(100, data.length)));
  if (textCheck.trim().startsWith('{') || textCheck.trim().startsWith('[')) {
    return 'json';
  }
  if (textCheck.includes('---') || textCheck.includes('name:') || textCheck.includes('version:')) {
    return 'yaml';
  }

  return 'Unknown';
}

/**
 * Gunzip a gzipped buffer
 * Note: This is a simplified implementation that works for small files
 * A production implementation should use a proper gunzip library
 */
async function gunzipBuffer(buffer: ArrayBuffer): Promise<Uint8Array | null> {
  try {
    // Check for gzip magic number (0x1F, 0x8B)
    const data = new Uint8Array(buffer);
    if (data[0] !== 0x1F || data[1] !== 0x8B) {
      console.log('Not a gzip file');
      return null;
    }

    // For Cloudflare Workers, we can use the DecompressionStream API
    const ds = new DecompressionStream('gzip');
    const decompressedStream = new Response(buffer).body!.pipeThrough(ds);
    const decompressedResponse = new Response(decompressedStream);
    return new Uint8Array(await decompressedResponse.arrayBuffer());
  } catch (error) {
    console.error('Error gunzipping buffer:', error);
    return null;
  }
}

export async function extractGemMetadata(gemFile: ArrayBuffer, fileName?: string): Promise<GemMetadata> {
  // Calculate SHA256 hash of the gem file
  const hash = await crypto.subtle.digest('SHA-256', gemFile);
  const sha = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  try {
    // First, try to identify the file format
    const fileData = new Uint8Array(gemFile);
    const fileFormat = identifyFileFormat(fileData);
    console.log(`Identified file format: ${fileFormat}`);

    // First, try to extract from the actual gem file contents
    console.log('Attempting to extract metadata from gem file contents');

    // Ruby gems are gzipped tar files
    if (fileFormat === 'gzip') {
      try {
        console.log('Attempting to decompress gzip file using DecompressionStream');
        // Try using DecompressionStream API (available in modern browsers and Cloudflare Workers)
        const ds = new DecompressionStream('gzip');
        const decompressedStream = new Response(gemFile).body!.pipeThrough(ds);
        const decompressedResponse = new Response(decompressedStream);
        const gunzippedData = new Uint8Array(await decompressedResponse.arrayBuffer());

        console.log('Successfully gunzipped gem file, size:', gunzippedData.length);
        console.log('First 16 bytes of gunzipped data:', Array.from(gunzippedData.slice(0, 16))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' '));

        const metadata = await extractMetadataFromGunzippedGem(gunzippedData);

        if (metadata && metadata.name !== 'unknown') {
          console.log('Successfully extracted metadata from gem contents:', metadata);
          return {
            ...metadata,
            sha,
            createdAt: new Date().toISOString(),
            downloads: 0
          } as GemMetadata;
        }
      } catch (error) {
        console.error('Error decompressing gzip file:', error);
      }
    } else if (fileFormat === 'tar') {
      // Try to extract directly from tar
      console.log('File appears to be an uncompressed tar file');
      const metadata = await extractMetadataFromGunzippedGem(fileData);

      if (metadata && metadata.name !== 'unknown') {
        console.log('Successfully extracted metadata from tar contents:', metadata);
        return {
          ...metadata,
          sha,
          createdAt: new Date().toISOString(),
          downloads: 0
        } as GemMetadata;
      }
    }

    // If we couldn't extract from the gem contents, try from the provided filename
    if (fileName) {
      console.log('Trying to extract metadata from filename:', fileName);
      const filenamePattern = /([a-zA-Z0-9_-]+)-([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)\.gem/;
      const filenameMatch = fileName.match(filenamePattern);

      if (filenameMatch) {
        const [_, name, version] = filenameMatch;
        console.log(`Extracted gem info from provided filename: ${name} ${version}`);

        return {
          name,
          version,
          platform: "ruby",
          authors: ["Unknown"],
          info: "Extracted from filename",
          summary: "Gem uploaded via GemFlare",
          requirements: [],
          sha,
          createdAt: new Date().toISOString(),
          downloads: 0
        };
      }
    }

    // Try to extract the gem name and version from the filename pattern in the gem file
    // This is a simplified approach and might not work for all gems

    // Look for .gemspec file in the tar header
    const gemspecPattern = /([a-zA-Z0-9_-]+)-([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)\.gemspec/;
    const decoder = new TextDecoder();

    // Convert the first 10KB to a string to search for the gemspec filename
    const headerText = decoder.decode(fileData.slice(0, 10240));
    const gemspecMatch = headerText.match(gemspecPattern);

    if (gemspecMatch) {
      const [_, name, version] = gemspecMatch;

      console.log(`Extracted gem info from gemspec: ${name} ${version}`);

      return {
        name,
        version,
        platform: "ruby",
        authors: ["Unknown"],
        info: "Extracted from gem file",
        summary: "Gem uploaded via GemFlare",
        requirements: [],
        sha,
        createdAt: new Date().toISOString(),
        downloads: 0
      };
    }

    // If we couldn't find a gemspec, try to extract from the filename in the gem file
    const filenamePattern = /([a-zA-Z0-9_-]+)-([0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?)\.gem/;
    const filenameMatch = headerText.match(filenamePattern);

    if (filenameMatch) {
      const [_, name, version] = filenameMatch;

      console.log(`Extracted gem info from filename in gem file: ${name} ${version}`);

      return {
        name,
        version,
        platform: "ruby",
        authors: ["Unknown"],
        info: "Extracted from gem filename",
        summary: "Gem uploaded via GemFlare",
        requirements: [],
        sha,
        createdAt: new Date().toISOString(),
        downloads: 0
      };
    }

    console.log("Could not extract gem info, using default values");
  } catch (error) {
    console.error("Error extracting gem metadata:", error);
  }

  // Fallback to default values if extraction fails
  return {
    name: "unknown",
    version: "0.0.0",
    platform: "ruby",
    authors: ["Unknown"],
    info: "Could not extract metadata",
    summary: "Gem uploaded via GemFlare",
    requirements: [],
    sha,
    createdAt: new Date().toISOString(),
    downloads: 0
  };
}

// KV utilities
export async function getAllGems(kv: KVNamespace): Promise<GemMetadata[]> {
  console.log('Getting all gems from KV');
  const list = await kv.list({ prefix: 'gem:' });
  console.log('KV list result:', list);

  const gems: GemMetadata[] = [];

  for (const key of list.keys) {
    console.log('Fetching gem data for key:', key.name);
    const gemData = await kv.get(key.name, 'json') as GemMetadata;
    if (gemData) {
      console.log('Gem data for key:', key.name, 'found');
      gems.push(gemData);
    } else {
      console.log('No gem data found for key:', key.name);
    }
  }

  // Sort gems by name and version
  gems.sort((a, b) => {
    if (a.name === b.name) {
      // Sort versions in descending order (newest first)
      return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
    }
    return a.name.localeCompare(b.name);
  });

  return gems;
}

export async function getGem(kv: KVNamespace, name: string): Promise<GemMetadata | null> {
  // This gets the latest version of a gem
  const list = await kv.list({ prefix: `gem:${name}:` });
  if (list.keys.length === 0) return null;

  // Get all versions of this gem
  const versions: GemMetadata[] = [];
  for (const key of list.keys) {
    const gemData = await kv.get(key.name, 'json') as GemMetadata;
    if (gemData) {
      versions.push(gemData);
    }
  }

  if (versions.length === 0) return null;

  // Sort by version (newest first)
  versions.sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' })
  );

  // Return the latest version
  return versions[0];
}

export async function getGemVersion(kv: KVNamespace, name: string, version: string): Promise<GemMetadata | null> {
  const key = `gem:${name}:${version}`;
  const gemData = await kv.get(key, 'json') as GemMetadata;
  return gemData || null;
}

export async function saveGem(kv: KVNamespace, metadata: GemMetadata): Promise<void> {
  const key = `gem:${metadata.name}:${metadata.version}`;
  console.log('Saving gem metadata to KV with key:', key);
  console.log('Metadata:', metadata);

  try {
    await kv.put(key, JSON.stringify(metadata));
    console.log('Gem metadata saved successfully');
  } catch (error) {
    console.error('Error saving gem metadata to KV:', error);
    throw error;
  }
}

export async function incrementDownloads(kv: KVNamespace, name: string, version: string): Promise<void> {
  const key = `gem:${name}:${version}`;
  const gemData = await kv.get(key, 'json') as GemMetadata;

  if (gemData) {
    gemData.downloads = (gemData.downloads || 0) + 1;
    await kv.put(key, JSON.stringify(gemData));
  }
}
