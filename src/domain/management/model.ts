/** Canonical management records. Monetary fields are integer BRL cents. */
export type Value = string | number | boolean | string[] | null;
export interface RecordData {
  id: string;
  kind: string;
  tenantId: string;
  unitId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  archived?: boolean;
  [key: string]: Value | undefined;
}
export type Database = Record<string, RecordData[]>;
export interface Field {
  key: string;
  label: string;
  type?:
    | "text"
    | "date"
    | "month"
    | "money"
    | "number"
    | "percent"
    | "select"
    | "ref"
    | "check"
    | "textarea";
  required?: boolean;
  options?: string[];
  ref?: string;
  hint?: string;
}
export interface Definition {
  label: string;
  singular: string;
  fields: Field[];
  dated?: string;
  global?: boolean;
}
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  required = true,
  extra: Partial<Field> = {},
): Field => ({ key, label, type, required, ...extra });
const ref = (key: string, label: string, table: string, required = true) =>
  f(key, label, "ref", required, { ref: table });
const opt = (key: string, label: string, options: string[], required = true) =>
  f(key, label, "select", required, { options });
export const CHANNELS = [
  "Salão",
  "Delivery próprio",
  "iFood",
  "Outros marketplaces",
  "Outros",
];
export const DRE_LINES = [
  "CMV",
  "Folha",
  "Encargos",
  "Aluguel",
  "Energia",
  "Marketing",
  "Taxas",
  "Administrativas",
  "Operacionais",
  "Depreciação e amortização",
  "Despesas financeiras",
  "Juros",
  "Impostos sobre vendas",
  "Impostos sobre lucro",
  "Sem efeito na DRE",
];
export const COST_CENTERS = [
  "Operação",
  "Cozinha",
  "Atendimento",
  "Administrativo",
  "Marketing",
  "Delivery",
  "Manutenção",
  "Central de produção",
  "Diretoria",
  "Outros",
];
export const CHECKLIST = [
  "Faturamento conferido",
  "Bancos conciliados",
  "Caixas conferidos",
  "iFood conciliado",
  "Cartões conciliados",
  "Fornecedores lançados",
  "Estoque fechado",
  "CMV calculado",
  "Folha lançada",
  "Impostos provisionados",
  "DRE fechada",
];
export const DATASETS = [
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
  "attendance",
  "loans",
  "budgets",
  "goals",
  "positions",
  "bankAccounts",
];
const nature = () =>
  opt("nature", "Natureza", [
    "Operacional",
    "Investimento",
    "Financiamento",
    "Transferência interna",
  ]);
