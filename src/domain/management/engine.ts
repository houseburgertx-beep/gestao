import { withTakeat } from "./takeat";
import {
  Database,
  RecordData,
  DEFINITIONS,
  str,
  num,
  addDays,
  daysBetween,
  monthEnd,
  currency,
} from "./model";
export interface Filters {
  start: string;
  end: string;
  today: string;
  unitId: string;
  companyId: string;
  brandId: string;
  group: string;
  channel: string;
}
export interface Metric {
  value: number | null;
  partial: number | null;
  missing: string[];
  formula: string;
}
export interface Alert {
  id: string;
  severity: "critical" | "warning" | "healthy";
  title: string;
  detail: string;
  unitId?: string;
  amount?: number;
}
export interface ForecastDay {
  date: string;
  incoming: number;
  outgoing: number;
  balance: number | null;
}
export const WEIGHTS: Record<string, number> = {
  liquidity: 15,
  cashGeneration: 15,
  debt: 10,
  margin: 10,
  cmv: 10,
  payroll: 10,
  overdue: 10,
  coverage: 10,
  goal: 5,
  profitability: 5,
};
const n = (r: RecordData, k: string) => num(r, k) ?? 0;
const total = (rows: RecordData[], key: string) =>
  rows.reduce((s, r) => s + n(r, key), 0);
const unique = (xs: string[]) => Array.from(new Set(xs));
const metric = (
  value: number | null,
  formula: string,
  missing: string[] = [],
): Metric => ({
  value: missing.length ? null : value,
  partial: value,
  missing: unique(missing),
  formula,
});
const ratio = (a: Metric, b: Metric, multiplier = 100): Metric =>
  metric(
    a.value !== null && b.value !== null && b.value > 0
      ? (a.value / b.value) * multiplier
      : null,
    "Numerador ÷ denominador × " + multiplier,
    [
      ...a.missing,
      ...b.missing,
      ...(b.value !== null && b.value <= 0
        ? ["Denominador positivo necessário"]
        : []),
    ],
  );
const combine = (parts: Metric[], signs: number[], formula: string) =>
  metric(
    parts.every((p) => p.value !== null)
      ? parts.reduce((s, p, i) => s + p.value! * signs[i], 0)
      : null,
    formula,
    parts.flatMap((p) => p.missing),
  );
