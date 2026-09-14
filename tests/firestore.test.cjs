const { test, before, after } = require("node:test");
const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  deleteDoc,
  runTransaction,
} = require("firebase/firestore");
let env;
const rec = (id, kind, extra = {}) => ({
  id,
  kind,
  tenantId: "house190",
  unitId: "u1",
  version: 1,
  createdBy: "admin",
  updatedBy: "admin",
  createdAt: "2026-09-14",
  updatedAt: "2026-09-14",
  ...extra,
});
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-gestao",
    firestore: {
      host: "127.0.0.1",
      port: 8089,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role, tenantId, unitId] of [
      ["admin", "admin", "house190", "all"],
      ["manager", "manager", "house190", "u1"],
      ["other", "admin", "other", "all"],
      ["inactive", "admin", "house190", "all"],
    ])
      await setDoc(doc(db, "users", uid), {
        role,
        tenantId,
        unitId,
        active: uid !== "inactive",
      });
    for (const id of ["u1", "u2"])
      await setDoc(
        doc(db, "gestao_units", id),
        rec(id, "units", { unitId: "", name: id }),
      );
    await setDoc(
      doc(db, "gestao_revenues", "revenue-u2"),
      rec("revenue-u2", "revenues", { unitId: "u2", date: "2026-09-01" }),
    );
    await setDoc(
      doc(db, "gestao_revenues", "revenue-u1"),
      rec("revenue-u1", "revenues", { date: "2026-09-01" }),
    );
    await setDoc(doc(db, "gestao_locks", "house190_u1_2026-08"), {
      tenantId: "house190",
      unitId: "u1",
      closed: true,
    });
  });
});
after(async () => {
  await env.cleanup();
});
test("unauthenticated and inactive accounts cannot read management data", async () => {
  await assertFails(
    getDoc(
      doc(
        env.unauthenticatedContext().firestore(),
        "gestao_revenues",
        "revenue-u1",
      ),
    ),
  );
  await assertFails(
    getDoc(
      doc(
        env.authenticatedContext("inactive").firestore(),
        "gestao_revenues",
        "revenue-u1",
      ),
    ),
  );
});
test("manager reads own unit and cannot read another unit", async () => {
  const db = env.authenticatedContext("manager").firestore();
  await assertSucceeds(getDoc(doc(db, "gestao_revenues", "revenue-u1")));
  await assertFails(getDoc(doc(db, "gestao_revenues", "revenue-u2")));
});
test("cross tenant reads are denied", async () => {
  await assertFails(
    getDoc(
      doc(
        env.authenticatedContext("other").firestore(),
        "gestao_revenues",
        "revenue-u1",
      ),
    ),
  );
});
test("scoped query is authorized and unscoped query denied", async () => {
  const db = env.authenticatedContext("manager").firestore();
  await assertSucceeds(
    getDocs(
      query(
        collection(db, "gestao_revenues"),
        where("tenantId", "==", "house190"),
        where("unitId", "==", "u1"),
      ),
    ),
  );
  await assertFails(getDocs(collection(db, "gestao_revenues")));
});
test("create transaction can read missing record and missing monthly lock", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      await tx.get(doc(db, "gestao_revenues", "created"));
      await tx.get(doc(db, "gestao_locks", "house190_u1_2026-09"));
      tx.set(
        doc(db, "gestao_revenues", "created"),
        rec("created", "revenues", { date: "2026-09-01" }),
      );
    }),
  );
});
test("unknown unit and forged tenant writes are denied", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertFails(
    setDoc(
      doc(db, "gestao_revenues", "unknown-unit"),
      rec("unknown-unit", "revenues", { unitId: "missing" }),
    ),
  );
  await assertFails(
    setDoc(
      doc(db, "gestao_revenues", "forged"),
      rec("forged", "revenues", { tenantId: "other" }),
    ),
  );
});
test("closed competence rejects write", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertFails(
    setDoc(
      doc(db, "gestao_payables", "closed"),
      rec("closed", "payables", { competence: "2026-08", amount: 100 }),
    ),
  );
});
test("manager cannot certify coverage or change managerial policy", async () => {
  const db = env.authenticatedContext("manager").firestore();
  await assertFails(
    setDoc(
      doc(db, "gestao_coverage", "cov"),
      rec("cov", "coverage", { createdBy: "manager", updatedBy: "manager" }),
    ),
  );
  await assertFails(
    setDoc(
      doc(db, "gestao_policies", "policy"),
      rec("policy", "policies", {
        unitId: "",
        createdBy: "manager",
        updatedBy: "manager",
      }),
    ),
  );
});
test("record version and immutable tenant prevent stale or forged edits", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertFails(
    updateDoc(doc(db, "gestao_revenues", "revenue-u1"), {
      version: 1,
      updatedBy: "admin",
    }),
  );
  await assertFails(
    updateDoc(doc(db, "gestao_revenues", "revenue-u1"), {
      tenantId: "other",
      version: 2,
      updatedBy: "admin",
    }),
  );
  await assertSucceeds(
    updateDoc(doc(db, "gestao_revenues", "revenue-u1"), {
      version: 2,
      updatedBy: "admin",
    }),
  );
});
test("physical deletion and audit modification are denied", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertFails(deleteDoc(doc(db, "gestao_revenues", "revenue-u1")));
  await assertSucceeds(
    setDoc(doc(db, "gestao_audit", "audit"), {
      tenantId: "house190",
      unitId: "u1",
      updatedBy: "admin",
    }),
  );
  await assertFails(
    updateDoc(doc(db, "gestao_audit", "audit"), { operation: "forged" }),
  );
});
test("ledger record is immutable", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertSucceeds(
    setDoc(
      doc(db, "gestao_transactions", "tx"),
      rec("tx", "transactions", { date: "2026-09-14", amount: 100 }),
    ),
  );
  await assertFails(
    updateDoc(doc(db, "gestao_transactions", "tx"), {
      amount: 10,
      version: 2,
      updatedBy: "admin",
    }),
  );
});
// Exercise the actual client transaction service against the emulator, with only
// the configured Firestore instance replaced; no production credentials or data.
const ts = require("typescript"),
  Module = require("node:module"),
  path = require("node:path");
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
let currentServiceDb;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/firebase")
    return {
      get db() {
        return currentServiceDb;
      },
    };
  if (request.startsWith("@/"))
    return originalLoad.call(
      this,
      path.resolve("src", request.slice(2)),
      parent,
      isMain,
    );
  return originalLoad.call(this, request, parent, isMain);
};
const {
  saveManagement,
  commitRecords,
  reverseSettlement,
} = require("../src/services/managementService.ts");
const { emptyDatabase } = require("../src/domain/management/model.ts");
const { settlement } = require("../src/domain/management/operations.ts");
Module._load = originalLoad;
async function serviceState() {
  const data = emptyDatabase();
  for (const kind of Object.keys(data)) {
    const snapshot = await getDocs(
      query(
        collection(currentServiceDb, "gestao_" + kind),
        where("tenantId", "==", "house190"),
      ),
    );
    data[kind] = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
  }
  return data;
}
test("service atomically creates a tax with one linked obligation", async () => {
  currentServiceDb = env.authenticatedContext("admin").firestore();
  const state = await serviceState();
  const tax = rec("service-tax", "taxes", {
    version: 0,
    competence: "2026-09",
    dueDate: "2026-10-20",
    amount: null,
    base: 100000,
    rate: 6,
    taxType: "ISS",
    taxEffect: "Impostos sobre vendas",
  });
  await assertSucceeds(saveManagement(tax, state));
  const saved = await getDoc(
    doc(currentServiceDb, "gestao_taxes", "service-tax"),
  );
  require("node:assert/strict").equal(saved.data().amount, 6000);
  const payable = await getDoc(
    doc(currentServiceDb, "gestao_payables", "ob-service-tax-tax"),
  );
  require("node:assert/strict").equal(payable.data().amount, 6000);
});
test("service prevents concurrent overpayment and supports traceable reversal", async () => {
  currentServiceDb = env.authenticatedContext("admin").firestore();
  await setDoc(
    doc(currentServiceDb, "gestao_bankAccounts", "service-bank"),
    rec("service-bank", "bankAccounts", {
      balance: 100000,
      balanceDate: "2026-09-01",
      reconciled: true,
    }),
  );
  let state = await serviceState();
  const obligation = state.payables.find((r) => r.id === "ob-service-tax-tax");
  const a = settlement(
      obligation,
      state,
      4000,
      "2026-09-14",
      "service-bank",
      "admin",
      "payment-a",
    ),
    b = settlement(
      obligation,
      state,
      4000,
      "2026-09-14",
      "service-bank",
      "admin",
      "payment-b",
    );
  const outcomes = await Promise.allSettled([
    commitRecords([a], state, a),
    commitRecords([b], state, b),
  ]);
  require("node:assert/strict").equal(
    outcomes.filter((r) => r.status === "fulfilled").length,
    1,
  );
  state = await serviceState();
  const payment = state.transactions.find(
    (r) => r.id === "payment-a" || r.id === "payment-b",
  );
  await assertSucceeds(
    reverseSettlement(payment, state, "admin", "2026-09-14"),
  );
  const saved = await getDoc(
    doc(currentServiceDb, "gestao_payables", obligation.id),
  );
  require("node:assert/strict").equal(saved.data().settledAmount, 0);
  require("node:assert/strict").equal(
    (
      await getDoc(doc(currentServiceDb, "gestao_transactions", payment.id))
    ).exists(),
    true,
  );
});
test("two simultaneous entries for the same source cannot duplicate a budget", async () => {
  currentServiceDb = env.authenticatedContext("admin").firestore();
  await setDoc(
    doc(currentServiceDb, "gestao_categories", "service-cat"),
    rec("service-cat", "categories", {
      unitId: "",
      name: "Teste",
      dreLine: "Operacionais",
      nature: "Operacional",
      behavior: "Fixa",
    }),
  );
  const state = await serviceState();
  const a = rec("budget-a", "budgets", {
      version: 0,
      categoryId: "service-cat",
      competence: "2026-09",
      amount: 10000,
    }),
    b = { ...a, id: "budget-b" };
  const outcomes = await Promise.allSettled([
    saveManagement(a, state),
    saveManagement(b, state),
  ]);
  require("node:assert/strict").equal(
    outcomes.filter((r) => r.status === "fulfilled").length,
    1,
  );
});

test('Takeat reports: shared source is tenant-scoped and credentials are rejected',async()=>{
 const db=env.authenticatedContext('admin').firestore();
 const id='house190_teixeira_2026-09';
 const report={id,kind:'takeatReports',tenantId:'house190',unitId:'teixeira',date:'2026-09',source:'takeat',syncedAt:'2026-09-14T20:00:00Z',totalRevenue:100,updatedBy:'admin'};
 await assertSucceeds(setDoc(doc(db,'takeat_reports',id),report));
 await assertSucceeds(getDocs(query(collection(db,'takeat_reports'),where('tenantId','==','house190'))));
 await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(),'takeat_reports',id)));
 await assertFails(getDoc(doc(env.authenticatedContext('manager').firestore(),'takeat_reports',id)));
 await assertFails(setDoc(doc(db,'takeat_reports',id),{...report,token:'must-not-be-stored',syncedAt:'2026-09-15T20:00:00Z'}));
 await assertFails(setDoc(doc(db,'takeat_reports',id),{...report,syncedAt:'2026-09-13T20:00:00Z'}));
 await assertSucceeds(setDoc(doc(db,'takeat_reports',id),{...report,totalRevenue:90,syncedAt:'2026-09-15T20:00:00Z'}));
});
