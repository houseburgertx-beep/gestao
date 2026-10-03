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

export type BrandId = "house" | "bruttus" | "all";

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
  manifestationType?: "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada" | string | null;
  manifestedAt?: string | null;
  destinatarioCnpj?: string;
  destinatarioNome?: string;
  tipoDocumento?: "entrada" | "manifesto" | string;
  importedToPayable?: boolean;
  payableId?: string;
  items?: ReceivedNfeItem[];
  source?: "takeat" | "manual" | "xml";
  syncedAt?: string;
}

export interface TakeatFiscalIssuedItem {
  numero: string;
  total: number;
  issuedAt: string;
  htmlUrl?: string;
  xmlUrl?: string;
}

export interface TakeatFiscalIssuedSummary {
  unitId: Exclude<UnitId, "all">;
  date: string; // YYYY-MM-DD
  count: number;
  totalIssued: number; // Valor total emitido correspondente ao relatório do PDV
  nfceTotalPrice: number; // Soma de nfce.total_price
  methods: Record<string, number>;
  invoices: TakeatFiscalIssuedItem[];
  syncedAt: string;
}

// ─────────────────────────────────────────────────────────
// Fechamento de Caixa Takeat PDV
// Endpoints: /restaurants/cashier-opening-event/summary/:id
//            /restaurants/cashier-audit
//            /restaurants/cashier-opening-verify
// ─────────────────────────────────────────────────────────

/** Cada linha de automatic_deposits, manual_deposits ou manual_withdrawals */
export interface TakeatCashierPayment {
  description: string;       // "Dinheiro", "CARTAO DE CREDITO", "PIX", etc.
  value: number;
  payment_method_id: number;
  is_manual: boolean;
  payment_id?: number;
  createdAt?: string;
}

/** Dados de abertura / fechamento do caixa */
export interface TakeatCashierOpening {
  id: number;
  initial_value: string;   // fundo de caixa (Troco Inicial / Abertura)
  final_value: string;
  total_value: string;
  opened_at: string;
  closed_at: string | null;
  restaurant_id?: number;
  user_open?: { name: string };
  user_close?: { name: string } | null;
}

/** Totais devolvidos pelo summary endpoint */
export interface TakeatCashierTotals {
  automatic_deposit: string; // total de vendas registradas no PDV
  manual_deposit: string;    // suprimentos (entradas manuais)
  manual_withdrawal: string; // sangrias (retiradas manuais)
  to_receive: number;        // a receber
}

/**
 * Item da lista de histórico de caixas fechados.
 * GET /restaurants/cashier-audit?start_date=...&end_date=...
 */
export interface TakeatCashierAuditItem {
  id: number;
  cashier_opening_id: number;
  annotation?: string;
  total_value: string;
  total_system_value: string;
  total_audited_value: string;
  manual_withdrawal: string;
  opened_at: string;
  closed_at: string;
  restaurant_id?: number;
  user_open?: { name: string };
  user_close?: { name: string } | null;
}

/**
 * Resultado final do caixa Takeat, pronto para uso no ClosingModal.
 * Inclui os dados brutos da API e os campos `mapped` já calculados
 * para preencher diretamente os inputs do formulário de fechamento.
 */
export interface TakeatCashierSummary {
  unitId: Exclude<UnitId, "all">;
  date: string; // YYYY-MM-DD (dia do fechamento buscado)
  cashierOpeningId: number;
  opening: TakeatCashierOpening;
  totals: TakeatCashierTotals;
  payments: TakeatCashierPayment[];        // automatic_deposits
  manualDeposits: TakeatCashierPayment[];  // suprimentos
  manualWithdrawals: TakeatCashierPayment[]; // sangrias
  /** Campos mapeados prontos para setar diretamente nos inputs (em reais, float) */
  mapped: {
    openingAmount: number;
    systemCash: number;
    systemCredit: number;
    systemDebit: number;
    systemPix: number;
    systemIfoodOnline: number;
    systemIfoodVoucher: number;
    systemTerm: number;
    systemClub: number;
    systemServiceFee: number;
    cashIn: number;        // total suprimentos (entradas manuais)
    sangriaAmount: number; // total sangrias (retiradas manuais)
    totalVendas: number;   // total automatic_deposit
  };
  operatorOpen?: string;
  operatorClose?: string;
  openedAtFormatted?: string;
  closedAtFormatted?: string;
  isOpen: boolean; // true = caixa ainda aberto no momento da busca
  syncedAt: string;
}
