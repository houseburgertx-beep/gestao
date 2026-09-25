import { auth } from "@/lib/firebase";

const DRIVE_WORKER_URL = "https://house190-email-notifications.house-folgas-notifications.workers.dev";
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

export async function compressImageFile(
  file: File,
  maxDimension = 1400,
  quality = 0.72
): Promise<{ file: File; dataUrl: string; size: number }> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !file.type ||
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif"
  ) {
    return { file, dataUrl: "", size: file.size };
  }

  return new Promise((resolve) => {
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (!width || !height) {
          resolve({ file, dataUrl: "", size: file.size });
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
          resolve({ file, dataUrl: "", size: file.size });
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
              resolve({ file, dataUrl, size: file.size });
              return;
            }
            const baseName = file.name.replace(/\.[^/.]+$/, "");
            const compressedFile = new File([blob], `${baseName}.jpg`, {
              type: outMime,
              lastModified: Date.now(),
            });
            try {
              Object.defineProperty(compressedFile, "__preCompressed", { value: true, writable: false });
            } catch {
              // ignore
            }
            resolve({ file: compressedFile, dataUrl, size: blob.size });
          },
          outMime,
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ file, dataUrl: "", size: file.size });
      };

      img.src = objectUrl;
    } catch {
      resolve({ file, dataUrl: "", size: file.size });
    }
  });
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
  const fileName = cleanContext ? `${date} - ${cleanContext} - ${originalName}` : `${date} - ${originalName}`;
  return new File([file], fileName.slice(0, 180), {
    type: file.type,
    lastModified: file.lastModified,
  });
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

async function authenticatedPost(path: string, body: object): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login novamente para acessar o Google Drive.");
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  try {
    return await fetch(`${DRIVE_WORKER_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function uploadFileToDrive(file: File, category: DriveCategory): Promise<StoredDriveFile> {
  let fileToUpload = file;
  let clientDataUrl = "";

  // Auto-compress large images client-side before sending to Drive worker (skip if already compressed)
  const isPreCompressed = Boolean((file as any).__preCompressed);
  if (!isPreCompressed && file.type && file.type.startsWith("image/") && file.size > 400 * 1024) {
    try {
      const compressed = await compressImageFile(file, 1400, 0.72);
      fileToUpload = compressed.file;
      clientDataUrl = compressed.dataUrl;
    } catch {
      fileToUpload = file;
    }
  }

  if (fileToUpload.size > MAX_DRIVE_FILE_SIZE) throw new Error("O arquivo deve ter no máximo 8 MB.");
  const base64 = await fileToBase64(fileToUpload);
  const response = await authenticatedPost("/files/upload", {
    fileName: fileToUpload.name,
    mimeType: fileToUpload.type || "application/octet-stream",
    base64,
    category,
  });
  const result = (await response.json().catch(() => null)) as (StoredDriveFile & { error?: string; message?: string }) | null;
  if (!response.ok || !result?.fileId) throw new Error(result?.message || "Não foi possível salvar o arquivo no Google Drive.");
  return {
    ...result,
    dataUrl: clientDataUrl || undefined,
  };
}

export async function createThumbnailDataUrl(
  file: File | Blob,
  maxDimension = 260,
  quality = 0.65
): Promise<string> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !file.type ||
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif"
  ) {
    return "";
  }

  return new Promise((resolve) => {
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (!width || !height) {
          resolve("");
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
          resolve("");
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve("");
      };
      img.src = objectUrl;
    } catch {
      resolve("");
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
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await authenticatedPost("/files/download", { fileId });
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
