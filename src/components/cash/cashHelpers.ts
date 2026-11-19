import { currency, RecordData, str } from "@/domain/management/model";

export const MAX_CLOSING_ATTACHMENTS = 20;
export const DRAFT_KEY = "house190_closing_draft";

export type CashAttachment = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  uploadedAt?: string;
};

export type OutflowItem = {
  id: string;
  name: string;
  amount: string;
};

export type PixRequestItem = {
  id: string;
  name: string;
  key: string;
  description: string;
  amount: string;
};

export type MachineEntry = {
  used: boolean;
  credit: string;
  debit: string;
  pix: string;
};

export const safeUUID = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

export const brl = (cents: number) => currency(Math.round(cents));

export const toMoneyCents = (val: string | number | undefined | null): number =>
  Math.max(0, Math.round(Number(String(val ?? "0").replace(",", ".").trim()) * 100) || 0);

export const toMoneyInput = (val: unknown): string =>
  typeof val === "number" && val !== 0 ? String(val / 100) : "";

export function isValidDataUrl(url?: string): url is string {
  if (!url || typeof url !== "string") return false;
  if (url.length === 60000) return false;
  if (!url.startsWith("data:image/")) return false;
  return url.length > 200;
}

export function isValidPixKey(key: string): boolean {
  const clean = key.trim();
  if (!clean) return false;
  const digits = clean.replace(/\D/g, "");
  if ((digits.length === 11 || digits.length === 14) && /^\d+$/.test(digits)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return true;
  if (/^(\+?55)?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(clean)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean) || /^[0-9a-f]{32}$/i.test(clean)) return true;
  return clean.length >= 5 && !/[<>{}\\]/.test(clean);
}

export const parseBankAmounts = (
  row: RecordData
): Record<string, { credit: number; debit: number; pix: number }> => {
  try {
    return JSON.parse(str(row, "reviewedBankAmountsJson") || str(row, "bankAmountsJson") || "{}");
  } catch {
    return {};
  }
};

export const parseAttachments = (row: RecordData): CashAttachment[] => {
  try {
    const raw = row.attachmentsJson;
    if (!raw) return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((att: CashAttachment) => {
      const isLocal = !att.fileId || att.fileId.startsWith("local-");
      if (!isLocal && att.dataUrl && !isValidDataUrl(att.dataUrl)) {
        return { ...att, dataUrl: undefined };
      }
      return att;
    });
  } catch {
    return [];
  }
};

export const parseOutflows = (json: unknown): OutflowItem[] => {
  try {
    if (typeof json === "string" && json.trim()) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          id: item.id || safeUUID(),
          name: String(item.name || ""),
          amount: typeof item.amount === "number" ? String(item.amount / 100) : String(item.amount || ""),
        }));
      }
    }
  } catch {}
  return [];
};

export const parsePixRequests = (json: unknown): PixRequestItem[] => {
  try {
    if (typeof json === "string" && json.trim()) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          id: item.id || safeUUID(),
          name: String(item.name || ""),
          key: String(item.key || ""),
          description: String(item.description || ""),
          amount: typeof item.amount === "number" ? String(item.amount / 100) : String(item.amount || ""),
        }));
      }
    }
  } catch {}
  return [];
};

export function loadDraftData(): Record<string, any> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function formatShortDate(isoDate: string): string {
  if (!isoDate) return "—";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function generateCleanWhatsAppClosingText(row: RecordData, unitName: string): string {
  const dateFormatted = formatShortDate(str(row, "date"));
  const shift = str(row, "shift") || "Único";
  const op = str(row, "operatorName") || "Operador";
  const sysTotal = brl(Number(row.systemTotal || 0));
  const sangria = Number(row.sangriaAmount || 0);
  const diff = Number(row.difference || 0);
  const diffText =
    diff === 0
      ? "Batido (R$ 0,00)"
      : diff > 0
      ? `Sobra de +${brl(diff)}`
      : `Falta de ${brl(Math.abs(diff))}`;

  let text = `*FECHAMENTO DE CAIXA — HOUSE 190*\n`;
  text += `Unidade: ${unitName}\n`;
  text += `Data: ${dateFormatted} (Turno: ${shift})\n`;
  text += `Operador: ${op}\n\n`;
  text += `*TOTAL FATURADO (PDV):* ${sysTotal}\n`;
  text += `- Dinheiro: ${brl(Number(row.systemCash || 0))}\n`;
  text += `- Crédito: ${brl(Number(row.systemCredit || 0))}\n`;
  text += `- Débito: ${brl(Number(row.systemDebit || 0))}\n`;
  text += `- PIX: ${brl(Number(row.systemPix || 0))}\n`;
  if (Number(row.systemServiceFee || 0) > 0) {
    text += `- Taxa de Serviço: ${brl(Number(row.systemServiceFee || 0))}\n`;
  }
  text += `\n*GAVETA E SANGRIA*\n`;
  text += `- Sangria: ${brl(sangria)}${str(row, "sangriaRecipient") ? ` (${str(row, "sangriaRecipient")})` : ""}\n`;
  text += `- Troco Final: ${brl(Number(row.closingFloat || 0))}\n`;
  if (Number(row.cashOutflows || 0) > 0) {
    text += `- Saídas da Gaveta: ${brl(Number(row.cashOutflows || 0))}\n`;
  }
  text += `\n*CONFERÊNCIA*\n`;
  text += `- Resultado: ${diffText}\n`;
  if (str(row, "notes")) {
    text += `\n*Observações:* ${str(row, "notes")}\n`;
  }
  return text;
}
