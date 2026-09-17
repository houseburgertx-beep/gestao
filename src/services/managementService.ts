"use client";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  runTransaction,
  writeBatch,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  RecordData,
  Database,
  DEFINITIONS,
  str,
  currency,
} from "@/domain/management/model";
import { buildRecords, validate } from "@/domain/management/operations";
import { addNotificationToFirestore } from "./firestoreService";
const col = (kind: string) => "gestao_" + kind;
const PENDING_RECORDS_KEY = "house190_pending_management_records";

export function queueManagementRecord(record: RecordData) {
  if (typeof window === "undefined") return;
  const current = JSON.parse(localStorage.getItem(PENDING_RECORDS_KEY) || "[]") as RecordData[];
  const next = [...current.filter((item) => item.id !== record.id), record];
  localStorage.setItem(PENDING_RECORDS_KEY, JSON.stringify(next));
}

export function getQueuedManagementRecords(): RecordData[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PENDING_RECORDS_KEY) || "[]") as RecordData[];
  } catch {
    return [];
  }
}

export async function flushManagementQueue(state: Database) {
  if (typeof window === "undefined") return 0;
  const pending = JSON.parse(localStorage.getItem(PENDING_RECORDS_KEY) || "[]") as RecordData[];
  let saved = 0;
  for (const record of pending) {
    try {
      await saveManagement(record, state);
      const remaining = (JSON.parse(localStorage.getItem(PENDING_RECORDS_KEY) || "[]") as RecordData[]).filter((item) => item.id !== record.id);
      localStorage.setItem(PENDING_RECORDS_KEY, JSON.stringify(remaining));
      saved += 1;
    } catch (error) {
      if (error instanceof Error && /quota|resource-exhausted/i.test(`${error.name} ${error.message}`)) break;
      throw error;
    }
  }
  return saved;
}
export function subscribeManagement(
  tenantId: string,
  unitId: string,
  onData: (kind: string, rows: RecordData[]) => void,
  onError: (kind: string, error: Error) => void,
): Unsubscribe {
  const subscriptions = Object.keys(DEFINITIONS).map((kind) => {
    const clauses = [where("tenantId", "==", tenantId)];
    if (unitId !== "all" && !DEFINITIONS[kind].global)
      clauses.push(where("unitId", "==", unitId));
    return onSnapshot(
      query(collection(db, col(kind)), ...clauses),
      (s) =>
        onData(
          kind,
          s.docs.map((d) => ({ ...d.data(), id: d.id }) as RecordData),
        ),
      (e) => onError(kind, e),
    );
  });
  return () => subscriptions.forEach((fn) => fn());
}
function lockId(record: RecordData) {
  const month = str(record, "competence") || str(record, "date").slice(0, 7);
  return month && record.unitId
    ? `${record.tenantId}_${record.unitId}_${month}`
    : null;
}
export function sanitizeFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeFirestoreData) as unknown as T;
  }
  if (typeof data === "object" && !(data instanceof Date)) {
    const clean: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = sanitizeFirestoreData(value);
      }
    }
    return clean;
  }
  return data;
}

