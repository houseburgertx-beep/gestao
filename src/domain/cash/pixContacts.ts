import { RecordData, str } from "@/domain/management/model";
import { isValidPixKey, parsePixRequests } from "@/components/cash/cashHelpers";

export const SAVED_PIX_CONTACTS_KEY = "house190_saved_pix_contacts_v1";
export const HIDDEN_PIX_CONTACTS_KEY = "house190_hidden_pix_contacts_v1";
export const AUTO_SAVE_PIX_PREF_KEY = "house190_auto_save_pix_v1";

export type PixContactSource = "saved" | "closing" | "payable" | "supplier" | "employee";

export interface SavedPixContact {
  id: string;
  name: string;
  key: string;
  defaultDescription?: string;
  source: PixContactSource;
  unitId?: string;
  usageCount: number;
  lastUsedAt: string;
  pinned?: boolean;
}

export interface PixDirectoryDatabase {
  cashClosings?: RecordData[];
  payables?: RecordData[];
  suppliers?: RecordData[];
  employees?: RecordData[];
}

export function normalizePixKeyId(rawKey: string): string {
  const trimmed = String(rawKey || "").trim();
  if (!trimmed) return "";

  // Email or random UUID key
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const digits = trimmed.replace(/\D/g, "");
  const looksNumericOnly = /^[\d\s()+.\-\/]+$/.test(trimmed);
  if (looksNumericOnly && digits.length >= 10 && digits.length <= 14) {
    // Strip Brazil +55 country code when clearly a phone (12 or 13 digits starting with 55)
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
      return digits.slice(2);
    }
    return digits;
  }

  return trimmed.toLowerCase().replace(/\s+/g, "");
}

export function formatCompactPixKey(rawKey: string): string {
  const clean = String(rawKey || "").trim();
  if (!clean) return "";

  // Random UUID key: abbreviate middle to keep pills minimalist
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
  }

  if (clean.length > 24) {
    return `${clean.slice(0, 14)}...${clean.slice(-6)}`;
  }
  return clean;
}

function normalizeSearchText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parsePayablePixNameAndDesc(
  description: string,
  supplierName?: string,
): { name: string; defaultDescription: string } {
  const rawDesc = String(description || "").trim();
  const closingMatch = rawDesc.match(/^PIX\s*[—-]\s*(.+?)\s*\(([^)]+)\)\s*$/i);
  if (closingMatch) {
    return {
      defaultDescription: closingMatch[1].trim(),
      name: closingMatch[2].trim(),
    };
  }
  const cleanedDesc = rawDesc.replace(/^PIX\s*[—-]\s*/i, "").trim();
  if (supplierName && supplierName.trim()) {
    return {
      name: supplierName.trim(),
      defaultDescription: cleanedDesc,
    };
  }
  return {
    name: cleanedDesc,
    defaultDescription: "",
  };
}

