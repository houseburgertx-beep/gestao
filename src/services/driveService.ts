import { auth } from "@/lib/firebase";
import { HOUSE190_WORKER_URL } from "@/config/worker";

const DRIVE_WORKER_URL = HOUSE190_WORKER_URL;
export const MAX_DRIVE_FILE_SIZE = 8 * 1024 * 1024;

export type DriveCategory = "documents" | "employee_photos" | "payment_proofs" | "task_attachments";

export type StoredDriveFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  uploadedAt?: string;
};

const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|bmp|heic|heif|avif)$/i;

export function isImageFile(file: File | Blob): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/svg+xml" || type === "image/gif") return false;
  if (type.startsWith("image/")) return true;
  if ("name" in file && typeof file.name === "string") {
    return IMAGE_EXT_REGEX.test(file.name);
  }
  return false;
}

function inferMimeType(file: File | Blob): string {
  const raw = (file.type || "").trim();
  if (raw.length >= 3) return raw.slice(0, 120);
  const name = "name" in file && typeof file.name === "string" ? file.name.toLowerCase() : "";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function markPreCompressed(file: File): File {
  try {
    Object.defineProperty(file, "__preCompressed", { value: true, writable: false });
  } catch {
    // ignore
  }
  return file;
}

export function isPreCompressedFile(file: File): boolean {
  return Boolean((file as unknown as { __preCompressed?: boolean }).__preCompressed);
}

async function compressImagePass(
  file: File,
  maxDimension: number,
  quality: number
): Promise<{ file: File; dataUrl: string; size: number }> {
  return new Promise((resolve) => {
    let settled = false;
    let objectUrl = "";
    const finish = (result: { file: File; dataUrl: string; size: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
      resolve(result);
    };

    const safetyTimer = setTimeout(() => {
      finish({ file, dataUrl: "", size: file.size });
    }, 15000);

    try {
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (!width || !height) {
          finish({ file, dataUrl: "", size: file.size });
          return;
        }
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish({ file, dataUrl: "", size: file.size });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const outMime = "image/jpeg";
        const dataUrl = canvas.toDataURL(outMime, quality);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              finish({ file, dataUrl, size: file.size });
              return;
            }
            const baseName = (file.name || "foto").replace(/\.[^/.]+$/, "");
            const compressedFile = markPreCompressed(
              new File([blob], `${baseName}.jpg`, {
                type: outMime,
                lastModified: Date.now(),
              })
            );
            finish({ file: compressedFile, dataUrl, size: blob.size });
          },
          outMime,
          quality
        );
      };

      img.onerror = () => {
        finish({ file, dataUrl: "", size: file.size });
      };

      img.src = objectUrl;
    } catch {
      finish({ file, dataUrl: "", size: file.size });
    }
  });
}

export async function compressImageFile(
  file: File,
  maxDimension = 1400,
  quality = 0.72
): Promise<{ file: File; dataUrl: string; size: number }> {
  if (typeof window === "undefined" || typeof document === "undefined" || !isImageFile(file)) {
    return { file, dataUrl: "", size: file.size };
  }

  const first = await compressImagePass(file, maxDimension, quality);
  if (first.size > MAX_DRIVE_FILE_SIZE) {
    return compressImagePass(file, Math.min(maxDimension, 1100), Math.min(quality, 0.58));
  }
  return first;
}

function cleanFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|#%{}]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 70);
}

