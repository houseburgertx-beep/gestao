import { TakeatCredentials, BrandId } from "@/types/takeat";
import { UnitId } from "@/types";

export interface TakeatStoreConfig {
  key: string;
  name: string;
  unitId: Exclude<UnitId, "all">;
  brand: BrandId;
  email: string;
  password?: string;
  /** Marcas incluídas neste login (para identificação na UI) */
  includes?: string[];
}

/**
 * Configuração Central de Credenciais do Takeat
 * 
 * IMPORTANTE: Cada entrada = 1 login real no Takeat.
 * 
 * - Teixeira de Freitas: Gleucehouse@gmail.com → House 190 Teixeira + Bruttus Burger TX (2ª marca)
 * - Eunápolis: Gleucehouse1@gmail.com → House 190 Eunápolis + Bruttus Eunápolis (2ª marca)
 * - Foodpark: Gleucedias1@gmail.com → apenas House Foodpark
 * 
 * A Bruttus é uma segunda marca dentro do mesmo login da House.
 * O faturamento retornado pela API general-cards já inclui ambas as marcas combinadas.
 */
export const DEFAULT_TAKEAT_CONFIGS: Record<string, TakeatStoreConfig> = {
  teixeira: {
    key: "teixeira",
    name: "Teixeira de Freitas (House + Bruttus)",
    unitId: "teixeira",
    brand: "house",
    email: process.env.NEXT_PUBLIC_TAKEAT_TEIXEIRA_EMAIL || "Gleucehouse@gmail.com",
    password: process.env.NEXT_PUBLIC_TAKEAT_TEIXEIRA_PASSWORD || "99596114",
    includes: ["House 190 Teixeira", "Bruttus Burger TX"],
  },
  eunapolis: {
    key: "eunapolis",
    name: "Eunápolis (House + Bruttus)",
    unitId: "eunapolis",
    brand: "house",
    email: process.env.NEXT_PUBLIC_TAKEAT_EUNAPOLIS_EMAIL || "Gleucehouse1@gmail.com",
    password: process.env.NEXT_PUBLIC_TAKEAT_EUNAPOLIS_PASSWORD || "99596114",
    includes: ["House 190 Eunápolis", "Bruttus Eunápolis"],
  },
  foodpark: {
    key: "foodpark",
    name: "House Foodpark",
    unitId: "foodpark",
    brand: "house",
    email: process.env.NEXT_PUBLIC_TAKEAT_FOODPARK_EMAIL || "Gleucedias1@gmail.com",
    password: process.env.NEXT_PUBLIC_TAKEAT_FOODPARK_PASSWORD || "99596114",
  },
};

/**
 * Retorna as credenciais padrão de uma operação.
 * Aceita tanto chaves novas (teixeira) quanto legadas (teixeira_house, teixeira_bruttus).
 */
export function getDefaultTakeatCredentials(keyOrUnitId: string): TakeatCredentials | null {
  // Tenta a chave direta
  let config = DEFAULT_TAKEAT_CONFIGS[keyOrUnitId];

  // Fallback: teixeira_house ou teixeira_bruttus → teixeira
  if (!config && keyOrUnitId.includes("_")) {
    const baseUnit = keyOrUnitId.split("_")[0];
    config = DEFAULT_TAKEAT_CONFIGS[baseUnit];
  }

  if (!config) return null;

  return {
    unitId: config.unitId,
    brand: config.brand,
    credentialKey: config.key,
    email: config.email,
    password: config.password,
  };
}

/**
 * Verifica se uma operação possui credenciais configuradas (por arquivo ou env)
 */
export function hasConfiguredCredentials(keyOrUnitId: string): boolean {
  const creds = getDefaultTakeatCredentials(keyOrUnitId);
  return Boolean(creds && creds.email && creds.password);
}