export function buildPixDirectory(
  data: PixDirectoryDatabase,
  unitId: string,
  localSaved: SavedPixContact[] = [],
  hiddenIds: string[] = [],
): SavedPixContact[] {
  const hiddenSet = new Set(hiddenIds.filter(Boolean));
  const map = new Map<string, SavedPixContact>();

  const upsert = (entry: {
    name: string;
    key: string;
    defaultDescription?: string;
    source: PixContactSource;
    unitId?: string;
    lastUsedAt?: string;
    usageIncrement?: number;
    pinned?: boolean;
  }) => {
    const cleanKey = String(entry.key || "").trim();
    const cleanName = String(entry.name || "").trim();
    if (!cleanKey || !cleanName || !isValidPixKey(cleanKey)) return;

    const id = normalizePixKeyId(cleanKey);
    if (!id || hiddenSet.has(id)) return;

    const cleanDesc = String(entry.defaultDescription || "").trim();
    const ts = String(entry.lastUsedAt || "");
    const existing = map.get(id);

    if (!existing) {
      map.set(id, {
        id,
        name: cleanName,
        key: cleanKey,
        defaultDescription: cleanDesc || undefined,
        source: entry.source,
        unitId: entry.unitId || undefined,
        usageCount: Math.max(1, entry.usageIncrement ?? 1),
        lastUsedAt: ts,
        pinned: Boolean(entry.pinned),
      });
      return;
    }

    existing.usageCount += Math.max(0, entry.usageIncrement ?? 1);
    if (entry.pinned) existing.pinned = true;

    const isNewer = Boolean(ts && (!existing.lastUsedAt || ts > existing.lastUsedAt));
    const entryIsSaved = entry.source === "saved";
    const existingIsSaved = existing.source === "saved";

    // Explicit saved contact or newer record refreshes display name/key/description
    if (entryIsSaved || (!existingIsSaved && isNewer)) {
      existing.name = cleanName;
      existing.key = cleanKey;
      if (cleanDesc) existing.defaultDescription = cleanDesc;
      if (entryIsSaved) existing.source = "saved";
      if (entry.unitId) existing.unitId = entry.unitId;
    } else if (!existing.defaultDescription && cleanDesc) {
      existing.defaultDescription = cleanDesc;
    }

    if (isNewer) {
      existing.lastUsedAt = ts;
    }
    if (!existing.unitId && entry.unitId) {
      existing.unitId = entry.unitId;
    }
  };

  // 1. Saved locally (explicitly or auto-saved)
  for (const item of localSaved) {
    if (!item || typeof item !== "object") continue;
    upsert({
      name: item.name,
      key: item.key,
      defaultDescription: item.defaultDescription,
      source: "saved",
      unitId: item.unitId,
      lastUsedAt: item.lastUsedAt,
      usageIncrement: Math.max(1, Number(item.usageCount || 1)),
      pinned: true,
    });
  }

  // 2. Registered suppliers with PIX key
  const suppliersById = new Map<string, string>();
  for (const supplier of data.suppliers || []) {
    if (!supplier || supplier.archived) continue;
    const sName = str(supplier, "name") || str(supplier, "tradeName") || str(supplier, "legalName");
    if (supplier.id && sName) suppliersById.set(supplier.id, sName);
    const sKey = str(supplier, "pixKey");
    if (sName && sKey) {
      upsert({
        name: sName,
        key: sKey,
        source: "supplier",
        lastUsedAt: str(supplier, "updatedAt") || str(supplier, "createdAt"),
        usageIncrement: 1,
      });
    }
  }

  // 3. Registered employees with PIX key (when available in context)
  for (const emp of data.employees || []) {
    if (!emp || emp.archived) continue;
    const eName = str(emp, "name");
    const eKey = str(emp, "pixKey") || str(emp, "bankData");
    if (eName && eKey && isValidPixKey(eKey)) {
      upsert({
        name: eName,
        key: eKey,
        source: "employee",
        unitId: emp.unitId,
        lastUsedAt: str(emp, "updatedAt") || str(emp, "createdAt"),
        usageIncrement: 1,
      });
    }
  }

  // 4. Historical cash closing PIX requests (shared via Firestore across all store devices)
  const closings = [...(data.cashClosings || [])]
    .filter((c) => c && !c.archived && c.pixRequestsJson)
    .sort((a, b) =>
      (str(a, "date") || str(a, "updatedAt")).localeCompare(str(b, "date") || str(b, "updatedAt")),
    );

  for (const closing of closings) {
    const items = parsePixRequests(closing.pixRequestsJson);
    const closingTs = str(closing, "updatedAt") || str(closing, "date") || str(closing, "createdAt");
    for (const req of items) {
      if (!req.name.trim() || !req.key.trim()) continue;
      upsert({
        name: req.name,
        key: req.key,
        defaultDescription: req.description,
        source: "closing",
        unitId: closing.unitId,
        lastUsedAt: closingTs,
        usageIncrement: 1,
      });
    }
  }

  // 5. Payables with PIX key (from cash closing or financial accounts payable)
  const payables = [...(data.payables || [])]
    .filter((p) => p && !p.archived)
    .sort((a, b) =>
      (str(a, "dueDate") || str(a, "updatedAt")).localeCompare(str(b, "dueDate") || str(b, "updatedAt")),
    );

  for (const payable of payables) {
    const rawKey =
      str(payable, "pixKey") ||
      (str(payable, "notes").match(/Chave PIX:\s*([^\s\n\r]+)/i)?.[1] || "");
    if (!rawKey) continue;
    const supplierName = payable.supplierId ? suppliersById.get(String(payable.supplierId)) : undefined;
    const parsed = parsePayablePixNameAndDesc(str(payable, "description"), supplierName);
    if (!parsed.name) continue;
    upsert({
      name: parsed.name,
      key: rawKey,
      defaultDescription: parsed.defaultDescription,
      source: "payable",
      unitId: payable.unitId,
      lastUsedAt: str(payable, "updatedAt") || str(payable, "dueDate") || str(payable, "createdAt"),
      // Avoid inflating usageCount for payables already counted from cashClosings
      usageIncrement: payable.sourceId ? 0 : 1,
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const aSameUnit = Boolean(unitId && a.unitId === unitId);
    const bSameUnit = Boolean(unitId && b.unitId === unitId);
    if (aSameUnit !== bSameUnit) return aSameUnit ? -1 : 1;

    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;

    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;

    if (b.lastUsedAt !== a.lastUsedAt) return b.lastUsedAt.localeCompare(a.lastUsedAt);

    return a.name.localeCompare(b.name, "pt-BR");
  });
}

export function filterPixContacts(contacts: SavedPixContact[], query: string): SavedPixContact[] {
  const needle = normalizeSearchText(query);
  if (!needle) return contacts;
  const digitsNeedle = query.replace(/\D/g, "");
  return contacts.filter((c) => {
    if (normalizeSearchText(c.name).includes(needle)) return true;
    if (normalizeSearchText(c.key).includes(needle)) return true;
    if (c.defaultDescription && normalizeSearchText(c.defaultDescription).includes(needle)) return true;
    if (digitsNeedle.length >= 3 && c.key.replace(/\D/g, "").includes(digitsNeedle)) return true;
    return false;
  });
}

export function loadLocalSavedPixContacts(): SavedPixContact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_PIX_CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistLocalSavedPixContacts(contacts: SavedPixContact[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_PIX_CONTACTS_KEY, JSON.stringify(contacts));
  } catch {}
}