export function nameFileForDrive(file: File, context: string): File {
  const dateParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type: "year" | "month" | "day") => dateParts.find((part) => part.type === type)?.value || "00";
  const date = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
  const originalName = cleanFilePart(file.name) || "arquivo";
  const cleanContext = cleanFilePart(context);
  const fileName = (cleanContext ? `${date} - ${cleanContext} - ${originalName}` : `${date} - ${originalName}`).slice(0, 180);
  const named = new File([file], fileName, {
    type: inferMimeType(file),
    lastModified: file.lastModified || Date.now(),
  });
  return isPreCompressedFile(file) ? markPreCompressed(named) : named;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 16384;
  const len = bytes.length;
  for (let offset = 0; offset < len; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

async function fileToBase64(file: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const comma = dataUrl.indexOf(",");
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      };
      reader.onerror = () => reject(reader.error || new Error("Erro ao ler arquivo"));
      reader.readAsDataURL(file);
    });
  }
  return arrayBufferToBase64(await file.arrayBuffer());
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIdx = 0;
  const count = items.length;
  const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (nextIdx < count) {
      const idx = nextIdx++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function authenticatedPost(
  path: string,
  body: object,
  options?: { forceRefreshToken?: boolean; timeoutMs?: number }
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login novamente para acessar o Google Drive.");
  const token = await user.getIdToken(Boolean(options?.forceRefreshToken));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 60000);
  try {
    return await fetch(`${DRIVE_WORKER_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Tempo esgotado ao conectar ao Google Drive. Verifique sua internet e tente novamente.");
    }
    throw new Error("Sem conexão com o servidor do Google Drive. Verifique sua internet e tente novamente.");
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapUploadErrorMessage(status: number, result: { error?: string; message?: string } | null): string {
  if (result?.message) return result.message;
  const code = result?.error || "";
  if (status === 401 || code === "unauthorized") {
    return "Sua sessão expirou. Atualize a página ou faça login novamente.";
  }
  if (status === 413 || code === "file_too_large" || code === "payload_too_large") {
    return "O arquivo ultrapassa o limite de 8 MB permitido no Google Drive.";
  }
  if (status === 400 || code === "invalid_payload" || code === "invalid_file") {
    return "Formato ou tamanho de arquivo inválido para envio ao Google Drive.";
  }
  if (status === 403 || code === "origin_not_allowed") {
    return "Acesso bloqueado pelo servidor de arquivos (origem não autorizada).";
  }
  return `Não foi possível salvar o arquivo no Google Drive (HTTP ${status}).`;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function uploadFileToDrive(file: File, category: DriveCategory): Promise<StoredDriveFile> {
  let fileToUpload = file;
  let clientDataUrl = "";

  // Auto-compress large images client-side before sending to Drive worker (skip if already compressed)
  const isPreCompressed = isPreCompressedFile(file);
  if (
    !isPreCompressed &&
    isImageFile(file) &&
    (file.size > 350 * 1024 || file.size > MAX_DRIVE_FILE_SIZE)
  ) {
    try {
      const compressed = await compressImageFile(file, 1400, 0.72);
      fileToUpload = compressed.file;
      clientDataUrl = compressed.dataUrl;
    } catch {
      fileToUpload = file;
    }
  }

  if (fileToUpload.size > MAX_DRIVE_FILE_SIZE) {
    throw new Error("O arquivo deve ter no máximo 8 MB.");
  }
  if (fileToUpload.size === 0) {
    throw new Error("O arquivo selecionado está vazio.");
  }

  const base64 = await fileToBase64(fileToUpload);
  const safeName = (fileToUpload.name || "arquivo").trim().slice(0, 180) || "arquivo";
  const safeMime = inferMimeType(fileToUpload);

  let lastErr: Error | null = null;
  let forceRefreshToken = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await authenticatedPost(
        "/files/upload",
        {
          fileName: safeName,
          mimeType: safeMime,
          base64,
          category,
        },
        { forceRefreshToken, timeoutMs: 60000 }
      );
      const result = (await response.json().catch(() => null)) as
        | (StoredDriveFile & { error?: string; message?: string })
        | null;

      if (response.ok && result?.fileId) {
        return {
          ...result,
          dataUrl: clientDataUrl || undefined,
        };
      }

      if (response.status === 401 && !forceRefreshToken) {
        forceRefreshToken = true;
        continue;
      }

      const err = new Error(mapUploadErrorMessage(response.status, result));
      if (!isRetryableStatus(response.status) || attempt === 2) {
        throw err;
      }
      lastErr = err;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error("Não foi possível salvar o arquivo no Google Drive.");
      const isNonRetryable =
        /no máximo 8 MB|vazio|inválido|Faça login|expir|origem não autorizada/i.test(errorObj.message);
      if (isNonRetryable || attempt === 2) {
        throw errorObj;
      }
      lastErr = errorObj;
    }
    await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 900));
  }

  throw lastErr || new Error("Não foi possível salvar o arquivo no Google Drive.");
}

export async function createThumbnailDataUrl(
  file: File | Blob,
  maxDimension = 220,
  quality = 0.58
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined" || !isImageFile(file)) {
    return "";
  }

  return new Promise((resolve) => {
    let settled = false;
    let objectUrl = "";
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(safetyTimer);
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
      resolve(value);
    };

    const safetyTimer = setTimeout(() => finish(""), 10000);

    try {
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (!width || !height) {
          finish("");
          return;
        }
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish("");
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";
        ctx.drawImage(img, 0, 0, width, height);
        finish(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => finish("");
      img.src = objectUrl;
    } catch {
      finish("");
    }
  });
}

// Global in-flight deduplication and concurrency control for Google Drive downloads
const inFlightDownloads = new Map<string, Promise<{ blob: Blob; url: string; mimeType: string }>>();
let activeDriveDownloads = 0;
const driveDownloadWaitQueue: Array<() => void> = [];

function acquireDriveDownloadSlot(): Promise<void> {
  if (activeDriveDownloads < 2) {
    activeDriveDownloads++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    driveDownloadWaitQueue.push(() => {
      activeDriveDownloads++;
      resolve();
    });
  });
}

function releaseDriveDownloadSlot(): void {
  activeDriveDownloads = Math.max(0, activeDriveDownloads - 1);
  const next = driveDownloadWaitQueue.shift();
  if (next) {
    next();
  }
}

export async function getFileBlobFromDrive(fileId: string): Promise<{ blob: Blob; url: string; mimeType: string }> {
  if (!fileId || typeof fileId !== "string") {
    throw new Error("ID do arquivo inválido.");
  }

  // Deduplicate simultaneous requests for the same fileId
  if (inFlightDownloads.has(fileId)) {
    return inFlightDownloads.get(fileId)!;
  }

  const task = (async () => {
    await acquireDriveDownloadSlot();
    try {
      let lastErr: unknown;
      let forceRefreshToken = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await authenticatedPost(
            "/files/download",
            { fileId },
            { forceRefreshToken, timeoutMs: 45000 }
          );
          if (response.status === 401 && !forceRefreshToken) {
            forceRefreshToken = true;
            continue;
          }
          if (!response.ok) {
            const errJson = await response.json().catch(() => null);
            const msg = errJson?.message || errJson?.error || `HTTP ${response.status}`;
            throw new Error(msg);
          }
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const mimeType = response.headers.get("content-type") || blob.type || "application/octet-stream";
          return { blob, url, mimeType };
        } catch (err) {
          lastErr = err;
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 800));
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || "Falha ao baixar arquivo do Drive"));
    } finally {
      releaseDriveDownloadSlot();
      inFlightDownloads.delete(fileId);
    }
  })();

  inFlightDownloads.set(fileId, task);
  return task;
}

export async function downloadFileFromDrive(fileId: string, suggestedName: string): Promise<void> {
  const { url } = await getFileBlobFromDrive(fileId);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName || "arquivo";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