const inRange = (d: string, a: string, b: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= a && d <= b;
export function scopeUnits(db: Database, f: Filters): RecordData[] {
  return (db.units || []).filter(
    (r) =>
      !r.archived &&
      (!f.unitId || r.id === f.unitId) &&
      (!f.companyId || str(r, "companyId") === f.companyId) &&
      (!f.brandId || str(r, "brandId") === f.brandId) &&
      (!f.group ||
        str(r, "groups")
          .split(",")
          .map((s) => s.trim())
          .includes(f.group)),
  );
}
export function isCovered(
  db: Database,
  unitId: string,
  dataset: string,
  start: string,
  end: string,
  channel = "",
): boolean {
  if (end < start) return true;
  const windows = (db.coverage || [])
    .filter(
      (r) =>
        !r.archived &&
        r.unitId === unitId &&
        r.dataset === dataset &&
        r.confirmed === true &&
        (r.source === "takeat" ? str(r, "channel") === channel : (!str(r, "channel") || r.channel === channel)),
    )
    .sort((a, b) => str(a, "start").localeCompare(str(b, "start")));
  let cursor = start;
  for (const w of windows) {
    if (str(w, "start") > cursor) break;
    if (str(w, "end") >= cursor) cursor = addDays(str(w, "end"), 1);
    if (cursor > end) return true;
  }
  return false;
}
export function outstanding(
  row: RecordData,
  db: Database,
  asOf: string,
): number {
  const paid = (db.transactions || [])
    .filter(
      (t) => !t.archived && t.obligationId === row.id && str(t, "date") <= asOf,
    )
    .reduce((s, t) => s + n(t, "amount") * (t.reversalOf ? -1 : 1), 0);
  return Math.max(0, n(row, "amount") - paid);
}
export function payableStatus(
  row: RecordData,
  db: Database,
  today: string,
): string {
  if (row.archived) return "Cancelado";
  if (outstanding(row, db, today) === 0) return "Pago";
  if (str(row, "dueDate") < today) return "Vencido";
  if (str(row, "dueDate") <= addDays(today, 3)) return "Vencendo";
  return str(row, "status") || "Pendente";
}
export function healthLabel(score: number | null) {
  return score === null
    ? "DADO PENDENTE"
    : score >= 80
      ? "Excelente"
      : score >= 65
        ? "Saudável"
        : score >= 50
          ? "Atenção"
          : score >= 30
            ? "Crítico"
            : "Emergência";
}
export function calculate(db: Database, f: Filters) {
  db = withTakeat(db, f);
  const units = scopeUnits(db, f),
    ids = new Set(units.map((u) => u.id));
  const asOf = f.end < f.today ? f.end : f.today;
  const end = asOf;
  const rows = (kind: string) =>
    (db[kind] || []).filter((r) => !r.archived && ids.has(r.unitId));
  const missing = (
    dataset: string,
    start = f.start,
    finish = end,
    channel = f.channel,
  ) => {
    if (finish < start) return ["Período futuro sem realizado"];
    const def = DEFINITIONS[dataset];
    const fields = (def?.fields || []).filter(
      (field) =>
        field.required &&
        ["money", "number", "percent"].includes(field.type || ""),
    );
    const relevant = rows(dataset).filter(
      (r) =>
        !def?.dated ||
        !str(r, def.dated) ||
        (str(r, "competence") >= start.slice(0, 7) &&
          str(r, "competence") <= finish.slice(0, 7)) ||
        (def.dated === "competence"
          ? str(r, def.dated) >= start.slice(0, 7) &&
            str(r, def.dated) <= finish.slice(0, 7)
          : str(r, def.dated) >= start && str(r, def.dated) <= finish),
    );
    const invalid = relevant.filter(r => !(dataset === "revenues" && r.source === "takeat")).flatMap((r) =>
      fields
        .filter((field) => num(r, field.key) === null)
        .map((field) => `${def.label}: ${field.label} ausente (${r.id})`),
    );
    return [
      ...(units.length
        ? units
            .filter(
              (u) => !isCovered(db, u.id, dataset, start, finish, channel),
            )
            .map(
              (u) =>
                `${str(u, "name")}: ${DEFINITIONS[dataset]?.label || dataset} não conferido de ${start} a ${finish}`,
            )
        : ["Cadastre e selecione as unidades"]),
      ...invalid,
    ];
  };
  const channelMissing = f.channel
    ? ["Valores de caixa, custos e patrimônio não são rateados por canal"]
    : [];
  const pick = (kind: string, key = "date") =>
    rows(kind).filter(
      (r) =>
        inRange(str(r, key), f.start, end) &&
        (!f.channel || r.channel === f.channel),
    );
  const period = (kind: string) =>
    rows(kind).filter(
      (r) =>
        str(r, "competence") >= f.start.slice(0, 7) &&
        str(r, "competence") <= end.slice(0, 7),
    );
  const periodMismatch =
    f.start.slice(8) !== "01" || end !== monthEnd(end)
      ? [
          "DRE exige competência mensal completa; para mês aberto, confira a competência até o corte",
        ]
      : [];
  // Monthly competence can be used in a partial period only if coverage explicitly confirms the exact requested interval.
  const monthsConfirmed = (dataset: string) =>
    missing(dataset).length === 0 ? [] : periodMismatch;
  const revs = pick("revenues"),
    sales = pick("sales");
  const revKey = (r: RecordData) => `${r.unitId}|${r.date}|${r.channel}`;
  const revenueKeys = new Set(revs.map(revKey));
  const overlap = sales.some((r) => revenueKeys.has(revKey(r)));
  const revenueRows = [
    ...revs,
    ...sales.filter((r) => !revenueKeys.has(revKey(r))),
  ];
  const revMissing = [
    ...missing("revenues"),
    ...(overlap
      ? [
          "Há vendas detalhadas e resumo no mesmo dia/canal; resolva a duplicidade",
        ]
      : []),
  ];
  const revenueMetric = (key: string, formula: string) =>
    metric(total(revenueRows, key), formula, [
      ...revMissing,
      ...(revenueRows.some((r) => num(r, key) === null)
        ? [`Campo ${key} incompleto no faturamento`]
        : []),
    ]);
  const gross = revenueMetric("gross", "Soma do faturamento bruto no período");
  const deductions = metric(
    revenueRows.reduce(
      (s, r) =>
        s +
        n(r, "discounts") +
        n(r, "coupons") +
        n(r, "cashback") +
        n(r, "cancellations"),
      0,
    ),
    "Descontos + cupons + cashback + cancelamentos",
    [
      ...revMissing,
      ...(revenueRows.some((r) =>
        ["discounts", "coupons", "cashback", "cancellations"].some(
          (k) => num(r, k) === null,
        ),
      )
        ? ["Deduções incompletas"]
        : []),
    ],
  );
  const commercial = combine(
    [gross, deductions],
    [1, -1],
    "Bruto − descontos − cupons − cashback − cancelamentos",
  );
  const taxRows = period("taxes");
  const salesTax = metric(
    total(
      taxRows.filter((r) => r.taxEffect === "Impostos sobre vendas"),
      "amount",
    ),
    "Impostos sobre vendas por competência",
    [...missing("taxes"), ...monthsConfirmed("taxes"), ...channelMissing],
  );
  const net = combine(
    [commercial, salesTax],
    [1, -1],
    "Receita comercial − impostos sobre vendas",
  );
  const fees = revenueMetric("fees", "Taxas comerciais registradas nas vendas");
  const transactions = rows("transactions").filter((r) =>
    inRange(str(r, "date"), f.start, end),
  );
  const transferRows = transactions.filter(
    (r) => r.nature === "Transferência interna",
  );
  const tx = transactions.filter((r) => r.nature !== "Transferência interna");
  const flow = (direction: string, operational = false) =>
    metric(
      total(
        tx.filter(
          (r) =>
            r.direction === direction &&
            (!operational || r.nature === "Operacional"),
        ),
        "amount",
      ),
      `${direction}s efetivas${operational ? " operacionais" : ""} no período`,
      [...missing("transactions"), ...channelMissing],
    );
  const receipts = flow("Entrada"),
    spending = flow("Saída");
  const operatingReceipts = flow("Entrada", true),
    operatingSpending = flow("Saída", true);
  const cashGeneration = combine(
    [operatingReceipts, operatingSpending],
    [1, -1],
    "Recebimentos operacionais − pagamentos operacionais",
  );
  const bankRows = rows("bankAccounts");
  const bankProblems = [
    ...missing("bankAccounts", asOf, asOf),
    ...missing("transactions", asOf, asOf),
    ...channelMissing,
  ];
  for (const u of units) {
    if (!bankRows.some((r) => r.unitId === u.id))
      bankProblems.push(`${str(u, "name")}: nenhuma conta/caixa conciliado`);
  }
  let bankValue = 0;
  for (const bank of bankRows) {
    const date = str(bank, "balanceDate");
    if (
      bank.reconciled !== true ||
      !date ||
      date > asOf ||
      num(bank, "balance") === null
    ) {
      bankProblems.push(
        `Saldo de ${str(bank, "name")} não conciliado no corte`,
      );
      continue;
    }
    if (!isCovered(db, bank.unitId, "transactions", addDays(date, 1), asOf))
      bankProblems.push(
        `Movimentações de ${str(bank, "name")} posteriores ao saldo não conferidas`,
      );
    bankValue += n(bank, "balance");
    for (const t of rows("transactions").filter(
      (t) =>
        t.bankAccountId === bank.id &&
        str(t, "date") > date &&
        str(t, "date") <= asOf,
    )) {
      bankValue += n(t, "amount") * (t.direction === "Entrada" ? 1 : -1);
    }
  }
  const bank = metric(
    bankValue,
    "Saldo conciliado + entradas posteriores − saídas posteriores",
    bankProblems,
  );
  const accounts = rows("payables").filter((r) => outstanding(r, db, asOf) > 0);
  const receivableRows = rows("receivables").filter(
    (r) => outstanding(r, db, asOf) > 0,
  );
  const obligationMissing = [
    ...missing("payables", asOf, addDays(asOf, 90)),
    ...channelMissing,
  ];
  const payable = metric(
    accounts.reduce((s, r) => s + outstanding(r, db, asOf), 0),
    "Total das obrigações abertas cadastradas",
    obligationMissing,
  );
  const receiveMissing = [
    ...missing("receivables", asOf, addDays(asOf, 90)),
    ...channelMissing,
  ];
  const receivable = metric(
    receivableRows.reduce((s, r) => s + outstanding(r, db, asOf), 0),
    "Recebíveis − liquidações",
    receiveMissing,
  );
  const amountDue = (days: number) =>
    metric(
      accounts
        .filter((r) => str(r, "dueDate") <= addDays(asOf, days))
        .reduce((s, r) => s + outstanding(r, db, asOf), 0),
      "Obrigações abertas até o horizonte, incluindo vencidas",
      obligationMissing,
    );
  const overdue = metric(
    accounts
      .filter((r) => str(r, "dueDate") < asOf)
      .reduce((s, r) => s + outstanding(r, db, asOf), 0),
    "Obrigações abertas vencidas antes da data de corte",
    obligationMissing,
  );
  const committedRows = accounts.filter(
    (r) => str(r, "dueDate") <= addDays(asOf, 30) || r.provision === true,
  );
  const committed = metric(
    committedRows.reduce((s, r) => s + outstanding(r, db, asOf), 0),
    "Vencidos + próximos 30 dias + provisões abertas, sem duplicar a origem",
    [...obligationMissing, ...missing("taxes"), ...missing("payroll")],
  );
  const freeCash = combine(
    [bank, committed],
    [1, -1],
    "Saldo bancário − compromissos em 30 dias − demais provisões abertas",
  );
  const taxesPayable = metric(
    accounts
      .filter((r) => r.sourceKind === "taxes")
      .reduce((s, r) => s + outstanding(r, db, asOf), 0),
    "Obrigações de impostos ainda não pagas",
    [...obligationMissing, ...missing("taxes")],
  );
  const payrollPayable = metric(
    accounts
      .filter((r) => r.sourceKind === "payroll")
      .reduce((s, r) => s + outstanding(r, db, asOf), 0),
    "Folha e provisões vinculadas ainda não pagas",
    [...obligationMissing, ...missing("payroll")],
  );
  const purchaseRows = pick("purchases");
  const purchases = metric(
    total(purchaseRows, "amount"),
    "Compras líquidas a custo",
    [...missing("purchases"), ...channelMissing],
  );
  const openingDate = addDays(f.start, -1);
  const inv = rows("inventory").filter((r) => r.confirmed === true);
  const opening = inv.filter((r) => r.date === openingDate),
    closing = inv.filter((r) => r.date === end);
  const invProblems = [
    ...missing("inventory", openingDate, openingDate),
    ...missing("inventory", end, end),
    ...missing("transfers"),
    ...channelMissing,
  ];
  const knownProducts = new Set(
    [
      ...opening,
      ...closing,
      ...purchaseRows,
      ...rows("transfers").filter((r) => inRange(str(r, "date"), f.start, end)),
    ].map((r) => `${r.unitId}|${r.productId}`),
  );
  for (const key of Array.from(knownProducts)) {
    if (
      !opening.some((r) => `${r.unitId}|${r.productId}` === key) ||
      !closing.some((r) => `${r.unitId}|${r.productId}` === key)
    )
      invProblems.push(`Estoque inicial/final ausente para ${key}`);
  }
  const incomingTransfers = (db.transfers || []).filter(
    (r) =>
      !r.archived &&
      ids.has(str(r, "toUnitId")) &&
      !ids.has(r.unitId) &&
      inRange(str(r, "date"), f.start, end),
  );
  const outgoingTransfers = rows("transfers").filter(
    (r) =>
      !ids.has(str(r, "toUnitId")) && inRange(str(r, "date"), f.start, end),
  );
  const cmv = metric(
    total(opening, "amount") +
      total(purchaseRows, "amount") +
      total(incomingTransfers, "amount") -
      total(outgoingTransfers, "amount") -
      total(closing, "amount"),
    "Estoque inicial + compras + transferências líquidas − estoque final",
    [...purchases.missing, ...invProblems],
  );
  if (cmv.value !== null && cmv.value < 0) {
    cmv.missing.push("CMV negativo: confira estoques e transferências");
    cmv.value = null;
  }
  const cmvPct = ratio(cmv, net);
  const payRows = period("payroll");
  const payrollCost = (r: RecordData) =>
    [
      "salary",
      "benefits",
      "charges",
      "commissions",
      "service",
      "overtime",
      "vacationProvision",
      "vacationThird",
      "thirteenth",
      "fgts",
      "provisionCharges",
    ].reduce((s, k) => s + n(r, k), 0);
  const payroll = metric(
    payRows.reduce((s, r) => s + payrollCost(r), 0),
    "Remuneração + benefícios + encargos + provisões incrementais",
    [
      ...missing("payroll"),
      ...monthsConfirmed("payroll"),
      ...channelMissing,
      ...payRows
        .filter((r) =>
          [
            "vacationProvision",
            "vacationThird",
            "thirteenth",
            "fgts",
            "provisionCharges",
          ].some((k) => num(r, k) === null),
        )
        .map((r) => `Provisões não calculadas: ${r.id}`),
    ],
  );
  let payrollPct = ratio(payroll, net);
  const cats = new Map((db.categories || []).map((r) => [r.id, r]));
  const expenses = period("payables").filter((r) => !r.sourceKind);
  const categoryProblems = expenses
    .filter((r) => !cats.has(str(r, "categoryId")))
    .map((r) => `Categoria ausente: ${str(r, "description")}`);
  const expensesMissing = [
    ...missing("payables"),
    ...monthsConfirmed("payables"),
    ...categoryProblems,
    ...channelMissing,
  ];
  const byLine = (line: string) =>
    metric(
      total(
        expenses.filter(
          (r) => cats.get(str(r, "categoryId"))?.dreLine === line,
        ),
        "amount",
      ),
      `Despesas de ${line} por competência`,
      expensesMissing,
    );
  const grossProfit = combine([net, cmv], [1, -1], "Receita líquida − CMV");
  const operatingLines = [
    "Aluguel",
    "Energia",
    "Marketing",
    "Taxas",
    "Administrativas",
    "Operacionais",
  ];
  const otherPayroll = combine(
    [
      byLine("Folha"),
      byLine("Encargos"),
      metric(
        total(
          taxRows.filter((r) => r.taxEffect === "Encargos"),
          "amount",
        ),
        "Encargos tributários fora da folha",
        salesTax.missing,
      ),
    ],
    [1, 1, 1],
    "Outros custos de pessoal classificados",
  );
  const personnel = combine(
    [payroll, otherPayroll],
    [1, 1],
    "Folha + demais custos de pessoal classificados",
  );
  payrollPct = ratio(personnel, net);
  const marketingPct = ratio(byLine("Marketing"), net),
    taxPct = ratio(salesTax, gross),
    feesPct = ratio(
      combine(
        [byLine("Taxas"), fees],
        [1, 1],
        "Taxas comerciais e demais taxas",
      ),
      net,
    );
  const opExpenses = combine(
    [...operatingLines.map(byLine), fees],
    Array(operatingLines.length + 1).fill(1),
    "Despesas operacionais por competência + taxas comerciais",
  );
  const ebitda = combine(
    [grossProfit, personnel, opExpenses],
    [1, -1, -1],
    "Lucro bruto − pessoal − despesas operacionais (antes de D&A)",
  );
  const depreciation = byLine("Depreciação e amortização");
  const operatingResult = combine(
    [ebitda, depreciation],
    [1, -1],
    "Resultado antes de D&A − depreciação/amortização",
  );
  const interest = combine(
    [
      byLine("Juros"),
      metric(
        total(period("loanInstallments"), "interest"),
        "Juros das parcelas por competência",
        [...missing("loans"), ...channelMissing],
      ),
    ],
    [1, 1],
    "Juros de obrigações e contratos",
  );
  const financeExpenses = byLine("Despesas financeiras");
  const profitTaxes = metric(
    total(
      taxRows.filter((r) => r.taxEffect === "Impostos sobre lucro"),
      "amount",
    ),
    "Tributos sobre lucro por competência",
    salesTax.missing,
  );
  const profit = combine(
    [operatingResult, financeExpenses, interest, profitTaxes],
    [1, -1, -1, -1],
    "Resultado operacional − despesas financeiras − juros − impostos sobre lucro",
  );
  const margin = ratio(profit, net),
    grossMargin = ratio(grossProfit, net),
    operatingMargin = ratio(operatingResult, net);
  const variable = metric(
    total(
      expenses.filter(
        (r) =>
          cats.get(str(r, "categoryId"))?.behavior === "Variável" &&
          ["Folha", "Encargos", ...operatingLines].includes(
            String(cats.get(str(r, "categoryId"))?.dreLine),
          ),
      ),
      "amount",
    ),
    "Despesas variáveis classificadas",
    expensesMissing,
  );
  const fixed = metric(
    total(
      expenses.filter(
        (r) =>
          cats.get(str(r, "categoryId"))?.behavior === "Fixa" &&
          [
            "Folha",
            "Encargos",
            "Depreciação e amortização",
            ...operatingLines,
          ].includes(String(cats.get(str(r, "categoryId"))?.dreLine)),
      ),
      "amount",
    ),
    "Despesas fixas classificadas",
    expensesMissing,
  );
  const contribution = combine(
    [net, cmv, variable, fees],
    [1, -1, -1, -1],
    "Receita líquida − CMV − despesas variáveis − taxas",
  );
  const contributionPct = ratio(contribution, net, 1);
  // Payroll is treated as fixed in this managerial model and disclosed in formula.
  const fixedCosts = combine(
    [fixed, payroll],
    [1, 1],
    "Despesas classificadas como fixas + custo da folha",
  );
  const fixedPct = ratio(fixedCosts, net);
  const breakeven = metric(
    fixedCosts.value !== null &&
      contributionPct.value !== null &&
      contributionPct.value > 0
      ? Math.round(fixedCosts.value / contributionPct.value)
      : null,
    "(Despesas fixas + folha) ÷ margem de contribuição decimal",
    [
      ...fixedCosts.missing,
      ...contributionPct.missing,
      ...(contributionPct.value !== null && contributionPct.value <= 0
        ? ["Margem de contribuição não positiva"]
        : []),
    ],
  );
  const orders = revenueMetric("orders", "Quantidade de pedidos informados"),
    customers = revenueMetric("customers", "Quantidade de clientes informados");
  const ticket = ratio(commercial, orders, 1);
  const goalRows = rows("goals").filter(
    (r) =>
      str(r, "start") === f.start &&
      str(r, "end") === f.end &&
      (!f.channel ? !str(r, "channel") : str(r, "channel") === f.channel),
  );
  const goalMissing = units
    .filter(
      (u) =>
        str(u, "unitType") !== "Central de produção" &&
        !goalRows.some((r) => r.unitId === u.id),
    )
    .map((u) => `${str(u, "name")}: meta do período não cadastrada`);
  const goal = metric(
    total(goalRows, "target"),
    "Metas do mesmo período e escopo, sem sobreposição",
    goalMissing,
  );
  const goalPct = ratio(gross, goal);
  const remaining = metric(
    gross.value !== null && goal.value !== null
      ? Math.max(0, goal.value - gross.value)
      : null,
    "max(0, meta − realizado)",
    [...gross.missing, ...goal.missing],
  );
  const elapsed = Math.max(0, daysBetween(f.start, end) + 1),
    fullDays = Math.max(0, daysBetween(f.start, f.end) + 1);
  const excludedDates = new Set(
    goalRows.flatMap((r) =>
      str(r, "operatingDays")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  const distinctCalendars = new Set(
    goalRows.map((r) => str(r, "operatingDays")),
  );
  const remainingDays = Math.max(
    0,
    daysBetween(end, f.end) -
      Array.from(excludedDates).filter((d) => d > end && d <= f.end).length,
  );
  const dailyNeeded = metric(
    remaining.value !== null && remainingDays > 0
      ? Math.round(remaining.value / remainingDays)
      : remaining.value === 0
        ? 0
        : null,
    "Faltante ÷ dias futuros de operação (hoje já está no realizado)",
    [
      ...remaining.missing,
      ...(distinctCalendars.size > 1
        ? ["Calendários diferentes: consulte a meta diária por unidade"]
        : []),
      ...(remainingDays === 0 && remaining.value !== 0
        ? ["Período encerrado sem dias restantes"]
        : []),
    ],
  );
  const projection = metric(
    gross.value !== null && elapsed > 0
      ? Math.round((gross.value / elapsed) * fullDays)
      : null,
    "Média por dia corrido com cobertura × dias corridos do período",
    gross.missing,
  );
  const positions = rows("positions").filter((r) => r.date === asOf);
  const posMissing = [
    ...missing("positions", asOf, asOf),
    ...channelMissing,
    ...units
      .filter((u) => !positions.some((r) => r.unitId === u.id))
      .map((u) => `${str(u, "name")}: posição patrimonial do corte ausente`),
  ];
  const position = (key: string) =>
    metric(total(positions, key), key, [
      ...posMissing,
      ...positions
        .filter((r) => num(r, key) === null)
        .map((r) => `Posição ${r.id}: ${key} ausente`),
    ]);
  const currentAssets = position("currentAssets"),
    currentLiabilities = position("currentLiabilities");
  const workingCapital = combine(
    [currentAssets, currentLiabilities],
    [1, -1],
    "Ativo circulante − passivo circulante",
  );
  const ncg = combine(
    [position("operatingAssets"), position("operatingLiabilities")],
    [1, -1],
    "Ativos operacionais exceto caixa − passivos operacionais exceto dívida",
  );
  const liquidity = ratio(currentAssets, currentLiabilities, 1),
    debt = ratio(position("totalLiabilities"), position("totalAssets"));
  const openingPositions = rows("positions").filter(
    (r) => r.date === openingDate,
  );
  const averageAssets = metric(
    (total(positions, "totalAssets") + total(openingPositions, "totalAssets")) /
      2,
    "(Ativos iniciais + finais) ÷ 2",
    [
      ...posMissing,
      ...missing("positions", openingDate, openingDate),
      ...units
        .filter((u) => !openingPositions.some((r) => r.unitId === u.id))
        .map((u) => `${str(u, "name")}: ativos iniciais ausentes`),
    ],
  );
  const profitability = ratio(profit, averageAssets);
  const forecast: ForecastDay[] = [];
  let forecastBalance = bank.value;
  for (let day = 0; day <= 90; day++) {
    const date = addDays(asOf, day);
    const incoming = receivableRows
      .filter((r) => str(r, "dueDate") === date)
      .reduce((s, r) => s + outstanding(r, db, asOf), 0);
    const outgoing = accounts
      .filter((r) =>
        day === 0 ? str(r, "dueDate") <= date : str(r, "dueDate") === date,
      )
      .reduce((s, r) => s + outstanding(r, db, asOf), 0);
    if (forecastBalance !== null) forecastBalance += incoming - outgoing;
    forecast.push({
      date,
      incoming,
      outgoing,
      balance:
        obligationMissing.length || receiveMissing.length
          ? null
          : forecastBalance,
    });
  }
  const cashProjection = metric(
    forecast[30]?.balance ?? null,
    "Saldo atual + recebíveis − obrigações em 30 dias",
    [...bank.missing, ...obligationMissing, ...receiveMissing],
  );
  const safeSpend = metric(
    freeCash.value !== null &&
      forecast.slice(0, 31).every((r) => r.balance !== null)
      ? Math.max(
          0,
          Math.min(
            freeCash.value,
            ...forecast.slice(0, 31).map((r) => r.balance!),
          ),
        )
      : null,
    "max(0, menor entre caixa livre e saldo mínimo projetado em 30 dias)",
    [...freeCash.missing, ...cashProjection.missing],
  );
  const lowest = forecast.every((r) => r.balance !== null)
    ? Math.min(...forecast.map((r) => r.balance!))
    : null;
  const negativeDate = forecast.find(
    (r) => r.balance !== null && r.balance < 0,
  )?.date;
  const coverage30 = ratio(
    combine(
      [
        bank,
        metric(
          receivableRows
            .filter(
              (r) =>
                str(r, "dueDate") >= asOf &&
                str(r, "dueDate") <= addDays(asOf, 30),
            )
            .reduce((s, r) => s + outstanding(r, db, asOf), 0),
          "Recebíveis não vencidos em 30 dias",
          receiveMissing,
        ),
      ],
      [1, 1],
      "Caixa + recebíveis em 30 dias",
    ),
    amountDue(30),
    1,
  );
  const burn = metric(
    cashGeneration.value !== null && elapsed > 0
      ? Math.max(0, -cashGeneration.value) / elapsed
      : null,
    "Queima operacional ÷ dias observados",
    cashGeneration.missing,
  );
  const runway = metric(
    freeCash.value !== null && burn.value !== null && burn.value > 0
      ? Math.max(0, freeCash.value) / burn.value
      : null,
    "Caixa livre ÷ queima diária",
    [
      ...freeCash.missing,
      ...burn.missing,
      ...(burn.value === 0 ? ["Não aplicável: não há queima operacional"] : []),
    ],
  );
  const debtBalance = metric(
    rows("loans").reduce(
      (s, r) =>
        s +
        n(r, "outstanding") -
        total(
          rows("transactions").filter(
            (t) =>
              t.loanId === r.id &&
              str(t, "date") > str(r, "balanceDate") &&
              str(t, "date") <= asOf,
          ),
          "principal",
        ),
      0,
    ),
    "Saldo devedor informado − amortizações posteriores",
    [
      ...missing("loans"),
      ...channelMissing,
      ...rows("loans")
        .filter((r) => str(r, "balanceDate") > asOf)
        .map(() => "Data-base da dívida posterior ao corte"),
    ],
  );
  const employees = rows("employees");
  const activeOn = (date: string) =>
    employees.filter(
      (r) =>
        str(r, "admissionDate") <= date &&
        (!str(r, "terminationDate") || str(r, "terminationDate") > date),
    ).length;
  const headcount = metric(
    activeOn(end),
    "Funcionários ativos na data de corte",
    missing("employees"),
  );
  const avgHeadcount = metric(
    (activeOn(f.start) + activeOn(end)) / 2,
    "(Quadro inicial + final) ÷ 2",
    missing("employees"),
  );
  const turnover = ratio(
    metric(
      (employees.filter((r) => inRange(str(r, "admissionDate"), f.start, end))
        .length +
        employees.filter((r) =>
          inRange(str(r, "terminationDate"), f.start, end),
        ).length) /
        2,
      "(Admissões + desligamentos) ÷ 2",
      missing("employees"),
    ),
    avgHeadcount,
  );
  const attendance = pick("attendance");
  const absenteeism = ratio(
    metric(
      total(attendance, "absentHours"),
      "Horas ausentes",
      missing("attendance"),
    ),
    metric(
      total(attendance, "scheduledHours"),
      "Horas previstas",
      missing("attendance"),
    ),
  );
  const revenuePerEmployee = ratio(gross, avgHeadcount, 1),
    costPerEmployee = ratio(personnel, avgHeadcount, 1);
  const overtime = metric(
    total(attendance, "extraHours"),
    "Horas extras registradas",
    missing("attendance"),
  );
  const budgetRows = period("budgets");
  const budgets = budgetRows.map((r) => {
    const actual = total(
      period("payables").filter((a) => a.categoryId === r.categoryId),
      "amount",
    );
    return {
      record: r,
      actual: metric(
        actual,
        "Despesas da categoria por competência",
        expensesMissing,
      ),
      difference: actual - n(r, "amount"),
      percent:
        n(r, "amount") > 0
          ? ((actual - n(r, "amount")) / n(r, "amount")) * 100
          : null,
    };
  });
  const budgetCost = metric(
    budgetRows
      .filter((r) => {
        const line = cats.get(str(r, "categoryId"))?.dreLine;
        return (
          line &&
          line !== "Sem efeito na DRE" &&
          line !== "Impostos sobre vendas"
        );
      })
      .reduce((s, r) => s + n(r, "amount"), 0),
    "Custos do orçamento da competência",
    missing("budgets", f.start, f.end),
  );
  const projectedProfit = metric(
    projection.value !== null &&
      net.value !== null &&
      gross.value !== null &&
      gross.value > 0 &&
      budgetCost.value !== null
      ? Math.round((projection.value * net.value) / gross.value) -
          budgetCost.value
      : null,
    "Receita líquida projetada pela relação líquida/bruta observada − custos orçados para o período",
    [
      ...projection.missing,
      ...net.missing,
      ...budgetCost.missing,
      ...(f.start.slice(8) !== "01" || f.end !== monthEnd(f.end)
        ? ["Projeção de resultado exige mês completo selecionado"]
        : []),
    ],
  );
  const monthlyDebtService = metric(
    total(period("loanInstallments"), "principal") +
      total(period("loanInstallments"), "interest"),
    "Amortização + juros das parcelas da competência",
    [...missing("loans"), ...channelMissing],
  );
  const debtCommitment = ratio(monthlyDebtService, gross);
  const interestPaid = metric(
    transactions
      .filter((r) => r.loanId)
      .reduce(
        (s, r) =>
          s +
          (n(r, "amount") - Math.abs(n(r, "principal"))) *
            (r.reversalOf ? -1 : 1),
        0,
      ),
    "Parcela paga − principal amortizado",
    [...missing("transactions"), ...missing("loans"), ...channelMissing],
  );
  const futureLoanRows = accounts.filter((r) => r.loanId);
  const weightedDebtDays = metric(
    futureLoanRows.length
      ? futureLoanRows.reduce(
          (s, r) =>
            s +
            Math.max(0, daysBetween(asOf, str(r, "dueDate"))) *
              outstanding(r, db, asOf),
          0,
        ) / futureLoanRows.reduce((s, r) => s + outstanding(r, db, asOf), 0)
      : null,
    "Prazo remanescente médio, ponderado pelo saldo das parcelas",
    [...obligationMissing, ...missing("loans")],
  );
  const policy = (db.policies || [])
    .filter((r) => !r.archived && str(r, "effectiveDate") <= asOf)
    .sort((a, b) =>
      str(b, "effectiveDate").localeCompare(str(a, "effectiveDate")),
    )[0];
  const clamp = (x: number) => Math.min(100, Math.max(0, x));
  const high = (value: number | null, target: number | null) =>
    value === null || target === null || target <= 0
      ? null
      : clamp((value / target) * 100);
  const low = (
    value: number | null,
    good: number | null,
    bad: number | null,
  ) =>
    value === null || good === null || bad === null || bad <= good
      ? null
      : value <= good
        ? 100
        : clamp(((bad - value) / (bad - good)) * 100);
  const policyValue = (k: string) => (policy ? num(policy, k) : null);
  const overdueRatio = ratio(overdue, payable);
  const scores: Record<string, number | null> = {
    liquidity: high(liquidity.value, policyValue("liquidityTarget")),
    cashGeneration: high(
      ratio(cashGeneration, net).value,
      policyValue("marginTarget"),
    ),
    debt: low(
      debt.value,
      policyValue("debtTarget"),
      policyValue("debtCritical"),
    ),
    margin: high(margin.value, policyValue("marginTarget")),
    cmv: low(
      cmvPct.value,
      policyValue("cmvTarget"),
      policyValue("cmvCritical"),
    ),
    payroll: low(
      ratio(personnel, net).value,
      policyValue("payrollTarget"),
      policyValue("payrollCritical"),
    ),
    overdue:
      payable.value === 0
        ? 100
        : overdueRatio.value === null
          ? null
          : clamp(100 - overdueRatio.value),
    coverage:
      amountDue(30).value === 0 && bank.value !== null
        ? bank.value >= 0
          ? 100
          : 0
        : high(coverage30.value, 1),
    goal: goalPct.value === null ? null : clamp(goalPct.value),
    profitability: high(profitability.value, policyValue("returnTarget")),
  };
  const score =
    policy && Object.values(scores).every((v) => v !== null)
      ? Math.round(
          Object.entries(WEIGHTS).reduce(
            (s, [k, w]) => s + (scores[k]! * w) / 100,
            0,
          ),
        )
      : null;
  const alerts: Alert[] = [];
  if (negativeDate)
    alerts.push({
      id: "cash-negative",
      severity: "critical",
      title: `Caixa negativo previsto em ${negativeDate.split("-").reverse().join("/")}`,
      detail: `Se nada mudar, o saldo será ${currency(forecast.find((d) => d.date === negativeDate)!.balance)}.`,
      amount: Math.abs(forecast.find((d) => d.date === negativeDate)!.balance!),
    });
  if (overdue.value !== null && overdue.value > 0)
    alerts.push({
      id: "overdue",
      severity: "critical",
      title: `${currency(overdue.value)} em contas vencidas`,
      detail: "Negocie vencimentos e priorize obrigações essenciais.",
      amount: overdue.value,
    });
  if (cmvPct.value !== null && cmvPct.value > 35)
    alerts.push({
      id: "cmv",
      severity: cmvPct.value > 40 ? "critical" : "warning",
      title: `CMV em ${cmvPct.value.toFixed(1)}%`,
      detail: "Compare compras, preços e inventários. Limites: 35% e 40%.",
    });
  if (
    policy &&
    payrollPct.value !== null &&
    payrollPct.value > n(policy, "payrollTarget")
  )
    alerts.push({
      id: "payroll",
      severity:
        payrollPct.value > n(policy, "payrollCritical")
          ? "critical"
          : "warning",
      title: `Folha em ${payrollPct.value.toFixed(1)}%`,
      detail: "Custo total de pessoal em relação à receita líquida.",
    });
  if (goalPct.value !== null) {
    if (goalPct.value >= 100)
      alerts.push({
        id: "goal-hit",
        severity: "healthy",
        title:
          goalRows.length &&
          total(goalRows, "superTarget") > 0 &&
          gross.value! >= total(goalRows, "superTarget")
            ? "Supermeta atingida"
            : "Meta atingida",
        detail: `${goalPct.value.toFixed(1)}% da meta.`,
      });
    else if (
      projection.value !== null &&
      goal.value !== null &&
      projection.value < goal.value
    )
      alerts.push({
        id: "goal-risk",
        severity: "warning",
        title: "Meta em risco",
        detail: `Projeção de ${currency(projection.value)} para meta de ${currency(goal.value)}.`,
      });
  }
  for (const r of accounts.filter(
    (r) =>
      r.sourceKind === "taxes" &&
      str(r, "dueDate") >= asOf &&
      str(r, "dueDate") <= addDays(asOf, 3),
  ))
    alerts.push({
      id: "tax-" + r.id,
      severity: "warning",
      title: `Imposto de ${currency(outstanding(r, db, asOf))} vence em ${daysBetween(asOf, str(r, "dueDate"))} dias`,
      detail: str(r, "description"),
      amount: outstanding(r, db, asOf),
    });
  for (const b of budgets.filter(
    (b) => b.actual.value !== null && b.difference > 0,
  ))
    alerts.push({
      id: "budget-" + b.record.id,
      severity: "warning",
      title: `Orçamento excedido em ${currency(b.difference)}`,
      detail: str(cats.get(str(b.record, "categoryId")) || b.record, "name"),
      amount: b.difference,
    });
  const coreMissing = unique([
    ...gross.missing,
    ...profit.missing,
    ...bank.missing,
    ...freeCash.missing,
    ...cmv.missing,
    ...goal.missing,
  ]);
  if (coreMissing.length)
    alerts.push({
      id: "data-quality",
      severity: "warning",
      title: "Dados pendentes impedem concluir a saúde do negócio",
      detail: coreMissing.slice(0, 3).join(" · "),
    });
  alerts.sort(
    (a, b) =>
      ({ critical: 0, warning: 1, healthy: 2 })[a.severity] -
        { critical: 0, warning: 1, healthy: 2 }[b.severity] ||
      (b.amount ?? 0) - (a.amount ?? 0),
  );
  const dre = [
    { label: "Receita bruta", metric: gross },
    { label: "Deduções de vendas", metric: deductions },
    { label: "Impostos sobre vendas", metric: salesTax },
    { label: "Receita líquida", metric: net },
    { label: "CMV", metric: cmv },
    { label: "Lucro bruto", metric: grossProfit },
    { label: "Folha e provisões", metric: payroll },
    { label: "Outros encargos / pessoal", metric: otherPayroll },
    ...operatingLines.map((label) => ({ label, metric: byLine(label) })),
    { label: "Taxas comerciais das vendas", metric: fees },
    { label: "EBITDA gerencial", metric: ebitda },
    { label: "Depreciação e amortização", metric: depreciation },
    { label: "Resultado operacional", metric: operatingResult },
    { label: "Despesas financeiras", metric: financeExpenses },
    { label: "Juros", metric: interest },
    { label: "Impostos sobre lucro", metric: profitTaxes },
    { label: "Resultado líquido", metric: profit },
  ];
  const trend = Array.from(new Set(revenueRows.filter(r => !r.periodEnd || r.periodStart === r.periodEnd).map((r) => str(r, "date"))))
    .sort()
    .map((date) => ({
      date,
      total:
        total(
          revenueRows.filter((r) => r.date === date && (!r.periodEnd || r.periodStart === r.periodEnd)),
          "gross",
        ) / 100,
    }));
  return {
    units,
    asOf,
    metrics: {
      gross,
      deductions,
      commercial,
      net,
      receipts,
      spending,
      operatingReceipts,
      operatingSpending,
      cashGeneration,
      bank,
      payable,
      receivable,
      overdue,
      committed,
      freeCash,
      taxesPayable,
      payrollPayable,
      purchases,
      cmv,
      cmvPct,
      payroll,
      personnel,
      payrollPct,
      opExpenses,
      ebitda,
      operatingResult,
      profit,
      margin,
      grossMargin,
      operatingMargin,
      breakeven,
      orders,
      customers,
      ticket,
      goal,
      goalPct,
      remaining,
      dailyNeeded,
      projection,
      workingCapital,
      ncg,
      liquidity,
      debt,
      profitability,
      cashProjection,
      safeSpend,
      projectedProfit,
      marketingPct,
      taxPct,
      feesPct,
      fixedPct,
      monthlyDebtService,
      debtCommitment,
      interestPaid,
      weightedDebtDays,
      burn,
      runway,
      debtBalance,
      headcount,
      turnover,
      absenteeism,
      revenuePerEmployee,
      costPerEmployee,
      overtime,
      coverage30,
    },
    amountDue,
    forecast,
    lowest,
    negativeDate,
    score,
    scores,
    policy,
    alerts,
    coreMissing,
    dre,
    trend,
    budgets,
    revenueRows,
    accounts,
    receivableRows,
    transferRows,
    remainingDays,
  };
}
export type Calculation = ReturnType<typeof calculate>;
