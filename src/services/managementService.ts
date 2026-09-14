"use client";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  runTransaction,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  RecordData,
  Database,
  DEFINITIONS,
  str,
} from "@/domain/management/model";
import { buildRecords, validate } from "@/domain/management/operations";
const col = (kind: string) => "gestao_" + kind;
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
export async function saveManagement(
  record: RecordData,
  state: Database,
  archive = false,
) {
  if (!archive) validate(record, state);
  const outgoing = archive
    ? [{ ...record, archived: true }]
    : buildRecords(record);
  if (!archive) validate(outgoing[0], state);
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
  await commitRecords(outgoing, state, record);
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
  await runTransaction(db, async (tx) => {
    const uniqueRef = uniqueId ? doc(db, "gestao_unique", uniqueId) : null;
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
      tx.set(uniqueRef, {
        tenantId: origin.tenantId,
        unitId: origin.unitId,
        recordId: origin.id,
        updatedBy: origin.updatedBy,
      });
    records.forEach((r, i) => {
      const data = {
        ...r,
        version: existing[i].exists()
          ? Number(existing[i].data()?.version || 0) + 1
          : 1,
        updatedAt: now,
      };
      tx.set(refs[i], data);
      const audit = doc(collection(db, "gestao_audit"));
      tx.set(audit, {
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
      });
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
}
