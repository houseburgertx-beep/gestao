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

export interface TakeatCredentials {
  unitId: Exclude<UnitId, "all">;
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
  date: string; // YYYY-MM-DD in America/Bahia
  userRole?: string; // 'admin' | 'diretoria' | 'gestor' | 'gerente_unidade'
  userUnitId?: string; // For permission enforcement
}

export interface TakeatSyncResult {
  success: boolean;
  unitId: Exclude<UnitId, "all">;
  unitName: string;
  date: string;
  data?: TakeatRevenueRecord;
  error?: string;
  errorCode?: "AUTH_FAILED" | "UNAUTHORIZED_UNIT" | "INVALID_PERIOD" | "API_UNAVAILABLE" | "MISSING_PAYMENT_DATA";
}
