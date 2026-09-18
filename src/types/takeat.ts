import { UnitId } from "./index";

export interface TakeatPaymentWithoutTax {
  balcony?: number | string;
  table?: number | string;
  delivery?: number | string;
  ifood?: number | string;
  [key: string]: any;
}

export interface TakeatGeneralCardsResponse {
  payment_without_tax?: TakeatPaymentWithoutTax;
  [key: string]: any;
}

export type BrandId = "house" | "bruttus";

export interface TakeatCredentials {
  unitId: Exclude<UnitId, "all">;
  brand?: BrandId;
  credentialKey?: string; // ex: "teixeira_house", "teixeira_bruttus", "eunapolis_house", "eunapolis_bruttus", "foodpark"
  email: string;
  password?: string;
  token?: string;
  restaurantId?: number | string;
  restaurantName?: string;
  tokenExpiresAt?: string;
}

export interface TakeatRevenueRecord {
  id: string;
  unitId: Exclude<UnitId, "all">;
  brand?: BrandId;
  operationKey?: string; // ex: "teixeira_house", "teixeira_bruttus", etc.
  operationName?: string; // ex: "Bruttus Burger TX", "House 190 Teixeira"
  date: string; // YYYY-MM-DD
  startDateUtc: string;
  endDateUtc: string;
  salao: number; // balcony + table
  delivery: number; // delivery
  ifood: number; // ifood
  totalRevenue: number; // salao + delivery + ifood
  rawBalcony: number;
  rawTable: number;
  rawDelivery: number;
  rawIfood: number;
  source: "takeat";
  syncedAt: string;
}

export interface TakeatSyncRequest {
  unitId: Exclude<UnitId, "all"> | "all";
  brand?: BrandId | "all";
  credentialKey?: string;
  date: string; // YYYY-MM-DD in America/Bahia
  userRole?: string; // 'admin' | 'diretoria' | 'gestor' | 'gerente_unidade'
  userUnitId?: string; // For permission enforcement
}

export interface TakeatSyncResult {
  success: boolean;
  unitId: Exclude<UnitId, "all">;
  brand?: BrandId;
  operationKey?: string;
  unitName: string;
  date: string;
  data?: TakeatRevenueRecord;
  error?: string;
  errorCode?: "AUTH_FAILED" | "UNAUTHORIZED_UNIT" | "INVALID_PERIOD" | "API_UNAVAILABLE" | "MISSING_PAYMENT_DATA";
}

export interface ReceivedNfeItem {
  id?: string;
  codigo?: string;
  descricao: string;
  ncm?: string;
  cfop?: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  impostos?: {
    icmsValor?: number;
    pisValor?: number;
    cofinsValor?: number;
    ipiValor?: number;
  };
}

export interface ReceivedNfe {
  id: string;
  nfeReceivedId?: string | number;
  unitId: Exclude<UnitId, "all">;
  unitName?: string;
  brand?: BrandId;
  numero: string;
  serie?: string;
  chave: string;
  fornecedorNome: string;
  fornecedorCnpj: string;
  dataEmissao: string; // YYYY-MM-DD
  dataRecebimento?: string;
  valorTotal: number;
  status: "autorizada" | "cancelada" | "processando";
  importedToPayable?: boolean;
  payableId?: string;
  items?: ReceivedNfeItem[];
  source?: "takeat" | "manual" | "xml";
  syncedAt?: string;
}

