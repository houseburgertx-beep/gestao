"use client";

import { Database, RecordData, dateToday, str } from "@/domain/management/model";
import { outstanding, payableStatus } from "@/domain/management/engine";
import { uploadFileToDrive } from "@/services/driveService";

function withChanges(database: Database, changed: RecordData[]): Database {
  const snapshot: Database = {};
  for (const [kind, rows] of Object.entries(database)) snapshot[kind] = [...rows];
  for (const record of changed) {
    const rows = snapshot[record.kind] || [];
    const index = rows.findIndex((row) => row.id === record.id);
    if (index >= 0) rows[index] = record;
    else rows.push(record);
    snapshot[record.kind] = rows;
  }
  return snapshot;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingDb: Database | null = null;
const pendingChangedMap = new Map<string, RecordData>();

async function performBackup(
  database: Database,
  changed: RecordData[] = [],
): Promise<void> {
  const snapshot = withChanges(database, changed);
  const today = dateToday();
  const headers = [
    "ID",
    "VENCIMENTO",
    "DESCRIÇÃO",
    "TIPO",
    "FORMA DE PAGAMENTO",
    "PARCELA",
    "LOJA / CAIXA",
    "FORNECEDOR",
    "VALOR ORIGINAL",
    "VALOR A PAGAR",
    "VALOR EM ABERTO",
    "STATUS",
    "IMPOSTO",
    "CÓDIGO / BOLETO",
    "ARQUIVO DO BOLETO",
    "OBSERVAÇÕES",
    "ATUALIZADO EM",
  ];
  const rows = (snapshot.payables || [])
    .filter((row) => !row.archived)
    .sort((a, b) => str(a, "dueDate").localeCompare(str(b, "dueDate")))
    .map((row) => {
      const unit = snapshot.units?.find((item) => item.id === row.unitId);
      const supplier = snapshot.suppliers?.find((item) => item.id === row.supplierId);
      const type = str(row, "obligationType") || (row.sourceKind === "taxes" ? "Imposto" : "Outros");
      const installment = row.installmentNumber
        ? `${row.installmentNumber}/${row.originalInstallments || row.installments || ""}`
        : str(row, "installments") || "1";
      const values = [
        row.id,
        row.dueDate,
        row.description,
        type,
        row.paymentMethod,
        installment,
        unit?.name || row.unitId,
        supplier?.name || "",
        brl(Number(row.originalAmount || row.amount || 0)),
        brl(Number(row.amount || 0)),
        brl(outstanding(row, snapshot, today)),
        payableStatus(row, snapshot, today),
        type === "Imposto" ? "SIM" : "NÃO",
        row.documentNumber,
        row.documentFileId ? `https://drive.google.com/open?id=${row.documentFileId}` : "",
        row.notes,
        row.updatedAt,
      ];
      return values.map(csvCell).join(";");
    });
  const contents = `\uFEFF${headers.map(csvCell).join(";")}\r\n${rows.join("\r\n")}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = new File(
    [contents],
    `BACKUP CONTAS A PAGAR - ${stamp}.csv`,
    { type: "text/csv;charset=utf-8" },
  );
  await uploadFileToDrive(file, "documents");
}

/**
 * Creates a versioned spreadsheet-compatible backup in Google Drive.
 * A new snapshot is intentional: it preserves earlier versions after edits or payments.
 * Background calls are debounced by 3 seconds to avoid multiple heavy concurrent uploads.
 */
export async function backupPayablesSpreadsheet(
  database: Database,
  changed: RecordData[] = [],
  immediate = false,
): Promise<void> {
  if (immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    for (const r of changed) pendingChangedMap.set(r.id, r);
    const changesToApply = Array.from(pendingChangedMap.values());
    pendingChangedMap.clear();
    const dbToUse = pendingDb || database;
    pendingDb = null;
    return performBackup(dbToUse, changesToApply);
  }

  // Enfileira alterações e agenda o backup para 3 segundos após a última alteração
  pendingDb = database;
  for (const r of changed) pendingChangedMap.set(r.id, r);

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  return new Promise((resolve) => {
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      const dbToUse = pendingDb || database;
      const changesToApply = Array.from(pendingChangedMap.values());
      pendingDb = null;
      pendingChangedMap.clear();
      try {
        await performBackup(dbToUse, changesToApply);
      } catch (err) {
        console.warn("Backup de contas a pagar no Google Drive:", err);
      }
      resolve();
    }, 3000);
  });
}

