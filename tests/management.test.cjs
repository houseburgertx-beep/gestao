const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");
const path = require("node:path");
test("E-mails: operador excluído; gerente recebe apenas nova tarefa da própria unidade", () => {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,"../email-worker/src/recipients.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const module={exports:{}};new Function("module","exports",source)(module,module.exports);
  const users=[{id:"1",email:"admin@example.com",role:"admin",active:true},{id:"2",email:"finance@example.com",role:"accountant",active:true},{id:"3",email:"manager@example.com",role:"manager",unitId:"teixeira",active:true},{id:"4",email:"operator@example.com",role:"operator",unitId:"teixeira",active:true},{id:"5",email:"inactive@example.com",role:"admin",active:false}];
  assert.deepEqual(module.exports.recipientsFor(users,{kind:"cash_closing"}),["admin@example.com","finance@example.com"]);
  assert.deepEqual(module.exports.recipientsFor(users,{kind:"task_created",unitId:"teixeira"}),["admin@example.com","finance@example.com","manager@example.com"]);
  assert.deepEqual(module.exports.recipientsFor(users,{kind:"task_completed",unitId:"teixeira"}),["admin@example.com","finance@example.com"]);
  assert.deepEqual(module.exports.recipientsFor(users,{kind:"task_created",unitId:"foodpark"}),["admin@example.com","finance@example.com"]);
});
test("Apps Script: o redirecionamento busca a resposta por GET sem repetir o envio", async () => {
  const worker = fs.readFileSync(path.join(__dirname, "../email-worker/src/index.ts"), "utf8");
  const functionSource = worker.slice(worker.indexOf("async function callGoogleScript("), worker.indexOf("async function sendEmail("));
  const compiled = ts.transpileModule(functionSource, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;
  const calls = [];
  const callGoogleScript = new Function("fetch", compiled + "; return callGoogleScript;")(async (url, init) => {
    calls.push({url, init});
    return calls.length === 1 ? new Response(null, {status: 302, headers: {Location: "https://script.googleusercontent.com/macros/echo?test=1"}}) : Response.json({ok: true, fileId: "test-file"});
  });
  assert.equal((await callGoogleScript({GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/test/exec", GOOGLE_SCRIPT_SECRET: "test"}, {action: "upload"})).fileId, "test-file");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[1].init.method, "GET");
  assert.equal(calls[1].init.body, undefined);
});
test("Apps Script: recupera 404 temporário lendo novamente sem duplicar o POST", async () => {
  const worker = fs.readFileSync(path.join(__dirname, "../email-worker/src/index.ts"), "utf8");
  const source = worker.slice(worker.indexOf("async function callGoogleScript("), worker.indexOf("async function sendEmail("));
  const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;
  const calls = [];
  const call = new Function("fetch", "setTimeout", compiled + ";return callGoogleScript;")(async (url, init) => {
    calls.push(init);
    if (calls.length === 1) return new Response(null, {status:302,headers:{Location:"https://script.googleusercontent.com/macros/echo?test=1"}});
    if (calls.length < 4) return new Response("Unavailable", {status:404});
    return Response.json({ok:true,fileId:"saved-file"});
  }, (callback) => callback());
  assert.equal((await call({GOOGLE_SCRIPT_URL:"https://script.google.com/macros/s/test/exec",GOOGLE_SCRIPT_SECRET:"test"},{action:"upload"})).fileId,"saved-file");
  assert.equal(calls.filter(c => c.method === "POST").length,1);
  assert.equal(calls.filter(c => c.method === "GET").length,3);
  assert.ok(calls.slice(1).every(c => !c.body));
});
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    filename,
  );
test("NF-e OESA reconhece a duplicata e não confunde produtos ou chave com boleto", () => {
  const { parseDebtDocument } = require("../src/domain/management/documentParsing.ts");
  const result = parseDebtDocument("Recebemos de OESA COMERCIO E REPRESENTACOES SA os produtos constantes na Nota Fiscal Eletrônica NF-e Nº: 177985 Emissão: 01/09/2026 DANFE CHAVE DE ACESSO 2926.0981.6119.3100.4549.5500.1000.1779.8515.3531.8567 CNPJ/CPF 81.611.931/0045-49 DESTINATÁRIO/REMETENTE A.M. GOURMET 42.549.171/0001-14 FATURAS DUPLICATAS FATURA VALOR ORIGINAL VALOR DESCONTO VALOR LÍQUIDO DUPLICATA VENCIMENTO VALOR 177985 1.705,09 0,00 1.705,09 001 22/09/2026 1.705,09 CÁLCULO DE IMPOSTO VALOR TOTAL DOS PRODUTOS 1.685,60");
  assert.equal(result.supplierName, "OESA COMERCIO E REPRESENTACOES SA");
  assert.equal(result.supplierDocument, "81.611.931/0045-49");
  assert.equal(result.amount, 170509);
  assert.equal(result.dueDate, "2026-09-22");
  assert.equal(result.documentNumber, "NF-e 177985");
  assert.equal(result.obligationType, "Débito");
  assert.equal(parseDebtDocument("NF-e Nº: Série: Emissão: 177985 1 01/09/2026 DANFE").documentNumber, "NF-e 177985");
});
test("Registro de empregado (PDF): extrai colaborador, CPF, cargo, admissão, salário e notas", () => {
  const { parseEmployeeDocument } = require("../src/domain/management/documentParsing.ts");
  const samplePdfText = `
Categoria
Doc. militar 
DOMINGOS PEREIRA DE SOUZA
NAIR DIAS FARIAS 
Empregado
Residência
Beneficiários 
GLEUCE DIAS DE SOUZA
Rua PROFESSORA MARIA ANTUNES, JARDIM LIBERDADE, TEIXEIRA
DE FREITAS, BA, - CEP: 45994-390 
FILIAÇÃO
Pai
Mãe 
0868043 
CTPS 
1508 
02/05/2000 
086.804.315-08 
CPF 
BA 
TEIXEIRA DE FREITAS - BA   BRASIL   Solteiro 
Título Eleitoral   Inscr. Órgão de Classe
Estado civil País da nacionalidade Local do nascimento Data de nascimento
Cart. Nac. Habilitação UF CTPS
Cédula de Identidade   Data de emissão   Órgão/UF emissor
Data de expedição da CTPS
Zona
Série
Seção 
FGTS   Opção em 
01/04/2026 
Data de Admissão 
01/04/2026 
Salário   Por 
Mês 
Horário de Trabalho 
das 16:00 as 00:00 
Horário de Intervalo
Conta vinculada no banco   Data da Retificação
PROGRAMA DE INTEGRAÇÃO SOCIAL - PIS
Cadastrado em   Sob nº   Domicílio bancário
Nº banco   Agência código
ALTERAÇÕES DE SALÁRIO, CARGO E/OU FUNÇÃO
FÉRIAS - PERÍODO AQUISITIVO   FÉRIAS - PERÍODO DE GOZO   Obs.: (Anotar advertências, suspensões, transferências, etc.)
RESCISÃO DE CONTRATO DE TRABALHO ACIDENTES DE TRABALHO, DOENÇAS OU DOENÇAS PROFISSIONAIS
CONTRIBUIÇÃO SINDICAL
End. da agência 
GLEUCE DIAS DE SOUZA 
OBSERVAÇÕES 
Tipo do desligamento:
Data da saída: 
2.000,00 R$ 
Categoria   Cor 
Preta   Sexo 
Masculino   Grau de instrução 
Ensino Médio Completo 
Telefone Celular Telefone Residencial 
Não 
Deficiência
Cargo 
SUPERVISOR GERAL   Função   C.B.O. 
520110 
FÉRIAS - PERÍODO ABONO PECUNIÁRIO 
000037
PC CASTRO ALVES, 436, CENTRO, TEIXEIRA DE FREITAS, BA,
52.910.864/0001-44 
Endereço
Nº Autenticar 
CNPJ 
REGISTRO DE EMPREGADO 
HOUSE BURGUER 190 HAMBURGUERIA LTDA
37 
Empregador
Matrícula eSocial 
SSP 
`;
  const result = parseEmployeeDocument(samplePdfText);
  assert.equal(result.name, "GLEUCE DIAS DE SOUZA");
  assert.equal(result.cpf, "086.804.315-08");
  assert.equal(result.birthDate, "2000-05-02");
  assert.equal(result.admissionDate, "2026-04-01");
  assert.equal(result.role, "SUPERVISOR GERAL");
  assert.equal(result.salary, 2000);
  assert.equal(result.salaryCents, 200000);
  assert.equal(result.salaryFormatted, "2.000,00");
  assert.equal(result.workHours, "das 16:00 as 00:00");
  assert.equal(result.unitId, "teixeira");
  assert.equal(result.department, "Gerência / Administrativo");
  assert.equal(result.contractType, "CLT");
  assert.equal(result.cbo, "520110");
  assert.equal(result.ctps, "0868043");
  assert.equal(result.serie, "1508");
  assert.equal(result.esocial, "37");
  assert.equal(result.motherName, "NAIR DIAS FARIAS");
  assert.equal(result.fatherName, "DOMINGOS PEREIRA DE SOUZA");
  assert.ok(result.notes.includes("CTPS: 0868043"));
  assert.ok(result.notes.includes("CBO: 520110"));

  const labeled = parseEmployeeDocument(`
    FICHA CADASTRAL DE COLABORADOR
    Nome do Empregado: João Carlos da Silva
    CPF: 123.456.789-10
    Data de Nascimento: 15/08/1996
    Cargo: Chapeiro Especialista
    Data de Admissão: 10/01/2026
    Salário Base: R$ 1.850,00
    Horário de Trabalho: 44h semanais
    Endereço: Av. Santos Dumont, 120, Eunápolis - BA - CEP: 45820-000
  `);
  assert.equal(labeled.name, "João Carlos da Silva");
  assert.equal(labeled.cpf, "123.456.789-10");
  assert.equal(labeled.birthDate, "1996-08-15");
  assert.equal(labeled.admissionDate, "2026-01-10");
  assert.equal(labeled.role, "Chapeiro Especialista");
  assert.equal(labeled.salary, 1850);
  assert.equal(labeled.salaryCents, 185000);
  assert.equal(labeled.unitId, "eunapolis");
  assert.equal(labeled.department, "Cozinha / Produção");
});
const {
  calculate,
  isCovered,
  outstanding,
  healthLabel,
  payableStatus,
} = require("../src/domain/management/engine.ts");
const {
  emptyDatabase,
  DEFINITIONS,
  addMonths,
  monthEnd,
  DATASETS,
} = require("../src/domain/management/model.ts");
const {
  buildRecords,
  validate,
  payrollProvisions,
  settlement,
} = require("../src/domain/management/operations.ts");
const filters = {
  start: "2026-09-01",
  end: "2026-09-30",
  today: "2026-09-30",
  unitId: "",
  companyId: "",
  brandId: "",
  group: "",
  channel: "",
};
let seq = 0;
const record = (kind, fields = {}) => ({
  id: "id" + ++seq,
  kind,
  tenantId: "test",
  unitId: "u1",
  version: 1,
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
  createdBy: "test",
  updatedBy: "test",
  ...Object.fromEntries(
    (DEFINITIONS[kind]?.fields || [])
      .filter(
        (f) => f.required && ["money", "number", "percent"].includes(f.type),
      )
      .map((f) => [f.key, 0]),
  ),
  ...(kind === "payroll"
    ? {
        vacationProvision: 0,
        vacationThird: 0,
        thirteenth: 0,
        fgts: 0,
        provisionCharges: 0,
      }
    : {}),
  ...fields,
});
function fixture() {
  const db = emptyDatabase();
  db.units = [
    record("units", {
      id: "u1",
      name: "Loja A",
      companyId: "c1",
      brandId: "b1",
      unitType: "Loja",
    }),
  ];
  return db;
}
test("Conta com fornecedor novo valida e grava ambos no mesmo lote; cadastro existente é reutilizado", async () => {
  const worker = fs.readFileSync(path.join(__dirname, "../src/services/managementService.ts"), "utf8");
  const source = worker.slice(worker.indexOf("export async function saveManagement("), worker.indexOf("async function createRecords(" )).replace("export async", "async");
  const compiled = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  const writes = [];
  const save = new Function("str","validate","buildRecords","createRecords","commitRecords",compiled + ";return saveManagement;")((r,k)=>String(r[k]||""),validate,buildRecords,async rows=>writes.push(rows),async rows=>writes.push(rows));
  const state = fixture();
  const payable = record("payables",{obligationType:"Boleto",status:"Pendente",description:"Nota do fornecedor",dueDate:"2026-09-22",amount:170509,scannedSupplierName:"OESA",scannedSupplierDocument:"81.611.931/0045-49"});
  await save(payable,state);
  assert.equal(writes.length,1);
  const supplier = writes[0].find(r=>r.kind === "suppliers");
  const account = writes[0].find(r=>r.kind === "payables");
  assert.equal(supplier.name,"OESA");
  assert.equal(account.supplierId,supplier.id);
  assert.equal(state.suppliers.length,0);
  state.suppliers.push(supplier);
  await save({...payable,id:"another-account"},state);
  assert.equal(writes[1].filter(r=>r.kind === "suppliers").length,0);
  assert.equal(writes[1].find(r=>r.kind === "payables").supplierId,supplier.id);
});
function complete(db) {
  for (const u of db.units)
    for (const dataset of DATASETS)
      db.coverage.push(
        record("coverage", {
          unitId: u.id,
          dataset,
          start: "2026-08-01",
          end: "2027-01-01",
          confirmed: true,
        }),
      );
  return db;
}
test("nenhuma base não vira faturamento zero ou score saudável", () => {
  const r = calculate(emptyDatabase(), filters);
  for (const k of ["gross", "bank", "profit", "freeCash"])
    assert.equal(r.metrics[k].value, null);
  assert.equal(r.score, null);
  assert.equal(r.negativeDate, undefined);
});
test("unidade cadastrada sem cobertura permanece pendente", () =>
  assert.equal(calculate(fixture(), filters).metrics.gross.value, null));
test("zero explicitamente conferido é zero; denominador zero não vira percentual", () => {
  const r = calculate(complete(fixture()), filters);
  assert.equal(r.metrics.gross.value, 0);
  assert.equal(r.metrics.margin.value, null);
  assert.equal(r.metrics.cmv.value, 0);
  assert.equal(r.score, null);
});
test("cobertura soma janelas adjacentes mas não cobre lacunas", () => {
  const db = fixture();
  db.coverage = [
    record("coverage", {
      dataset: "revenues",
      start: "2026-09-01",
      end: "2026-09-10",
      confirmed: true,
    }),
    record("coverage", {
      dataset: "revenues",
      start: "2026-09-11",
      end: "2026-09-30",
      confirmed: true,
    }),
  ];
  assert.equal(
    isCovered(db, "u1", "revenues", "2026-09-01", "2026-09-30"),
    true,
  );
  db.coverage[1].start = "2026-09-12";
  assert.equal(
    isCovered(db, "u1", "revenues", "2026-09-01", "2026-09-30"),
    false,
  );
});
test("cobertura de um canal não certifica todos os canais", () => {
  const db = fixture();
  db.coverage = [
    record("coverage", {
      dataset: "revenues",
      start: "2026-09-01",
      end: "2026-09-30",
      channel: "iFood",
      confirmed: true,
    }),
  ];
  assert.equal(
    isCovered(db, "u1", "revenues", filters.start, filters.end),
    false,
  );
  assert.equal(
    isCovered(db, "u1", "revenues", filters.start, filters.end, "iFood"),
    true,
  );
});
test("venda, DRE e recebimento permanecem separados", () => {
  const db = complete(fixture());
  db.revenues = [
    record("revenues", {
      date: "2026-09-10",
      channel: "Salão",
      gross: 100000,
      discounts: 1000,
      coupons: 0,
      cashback: 0,
      cancellations: 0,
      fees: 500,
      orders: 20,
      customers: 18,
    }),
  ];
  const r = calculate(db, filters);
  assert.equal(r.metrics.gross.value, 100000);
  assert.equal(r.metrics.net.value, 99000);
  assert.equal(r.metrics.receipts.value, 0);
  assert.equal(r.metrics.profit.value, 98500);
  assert.equal(r.metrics.ticket.value, 4950);
});
test("pagamento parcial não altera despesa por competência", () => {
  const db = complete(fixture());
  db.categories = [
    record("categories", { id: "rent", dreLine: "Aluguel", behavior: "Fixa" }),
  ];
  db.payables = [
    record("payables", {
      id: "a",
      amount: 10000,
      competence: "2026-09",
      dueDate: "2026-09-20",
      categoryId: "rent",
    }),
  ];
  db.transactions = [
    record("transactions", {
      obligationId: "a",
      amount: 4000,
      date: "2026-09-21",
      direction: "Saída",
      nature: "Operacional",
    }),
  ];
  const r = calculate(db, filters);
  assert.equal(r.metrics.payable.value, 6000);
  assert.equal(r.metrics.spending.value, 4000);
  assert.equal(r.metrics.opExpenses.value, 10000);
  assert.equal(r.metrics.overdue.value, 6000);
});
test("saldo inicial não conta movimentos anteriores novamente", () => {
  const db = complete(fixture());
  db.bankAccounts = [
    record("bankAccounts", {
      id: "bank",
      balance: 50000,
      balanceDate: "2026-09-15",
      reconciled: true,
    }),
  ];
  db.transactions = [
    record("transactions", {
      date: "2026-09-10",
      amount: 10000,
      direction: "Entrada",
      bankAccountId: "bank",
      nature: "Operacional",
    }),
    record("transactions", {
      date: "2026-09-20",
      amount: 5000,
      direction: "Saída",
      bankAccountId: "bank",
      nature: "Operacional",
    }),
  ];
  assert.equal(calculate(db, filters).metrics.bank.value, 45000);
});
test("imposto gera uma obrigação e reduz caixa livre uma única vez", () => {
  const db = complete(fixture());
  const source = record("taxes", {
    id: "tax",
    amount: 10000,
    competence: "2026-09",
    dueDate: "2026-10-03",
    taxType: "ISS",
    taxEffect: "Impostos sobre vendas",
  });
  for (const r of buildRecords(source)) db[r.kind].push(r);
  db.bankAccounts = [
    record("bankAccounts", {
      balance: 100000,
      balanceDate: "2026-09-30",
      reconciled: true,
    }),
  ];
  const r = calculate(db, filters);
  assert.equal(r.metrics.taxesPayable.value, 10000);
  assert.equal(r.metrics.committed.value, 10000);
  assert.equal(r.metrics.freeCash.value, 90000);
  assert.equal(r.metrics.net.value, -10000);
  assert.equal(r.metrics.opExpenses.value, 0);
});
test("estoque e transferências a custo consolidam sem duplicação", () => {
  const db = complete(fixture());
  db.units.push(
    record("units", { id: "u2", name: "Loja B", unitType: "Loja" }),
  );
  complete(db);
  for (const u of ["u1", "u2"]) {
    db.inventory.push(
      record("inventory", {
        unitId: u,
        productId: "p",
        date: "2026-08-31",
        amount: 10000,
        confirmed: true,
      }),
      record("inventory", {
        unitId: u,
        productId: "p",
        date: "2026-09-30",
        amount: 5000,
        confirmed: true,
      }),
    );
  }
  db.transfers = [
    record("transfers", {
      toUnitId: "u2",
      date: "2026-09-15",
      amount: 1000,
      productId: "p",
    }),
  ];
  assert.equal(calculate(db, filters).metrics.cmv.value, 10000);
  assert.equal(
    calculate(db, { ...filters, unitId: "u1" }).metrics.cmv.value,
    4000,
  );
  assert.equal(
    calculate(db, { ...filters, unitId: "u2" }).metrics.cmv.value,
    6000,
  );
});
test("estoque inicial ausente nunca equivale a zero", () => {
  const db = complete(fixture());
  db.inventory = [
    record("inventory", {
      productId: "p",
      date: "2026-09-30",
      amount: 5000,
      confirmed: true,
    }),
  ];
  assert.equal(calculate(db, filters).metrics.cmv.value, null);
});
test("empréstimo recebido não é geração operacional ou receita", () => {
  const db = complete(fixture());
  db.transactions = [
    record("transactions", {
      date: "2026-09-02",
      direction: "Entrada",
      nature: "Financiamento",
      amount: 100000,
    }),
  ];
  const r = calculate(db, filters);
  assert.equal(r.metrics.receipts.value, 100000);
  assert.equal(r.metrics.cashGeneration.value, 0);
  assert.equal(r.metrics.gross.value, 0);
});
test("recebíveis vencidos não são recebimento futuro presumido", () => {
  const db = complete(fixture());
  db.bankAccounts = [
    record("bankAccounts", {
      balance: 0,
      balanceDate: "2026-09-30",
      reconciled: true,
    }),
  ];
  db.receivables = [
    record("receivables", { amount: 10000, dueDate: "2026-09-10" }),
  ];
  assert.equal(calculate(db, filters).forecast[0].incoming, 0);
});
test("alerta identifica primeira data e déficit exato de caixa", () => {
  const db = complete(fixture());
  db.bankAccounts = [
    record("bankAccounts", {
      balance: 10000,
      balanceDate: "2026-09-30",
      reconciled: true,
    }),
  ];
  db.payables = [record("payables", { amount: 15000, dueDate: "2026-10-03" })];
  const r = calculate(db, filters);
  assert.equal(r.negativeDate, "2026-10-03");
  assert.equal(r.lowest, -5000);
  assert.equal(r.alerts[0].id, "cash-negative");
});
test("arredondamento de parcelas preserva cada centavo e último dia do mês", () => {
  const rows = buildRecords(
    record("payables", {
      amount: 10000,
      dueDate: "2026-01-31",
      competence: "2026-01",
      installments: 3,
    }),
  );
  assert.deepEqual(
    rows.map((r) => r.amount),
    [3334, 3333, 3333],
  );
  assert.deepEqual(
    rows.map((r) => r.dueDate),
    ["2026-01-31", "2026-02-28", "2026-03-31"],
  );
  assert.equal(
    rows.reduce((s, r) => s + r.amount, 0),
    10000,
  );
});
test("recorrência repete valor e muda competência", () => {
  const rows = buildRecords(
    record("payables", {
      amount: 10000,
      dueDate: "2026-12-10",
      competence: "2026-12",
      recurrenceCount: 2,
    }),
  );
  assert.equal(rows[1].amount, 10000);
  assert.equal(rows[1].competence, "2027-01");
});
test("provisões explicitam férias, terço e décimo terceiro", () => {
  const r = payrollProvisions(
    record("payroll", { eligibleBase: 120000, fgtsRate: 8, chargeRate: 0 }),
  );
  assert.equal(r.vacationProvision, 10000);
  assert.equal(r.vacationThird, 3333);
  assert.equal(r.thirteenth, 10000);
  assert.equal(r.fgts, 9600);
});
test("baixa acima do saldo ou conta inexistente é bloqueada; permite contas do grupo", () => {
  const db = fixture();
  const r = record("payables", { id: "p", amount: 10000 });
  db.payables = [r];
  db.bankAccounts = [
    record("bankAccounts", { id: "bank" }),
    record("bankAccounts", { id: "other", unitId: "u2" }),
  ];
  assert.throws(() =>
    settlement(r, db, 10001, "2026-09-20", "bank", "test", "tx"),
  );
  assert.throws(() =>
    settlement(r, db, 1, "2026-09-20", "invalid_bank_id", "test", "tx"),
  );
  const ok = settlement(r, db, 5000, "2026-09-20", "other", "test", "tx");
  assert.equal(ok.amount, 5000);
  assert.equal(ok.bankAccountId, "other");
});
test("score não redistribui pesos na falta de posição patrimonial", () => {
  const db = complete(fixture());
  db.policies = [
    record("policies", {
      effectiveDate: "2026-01-01",
      liquidityTarget: 1.5,
      cmvTarget: 35,
      cmvCritical: 40,
      payrollTarget: 25,
      payrollCritical: 35,
      marginTarget: 10,
      debtTarget: 40,
      debtCritical: 80,
      returnTarget: 5,
    }),
  ];
  assert.equal(calculate(db, filters).score, null);
});
test("faixas solicitadas do score têm limites corretos", () =>
  assert.deepEqual([0, 29, 30, 49, 50, 64, 65, 79, 80, 100].map(healthLabel), [
    "Emergência",
    "Emergência",
    "Crítico",
    "Crítico",
    "Atenção",
    "Atenção",
    "Saudável",
    "Saudável",
    "Excelente",
    "Excelente",
  ]));
test("filtro de empresa exclui outras unidades", () => {
  const db = complete(fixture());
  db.units.push(record("units", { id: "u2", companyId: "other" }));
  db.revenues = [
    record("revenues", { unitId: "u2", date: "2026-09-10", gross: 99999 }),
  ];
  assert.equal(
    calculate(db, { ...filters, companyId: "c1" }).metrics.gross.value,
    0,
  );
});
test("valores patrimoniais não são rateados arbitrariamente por canal", () => {
  const db = complete(fixture());
  db.bankAccounts = [
    record("bankAccounts", {
      balance: 10000,
      balanceDate: "2026-09-30",
      reconciled: true,
    }),
  ];
  assert.equal(
    calculate(db, { ...filters, channel: "iFood" }).metrics.bank.value,
    null,
  );
});
test("resumo e venda do mesmo dia/canal impedem receita conclusiva", () => {
  const db = complete(fixture());
  db.revenues = [
    record("revenues", { date: "2026-09-01", channel: "Salão", gross: 10000 }),
  ];
  db.sales = [
    record("sales", { date: "2026-09-01", channel: "Salão", gross: 10000 }),
  ];
  assert.equal(calculate(db, filters).metrics.gross.value, null);
});
test("mês fechado exige checklist integral", () => {
  const db = fixture();
  assert.throws(() =>
    validate(
      record("closings", { competence: "2026-09", status: "MÊS FECHADO" }),
      db,
    ),
  );
});
test("mudança de ano e fevereiro bissexto", () => {
  assert.equal(addMonths("2026-12-31", 2), "2027-02-28");
  assert.equal(monthEnd("2028-02-01"), "2028-02-29");
});
test("estorno restaura obrigação sem apagar histórico de caixa", () => {
  const db = complete(fixture());
  const p = record("payables", {
    id: "p-reversal",
    amount: 10000,
    dueDate: "2026-09-20",
    competence: "2026-09",
  });
  db.payables = [p];
  db.transactions = [
    record("transactions", {
      id: "paid",
      obligationId: p.id,
      amount: 4000,
      direction: "Saída",
      nature: "Operacional",
      date: "2026-09-20",
    }),
    record("transactions", {
      id: "reverse-paid",
      obligationId: p.id,
      reversalOf: "paid",
      amount: 4000,
      direction: "Entrada",
      nature: "Operacional",
      date: "2026-09-21",
    }),
  ];
  assert.equal(outstanding(p, db, "2026-09-20"), 6000);
  assert.equal(outstanding(p, db, "2026-09-21"), 10000);
  assert.equal(calculate(db, filters).metrics.cashGeneration.value, 0);
});
test("provisão tributária exige base e alíquota e preserva centavos", () => {
  const r = record("taxes", {
    amount: null,
    base: 123456,
    rate: 6,
    competence: "2026-09",
    dueDate: "2026-10-20",
    taxType: "Simples Nacional",
  });
  const records = buildRecords(r);
  assert.equal(records[0].amount, 7407);
  assert.equal(records[1].amount, 7407);
  assert.throws(() => buildRecords({ ...r, base: null }));
});
test("limite para gastar não antecipa recebíveis nem consome provisões", () => {
  const db = complete(fixture());
  db.bankAccounts = [
    record("bankAccounts", {
      balance: 10000,
      balanceDate: "2026-09-30",
      reconciled: true,
    }),
  ];
  db.payables = [record("payables", { amount: 4000, dueDate: "2026-10-15" })];
  db.receivables = [
    record("receivables", { amount: 100000, dueDate: "2026-10-01" }),
  ];
  const r = calculate(db, filters);
  assert.equal(r.metrics.freeCash.value, 6000);
  assert.equal(r.metrics.safeSpend.value, 6000);
});
test("score completo decorre dos dez indicadores e não de valores fixos", () => {
  const db = complete(fixture());
  db.revenues = [
    record("revenues", {
      date: "2026-09-30",
      channel: "Salão",
      gross: 100000,
      discounts: 0,
      coupons: 0,
      cashback: 0,
      cancellations: 0,
      fees: 2000,
      orders: 100,
      customers: 100,
    }),
  ];
  db.purchases = [
    record("purchases", { date: "2026-09-10", productId: "p", amount: 30000 }),
  ];
  db.inventory = [
    record("inventory", {
      date: "2026-08-31",
      productId: "p",
      amount: 10000,
      confirmed: true,
    }),
    record("inventory", {
      date: "2026-09-30",
      productId: "p",
      amount: 10000,
      confirmed: true,
    }),
  ];
  db.payroll = [record("payroll", { competence: "2026-09", salary: 20000 })];
  db.categories = [
    record("categories", { id: "rent", dreLine: "Aluguel", behavior: "Fixa" }),
  ];
  db.payables = [
    record("payables", {
      amount: 10000,
      competence: "2026-09",
      dueDate: "2026-10-05",
      categoryId: "rent",
    }),
  ];
  db.transactions = [
    record("transactions", {
      date: "2026-09-15",
      amount: 100000,
      direction: "Entrada",
      nature: "Operacional",
    }),
    record("transactions", {
      date: "2026-09-15",
      amount: 70000,
      direction: "Saída",
      nature: "Operacional",
    }),
  ];
  db.bankAccounts = [
    record("bankAccounts", {
      balance: 100000,
      balanceDate: "2026-09-30",
      reconciled: true,
    }),
  ];
  db.positions = [
    record("positions", { date: "2026-08-31", totalAssets: 200000 }),
    record("positions", {
      date: "2026-09-30",
      currentAssets: 180000,
      currentLiabilities: 40000,
      totalAssets: 250000,
      totalLiabilities: 40000,
    }),
  ];
  db.goals = [
    record("goals", { start: "2026-09-01", end: "2026-09-30", target: 100000 }),
  ];
  db.policies = [
    record("policies", {
      effectiveDate: "2026-01-01",
      liquidityTarget: 1.5,
      cmvTarget: 35,
      cmvCritical: 40,
      payrollTarget: 25,
      payrollCritical: 35,
      marginTarget: 10,
      debtTarget: 40,
      debtCritical: 80,
      returnTarget: 5,
    }),
  ];
  const r = calculate(db, filters);
  assert.equal(r.metrics.profit.value, 38000);
  assert.equal(r.score, 100);
  db.inventory.pop();
  assert.equal(calculate(db, filters).score, null);
});

test("campo financeiro ausente continua pendente apesar da cobertura", () => {
  const db = complete(fixture());
  const payroll = record("payroll", { competence: "2026-09", salary: 10000 });
  delete payroll.benefits;
  db.payroll = [payroll];
  assert.equal(calculate(db, filters).metrics.payroll.value, null);
});

test('Takeat: monthly and daily reports never double count; unknown costs remain pending',()=>{
 const db=emptyDatabase();
 db.units=[{id:'teixeira',name:'House 190 Teixeira',unitId:''}];
 const base={source:'takeat',unitId:'teixeira',syncedAt:'2026-09-30T20:00:00Z',salao:60,delivery:30,ifood:10,totalRevenue:100};
 db.takeatReports=[{...base,id:'month',date:'2026-09'},{...base,id:'day',date:'2026-09-10'}];
 const result=calculate(db,filters);
 assert.equal(result.metrics.gross.value,10000);
 assert.equal(result.metrics.net.value,null);
 assert.equal(result.metrics.freeCash.value,null);
 assert.equal(result.trend.length,0);
 assert.equal(calculate(db,{...filters,channel:'Salão'}).metrics.gross.value,6000);
 assert.equal(calculate(db,{...filters,channel:'Outros'}).metrics.gross.value,null);
 assert.equal(calculate(db,{...filters,start:'2026-09-10',end:'2026-09-10'}).metrics.gross.value,10000);
 assert.equal(calculate(db,{...filters,start:'2026-09-11',end:'2026-09-11'}).metrics.gross.value,null);
});
test('Takeat: stale monthly snapshot does not assert current-day completeness',()=>{
 const db=emptyDatabase();db.units=[{id:'teixeira',name:'Teixeira',unitId:''}];
 db.takeatReports=[{id:'m',source:'takeat',unitId:'teixeira',date:'2026-09',syncedAt:'2026-09-14T20:00:00Z',salao:60,delivery:30,ifood:10,totalRevenue:100}];
 const result=calculate(db,filters);
 assert.equal(result.metrics.gross.value,null);
 assert.equal(result.metrics.gross.partial,10000);
});
test('Takeat: channels without reconciliation are not invented',()=>{
 const db=emptyDatabase();db.units=[{id:'teixeira',name:'Teixeira',unitId:''}];
 db.takeatReports=[{id:'m',source:'takeat',unitId:'teixeira',date:'2026-09',syncedAt:'2026-09-30T20:00:00Z',salao:60,delivery:30,ifood:0,totalRevenue:100}];
 assert.equal(calculate(db,filters).metrics.gross.value,10000);
 assert.equal(calculate(db,{...filters,channel:'iFood'}).metrics.gross.value,null);
});

test('Fechamento e conferência: dinheiro esperado negativo sem cobertura resulta em falta e não sobra', () => {
  const calcCashDiff = (cashExpected, cashFound) => {
    return cashExpected < 0 ? cashFound - Math.abs(cashExpected) : cashFound - cashExpected;
  };
  const diffLabel = (diff) => {
    const rounded = Math.round(diff);
    return rounded === 0 ? "Confere" : rounded > 0 ? "Sobra" : "Falta";
  };

  // User bug case: cashExpected = -10.34 (-1034 cents), cashFound = 0
  const bugDiff = calcCashDiff(-1034, 0);
  assert.equal(bugDiff, -1034);
  assert.equal(diffLabel(bugDiff), "Falta");

  // Fully covered: cashExpected = -10.34, cashFound = 10.34
  const coveredDiff = calcCashDiff(-1034, 1034);
  assert.equal(coveredDiff, 0);
  assert.equal(diffLabel(coveredDiff), "Confere");

  // Over-covered: cashExpected = -10.34, cashFound = 15.00
  const surplusDiff = calcCashDiff(-1034, 1500);
  assert.equal(surplusDiff, 466);
  assert.equal(diffLabel(surplusDiff), "Sobra");

  // Normal positive expected shortage: cashExpected = 50.00, cashFound = 0
  const normalShortage = calcCashDiff(5000, 0);
  assert.equal(normalShortage, -5000);
  assert.equal(diffLabel(normalShortage), "Falta");

  // Normal positive expected surplus: cashExpected = 50.00, cashFound = 60.00
  const normalSurplus = calcCashDiff(5000, 6000);
  assert.equal(normalSurplus, 1000);
  assert.equal(diffLabel(normalSurplus), "Sobra");
});

test("Google Sheets: formatação das tabelas espelho preserva ID, valores e links", () => {
  const {
    formatPayableRow,
    formatSettlementRow,
    formatCashClosingRow,
    formatCashConferenceRow,
  } = require("../src/services/sheetsBackupService.ts");

  const db = {
    units: [{ id: "u-tx", name: "House 190 Teixeira" }],
    suppliers: [{ id: "s-carne", name: "Frigorífico Frijoa" }],
    bankAccounts: [{ id: "b-stone", name: "Stone Teixeira" }],
    payables: [],
    transactions: [],
  };

  const payable = {
    id: "pay-100",
    unitId: "u-tx",
    supplierId: "s-carne",
    description: "Compra semanal de carne",
    dueDate: "2026-09-25",
    amount: 150000,
    originalAmount: 150000,
    obligationType: "Insumos",
    paymentMethod: "Boleto",
    documentFileId: "drive-file-boleto-123",
  };

  const pRow = formatPayableRow(payable, db, "2026-09-17");
  assert.equal(pRow.ID, "pay-100");
  assert.equal(pRow.UNIDADE, "House 190 Teixeira");
  assert.equal(pRow.FORNECEDOR, "Frigorífico Frijoa");
  assert.equal(pRow.LINK_BOLETO_DRIVE, "https://drive.google.com/open?id=drive-file-boleto-123");
  assert.equal(pRow.VALOR_PAGAR, "1.500,00");

  const settlement = {
    id: "tx-200",
    unitId: "u-tx",
    bankAccountId: "b-stone",
    description: "Baixa: Compra semanal de carne",
    amount: 150000,
    date: "2026-09-17",
    operatorName: "Gleuce",
    paymentProofFileId: "drive-proof-456",
  };

  const sRow = formatSettlementRow(settlement, db);
  assert.equal(sRow.ID, "tx-200");
  assert.equal(sRow.CONTA_BANCARIA, "Stone Teixeira");
  assert.equal(sRow.QUEM_PAGOU, "Gleuce");
  assert.equal(sRow.LINK_COMPROVANTE_DRIVE, "https://drive.google.com/open?id=drive-proof-456");

  const closing = {
    id: "close-300",
    date: "2026-09-17",
    unitId: "u-tx",
    operatorName: "Operador 1",
    systemTotal: 500000,
    cashExpected: 100000,
    cashFound: 95000,
    cashDifference: -5000,
    status: "Conferido",
  };
  const cRow = formatCashClosingRow(closing, db);
  assert.equal(cRow.ID, "close-300");
  assert.equal(cRow.DIFERENCA_DINHEIRO, "-50,00");
  assert.equal(cRow.STATUS, "Conferido");
});

test("RH - Cálculo dinâmico de tempo de casa (calculateTenure)", () => {
  const { calculateTenure } = require("../src/lib/tenureUtils.ts");

  // Colaborador admitido há 10 dias
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const tenure10d = calculateTenure(tenDaysAgo);
  assert.equal(tenure10d.years, 0);
  assert.equal(tenure10d.months, 0);
  assert.ok(tenure10d.days >= 9 && tenure10d.days <= 11);
  assert.match(tenure10d.text, /dias? de casa/);

  // Colaborador admitido há 70 dias (~2 meses)
  const seventyDaysAgo = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
  const tenure70d = calculateTenure(seventyDaysAgo);
  assert.ok(tenure70d.totalDays >= 69 && tenure70d.totalDays <= 71);
  assert.match(tenure70d.text, /m[eê]s/);

  // Colaborador com data futura ou vazia
  const emptyTenure = calculateTenure("");
  assert.equal(emptyTenure.totalDays, 0);
  assert.equal(emptyTenure.text, "Data não informada");

  // Colaborador com data em formato brasileiro DD/MM/YYYY
  const brTenure = calculateTenure("01/01/2024", "01/07/2024");
  assert.equal(brTenure.years, 0);
  assert.equal(brTenure.months, 6);
  assert.equal(brTenure.text, "6 meses de casa");
});

test("RH - Alertas e acompanhamento de contrato de experiência de 90 dias (getExperienceInfo)", () => {
  const { getExperienceInfo } = require("../src/lib/tenureUtils.ts");

  // Formato brasileiro DD/MM/YYYY funcionando perfeitamente
  const adm85d = new Date(Date.now() - 85 * 86400000);
  const pad = (n) => String(n).padStart(2, "0");
  const admBr = `${pad(adm85d.getUTCDate())}/${pad(adm85d.getUTCMonth() + 1)}/${adm85d.getUTCFullYear()}`;
  const expBr = getExperienceInfo(admBr);
  assert.equal(expBr.inExperience, true);
  assert.equal(expBr.urgency, "critical");
  assert.ok(expBr.daysRemaining <= 10 && expBr.daysRemaining >= 0);

  // Admitido há 85 dias (restam 5 dias para os 90 dias -> crítico <= 10d)
  const adm85dStr = new Date(Date.now() - 85 * 86400000).toISOString().slice(0, 10);
  const expCritical = getExperienceInfo(adm85dStr);
  assert.equal(expCritical.inExperience, true);
  assert.equal(expCritical.urgency, "critical");
  assert.ok(expCritical.daysRemaining <= 10 && expCritical.daysRemaining >= 0);
  assert.match(expCritical.badgeText, /Experiência acaba em|dias restantes/i);

  // Admitido há 90 dias (vencendo exatamente hoje -> crítico, último dia)
  const adm90d = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const expDay0 = getExperienceInfo(adm90d);
  assert.equal(expDay0.inExperience, true);
  assert.equal(expDay0.urgency, "critical");
  assert.equal(expDay0.daysRemaining, 0);
  assert.equal(expDay0.badgeText, "Último dia da experiência hoje!");

  // Admitido há 70 dias (restam 20 dias -> aviso <= 30d)
  const adm70d = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);
  const expWarning = getExperienceInfo(adm70d);
  assert.equal(expWarning.inExperience, true);
  assert.equal(expWarning.urgency, "warning");
  assert.ok(expWarning.daysRemaining <= 30 && expWarning.daysRemaining > 10);

  // Admitido há 15 dias (restam 75 dias -> normal)
  const adm15d = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10);
  const expNormal = getExperienceInfo(adm15d);
  assert.equal(expNormal.inExperience, true);
  assert.equal(expNormal.urgency, "normal");

  // Admitido há 120 dias (já passou dos 90 dias -> concluído)
  const adm120d = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const expCompleted = getExperienceInfo(adm120d);
  assert.equal(expCompleted.inExperience, false);
  assert.equal(expCompleted.urgency, "completed");

  // Colaborador já desligado não fica em alerta de experiência
  const expTerminated = getExperienceInfo(adm85dStr, undefined, true);
  assert.equal(expTerminated.inExperience, false);
  assert.equal(expTerminated.urgency, "completed");
});


