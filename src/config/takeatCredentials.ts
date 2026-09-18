import { TakeatCredentials, BrandId } from "@/types/takeat";
import { UnitId } from "@/types";

export interface TakeatStoreConfig {
  key: string;
  name: string;
  unitId: Exclude<UnitId, "all">;
  brand: BrandId;
  email: string;
  password?: string;
}

/**
 * Configuração Central de Credenciais do Takeat
 * 
 * Este arquivo é versionado no repositório para que todos os usuários/gestores
 * tenham acesso aos dados atualizados automaticamente sem precisar logar em cada máquina.
 * 
 * - Teixeira de Freitas: House 190 Teixeira & Bruttus Burger TX (segunda marca no mesmo login)
 * - Eunápolis: House 190 Eunápolis & Bruttus Eunápolis (segunda marca no mesmo login)
 * - Foodpark: House Foodpark
 */
export const DEFAULT_TAKEAT_CONFIGS: Record<string, TakeatStoreConfig> = {
  teixeira_house: {
    key: "teixeira_house",
    name: "House 190 Teixeira",
    unitId: "teixeira",
    brand: "house",
    email: process.env.NEXT_PUBLIC_TAKEAT_TEIXEIRA_HOUSE_EMAIL || "Gleucehouse@gmail.com",
    password: process.env.NEXT_PUBLIC_TAKEAT_TEIXEIRA_HOUSE_PASSWORD || "99596114",
  },
  teixeira_bruttus: {
    key: "teixeira_bruttus",
    name: "Bruttus Burger TX",
    unitId: "teixeira",
    brand: "bruttus",
    email: process.env.NEXT_PUBLIC_TAKEAT_TEIXEIRA_BRUTTUS_EMAIL || "Gleucehouse@gmail.com",
    password: process.env.NEXT_PUBLIC_TAKEAT_TEIXEIRA_BRUTTUS_PASSWORD || "99596114",
  },
  eunapolis_house: {
    key: "eunapolis_house",
    name: "House 190 Eunápolis",
    unitId: "eunapolis",
    brand: "house",
    email: process.env.NEXT_PUBLIC_TAKEAT_EUNAPOLIS_HOUSE_EMAIL || "Gleucehouse1@gmail.com",
    password: process.env.NEXT_PUBLIC_TAKEAT_EUNAPOLIS_HOUSE_PASSWORD || "99596114",
  },
  eunapolis_bruttus: {
    key: "eunapolis_bruttus",
    name: "Bruttus Eunápolis",
    unitId: "eunapolis",
    brand: "bruttus",
    email: process.env.NEXT_PUBLIC_TAKEAT_EUNAPOLIS_BRUTTUS_EMAIL || "Gleucehouse1@gmail.com",
    password: process.env.NEXT_PUBLIC_TAKEAT_EUNAPOLIS_BRUTTUS_PASSWORD || "99596114",
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
 * Retorna as credenciais padrão de uma operação, se existirem
 */
export function getDefaultTakeatCredentials(keyOrUnitId: string): TakeatCredentials | null {
  const config = DEFAULT_TAKEAT_CONFIGS[keyOrUnitId];
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
  const config = DEFAULT_TAKEAT_CONFIGS[keyOrUnitId];
  return Boolean(config && config.email && config.password);
}
