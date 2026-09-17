"use client";

import { Database, RecordData, dateToday, str } from "../domain/management/model";
import { outstanding, payableStatus } from "../domain/management/engine";

const WORKER_URL = "https://house190-email-notifications.house-folgas-notifications.workers.dev";
const SPREADSHEET_STORAGE_KEY = "house190_backup_spreadsheet_url";

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(isoStr?: string): string {
  if (!isoStr || !isoStr.includes("T")) return "";
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

async function authenticatedPost(path: string, body: object): Promise<Response> {
  const { auth } = await import("../lib/firebase");
  const user = auth.currentUser;
  if (!user) throw new Error("Usuário não autenticado para sincronização.");
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  try {
    return await fetch(`${WORKER_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getCachedSpreadsheetUrl(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SPREADSHEET_STORAGE_KEY);
}

export function setCachedSpreadsheetUrl(url: string): void {
  if (typeof window === "undefined" || !url) return;
  localStorage.setItem(SPREADSHEET_STORAGE_KEY, url);
}

// ==========================================================================
// FORMATAÇÃO DE TABELAS PARA A PLANILHA ÚNICA DO GOOGLE SHEETS
// ==========================================================================

const getName = (record?: RecordData | null): string => (record ? str(record, "name") : "");

export function formatPayableRow(row: RecordData, db: Database, today: string): Record<string, string> {
  const unitId = str(row, "unitId");
  const unit = db.units?.find((item) => item.id === unitId);
  const supplierId = str(row, "supplierId");
  const supplier = db.suppliers?.find((item) => item.id === supplierId);
  const type = str(row, "obligationType") || (row.sourceKind === "taxes" ? "Imposto" : "Outros");
  const installment = row.installmentNumber
    ? `${row.installmentNumber}/${row.originalInstallments || row.installments || 1}`
    : str(row, "installments") || "1";

  return {
    ID: row.id,
    VENCIMENTO: str(row, "dueDate"),
    UNIDADE: getName(unit) || unitId || "",
    FORNECEDOR: getName(supplier) || str(row, "scannedSupplierName") || "",
    DESCRICAO: str(row, "description"),
    TIPO: type,
    FORMA_PAGAMENTO: str(row, "paymentMethod") || "Não informado",
    PARCELA: installment,
    VALOR_ORIGINAL: brl(Number(row.originalAmount || row.amount || 0)),
    VALOR_PAGAR: brl(Number(row.amount || 0)),
    SALDO_ABERTO: brl(outstanding(row, db, today)),
    STATUS: payableStatus(row, db, today),
    IMPOSTO: type === "Imposto" || row.sourceKind === "taxes" ? "SIM" : "NÃO",
    DOCUMENTO_CODIGO: str(row, "documentNumber"),
    LINK_BOLETO_DRIVE: row.documentFileId ? `https://drive.google.com/open?id=${row.documentFileId}` : "",
    OBSERVACOES: str(row, "notes"),
    ATUALIZADO_EM: str(row, "updatedAt") || new Date().toISOString(),
  };
}

export function formatSettlementRow(row: RecordData, db: Database): Record<string, string> {
  const unitId = str(row, "unitId");
  const unit = db.units?.find((item) => item.id === unitId);
  const bankAccountId = str(row, "bankAccountId");
  const bank = db.bankAccounts?.find((item) => item.id === bankAccountId);

  return {
    ID: row.id,
    DATA_BAIXA: str(row, "date"),
    HORARIO: formatTime(str(row, "createdAt")),
    UNIDADE: getName(unit) || unitId || "",
    CONTA_BANCARIA: getName(bank) || bankAccountId || "",
    DESCRICAO: str(row, "description"),
    VALOR_PAGO: brl(Number(row.amount || 0)),
    QUEM_PAGOU: str(row, "operatorName") || str(row, "reviewedBy") || str(row, "createdBy") || "",
    FORMA_PAGAMENTO: str(row, "paymentMethod") || "",
    LINK_COMPROVANTE_DRIVE: row.paymentProofFileId ? `https://drive.google.com/open?id=${row.paymentProofFileId}` : "",
    ID_OBRIGACAO: str(row, "obligationId"),
    REGISTRADO_EM: str(row, "createdAt") || str(row, "updatedAt") || "",
  };
}

export function formatCashClosingRow(row: RecordData, db: Database): Record<string, string> {
  const unitId = str(row, "unitId");
  const unit = db.units?.find((item) => item.id === unitId);

  return {
    ID: row.id,
    DATA: str(row, "date"),
    TURNO: str(row, "shift") || "Único",
    UNIDADE: getName(unit) || unitId || "",
    OPERADOR: str(row, "operatorName") || "",
    FATURAMENTO_TOTAL: brl(Number(row.systemTotal || 0)),
    DINHEIRO_ESPERADO: brl(Number(row.cashExpected || 0)),
    DINHEIRO_INFORMADO: brl(Number(row.cashFound || 0)),
    DIFERENCA_DINHEIRO: brl(Number(row.cashDifference || 0)),
    CARTAO_CREDITO: brl(Number(row.creditFound || 0)),
    CARTAO_DEBITO: brl(Number(row.debitFound || 0)),
    PIX: brl(Number(row.pixFound || 0)),
    SANGRIAS: brl(Number(row.sangriaAmount || 0)),
    DIVERGENCIA_GERAL: brl(Number(row.difference || 0)),
    STATUS: str(row, "status") || "Pendente",
    REGISTRADO_EM: str(row, "createdAt") || str(row, "updatedAt") || "",
  };
}

export function formatCashConferenceRow(row: RecordData, db: Database): Record<string, string> {
  const unitId = str(row, "unitId");
  const unit = db.units?.find((item) => item.id === unitId);

  return {
    ID: row.id,
    ID_FECHAMENTO: str(row, "closingId"),
    DATA_CAIXA: str(row, "date"),
    UNIDADE: getName(unit) || unitId || "",
    OPERADOR_CAIXA: str(row, "operatorName") || "",
    QUEM_CONFERIU: str(row, "reviewedBy") || str(row, "conferredBy") || "",
    DATA_CONFERENCIA: str(row, "conferredAt") || str(row, "createdAt") || "",
    STATUS: str(row, "status") || "Conferido",
    DIVERGENCIA_TOTAL: brl(Number(row.difference || 0)),
    NOTAS: str(row, "notes"),
    CONCILIACAO_BANCOS_JSON: str(row, "reviewedBankAmountsJson") || str(row, "afterBalancesJson") || "",
    REGISTRADO_EM: str(row, "createdAt") || str(row, "updatedAt") || "",
  };
}

export function formatBankAccountRow(row: RecordData, db: Database): Record<string, string> {
  const unitId = str(row, "unitId");
  const unit = db.units?.find((item) => item.id === unitId);

  return {
    ID: row.id,
    NOME_CONTA: str(row, "name"),
    BANCO: str(row, "bank") || "",
    UNIDADE: getName(unit) || unitId || "",
    SALDO_ATUAL: brl(typeof row.balance === "number" ? row.balance : 0),
    DATA_SALDO: str(row, "balanceDate") || "",
    CONCILIADO: row.reconciled ? "SIM" : "NÃO",
    ATUALIZADO_POR: str(row, "updatedBy") || "",
    ATUALIZADO_EM: str(row, "balanceUpdatedAt") || str(row, "updatedAt") || "",
  };
}

export function formatBankTransferRow(row: RecordData, db: Database): Record<string, string> {
  const fromBankId = str(row, "fromBankId");
  const toBankId = str(row, "toBankId");
  const fromBank = db.bankAccounts?.find((item) => item.id === fromBankId);
  const toBank = db.bankAccounts?.find((item) => item.id === toBankId);

  return {
    ID: row.id,
    DATA: str(row, "date"),
    CONTA_ORIGEM: getName(fromBank) || fromBankId || "",
    CONTA_DESTINO: getName(toBank) || toBankId || "",
    VALOR: brl(Number(row.amount || 0)),
    RESPONSAVEL: str(row, "createdBy") || "",
    OBSERVACOES: str(row, "notes") || "",
    REGISTRADO_EM: str(row, "createdAt") || str(row, "updatedAt") || "",
  };
}

export function formatSupplierRow(row: RecordData): Record<string, string> {
  return {
    ID: row.id,
    NOME: str(row, "name"),
    DOCUMENTO_CNPJ_CPF: str(row, "document") || "",
    TELEFONE: str(row, "phone") || "",
    CHAVE_PIX: str(row, "pixKey") || "",
    CATEGORIA: str(row, "category") || "",
    ATUALIZADO_EM: str(row, "updatedAt") || new Date().toISOString(),
  };
}

// ==========================================================================
// FILA ASSÍNCRONA COM DEBOUNCE PARA REPLICAÇÃO EM TEMPO REAL
// ==========================================================================

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDb: Database | null = null;
const pendingChangedRecords = new Map<string, RecordData>();

async function executeSync(
  db: Database,
  records: RecordData[],
  operation = "upsert_batch",
  details = "Atualização automática de registros",
): Promise<{ ok: boolean; spreadsheetUrl?: string; processedRecords?: number }> {
  const today = dateToday();
  const tables: Record<string, Record<string, string>[]> = {};

  const payablesList: Record<string, string>[] = [];
  const settlementsList: Record<string, string>[] = [];
  const closingsList: Record<string, string>[] = [];
  const conferencesList: Record<string, string>[] = [];
  const banksList: Record<string, string>[] = [];
  const transfersList: Record<string, string>[] = [];
  const suppliersList: Record<string, string>[] = [];

  for (const r of records) {
    if (r.archived) continue;
    switch (r.kind) {
      case "payables":
        payablesList.push(formatPayableRow(r, db, today));
        break;
      case "transactions":
        if (r.direction === "Saída" || r.obligationKind === "payables") {
          settlementsList.push(formatSettlementRow(r, db));
        }
        break;
      case "cashClosings":
        closingsList.push(formatCashClosingRow(r, db));
        break;
      case "cashConferences":
        conferencesList.push(formatCashConferenceRow(r, db));
        break;
      case "bankAccounts":
        banksList.push(formatBankAccountRow(r, db));
        break;
      case "bankTransfers":
        transfersList.push(formatBankTransferRow(r, db));
        break;
      case "suppliers":
        suppliersList.push(formatSupplierRow(r));
        break;
    }
  }

  if (payablesList.length) tables.Contas_Pagar = payablesList;
  if (settlementsList.length) tables.Pagamentos_Baixas = settlementsList;
  if (closingsList.length) tables.Fechamentos_Caixa = closingsList;
  if (conferencesList.length) tables.Conferencias_Caixa = conferencesList;
  if (banksList.length) tables.Contas_Bancarias = banksList;
  if (transfersList.length) tables.Transferencias_Internas = transfersList;
  if (suppliersList.length) tables.Fornecedores = suppliersList;

  if (Object.keys(tables).length === 0) {
    return { ok: true, processedRecords: 0 };
  }

  const response = await authenticatedPost("/sheets/sync", {
    tables,
    operation,
    details,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Falha HTTP ${response.status} ao sincronizar com Google Sheets.`);
  }

  const result = (await response.json()) as {
    ok: boolean;
    spreadsheetUrl?: string;
    processedRecords?: number;
  };

  if (result.spreadsheetUrl) {
    setCachedSpreadsheetUrl(result.spreadsheetUrl);
  }

  return result;
}

/**
 * Enfileira alterações para sincronização no Google Sheets com debounce de 3s.
 * NUNCA bloqueia a interface do usuário.
 */
export function replicateToSheet(db: Database, changed: RecordData[] = []): void {
  pendingDb = db;
  for (const r of changed) {
    pendingChangedRecords.set(r.id, r);
  }

  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(async () => {
    syncTimer = null;
    const dbToUse = pendingDb || db;
    const recordsToSync = Array.from(pendingChangedRecords.values());
    pendingDb = null;
    pendingChangedRecords.clear();

    if (recordsToSync.length === 0) return;

    try {
      await executeSync(
        dbToUse,
        recordsToSync,
        "auto_sync",
        `Sincronização em segundo plano (${recordsToSync.length} registros)`,
      );
    } catch (err) {
      console.warn("Sincronização em segundo plano no Google Sheets:", err);
    }
  }, 3000);
}

/**
 * Força uma sincronização integral de todas as tabelas ativas para a planilha única do Google Sheets.
 */
export async function fullSyncToSheet(
  db: Database,
): Promise<{ ok: boolean; spreadsheetUrl: string; processedRecords: number }> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  pendingChangedRecords.clear();

  const allRecords: RecordData[] = [
    ...(db.payables || []),
    ...(db.transactions || []),
    ...(db.cashClosings || []),
    ...(db.cashConferences || []),
    ...(db.bankAccounts || []),
    ...(db.bankTransfers || []),
    ...(db.suppliers || []),
  ];

  const result = await executeSync(
    db,
    allRecords,
    "full_sync",
    `Sincronização integral manual (${allRecords.length} registros)`,
  );

  return {
    ok: true,
    spreadsheetUrl: result.spreadsheetUrl || getCachedSpreadsheetUrl() || "",
    processedRecords: result.processedRecords || allRecords.length,
  };
}

// Exportação de compatibilidade retroativa
export async function backupPayablesSpreadsheet(
  database: Database,
  changed: RecordData[] = [],
  immediate = false,
): Promise<void> {
  if (immediate) {
    await fullSyncToSheet(database);
  } else {
    replicateToSheet(database, changed);
  }
}
