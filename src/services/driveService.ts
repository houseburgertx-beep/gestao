import { auth } from "@/lib/firebase";

const DRIVE_WORKER_URL = "https://house190-email-notifications.house-folgas-notifications.workers.dev";
export const MAX_DRIVE_FILE_SIZE = 8 * 1024 * 1024;

export type DriveCategory = "documents" | "employee_photos" | "payment_proofs" | "task_attachments";

export type StoredDriveFile = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

function cleanFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|#%{}]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 70);
}

export function nameFileForDrive(file: File, context: string): File {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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
  if (file.size > MAX_DRIVE_FILE_SIZE) throw new Error("O arquivo deve ter no máximo 8 MB.");
  const response = await authenticatedPost("/files/upload", {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    base64: arrayBufferToBase64(await file.arrayBuffer()),
    category,
  });
  const result = (await response.json().catch(() => null)) as (StoredDriveFile & { error?: string }) | null;
  if (!response.ok || !result?.fileId) throw new Error(result?.error || "Não foi possível salvar o arquivo no Drive.");
  return result;
}

export async function downloadFileFromDrive(fileId: string, suggestedName: string): Promise<void> {
  const response = await authenticatedPost("/files/download", { fileId });
  if (!response.ok) throw new Error("Não foi possível baixar o arquivo do Drive.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName || "arquivo";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
