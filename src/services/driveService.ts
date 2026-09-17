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
  maxDimension = 1600,
  quality = 0.75
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
  const chunkSize = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(binary);
}

async function authenticatedPost(path: string, body: object): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login novamente para acessar o Google Drive.");
  const token = await user.getIdToken();
  return fetch(`${DRIVE_WORKER_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function uploadFileToDrive(file: File, category: DriveCategory): Promise<StoredDriveFile> {
  let fileToUpload = file;
  let clientDataUrl = "";

  // Auto-compress large images client-side before sending to Drive worker
  if (file.type && file.type.startsWith("image/") && file.size > 250 * 1024) {
    try {
      const compressed = await compressImageFile(file, 1600, 0.75);
      fileToUpload = compressed.file;
      clientDataUrl = compressed.dataUrl;
    } catch {
      fileToUpload = file;
    }
  }

  if (fileToUpload.size > MAX_DRIVE_FILE_SIZE) throw new Error("O arquivo deve ter no máximo 8 MB.");
  const response = await authenticatedPost("/files/upload", {
    fileName: fileToUpload.name,
    mimeType: fileToUpload.type || "application/octet-stream",
    base64: arrayBufferToBase64(await fileToUpload.arrayBuffer()),
    category,
  });
  const result = (await response.json().catch(() => null)) as (StoredDriveFile & { error?: string; message?: string }) | null;
  if (!response.ok || !result?.fileId) throw new Error(result?.message || "Não foi possível salvar o arquivo no Google Drive.");
  return {
    ...result,
    dataUrl: clientDataUrl || undefined,
  };
}

export async function getFileBlobFromDrive(fileId: string): Promise<{ blob: Blob; url: string; mimeType: string }> {
  const response = await authenticatedPost("/files/download", { fileId });
  if (!response.ok) throw new Error("Não foi possível carregar o arquivo do Drive.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const mimeType = response.headers.get("content-type") || blob.type || "application/octet-stream";
  return { blob, url, mimeType };
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