const category = () => ref("categoryId", "Categoria", "categories");
const due = () => f("dueDate", "Vencimento", "date");
const competence = () => f("competence", "Competência", "month");
const amount = () => f("amount", "Valor (R$)", "money");
export const DEFINITIONS: Record<string, Definition> = {
  companies: {
    label: "Empresas",
    singular: "empresa",
    global: true,
    fields: [
      f("name", "Nome"),
      f("legalName", "Razão social"),
      f("cnpj", "CNPJ"),
      f("regime", "Regime tributário", "text", false),
    ],
  },
  brands: {
    label: "Marcas",
    singular: "marca",
    global: true,
    fields: [f("name", "Nome")],
  },
  units: {
    label: "Unidades",
    singular: "unidade",
    global: true,
    fields: [
      f("name", "Nome"),
      f("code", "Código"),
      ref("companyId", "Empresa", "companies", false),
      ref("brandId", "Marca", "brands", false),
      opt("unitType", "Tipo", ["Loja", "Central de produção"]),
      f("groups", "Grupos (separados por vírgula)", "text", false),
    ],
  },
  categories: {
    label: "Categorias",
    singular: "categoria",
    global: true,
    fields: [
      f("name", "Nome"),
      f("subcategory", "Subcategoria", "text", false),
      opt("dreLine", "Linha da DRE", DRE_LINES),
      opt("behavior", "Comportamento", ["Fixa", "Variável", "Não se aplica"]),
      nature(),
    ],
  },
  costCenters: {
    label: "Centros de custo",
    singular: "centro de custo",
    fields: [f("name", "Nome"), opt("area", "Área", COST_CENTERS)],
  },
  suppliers: {
    label: "Fornecedores",
    singular: "fornecedor",
    global: true,
    fields: [
      f("name", "Nome"),
      f("document", "CNPJ / CPF", "text", false),
      f("email", "E-mail", "text", false),
      f("phone", "Telefone", "text", false),
    ],
  },
  bankAccounts: {
    label: "Bancos e caixas",
    singular: "conta / caixa",
    fields: [
      f("name", "Nome"),
      f("bank", "Banco / caixa"),
      f("balance", "Saldo conciliado (R$)", "money"),
      f("balanceDate", "Data do saldo", "date"),
      f("reconciled", "Saldo conferido", "check"),
      f("notes", "Observações", "textarea", false),
    ],
  },
  revenues: {
    label: "Faturamento",
    singular: "faturamento diário",
    dated: "date",
    fields: [
      f("date", "Data", "date"),
      opt("channel", "Canal", CHANNELS),
      f("gross", "Faturamento bruto", "money"),
      f("discounts", "Descontos", "money"),
      f("coupons", "Cupons", "money"),
      f("cashback", "Cashback", "money"),
      f("cancellations", "Cancelamentos", "money"),
      f("fees", "Taxas comerciais", "money"),
      f("orders", "Pedidos", "number", false),
      f("customers", "Clientes", "number", false),
      f("externalId", "Documento / chave de origem"),
    ],
  },
  sales: {
    label: "Vendas detalhadas",
    singular: "venda",
    dated: "date",
    fields: [
      f("date", "Data", "date"),
      opt("channel", "Canal", CHANNELS),
      f("gross", "Bruto", "money"),
      f("discounts", "Descontos", "money"),
      f("coupons", "Cupons", "money"),
      f("cashback", "Cashback", "money"),
      f("cancellations", "Cancelamentos", "money"),
      f("fees", "Taxas", "money"),
      f("orders", "Pedidos", "number"),
      f("customers", "Clientes", "number", false),
      f("externalId", "Documento único"),
    ],
  },
  transactions: {
    label: "Movimentações financeiras",
    singular: "movimentação",
    dated: "date",
    fields: [
      f("description", "Descrição"),
      f("date", "Data efetiva", "date"),
      competence(),
      opt("direction", "Direção", ["Entrada", "Saída"]),
      amount(),
      ref("bankAccountId", "Conta bancária", "bankAccounts"),
      nature(),
      category(),
      ref("costCenterId", "Centro de custo", "costCenters", false),
      opt("channel", "Canal", CHANNELS, false),
      f("paymentMethod", "Forma de pagamento"),
      f("externalId", "Documento / referência"),
      f("notes", "Observações", "textarea", false),
    ],
  },
  payables: {
    label: "Contas a pagar",
    singular: "conta a pagar",
    dated: "dueDate",
    fields: [
      opt("obligationType", "Tipo da conta", [
        "Boleto",
        "Débito",
        "Imposto",
        "Conta fixa",
        "Cheque",
        "Empréstimo",
        "Outros",
      ]),
      f("description", "Descrição"),
      ref("supplierId", "Fornecedor", "suppliers", false),
      ref("categoryId", "Categoria", "categories", false),
      ref("costCenterId", "Centro de custo", "costCenters", false),
      f("competence", "Competência", "month", false),
      due(),
      f("originalAmount", "Valor original (R$)", "money", false),
      f("amount", "Valor a pagar (R$)", "money"),
      opt("paymentMethod", "Forma de pagamento", [
        "Boleto",
        "Débito automático",
        "PIX",
        "Transferência",
        "Cheque",
        "Dinheiro",
        "Cartão",
        "Outros",
      ], false),
      f("documentNumber", "Código / número do boleto", "text", false),
      opt("nature", "Natureza", [
        "Operacional",
        "Investimento",
        "Financiamento",
        "Transferência interna",
      ], false),
      opt("status", "Status", ["Pendente", "Agendado"]),
      f("installments", "Quantidade de parcelas", "number", false, {
        hint: "Valor informado é o total, dividido entre as parcelas.",
      }),
      f("recurrenceCount", "Repetições mensais", "number", false, {
        hint: "Repete o valor integral. Não combine com parcelamento.",
      }),
      f("notes", "Observações", "textarea", false),
    ],
  },
  receivables: {
    label: "Contas a receber",
    singular: "conta a receber",
    dated: "dueDate",
    fields: [
      f("description", "Descrição / cliente"),
      competence(),
      due(),
      amount(),
      opt("channel", "Canal", CHANNELS, false),
      nature(),
      f("saleId", "ID da venda / referência", "text", false),
      f("notes", "Observações", "textarea", false),
    ],
  },
  taxes: {
    label: "Impostos",
    singular: "imposto / provisão",
    dated: "dueDate",
    fields: [
      opt("taxType", "Tipo", [
        "Simples Nacional",
        "FGTS",
        "INSS",
        "ISS",
        "ICMS",
        "IRPJ / CSLL",
        "Outros",
      ]),
      competence(),
      due(),
      f("amount", "Valor da guia / provisão", "money", false, {
        hint: "Informe o valor, ou preencha base e alíquota para calcular.",
      }),
      ref("categoryId", "Categoria do orçamento", "categories", false),
      opt("taxEffect", "Efeito no resultado", [
        "Impostos sobre vendas",
        "Encargos",
        "Impostos sobre lucro",
        "Sem efeito na DRE",
      ]),
      f("base", "Base de cálculo", "money", false),
      f("rate", "Alíquota (%)", "percent", false),
      f("notes", "Observações", "textarea", false),
    ],
  },
  employees: {
    label: "Funcionários",
    singular: "funcionário",
    fields: [
      f("name", "Nome"),
      f("role", "Cargo"),
      f("department", "Setor"),
      f("admissionDate", "Admissão", "date"),
      f("terminationDate", "Desligamento", "date", false),
      f("salary", "Salário", "money"),
      opt("status", "Status", ["Ativo", "Férias", "Afastado", "Desligado"]),
      f("notes", "Observações", "textarea", false),
    ],
  },
  payroll: {
    label: "Folha e provisões",
    singular: "folha de funcionário",
    dated: "dueDate",
    fields: [
      ref("employeeId", "Funcionário", "employees"),
      competence(),
      due(),
      ref("categoryId", "Categoria do orçamento", "categories", false),
      f("salary", "Salário", "money"),
      f("benefits", "Benefícios", "money"),
      f("charges", "Encargos patronais", "money"),
      f("commissions", "Comissões", "money"),
      f("service", "Taxa de serviço", "money"),
      f("overtime", "Horas extras (R$)", "money"),
      f("eligibleBase", "Base elegível de provisões", "money"),
      f("fgtsRate", "FGTS patronal (%)", "percent"),
      f("chargeRate", "Encargos sobre provisões (%)", "percent"),
      f("provisionDueDate", "Vencimento previsto das provisões", "date"),
      f("notes", "Observações", "textarea", false),
    ],
  },
  attendance: {
    label: "Frequência e horas",
    singular: "registro de frequência",
    dated: "date",
    fields: [
      ref("employeeId", "Funcionário", "employees"),
      f("date", "Data", "date"),
      f("scheduledHours", "Horas previstas", "number"),
      f("absentHours", "Horas ausentes", "number"),
      f("extraHours", "Horas extras", "number"),
    ],
  },
  products: {
    label: "Produtos",
    singular: "produto",
    global: true,
    fields: [
      f("name", "Nome"),
      f("code", "Código"),
      f("productCategory", "Categoria"),
      f("measure", "Unidade de medida"),
      f("minimum", "Estoque mínimo", "number", false),
    ],
  },
  purchases: {
    label: "Compras",
    singular: "compra",
    dated: "date",
    fields: [
      f("description", "Descrição"),
      ref("supplierId", "Fornecedor", "suppliers"),
      ref("productId", "Produto", "products"),
      ref("categoryId", "Categoria do orçamento", "categories", false),
      f("date", "Data / competência", "date"),
      due(),
      f("quantity", "Quantidade", "number"),
      amount(),
      f("externalId", "Documento único"),
      f("notes", "Observações", "textarea", false),
    ],
  },
  inventory: {
    label: "Posições de estoque",
    singular: "posição de estoque",
    dated: "date",
    fields: [
      ref("productId", "Produto", "products"),
      f("date", "Data da posição", "date"),
      f("quantity", "Quantidade", "number"),
      amount(),
      f("confirmed", "Inventário conferido", "check"),
    ],
  },
  transfers: {
    label: "Transferências",
    singular: "transferência a custo",
    dated: "date",
    fields: [
      ref("toUnitId", "Unidade de destino", "units"),
      ref("productId", "Produto", "products"),
      f("date", "Data", "date"),
      f("quantity", "Quantidade", "number"),
      amount(),
      f("externalId", "Documento único"),
    ],
  },
  production: {
    label: "Central de produção",
    singular: "produção",
    dated: "date",
    fields: [
      ref("productId", "Produto produzido", "products"),
      f("date", "Data", "date"),
      f("quantity", "Quantidade produzida", "number"),
      f("consumedCost", "Custo dos insumos consumidos", "money"),
      f("producedCost", "Custo da produção final", "money"),
      f("loss", "Perdas identificadas", "money"),
      f("externalId", "Ordem de produção"),
    ],
  },
  loans: {
    label: "Empréstimos e dívidas",
    singular: "empréstimo",
    fields: [
      f("bank", "Banco"),
      f("contract", "Contrato"),
      f("original", "Valor original", "money"),
      f("outstanding", "Saldo devedor na data-base", "money"),
      f("balanceDate", "Data-base", "date"),
      f("installmentCount", "Quantidade de parcelas", "number"),
      f("notes", "Observações", "textarea", false),
    ],
  },
  loanInstallments: {
    label: "Parcelas de dívidas",
    singular: "parcela",
    dated: "dueDate",
    fields: [
      ref("loanId", "Contrato", "loans"),
      f("number", "Número da parcela", "number"),
      competence(),
      due(),
      ref("categoryId", "Categoria do orçamento", "categories", false),
      f("principal", "Amortização do principal", "money"),
      f("interest", "Juros", "money"),
    ],
  },
  goals: {
    label: "Metas",
    singular: "meta",
    dated: "start",
    fields: [
      f("description", "Nome"),
      opt("frequency", "Frequência", ["Diária", "Semanal", "Mensal"]),
      f("start", "Início", "date"),
      f("end", "Fim", "date"),
      opt("channel", "Canal", CHANNELS, false),
      f("target", "Meta", "money"),
      f("superTarget", "Supermeta", "money", false),
      f(
        "operatingDays",
        "Datas não operacionais (YYYY-MM-DD, vírgulas)",
        "text",
        false,
      ),
    ],
  },
  budgets: {
    label: "Orçamento",
    singular: "orçamento",
    dated: "competence",
    fields: [competence(), category(), amount()],
  },
  actions: {
    label: "Plano de ação",
    singular: "ação",
    dated: "dueDate",
    fields: [
      f("problem", "Problema"),
      f("action", "Ação", "textarea"),
      f("owner", "Responsável"),
      due(),
      opt("status", "Status", ["Pendente", "Em andamento", "Concluído"]),
      f("alertId", "Alerta de origem", "text", false),
    ],
  },
  closings: {
    label: "Fechamento mensal",
    singular: "fechamento",
    dated: "competence",
    fields: [
      competence(),
      ...CHECKLIST.map((label, i) => f("check" + i, label, "check")),
      opt("status", "Estado", ["MÊS ABERTO", "EM CONFERÊNCIA", "MÊS FECHADO"]),
      f("notes", "Observações", "textarea", false),
    ],
  },
  coverage: {
    label: "Conferência das bases",
    singular: "conferência de cobertura",
    dated: "start",
    fields: [
      opt("dataset", "Base conferida", DATASETS),
      f("start", "Início", "date"),
      f("end", "Fim", "date"),
      opt("channel", "Canal (vazio = todos)", CHANNELS, false),
      f(
        "confirmed",
        "Todos os dados deste período foram conferidos, inclusive ausência de movimento",
        "check",
      ),
      f("notes", "Evidência / observações", "textarea"),
    ],
  },
  positions: {
    label: "Posições patrimoniais",
    singular: "posição patrimonial",
    dated: "date",
    fields: [
      f("date", "Data-base", "date"),
      f("currentAssets", "Ativo circulante", "money"),
      f("currentLiabilities", "Passivo circulante", "money"),
      f("totalAssets", "Ativo total", "money"),
      f("totalLiabilities", "Passivo total", "money"),
      f("operatingAssets", "Ativos operacionais exceto caixa", "money"),
      f(
        "operatingLiabilities",
        "Passivos operacionais exceto dívidas",
        "money",
      ),
    ],
  },
  policies: {
    label: "Política gerencial",
    singular: "política",
    global: true,
    fields: [
      f("name", "Nome / versão"),
      f("effectiveDate", "Vigente a partir de", "date"),
      f("cmvTarget", "CMV saudável (%)", "percent"),
      f("cmvCritical", "CMV crítico (%)", "percent"),
      f("payrollTarget", "Folha saudável (%)", "percent"),
      f("payrollCritical", "Folha crítica (%)", "percent"),
      f("marginTarget", "Margem líquida alvo (%)", "percent"),
      f("liquidityTarget", "Liquidez alvo (razão)", "number"),
      f("debtTarget", "Endividamento saudável (%)", "percent"),
      f("debtCritical", "Endividamento crítico (%)", "percent"),
      f("returnTarget", "Rentabilidade alvo no período (%)", "percent"),
      f("notes", "Justificativa dos limites", "textarea"),
    ],
  },
};
export const str = (r: RecordData, k: string) =>
  typeof r[k] === "string" ? (r[k] as string) : "";
export const num = (r: RecordData, k: string) =>
  typeof r[k] === "number" ? (r[k] as number) : null;
export const dateToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const addDays = (d: string, n: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const monthEnd = (d: string) =>
  new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 0, 12))
    .toISOString()
    .slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000,
  );
export const cents = (n: number) => Math.round(n * 100);
export const currency = (n: number | null) =>
  n === null
    ? "DADO PENDENTE"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(n / 100);
export const percent = (n: number | null) =>
  n === null
    ? "DADO PENDENTE"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n) +
      "%";
export function addMonths(date: string, n: number) {
  const day = Number(date.slice(8, 10));
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(
    Math.min(day, Number(monthEnd(d.toISOString().slice(0, 10)).slice(8, 10))),
  );
  return d.toISOString().slice(0, 10);
}
export function emptyDatabase(): Database {
  return Object.fromEntries(Object.keys(DEFINITIONS).map((k) => [k, []]));
}
