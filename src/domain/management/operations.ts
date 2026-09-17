import {
  RecordData,
  Database,
  DEFINITIONS,
  CHECKLIST,
  Field,
  str,
  num,
  addMonths,
  monthEnd,
  cents,
} from "./model";
import { isCovered, calculate, outstanding } from "./engine";
export function validate(record: RecordData, db: Database) {
  const def = DEFINITIONS[record.kind];
  if (!def) throw new Error("Base inválida.");
  if (
    !def.global &&
    !db.units.some((u) => u.id === record.unitId && !u.archived)
  )
    throw new Error("Selecione uma unidade cadastrada.");
  for (const field of def.fields) {
    const value = record[field.key];
    if (
      field.required &&
      (value === undefined || value === null || value === "")
    )
      throw new Error(`Preencha: ${field.label}.`);
    if (value === undefined || value === null || value === "") continue;
    if (["money", "number", "percent"].includes(field.type || "")) {
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`${field.label}: número inválido.`);
      if (field.type === "money" && !Number.isSafeInteger(value))
        throw new Error(`${field.label}: valor monetário inválido.`);
      if (
        value < 0 &&
        !(record.kind === "bankAccounts" && field.key === "balance") &&
        !(record.kind === "cashConferences" && field.key === "difference") &&
        !(record.kind === "cashClosings" && ["difference", "cashDifference", "creditDifference", "debitDifference", "pixDifference", "motoboyDifference", "invoiceDifference"].includes(field.key))
      )
        throw new Error(`${field.label} não pode ser negativo.`);
    }
    if (
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ||
        new Date(String(value) + "T12:00:00Z").toISOString().slice(0, 10) !==
          value)
    )
      throw new Error(`${field.label}: data inválida.`);
    if (
      field.type === "month" &&
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value))
    )
      throw new Error("Competência inválida.");
    if (
      field.type === "select" &&
      value !== "" &&
      value !== undefined &&
      value !== null &&
      !field.options?.includes(String(value))
    )
      throw new Error(`${field.label}: opção inválida.`);
    if (field.type === "ref") {
      const target = (db[field.ref!] || []).find(
        (r) => r.id === value && !r.archived,
      );
      if (!target) throw new Error(`${field.label}: cadastro não encontrado.`);
      if (!DEFINITIONS[field.ref!].global && target.unitId !== record.unitId)
        throw new Error(`${field.label}: cadastro de outra unidade.`);
    }
  }
  if (record.start && record.end && str(record, "end") < str(record, "start"))
    throw new Error("A data final deve ser posterior à inicial.");
  if (record.kind === "transfers" && record.toUnitId === record.unitId)
    throw new Error("Origem e destino devem ser diferentes.");
  if (record.kind === "policies") {
    for (const [good, bad] of [
      ["cmvTarget", "cmvCritical"],
      ["payrollTarget", "payrollCritical"],
      ["debtTarget", "debtCritical"],
    ])
      if (Number(record[bad]) <= Number(record[good]))
        throw new Error("Limite crítico deve superar o limite saudável.");
    for (const k of ["marginTarget", "liquidityTarget", "returnTarget"])
      if (Number(record[k]) <= 0)
        throw new Error(
          "Metas de margem, liquidez e rentabilidade devem ser positivas.",
        );
  }
  if (record.kind === "revenues" || record.kind === "sales") {
    if (
      ["discounts", "coupons", "cashback", "cancellations"].reduce(
        (s, k) => s + Number(record[k] || 0),
        0,
      ) > Number(record.gross)
    )
      throw new Error("Deduções excedem o faturamento bruto.");
    const other = record.kind === "sales" ? "revenues" : "sales";
    if (
      db[other].some(
        (r) =>
          !r.archived &&
          r.unitId === record.unitId &&
          r.date === record.date &&
          r.channel === record.channel,
      )
    )
      throw new Error(
        "Já existe resumo/venda para este dia e canal. Use uma única fonte.",
      );
  }
  if (
    record.kind === "attendance" &&
    Number(record.absentHours) > Number(record.scheduledHours)
  )
    throw new Error("Horas ausentes excedem as previstas.");
  if (
    record.kind === "goals" &&
    Number(record.superTarget || 0) > 0 &&
    Number(record.superTarget) < Number(record.target)
  )
    throw new Error("Supermeta deve ser maior ou igual à meta.");
  if (
    record.kind === "payables" &&
    !record.sourceKind &&
    record.obligationType !== "Imposto" &&
    ["CMV", "Impostos sobre vendas", "Impostos sobre lucro"].includes(
      String(db.categories.find((c) => c.id === record.categoryId)?.dreLine),
    )
  )
    throw new Error(
      "Use o módulo de compras/estoque ou impostos para este lançamento, mantendo a apuração integrada.",
    );
  if (record.kind === "payables") {
    const installments = Number(record.installments || 1),
      recurrence = Number(record.recurrenceCount || 1);
    if (
      !Number.isInteger(installments) ||
      !Number.isInteger(recurrence) ||
      installments < 1 ||
      recurrence < 1 ||
      installments > 120 ||
      recurrence > 120
    )
      throw new Error("Informe de 1 a 120 parcelas/repetições.");
    if (installments > 1 && recurrence > 1)
      throw new Error("Use parcelamento ou recorrência, separadamente.");
  }
  if (record.kind === "closings" && record.status === "MÊS FECHADO") {
    if (CHECKLIST.some((_, i) => record["check" + i] !== true))
      throw new Error("Conclua todos os itens do fechamento.");
    const start = str(record, "competence") + "-01",
      end = monthEnd(start);
    for (const dataset of [
      "revenues",
      "transactions",
      "payables",
      "receivables",
      "taxes",
      "payroll",
      "purchases",
      "inventory",
      "transfers",
      "employees",
      "loans",
      "bankAccounts",
    ])
      if (!isCovered(db, record.unitId, dataset, start, end))
        throw new Error(`Confira a base ${dataset} antes de fechar.`);
    const result = calculate(db, {
      unitId: record.unitId,
      companyId: "",
      brandId: "",
      group: "",
      channel: "",
      start,
      end,
      today: end,
    });
    if (
      result.metrics.profit.value === null ||
      result.metrics.bank.value === null
    )
      throw new Error(
        "DRE e saldo bancário precisam estar completos antes do fechamento.",
      );
  }
  const same = (keys: string[]) =>
    db[record.kind].some(
      (r) =>
        r.id !== record.id &&
        !r.archived &&
        r.unitId === record.unitId &&
        keys.every((k) => r[k] === record[k]),
    );
  const uniqueKeys: Record<string, string[]> = {
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
  if (uniqueKeys[record.kind] && same(uniqueKeys[record.kind]))
    throw new Error(
      "Já existe um registro para esta origem/período. Edite o existente.",
    );
  const payments = db.transactions.filter(
    (t) =>
      !t.archived &&
      (t.obligationId === record.id ||
        db.payables.some(
          (p) => p.sourceId === record.id && p.id === t.obligationId,
        )),
  );
  if (payments.length)
    throw new Error(
      "Este registro possui liquidações. Faça o estorno da liquidação antes de alterar a origem.",
    );
}
export function payrollProvisions(r: RecordData) {
  const base = Number(r.eligibleBase);
  const vacationProvision = Math.round(base / 12),
    vacationThird = Math.round(vacationProvision / 3),
    thirteenth = Math.round(base / 12);
  const fgts = Math.round((base * Number(r.fgtsRate)) / 100);
  const provisionCharges = Math.round(
    ((vacationProvision + vacationThird + thirteenth) * Number(r.chargeRate)) /
      100,
  );
  return {
    vacationProvision,
    vacationThird,
    thirteenth,
    fgts,
    provisionCharges,
  };
}
export function buildRecords(input: RecordData): RecordData[] {
  const r = { ...input };
  if (
    r.kind === "taxes" &&
    (r.amount === null || r.amount === undefined) &&
    typeof r.base === "number" &&
    typeof r.rate === "number"
  )
    r.amount = Math.round((r.base * r.rate) / 100);
  if (r.kind === "payroll") Object.assign(r, payrollProvisions(r));
  if (
    r.kind === "taxes" &&
    (typeof r.amount !== "number" || !Number.isSafeInteger(r.amount))
  )
    throw new Error("Informe o valor do imposto ou base e alíquota completas.");
  const result = [r];
  const obligation = (
    suffix: string,
    amount: number,
    dueDate: string,
    description: string,
    extra: Partial<RecordData> = {},
  ) => {
    result.push({
      ...r,
      id: `ob-${r.id}-${suffix}`,
      kind: "payables",
      amount,
      dueDate,
      description,
      status: "Pendente",
      obligationType:
        r.kind === "taxes"
          ? "Imposto"
          : r.kind === "loanInstallments"
            ? "Empréstimo"
            : r.kind === "purchases"
              ? "Boleto"
              : "Outros",
      sourceKind: r.kind,
      sourceId: r.id,
      nature: "Operacional",
      categoryId: r.categoryId || "",
      installments: 1,
      recurrenceCount: 1,
      ...extra,
    });
  };
  if (r.kind === "taxes")
    obligation(
      "tax",
      Number(r.amount),
      str(r, "dueDate"),
      `${r.taxType} · ${r.competence}`,
    );
  if (r.kind === "payroll") {
    const pay = [
      "salary",
      "benefits",
      "charges",
      "commissions",
      "service",
      "overtime",
      "fgts",
    ].reduce((s, k) => s + Number(r[k]), 0);
    const provision = [
      "vacationProvision",
      "vacationThird",
      "thirteenth",
      "provisionCharges",
    ].reduce((s, k) => s + Number(r[k]), 0);
    obligation("pay", pay, str(r, "dueDate"), `Folha · ${r.competence}`);
    obligation(
      "provision",
      provision,
      str(r, "provisionDueDate"),
      `Férias / 13º / encargos provisionados · ${r.competence}`,
      { provision: true },
    );
  }
  if (r.kind === "purchases") {
    r.competence = str(r, "date").slice(0, 7);
    obligation(
      "purchase",
      Number(r.amount),
      str(r, "dueDate"),
      str(r, "description"),
      { competence: r.competence },
    );
  }
  if (r.kind === "loanInstallments")
    obligation(
      "loan",
      Number(r.principal) + Number(r.interest),
      str(r, "dueDate"),
      `Parcela ${r.number}`,
      { nature: "Financiamento", loanId: r.loanId },
    );
  if (r.kind === "payables") {
    const installments = Number(r.installments || 1),
      recurrence = Number(r.recurrenceCount || 1),
      count = Math.max(installments, recurrence);
    if (count > 1) {
      result.length = 0;
      for (let i = 0; i < count; i++) {
        result.push({
          ...r,
          id: i === 0 ? r.id : `${r.id}-part-${i + 1}`,
          amount:
            installments > 1
              ? Math.floor(Number(r.amount) / count) +
                (i < Number(r.amount) % count ? 1 : 0)
              : r.amount,
          originalTotal: r.amount,
          originalInstallments: count,
          installmentNumber: i + 1,
          installmentGroupId: r.id,
          dueDate: addMonths(str(r, "dueDate"), i),
          competence:
            recurrence > 1
              ? addMonths(str(r, "competence") + "-01", i).slice(0, 7)
              : r.competence,
          installments: 1,
          recurrenceCount: 1,
        });
      }
    }
  }
  return result;
}
export function settlement(
  record: RecordData,
  db: Database,
  amount: number,
  date: string,
  bankId: string,
  uid: string,
  id: string,
): RecordData {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > outstanding(record, db, date)
  )
    throw new Error("Valor da baixa deve ser positivo e não exceder o saldo.");
  const bank = db.bankAccounts.find((r) => r.id === bankId && !r.archived);
  if (!bank)
    throw new Error("Conta bancária de saída inválida ou inativa.");
  const row: RecordData = {
    id,
    kind: "transactions",
    tenantId: record.tenantId,
    unitId: record.unitId,
    version: 0,
    createdBy: uid,
    updatedBy: uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    description: `Baixa: ${str(record, "description")}`,
    date,
    competence: record.competence || date.slice(0, 7),
    amount,
    direction: record.kind === "receivables" ? "Entrada" : "Saída",
    bankAccountId: bankId,
    nature: record.nature || "Operacional",
    categoryId: record.categoryId || "",
    obligationId: record.id,
    obligationKind: record.kind,
    channel: record.channel || "",
    paymentMethod: record.paymentMethod || "",
    externalId: id,
  };
  if (record.loanId) {
    const installment = db.loanInstallments.find(
      (r) => r.id === record.sourceId,
    );
    row.loanId = record.loanId;
    row.principal = installment
      ? Math.round(
          (amount * Number(installment.principal)) / Number(record.amount),
        )
      : 0;
  }
  return row;
}
export function parseField(field: Field, value: FormDataEntryValue | null) {
  if (field.type === "check") return value === "on";
  if (value === null || value === "") return null;
  const text = String(value);
  if (field.type === "money") return cents(Number(text));
  if (field.type === "number" || field.type === "percent") return Number(text);
  return text.trim();
}
