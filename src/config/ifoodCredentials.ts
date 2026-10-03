import { IfoodCredentials, IfoodUnitId } from "@/types/ifood";

const IFOOD_CREDENTIALS_STORAGE_KEY = "house190_ifood_credentials_v1";

export const DEFAULT_IFOOD_CONFIGS: Record<IfoodUnitId, IfoodCredentials> = {
  teixeira: {
    unitId: "teixeira",
    unitName: "House 190 Teixeira de Freitas",
    clientId: process.env.NEXT_PUBLIC_IFOOD_TEIXEIRA_CLIENT_ID || "",
    clientSecret: process.env.NEXT_PUBLIC_IFOOD_TEIXEIRA_CLIENT_SECRET || "",
    merchantId: process.env.NEXT_PUBLIC_IFOOD_TEIXEIRA_MERCHANT_ID || "b0954b6b-f99c-44b6-ba1e-987f32b2b22a",
    isConfigured: false,
  },
  eunapolis: {
    unitId: "eunapolis",
    unitName: "House 190 Eunápolis",
    clientId: process.env.NEXT_PUBLIC_IFOOD_EUNAPOLIS_CLIENT_ID || "",
    clientSecret: process.env.NEXT_PUBLIC_IFOOD_EUNAPOLIS_CLIENT_SECRET || "",
    merchantId: process.env.NEXT_PUBLIC_IFOOD_EUNAPOLIS_MERCHANT_ID || "eun9921a-11bc-4882-9a00-11234abcd091",
    isConfigured: false,
  },
  foodpark: {
    unitId: "foodpark",
    unitName: "House Foodpark",
    clientId: process.env.NEXT_PUBLIC_IFOOD_FOODPARK_CLIENT_ID || "",
    clientSecret: process.env.NEXT_PUBLIC_IFOOD_FOODPARK_CLIENT_SECRET || "",
    merchantId: process.env.NEXT_PUBLIC_IFOOD_FOODPARK_MERCHANT_ID || "fp102938-4444-2222-aaaa-555544443333",
    isConfigured: false,
  },
};

export function loadIfoodCredentials(unitId: IfoodUnitId): IfoodCredentials {
  if (typeof window === "undefined") {
    return DEFAULT_IFOOD_CONFIGS[unitId] || DEFAULT_IFOOD_CONFIGS.teixeira;
  }

  try {
    const raw = localStorage.getItem(IFOOD_CREDENTIALS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed[unitId]) {
        return {
          ...DEFAULT_IFOOD_CONFIGS[unitId],
          ...parsed[unitId],
          isConfigured: Boolean(parsed[unitId].clientId && parsed[unitId].clientSecret),
        };
      }
    }
  } catch (err) {
    console.error("Erro ao carregar credenciais do iFood do localStorage:", err);
  }

  const def = DEFAULT_IFOOD_CONFIGS[unitId] || DEFAULT_IFOOD_CONFIGS.teixeira;
  return {
    ...def,
    isConfigured: Boolean(def.clientId && def.clientSecret),
  };
}

export function saveIfoodCredentials(unitId: IfoodUnitId, creds: Partial<IfoodCredentials>): void {
  if (typeof window === "undefined") return;

  try {
    const raw = localStorage.getItem(IFOOD_CREDENTIALS_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[unitId] = {
      ...(all[unitId] || DEFAULT_IFOOD_CONFIGS[unitId]),
      ...creds,
      unitId,
    };
    all[unitId].isConfigured = Boolean(all[unitId].clientId && all[unitId].clientSecret);
    localStorage.setItem(IFOOD_CREDENTIALS_STORAGE_KEY, JSON.stringify(all));
  } catch (err) {
    console.error("Erro ao salvar credenciais do iFood no localStorage:", err);
  }
}