export async function saveManagement(
  record: RecordData,
  state: Database,
  archive = false,
) {
  let prepared = { ...record };
  let scannedSupplier: RecordData | null = null;
  if (!archive && prepared.kind === "payables" && !prepared.supplierId && str(prepared, "scannedSupplierName")) {
    const supplierName = str(prepared, "scannedSupplierName").trim();
    const supplierDocument = str(prepared, "scannedSupplierDocument").replace(/\D/g, "");
    const existingSupplier = state.suppliers.find((item) =>
      (supplierDocument && str(item, "document").replace(/\D/g, "") === supplierDocument) ||
      str(item, "name").trim().toLocaleLowerCase("pt-BR") === supplierName.toLocaleLowerCase("pt-BR"),
    );
    if (existingSupplier) prepared.supplierId = existingSupplier.id;
    else {
      const supplierId = `scan-${supplierDocument || supplierName.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
      scannedSupplier = {
        id: supplierId,
        kind: "suppliers",
        tenantId: prepared.tenantId,
        unitId: "",
        version: 0,
        createdAt: prepared.createdAt,
        updatedAt: prepared.updatedAt,
        createdBy: prepared.createdBy,
        updatedBy: prepared.updatedBy,
        name: supplierName,
        document: supplierDocument,
      };
      prepared.supplierId = supplierId;
    }
  }
  delete prepared.scannedSupplierName;
  delete prepared.scannedSupplierDocument;
  // The supplier is part of this same atomic write and is not in the live
  // subscription yet. Validate the payable against the pending supplier too.
  const validationState = scannedSupplier
    ? { ...state, suppliers: [...state.suppliers, scannedSupplier] }
    : state;
  if (!archive) validate(prepared, validationState);
  const outgoing = archive
    ? [{ ...prepared, archived: true }]
    : buildRecords(prepared);
  if (scannedSupplier) outgoing.unshift(scannedSupplier);
  if (!archive) validate(outgoing[0], validationState);
  const obsolete = (state.payables || []).filter(
    (p) => p.sourceId === record.id && !outgoing.some((x) => x.id === p.id),
  );
  if (archive)
    outgoing.push(
      ...state.payables
        .filter((p) => p.sourceId === record.id)
        .map((p) => ({ ...p, archived: true })),
    );
  else outgoing.push(...obsolete.map((p) => ({ ...p, archived: true })));
  const allNew = !archive && outgoing.every((item) => !(state[item.kind] || []).some((saved) => saved.id === item.id));
  if (prepared.kind === "payables" && allNew) await createRecords(outgoing);
  else await commitRecords(outgoing, state, prepared);
  return outgoing;
}

async function createRecords(records: RecordData[]) {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  records.forEach((record) => {
    const saved = sanitizeFirestoreData({ ...record, version: 1, updatedAt: now });
    batch.set(doc(db, col(record.kind), record.id), saved);
    const audit = doc(collection(db, "gestao_audit"));
    batch.set(audit, sanitizeFirestoreData({
      id: audit.id,
      tenantId: record.tenantId,
      unitId: record.unitId,
      kind: record.kind,
      recordId: record.id,
      operation: "create",
      updatedBy: record.updatedBy,
      updatedAt: now,
      version: 1,
      before: null,
      after: saved,
    }));
  });
  await batch.commit();
}
export async function commitRecords(
  records: RecordData[],
  state: Database,
  origin: RecordData,
) {
  const uniqueFields: Record<string, string[]> = {
    revenues: ["date", "channel"],
    sales: ["externalId"],
    purchases: ["externalId"],
    transfers: ["externalId"],
    production: ["externalId"],
    payroll: ["employeeId", "competence"],
    budgets: ["categoryId", "competence"],
    inventory: ["productId", "date"],
    positions: ["date"],
    closings: ["competence"],
    cashClosings: ["date", "shift"],
    cashConferences: ["closingId"],
    goals: ["start", "end", "channel"],
    loanInstallments: ["loanId", "number"],
    loans: ["contract"],
  };
  const keys = uniqueFields[origin.kind];
  let uniqueId: string | null = null;
  if (keys) {
    const raw = JSON.stringify([
      origin.tenantId,
      origin.unitId,
      origin.kind,
      ...keys.map((k) => origin[k] ?? ""),
    ]);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(raw),
    );
    uniqueId = Array.from(new Uint8Array(digest))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  }
  const uniqueRef = uniqueId ? doc(db, "gestao_unique", uniqueId) : null;
  try {
    await runTransaction(db, async (tx) => {
      const uniqueSnapshot = uniqueRef ? await tx.get(uniqueRef) : null;
      if (
        uniqueSnapshot?.exists() &&
        uniqueSnapshot.data().recordId !== origin.id
      )
        throw new Error(
          "Já existe um registro salvo para esta origem ou período. Atualize a base.",
        );
      const refs = records.map((r) => doc(db, col(r.kind), r.id));
      const existing = await Promise.all(refs.map((ref) => tx.get(ref)));
      const lockIds = Array.from(
        new Set(
          records
            .filter((r) => !["closings", "coverage", "actions"].includes(r.kind))
            .map(lockId)
            .filter(Boolean),
        ),
      ) as string[];
      const locks = await Promise.all(
        lockIds.map((id) => tx.get(doc(db, "gestao_locks", id))),
      );
      if (locks.some((l) => l.exists() && l.data().closed === true))
        throw new Error(
          "Mês fechado. Reabra o fechamento antes de alterar lançamentos.",
        );
      for (let i = 0; i < records.length; i++) {
        const r = records[i],
          old = existing[i];
        const expected = (state[r.kind] || []).find((x) => x.id === r.id);
        if (
          old.exists() &&
          Number(old.data().settledAmount || 0) > 0 &&
          origin.kind !== "transactions"
        )
          throw new Error("Registro possui baixa. Estorne antes de alterar.");
        if (old.exists() && origin.kind === "transactions" && origin.obligationId)
          throw new Error("Uma liquidação registrada é imutável. Use estorno.");
        if (
          old.exists() &&
          (!expected || old.data().version !== expected.version)
        )
          throw new Error(
            "Registro alterado em outra sessão. Atualize antes de salvar.",
          );
        if (!old.exists() && expected)
          throw new Error("Registro indisponível. Atualize antes de salvar.");
      }
      // A receipt/payment locks its obligation version too: concurrent partial payments cannot overpay.
      const payment =
        records.length === 1 &&
        origin.kind === "transactions" &&
        origin.obligationId
          ? origin
          : null;
      let obligationRef: ReturnType<typeof doc> | null = null;
      let obligationSnapshot;
      if (payment) {
        obligationRef = doc(
          db,
          col(str(payment, "obligationKind")),
          str(payment, "obligationId"),
        );
        obligationSnapshot = await tx.get(obligationRef);
        if (!obligationSnapshot.exists())
          throw new Error("Obrigação não encontrada.");
        const value = obligationSnapshot.data();
        if (value.archived) throw new Error("Obrigação cancelada.");
        const settled = Number(value.settledAmount || 0);
        const delta = Number(payment.amount) * (payment.reversalOf ? -1 : 1);
        if (settled + delta < 0 || settled + delta > Number(value.amount))
          throw new Error("A baixa excede o saldo atualizado da obrigação.");
      }
      if (payment?.reversalOf) {
        const original = await tx.get(
          doc(db, col("transactions"), str(payment, "reversalOf")),
        );
        if (
          !original.exists() ||
          original.data().obligationId !== payment.obligationId ||
          original.data().amount !== payment.amount ||
          original.data().direction === payment.direction
        )
          throw new Error("Estorno não corresponde à liquidação original.");
      }
      const now = new Date().toISOString();
      if (uniqueRef && !uniqueSnapshot?.exists())
        tx.set(uniqueRef, sanitizeFirestoreData({
          tenantId: origin.tenantId,
          unitId: origin.unitId,
          recordId: origin.id,
          updatedBy: origin.updatedBy,
        }));
      records.forEach((r, i) => {
        const data = sanitizeFirestoreData({
          ...r,
          version: existing[i].exists()
            ? Number(existing[i].data()?.version || 0) + 1
            : 1,
          updatedAt: now,
        });
        tx.set(refs[i], data);
        const audit = doc(collection(db, "gestao_audit"));
        tx.set(audit, sanitizeFirestoreData({
          id: audit.id,
          tenantId: r.tenantId,
          unitId: r.unitId,
          kind: r.kind,
          recordId: r.id,
          operation: r.archived
            ? "cancel"
            : existing[i].exists()
              ? "update"
              : "create",
          updatedBy: r.updatedBy,
          updatedAt: now,
          version: data.version,
          before: existing[i].exists() ? existing[i].data() : null,
          after: data,
        }));
      });
      if (payment && obligationRef && obligationSnapshot?.exists()) {
        const value = obligationSnapshot.data();
        tx.update(obligationRef, {
          settledAmount: Math.max(
            0,
            Number(value.settledAmount || 0) +
              Number(payment.amount) * (payment.reversalOf ? -1 : 1),
          ),
          version: Number(value.version || 0) + 1,
          updatedAt: now,
          updatedBy: payment.updatedBy,
        });
      }
      if (origin.kind === "closings") {
        const id = lockId(origin)!;
        tx.set(doc(db, "gestao_locks", id), {
          id,
          tenantId: origin.tenantId,
          unitId: origin.unitId,
          closed: origin.status === "MÊS FECHADO",
          competence: origin.competence,
          updatedBy: origin.updatedBy,
        });
      }
    });
  } catch (error) {
    const isQuotaOrContention =
      error instanceof Error &&
      /quota|resource-exhausted|exceeded|unavailable|deadline/i.test(`${error.name} ${error.message}`);
    if (isQuotaOrContention) {
      console.warn("[commitRecords] Quota ou contenção no Firestore. Executando fallback em batch leve...", error);
      try {
        const batch = writeBatch(db);
        const now = new Date().toISOString();
        records.forEach((r) => {
          const data = sanitizeFirestoreData({
            ...r,
            version: Number(r.version || 0) + 1,
            updatedAt: now,
          });
          batch.set(doc(db, col(r.kind), r.id), data, { merge: true });
        });
        if (uniqueRef) {
          batch.set(uniqueRef, sanitizeFirestoreData({
            tenantId: origin.tenantId,
            unitId: origin.unitId,
            recordId: origin.id,
            updatedBy: origin.updatedBy,
          }), { merge: true });
        }
        await batch.commit();
        console.log("[commitRecords] Gravado via batch leve com sucesso!");
      } catch (batchErr) {
        console.warn("[commitRecords] Cota total diária do Firestore esgotada. Enfileirando localmente para envio 100% seguro:", batchErr);
        records.forEach((r) => queueManagementRecord(r));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("house190_local_records_queued", { detail: records }));
        }
      }
    } else {
      throw error;
    }
  }
  if (origin.kind === "actions" && !origin.archived) {
    const previous = state.actions.find((item) => item.id === origin.id);
    const created = !previous;
    const completed = previous?.status !== "Concluído" && origin.status === "Concluído";
    if (created || completed) void addNotificationToFirestore({
      type:"task",eventKind:created ? "task_created" : "task_completed",unitId:origin.unitId,
      title:created ? "Nova tarefa criada" : "Tarefa concluída",
      message:`${str(origin,"problem")} · responsável: ${str(origin,"owner") || "DADO PENDENTE"}.`,
      details:[{label:"Tarefa",value:str(origin,"problem") || "DADO PENDENTE"},{label:"Descrição",value:str(origin,"action") || "DADO PENDENTE"},{label:"Responsável",value:str(origin,"owner") || "DADO PENDENTE"},{label:"Prazo",value:str(origin,"dueDate").split("-").reverse().join("/") || "DADO PENDENTE"},{label:"Status",value:str(origin,"status") || "Pendente"}],
      link:"/tarefas/",severity:completed ? "success" : "info",read:false,timestamp:new Date().toISOString()
    });
  }
  if (["cashClosings", "cashConferences"].includes(origin.kind) && !origin.archived) {
    const difference = Number(origin.difference || 0);
    const unitName = String(state.units.find((unit) => unit.id === origin.unitId)?.name || origin.unitId);
    void addNotificationToFirestore({type:"approval",eventKind:"cash_closing",unitId:origin.unitId,title:origin.kind === "cashClosings" ? "Fechamento de caixa enviado" : "Conferência de caixa concluída",message:`${unitName} · ${str(origin,"date").split("-").reverse().join("/")} · ${difference === 0 ? "Sem divergência no fechamento principal." : `Divergência: ${currency(difference)}.`}`,details:[{label:"Unidade",value:unitName},{label:"Data",value:str(origin,"date").split("-").reverse().join("/")},{label:"Operador",value:str(origin,"operatorName") || "DADO PENDENTE"},{label:"Situação",value:str(origin,"status")},{label:"Diferença",value:currency(difference)}],link:origin.kind === "cashClosings" ? "/conferencia-caixa/" : "/fechamento-caixa/",severity:difference !== 0 ? "warning" : "success",read:false,timestamp:new Date().toISOString()});
    const pix = records.filter((record) => record.kind === "payables" && record.pixKey);
    if (pix.length) void addNotificationToFirestore({type:"payable",eventKind:"pix_request",unitId:origin.unitId,title:"Novas solicitações de PIX",message:`${pix.length} solicitação(ões) de PIX no fechamento de ${unitName}. Total: ${currency(pix.reduce((sum,record) => sum + Number(record.amount || 0),0))}.`,details:pix.slice(0,12).map((record) => ({label:"Pagamento PIX",value:`${str(record,"description")} · ${currency(Number(record.amount || 0))}`})),link:"/contas-a-pagar/",severity:"warning",read:false,timestamp:new Date().toISOString()});
  }
}

export async function reverseSettlement(
  record: RecordData,
  state: Database,
  uid: string,
  date: string,
) {
  if (
    !record.obligationId ||
    record.reversalOf ||
    state.transactions.some((t) => t.reversalOf === record.id)
  )
    throw new Error("Liquidação indisponível para estorno.");
  if (date < str(record, "date"))
    throw new Error("O estorno não pode ser anterior à liquidação.");
  const now = new Date().toISOString();
  const reversal: RecordData = {
    ...record,
    id: "reverse-" + record.id,
    version: 0,
    date,
    competence: date.slice(0, 7),
    reversalOf: record.id,
    direction: record.direction === "Entrada" ? "Saída" : "Entrada",
    description: "Estorno: " + str(record, "description"),
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
    principal: record.principal ? -Number(record.principal) : 0,
  };
  await commitRecords([reversal], state, reversal);
  return reversal;
}
