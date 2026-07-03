import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Abstração de armazenamento de arquivos. O MVP usa disco local; a mesma
 * interface pode futuramente ser implementada por S3, GCS ou Google Drive
 * sem alterar os chamadores (upload de arquivos, extração, relatórios).
 */
export interface FileStorageService {
  save(companyId: string, fileName: string, content: Buffer): Promise<StoredFile>;
  read(storedPath: string): Promise<Buffer>;
  absolutePath(storedPath: string): string;
}

export type StoredFile = {
  storedPath: string;
  sizeBytes: number;
  hash: string;
};

class LocalFileStorageService implements FileStorageService {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async save(companyId: string, fileName: string, content: Buffer): Promise<StoredFile> {
    const hash = createHash("sha256").update(content).digest("hex");
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const relativeDir = path.join(companyId, new Date().toISOString().slice(0, 10));
    const relativePath = path.join(relativeDir, `${hash.slice(0, 12)}_${safeName}`);
    const fullDir = path.join(this.rootDir, relativeDir);
    await mkdir(fullDir, { recursive: true });
    await writeFile(path.join(this.rootDir, relativePath), content);
    return { storedPath: relativePath, sizeBytes: content.length, hash };
  }

  async read(storedPath: string): Promise<Buffer> {
    return readFile(path.join(this.rootDir, storedPath));
  }

  absolutePath(storedPath: string): string {
    return path.join(this.rootDir, storedPath);
  }
}

let instance: FileStorageService | null = null;

export function getFileStorage(): FileStorageService {
  if (!instance) {
    const rootDir = path.resolve(/* turbopackIgnore: true */ process.env.FILE_STORAGE_DIR || "./storage");
    instance = new LocalFileStorageService(rootDir);
  }
  return instance;
}

export async function fileExistsInStorage(storedPath: string): Promise<boolean> {
  try {
    await stat(getFileStorage().absolutePath(storedPath));
    return true;
  } catch {
    return false;
  }
}