export function loadHiddenPixContactIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HIDDEN_PIX_CONTACTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return [];
  }
}

export function persistHiddenPixContactIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HIDDEN_PIX_CONTACTS_KEY, JSON.stringify(ids));
  } catch {}
}

export function loadAutoSavePixPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(AUTO_SAVE_PIX_PREF_KEY);
    if (raw === null) return true;
    return raw !== "false";
  } catch {
    return true;
  }
}

export function persistAutoSavePixPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTO_SAVE_PIX_PREF_KEY, enabled ? "true" : "false");
  } catch {}
}

export function upsertLocalSavedPixContact(
  list: SavedPixContact[],
  entry: { name: string; key: string; defaultDescription?: string; unitId?: string },
  nowIso = new Date().toISOString(),
): SavedPixContact[] {
  const cleanName = String(entry.name || "").trim();
  const cleanKey = String(entry.key || "").trim();
  if (!cleanName || !cleanKey || !isValidPixKey(cleanKey)) return list;

  const id = normalizePixKeyId(cleanKey);
  if (!id) return list;

  const cleanDesc = String(entry.defaultDescription || "").trim();
  const existing = list.find((c) => c.id === id);

  const updated: SavedPixContact = {
    id,
    name: cleanName,
    key: cleanKey,
    defaultDescription: cleanDesc || existing?.defaultDescription,
    source: "saved",
    unitId: entry.unitId || existing?.unitId,
    usageCount: (existing?.usageCount || 0) + 1,
    lastUsedAt: nowIso,
    pinned: true,
  };

  return [updated, ...list.filter((c) => c.id !== id)].slice(0, 120);
}
