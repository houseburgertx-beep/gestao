"use client";

import {
  AccountPayable,
  Supplier,
  TaxRecord,
  DailyRevenue,
  UnitGoal,
  Employee,
  EmployeeVacation,
  Task,
  DocumentItem,
  ActivityLog,
  AppNotification,
  TaskStatus,
  UnitId,
} from "@/types";
import {
  TakeatRevenueRecord,
  TakeatCredentials,
  TakeatSyncResult,
  TakeatGeneralCardsResponse,
  ReceivedNfe,
  BrandId,
} from "@/types/takeat";
import {
  parseBRLNumber,
  getBahiaIsoDayRange,
  getBahiaIsoMonthRange,
  validateUnitPermission,
  processOfficialRevenue,
  fetchTakeatGeneralCards,
  fetchTakeatReceivedNfes,
  sanitizeToken,
  TAKEAT_OPERATIONS,
  getYesterdayBahiaDate,
} from "./takeatService";
import {
  getDefaultTakeatCredentials,
  DEFAULT_TAKEAT_CONFIGS,
} from "@/config/takeatCredentials";
import {
  INITIAL_ACCOUNTS_PAYABLE,
  INITIAL_SUPPLIERS,
  INITIAL_TAXES,
  INITIAL_DAILY_REVENUE,
  INITIAL_GOALS,
  INITIAL_EMPLOYEES,
  INITIAL_VACATIONS,
  INITIAL_TASKS,
  INITIAL_DOCUMENTS,
  INITIAL_ACTIVITY_LOGS,
  INITIAL_NOTIFICATIONS,
} from "@/data/mockData";
import {
  saveEmployeeToFirestore,
  saveSupplierToFirestore,
  saveAccountPayableToFirestore,
  saveGoalToFirestore,
  saveTakeatRevenuesToCloud,
  addNotificationToFirestore,
  getEmployeesFromFirestore,
  getSuppliersFromFirestore,
  getAccountsPayableFromFirestore,
  getGoalsFromFirestore,
  getDocumentsFromFirestore,
  saveDocumentToFirestore,
} from "./firestoreService";

const STORAGE_KEYS = {
  ACCOUNTS: "house190_accounts",
  SUPPLIERS: "house190_suppliers",
  TAXES: "house190_taxes",
  REVENUES: "house190_revenues",
  GOALS: "house190_goals",
  EMPLOYEES: "house190_employees",
  VACATIONS: "house190_vacations",
  TASKS: "house190_tasks",
  DOCS: "house190_docs",
  LOGS: "house190_logs",
  NOTIFS: "house190_notifs",
  TAKEAT_REVENUES: "house190_takeat_revenues",
  TAKEAT_CREDS: "house190_takeat_creds",
  RECEIVED_NFES: "house190_received_nfes",
};

export const INITIAL_TAKEAT_REVENUES: TakeatRevenueRecord[] = [];
export const INITIAL_TAKEAT_CREDENTIALS: Record<string, TakeatCredentials> = {};
export const INITIAL_RECEIVED_NFES: ReceivedNfe[] = [];


class DataStore {
  constructor() {
    if (typeof window !== "undefined") {
      try {
        // Preserve prior local records; migration is explicit and reviewed.
        // Sincroniza em segundo plano com o Firestore
        this.syncFromFirestore();
      } catch {}
    }
  }

  async syncFromFirestore() {
    if (typeof window === "undefined") return;
    try {
      const [emps, sups, accs, goals, documents] = await Promise.all([
        getEmployeesFromFirestore(),
        getSuppliersFromFirestore(),
        getAccountsPayableFromFirestore(),
        getGoalsFromFirestore(),
        getDocumentsFromFirestore(),
      ]);

      let changed = false;
      if (emps && emps.length > 0) {
        this.set(STORAGE_KEYS.EMPLOYEES, emps);
        changed = true;
      }
      if (sups && sups.length > 0) {
        this.set(STORAGE_KEYS.SUPPLIERS, sups);
        changed = true;
      }
      if (accs && accs.length > 0) {
        this.set(STORAGE_KEYS.ACCOUNTS, accs);
        changed = true;
      }
      if (goals && goals.length > 0) {
        this.set(STORAGE_KEYS.GOALS, goals);
        changed = true;
      }
      if (documents && documents.length > 0) {
        this.set(STORAGE_KEYS.DOCS, documents);
        changed = true;
      }

      if (changed) {
        window.dispatchEvent(new Event("house190_data_updated"));
      }
    } catch (e) {
      console.warn("Sincronização em nuvem não disponível offline:", e);
    }
  }

  // Permite ao usuário resetar para estado 100% limpo quando desejar
  clearAllMockData() {
    if (typeof window === "undefined") return;
    try {
      const takeatCreds = localStorage.getItem(STORAGE_KEYS.TAKEAT_CREDS);
      localStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
      localStorage.removeItem(STORAGE_KEYS.SUPPLIERS);
      localStorage.removeItem(STORAGE_KEYS.TAXES);
      localStorage.removeItem(STORAGE_KEYS.GOALS);
      localStorage.removeItem(STORAGE_KEYS.EMPLOYEES);
      localStorage.removeItem(STORAGE_KEYS.VACATIONS);
      localStorage.removeItem(STORAGE_KEYS.TASKS);
      localStorage.removeItem(STORAGE_KEYS.DOCS);
      localStorage.removeItem(STORAGE_KEYS.LOGS);
      localStorage.removeItem(STORAGE_KEYS.NOTIFS);
      localStorage.removeItem(STORAGE_KEYS.REVENUES);
      if (takeatCreds) localStorage.setItem(STORAGE_KEYS.TAKEAT_CREDS, takeatCreds);
      window.dispatchEvent(new Event("house190_data_updated"));
    } catch {}
  }
  private get<T>(key: string, initial: T): T {
    if (typeof window === "undefined") return initial;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initial;
    } catch {
      return initial;
    }
  }

  private set<T>(key: string, data: T) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(data));
      window.dispatchEvent(new Event("house190_data_updated"));
    } catch (e) {
      console.error("Storage error:", e);
    }
  }

  // ACCOUNTS PAYABLE
  getAccounts(): AccountPayable[] {
    return this.get(STORAGE_KEYS.ACCOUNTS, INITIAL_ACCOUNTS_PAYABLE);
  }

  addAccount(account: Omit<AccountPayable, "id" | "createdAt" | "finalAmount">, installmentsCount: number = 1): AccountPayable[] {
    const accounts = this.getAccounts();
    const createdList: AccountPayable[] = [];
    const groupId = installmentsCount > 1 ? `grp-${Date.now()}` : undefined;
    const baseAmount = account.amount / installmentsCount;
    const now = new Date().toISOString();

    for (let i = 1; i <= installmentsCount; i++) {
      // Calculate due date for installment i
      const baseDueDate = new Date(account.dueDate + "T12:00:00Z");
      baseDueDate.setMonth(baseDueDate.getMonth() + (i - 1));
      const dueDateStr = baseDueDate.toISOString().split("T")[0];

      const newAccount: AccountPayable = {
        ...account,
        id: `cp-${Date.now()}-${i}`,
        amount: baseAmount,
        interest: account.interest || 0,
        penalty: account.penalty || 0,
        discount: account.discount || 0,
        finalAmount: baseAmount + (account.interest || 0) + (account.penalty || 0) - (account.discount || 0),
        dueDate: dueDateStr,
        installmentNumber: installmentsCount > 1 ? i : undefined,
        totalInstallments: installmentsCount > 1 ? installmentsCount : undefined,
        installmentGroupId: groupId,
        approvalTier: baseAmount > 10000 ? "director" : baseAmount > 1000 ? "manager" : "auto",
        status: baseAmount > 1000 ? "pending_approval" : "approved",
        createdAt: now,
      };

      createdList.push(newAccount);
    }

    this.set(STORAGE_KEYS.ACCOUNTS, [...createdList, ...accounts]);
    createdList.forEach((acc) => {
      saveAccountPayableToFirestore(acc).catch(() => {});
    });
    
    // Log activity
    this.addLog({
      userId: "usr-current",
      userName: "Você (Gestor)",
      action: "Novo Lançamento",
      entityType: "Conta a Pagar",
      entityId: createdList[0].id,
      details: `Lançou conta "${account.description}" para ${account.supplierName} no valor de R$ ${account.amount.toFixed(2)}${installmentsCount > 1 ? ` em ${installmentsCount}x` : ""}.`,
    });
    this.addNotification({
      type: "payable",
      title: "Nova conta a pagar",
      message: `${account.description} foi lançada no valor de R$ ${account.amount.toFixed(2)}.`,
      link: "/financeiro",
      severity: account.amount > 1000 ? "warning" : "info",
    });

    return createdList;
  }

  updateAccountStatus(id: string, status: AccountPayable["status"], details?: string) {
    const accounts = this.getAccounts();
    const updated = accounts.map((acc) => (acc.id === id ? { ...acc, status } : acc));
    this.set(STORAGE_KEYS.ACCOUNTS, updated);
    const changed = updated.find((acc) => acc.id === id);
    if (changed) saveAccountPayableToFirestore(changed).catch(() => {});

    this.addLog({
      userId: "usr-current",
      userName: "Você (Gestor)",
      action: "Alteração de Status",
      entityType: "Conta a Pagar",
      entityId: id,
      details: details || `Alterou status da conta ${id} para "${status}".`,
    });
  }

  approveAccount(id: string, reviewerName: string = "Diretoria", comment?: string) {
    const accounts = this.getAccounts();
    const updated = accounts.map((acc) =>
      acc.id === id
        ? {
            ...acc,
            status: "approved" as const,
            approvedBy: reviewerName,
            approvedAt: new Date().toISOString(),
            notes: comment ? `${acc.notes || ""}\n[Aprovação]: ${comment}` : acc.notes,
          }
        : acc
    );
    this.set(STORAGE_KEYS.ACCOUNTS, updated);
    const changed = updated.find((acc) => acc.id === id);
    if (changed) saveAccountPayableToFirestore(changed).catch(() => {});

    this.addLog({
      userId: "usr-current",
      userName: reviewerName,
      action: "Aprovação de Pagamento",
      entityType: "Conta a Pagar",
      entityId: id,
      details: `Aprovou o pagamento da conta ${id}.${comment ? ` Comentário: ${comment}` : ""}`,
    });
    this.addNotification({
      type: "approval",
      title: "Pagamento aprovado",
      message: `A conta ${id} foi aprovada por ${reviewerName}.`,
      link: "/financeiro",
      severity: "success",
    });
  }

  rejectAccount(id: string, reviewerName: string = "Diretoria", reason: string) {
    const accounts = this.getAccounts();
    const updated = accounts.map((acc) =>
      acc.id === id
        ? {
            ...acc,
            status: "canceled" as const,
            notes: `${acc.notes || ""}\n[Recusa - ${reviewerName}]: ${reason}`,
          }
        : acc
    );
    this.set(STORAGE_KEYS.ACCOUNTS, updated);
    const changed = updated.find((acc) => acc.id === id);
    if (changed) saveAccountPayableToFirestore(changed).catch(() => {});

    this.addLog({
      userId: "usr-current",
      userName: reviewerName,
      action: "Recusa de Pagamento",
      entityType: "Conta a Pagar",
      entityId: id,
      details: `Recusou o pagamento da conta ${id}. Motivo: ${reason}`,
    });
    this.addNotification({
      type: "approval",
      title: "Pagamento recusado",
      message: `A conta ${id} foi recusada. Motivo: ${reason}`,
      link: "/financeiro",
      severity: "danger",
    });
  }

  payAccount(id: string, bankAccount: string, proofName?: string, proofDriveFileId?: string) {
    const accounts = this.getAccounts();
    const now = new Date().toISOString();
    const updated = accounts.map((acc) =>
      acc.id === id
        ? {
            ...acc,
            status: "paid" as const,
            paidAt: now,
            bankAccount,
            paymentProof: proofName || "comprovante_liquidacao.pdf",
            ...(proofName ? { paymentProofName: proofName } : {}),
            ...(proofDriveFileId ? { paymentProofDriveFileId: proofDriveFileId } : {}),
          }
        : acc
    );
    this.set(STORAGE_KEYS.ACCOUNTS, updated);
    const changed = updated.find((acc) => acc.id === id);
    if (changed) saveAccountPayableToFirestore(changed).catch(() => {});

    this.addLog({
      userId: "usr-current",
      userName: "Financeiro House",
      action: "Baixa de Pagamento",
      entityType: "Conta a Pagar",
      entityId: id,
      details: `Liquidou pagamento da conta ${id} via conta "${bankAccount}".`,
    });
    this.addNotification({
      type: "payable",
      title: "Pagamento concluído",
      message: `A conta ${id} foi marcada como paga.`,
      link: "/financeiro",
      severity: "success",
    });
  }

  batchPay(ids: string[], bankAccount: string) {
    ids.forEach((id) => this.payAccount(id, bankAccount));
  }

  // SUPPLIERS
  getSuppliers(): Supplier[] {
    return this.get(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
  }

  addSupplier(supplier: Omit<Supplier, "id" | "createdAt">): Supplier {
    const suppliers = this.getSuppliers();
    const newSupplier: Supplier = {
      ...supplier,
      id: `sup-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.set(STORAGE_KEYS.SUPPLIERS, [newSupplier, ...suppliers]);
    saveSupplierToFirestore(newSupplier).catch(() => {});
    return newSupplier;
  }

  // TAXES
  getTaxes(): TaxRecord[] {
    return this.get(STORAGE_KEYS.TAXES, INITIAL_TAXES);
  }

  addTax(tax: Omit<TaxRecord, "id">): TaxRecord {
    const taxes = this.getTaxes();
    const newTax: TaxRecord = {
      ...tax,
      id: `tax-${Date.now()}`,
    };
    this.set(STORAGE_KEYS.TAXES, [newTax, ...taxes]);
    this.addNotification({
      type: "tax",
      title: `Novo tributo ${tax.taxType}`,
      message: `Vencimento em ${tax.dueDate}, no valor de R$ ${tax.amount.toFixed(2)}.`,
      link: "/fiscal",
      severity: "warning",
    });
    return newTax;
  }

  // REVENUES (Alimentado estritamente por dados oficiais e lançamentos reais)
  getRevenues(): DailyRevenue[] {
    const manual = this.get<DailyRevenue[]>(STORAGE_KEYS.REVENUES, []);
    const takeat = this.getTakeatRevenues();
    const map = new Map<string, DailyRevenue>();

    for (const m of manual) {
      if (
        m &&
        m.id &&
        !m.id.includes("fake") &&
        (m.unitId as string) !== "central" &&
        !m.id.startsWith("rev-01") &&
        !m.id.startsWith("rev-02")
      ) {
        const fixedDate = m.date === "2026-09-01" && (m.netRevenue || m.grossRevenue) > 40000 ? "2026-09" : m.date;
        map.set(`${m.unitId}-${fixedDate}`, { ...m, date: fixedDate });
      }
    }

    for (const t of takeat) {
      if ((t.unitId as string) === "central") continue;
      map.set(`${t.unitId}-${t.date}`, {
        id: `rev-takeat-${t.unitId}-${t.date}`,
        unitId: t.unitId,
        date: t.date,
        grossRevenue: t.totalRevenue,
        discounts: 0,
        cancellations: 0,
        netRevenue: t.totalRevenue,
        notes: `Oficial Takeat (Salão: R$ ${t.salao.toFixed(2)}, Delivery: R$ ${t.delivery.toFixed(2)}, iFood: R$ ${t.ifood.toFixed(2)})`,
      });
    }

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }

  addRevenue(rev: Omit<DailyRevenue, "id" | "netRevenue">): DailyRevenue {
    const manualRevenues = this.get<DailyRevenue[]>(STORAGE_KEYS.REVENUES, [])
      .filter((r) => !r.id.startsWith("rev-takeat-") && (r.unitId as string) !== "central");
    const netRevenue = rev.grossRevenue - (rev.discounts || 0) - (rev.cancellations || 0);
    const newRev: DailyRevenue = {
      ...rev,
      id: `rev-${Date.now()}`,
      netRevenue,
    };
    this.set(STORAGE_KEYS.REVENUES, [newRev, ...manualRevenues]);
    return newRev;
  }

  // GOALS (Cálculo em tempo real baseado nas metas oficiais dos documentos e faturamento Takeat)
  getStoredGoals(): UnitGoal[] {
    return this.get<UnitGoal[]>(STORAGE_KEYS.GOALS, []);
  }

  getGoals(): UnitGoal[] {
    let rawGoals = this.get<UnitGoal[]>(STORAGE_KEYS.GOALS, []);
    const defaultTargets: Record<string, { target: number; superTarget: number; salaoTarget: number; deliveryTarget: number; ifoodTarget: number }> = {
      teixeira: { target: 200000, superTarget: 210000, salaoTarget: 70000, deliveryTarget: 80000, ifoodTarget: 50000 },
      eunapolis: { target: 200000, superTarget: 210000, salaoTarget: 70000, deliveryTarget: 80000, ifoodTarget: 50000 },
      foodpark: { target: 180000, superTarget: 190000, salaoTarget: 90000, deliveryTarget: 60000, ifoodTarget: 30000 },
    };

    // Central de Produção (CP) é estritamente excluída de metas (é uma unidade de fábrica/produção sem venda direta)
    rawGoals = rawGoals.filter((g) => g.unitId !== ("central" as any));

    if (rawGoals.length === 0 || rawGoals.some((g) => g.targetAmount === 0 && defaultTargets[g.unitId]?.target > 0)) {
      const salesUnits: Array<Exclude<UnitId, "all" | "central">> = ["teixeira", "eunapolis", "foodpark"];
      rawGoals = salesUnits.map((u) => {
        const conf = defaultTargets[u] || { target: 0, superTarget: 0 };
        return {
          id: `goal-${u}`,
          unitId: u,
          month: 9,
          year: 2026,
          targetAmount: conf.target,
          superTargetAmount: conf.superTarget,
          currentRealized: 0,
          previousMonthRealized: 0,
          dailyAverageTarget: conf.target > 0 ? Math.round(conf.target / 30) : 0,
          currentDailyAverage: 0,
          projectedClose: 0,
        };
      });
      this.set(STORAGE_KEYS.GOALS, rawGoals);
    }

    const revenues = this.getRevenues();
    const takeatRevs = this.getTakeatRevenues();

    return rawGoals.map((g) => {
      const monthPrefix = `${g.year}-${String(g.month).padStart(2, "0")}`;
      const conf = defaultTargets[g.unitId] || { target: g.targetAmount, superTarget: g.superTargetAmount || g.targetAmount, salaoTarget: 0, deliveryTarget: 0, ifoodTarget: 0 };

      // Takeat channel breakdown: separa registros do mês consolidado e diários para nunca duplicar
      const unitTakeat = takeatRevs.filter(
        (r) => r.unitId === g.unitId && r.date.startsWith(monthPrefix)
      );

      const monthlyRecord = unitTakeat.find((r) => r.date === monthPrefix);
      const dailyTakeat = unitTakeat.filter((r) => r.date !== monthPrefix && r.date.length === 10);

      const dailySalao = dailyTakeat.reduce((acc, cur) => acc + (cur.salao || 0), 0);
      const dailyDelivery = dailyTakeat.reduce((acc, cur) => acc + (cur.delivery || 0), 0);
      const dailyIfood = dailyTakeat.reduce((acc, cur) => acc + (cur.ifood || 0), 0);
      const dailySum = dailySalao + dailyDelivery + dailyIfood;

      let salaoRealized = 0;
      let deliveryRealized = 0;
      let ifoodRealized = 0;

      if (monthlyRecord && monthlyRecord.totalRevenue >= dailySum) {
        // Usa o registro consolidado do mês oficial
        salaoRealized = monthlyRecord.salao || 0;
        deliveryRealized = monthlyRecord.delivery || 0;
        ifoodRealized = monthlyRecord.ifood || 0;
      } else {
        // Usa o acumulado dos dias individuais
        salaoRealized = dailySalao;
        deliveryRealized = dailyDelivery;
        ifoodRealized = dailyIfood;
      }

      // Proteção de canais: se o acumulado diário veio sem Salão ou iFood (ex: Takeat só reportou delivery),
      // mas o registro consolidado mensal possui valores nesses canais, preserva os dados oficiais do mês
      if (salaoRealized === 0 && monthlyRecord && (monthlyRecord.salao || 0) > 0) {
        salaoRealized = monthlyRecord.salao;
      }
      if (ifoodRealized === 0 && monthlyRecord && (monthlyRecord.ifood || 0) > 0) {
        ifoodRealized = monthlyRecord.ifood;
      }

      const takeatSum = salaoRealized + deliveryRealized + ifoodRealized;

      const monthRevs = revenues.filter(
        (r) => r.unitId === g.unitId && r.date.startsWith(monthPrefix)
      );
      const monthlySummary = monthRevs.find((r) => r.date === monthPrefix);
      const dailyRevsOnly = monthRevs.filter((r) => r.date !== monthPrefix && r.date.length === 10);
      const dailyRevsSum = dailyRevsOnly.reduce((acc, cur) => acc + cur.netRevenue, 0);
      const generalRealized = monthlySummary && monthlySummary.netRevenue >= dailyRevsSum
        ? monthlySummary.netRevenue
        : dailyRevsSum;

      const currentRealized = Math.max(takeatSum, generalRealized);

      const daysElapsed = Math.min(30, Math.max(1, new Date().getDate()));
      const currentDailyAverage =
        currentRealized > 0
          ? Math.round((currentRealized / daysElapsed) * 100) / 100
          : 0;

      const projectedClose =
        currentDailyAverage > 0
          ? Math.round(currentDailyAverage * 30 * 100) / 100
          : currentRealized;

      const targetAmount = g.targetAmount > 0 ? g.targetAmount : conf.target;
      const superTargetAmount = g.superTargetAmount && g.superTargetAmount > 0 ? g.superTargetAmount : conf.superTarget;

      return {
        ...g,
        targetAmount,
        superTargetAmount,
        currentRealized,
        currentDailyAverage,
        projectedClose,
        channels: {
          salao: {
            target: conf.salaoTarget,
            realized: salaoRealized,
            bonus: 500,
          },
          delivery: {
            target: conf.deliveryTarget,
            realized: deliveryRealized,
            bonus: g.unitId === "foodpark" ? 1000 : 750,
          },
          ifood: {
            target: conf.ifoodTarget,
            realized: ifoodRealized,
            bonus: g.unitId === "foodpark" ? 500 : 750,
          },
        },
      };
    });
  }


  setGoalTarget(unitId: string, targetAmount: number, month: number = 9, year: number = 2026) {
    const goals = this.getGoals();
    const existingIndex = goals.findIndex((g) => g.unitId === unitId && g.month === month && g.year === year);
    if (existingIndex >= 0) {
      goals[existingIndex].targetAmount = targetAmount;
    } else {
      goals.push({
        id: `goal-${unitId}-${year}-${month}`,
        unitId: unitId as any,
        month,
        year,
        targetAmount,
        currentRealized: 0,
        previousMonthRealized: 0,
        dailyAverageTarget: targetAmount / 30,
        currentDailyAverage: 0,
        projectedClose: 0,
      });
    }
    this.set(STORAGE_KEYS.GOALS, goals);
    const changed = goals.find((g) => g.unitId === unitId && g.month === month && g.year === year);
    if (changed) saveGoalToFirestore(changed).catch(() => {});
    this.addNotification({
      type: "goal",
      title: "Meta atualizada",
      message: `A meta da unidade ${unitId} foi definida em R$ ${targetAmount.toFixed(2)}.`,
      link: "/metas",
      severity: "info",
    });
  }

  // EMPLOYEES & VACATIONS
  getEmployees(): Employee[] {
    return this.get(STORAGE_KEYS.EMPLOYEES, INITIAL_EMPLOYEES);
  }

  addEmployee(emp: Omit<Employee, "id" | "documentsCount">): Employee {
    const employees = this.getEmployees();
    const newEmp: Employee = {
      ...emp,
      id: `emp-${Date.now()}`,
      documentsCount: 0,
    };
    this.set(STORAGE_KEYS.EMPLOYEES, [newEmp, ...employees]);
    saveEmployeeToFirestore(newEmp).catch(() => {});
    this.addNotification({
      type: "vacation",
      title: "Novo colaborador cadastrado",
      details: [{label:"Funcionário",value:newEmp.name},{label:"Cargo",value:newEmp.role},{label:"Unidade",value:newEmp.unitId}],
      message: `${newEmp.name} foi adicionado(a) como ${newEmp.role}.`,
      link: "/rh",
      severity: "success",
    });
    return newEmp;
  }

  updateEmployee(emp: Employee): Employee {
    const employees = this.getEmployees();
    const index = employees.findIndex((e) => e.id === emp.id);
    let updatedList: Employee[];
    if (index >= 0) {
      updatedList = [...employees];
      updatedList[index] = { ...updatedList[index], ...emp };
    } else {
      updatedList = [emp, ...employees];
    }
    this.set(STORAGE_KEYS.EMPLOYEES, updatedList);
    saveEmployeeToFirestore(emp).catch((err) => console.warn("Erro ao atualizar colaborador no Firestore:", err));
    
    if (emp.status === "terminated") {
      this.addLog({
        userId: "system",
        userName: "RH",
        action: "Desligamento registrado",
        entityType: "employee",
        entityId: emp.id,
        details: `${emp.name} - ${emp.terminationType || "Rescisão contratual"}`,
      });
      this.addNotification({
        type: "vacation",
        title: "Desligamento registrado",
        details: [
          { label: "Colaborador", value: emp.name },
          { label: "Data do Desligamento", value: emp.terminationDate || new Date().toISOString().slice(0, 10) },
          { label: "Tipo", value: emp.terminationType || "Não informado" },
        ],
        message: `Desligamento de ${emp.name} registrado no sistema.`,
        link: "/rh",
        severity: "warning",
      });
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("house190_data_updated"));
    }
    return emp;
  }

  getVacations(): EmployeeVacation[] {
    return this.get(STORAGE_KEYS.VACATIONS, INITIAL_VACATIONS);
  }

  addVacation(vac: Omit<EmployeeVacation, "id">): EmployeeVacation {
    const vacations = this.getVacations();
    const newVac: EmployeeVacation = {
      ...vac,
      id: `vac-${Date.now()}`,
    };
    this.set(STORAGE_KEYS.VACATIONS, [newVac, ...vacations]);
    return newVac;
  }

  // TASKS
  getTasks(): Task[] {
    return this.get(STORAGE_KEYS.TASKS, INITIAL_TASKS);
  }

  addTask(task: Omit<Task, "id" | "checklist" | "comments" | "attachmentsCount">): Task {
    const tasks = this.getTasks();
    const newTask: Task = {
      ...task,
      id: `tsk-${Date.now()}`,
      checklist: [],
      comments: [],
      attachmentsCount: 0,
    };
    this.set(STORAGE_KEYS.TASKS, [newTask, ...tasks]);
    this.addNotification({
      type: "task",
      title: "Nova tarefa criada",
      message: `${task.title} foi atribuída a ${task.assigneeName}.`,
      link: "/tarefas",
      severity: task.priority === "urgent" ? "danger" : "info",
    });
    return newTask;
  }

  updateTaskStatus(id: string, status: TaskStatus) {
    const tasks = this.getTasks();
    const updated = tasks.map((t) => (t.id === id ? { ...t, status } : t));
    this.set(STORAGE_KEYS.TASKS, updated);
  }

  toggleChecklistItem(taskId: string, checkId: string) {
    const tasks = this.getTasks();
    const updated = tasks.map((t) => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        checklist: t.checklist.map((c) => (c.id === checkId ? { ...c, done: !c.done } : c)),
      };
    });
    this.set(STORAGE_KEYS.TASKS, updated);
  }

  // DOCUMENTS
  getDocuments(): DocumentItem[] {
    return this.get<DocumentItem[]>(STORAGE_KEYS.DOCS, INITIAL_DOCUMENTS).filter((item) => !item.archived);
  }

  async updateDocument(item: DocumentItem): Promise<void> {
    await saveDocumentToFirestore(item);
    const documents = this.getDocuments().filter((doc) => doc.id !== item.id);
    this.set(STORAGE_KEYS.DOCS, item.archived ? documents : [item, ...documents]);
  }

  async addDocument(doc: Omit<DocumentItem, "id" | "uploadDate">): Promise<DocumentItem> {
    const docs = this.getDocuments();
    const newDoc: DocumentItem = {
      ...doc,
      id: `doc-${Date.now()}`,
      uploadDate: new Date().toISOString().split("T")[0],
    };
    await saveDocumentToFirestore(newDoc);
    this.set(STORAGE_KEYS.DOCS, [newDoc, ...docs]);
    this.addNotification({
      type: "doc",
      title: "Documento salvo no Drive",
      details: [{label:"Documento",value:doc.title},{label:"Unidade",value:doc.unitId === "all" ? "Todas as unidades" : doc.unitId},{label:"Arquivo",value:doc.originalFileName || doc.title},{label:"Armazenamento",value:"Google Drive"}],
      message: `${doc.originalFileName || doc.title} foi salvo na pasta Documentos e já está disponível no painel.`,
      link: "/documentos",
      severity: "success",
    });
    return newDoc;
  }

  // LOGS
  getLogs(): ActivityLog[] {
    return this.get(STORAGE_KEYS.LOGS, INITIAL_ACTIVITY_LOGS);
  }

  addLog(log: Omit<ActivityLog, "id" | "timestamp">) {
    const logs = this.getLogs();
    const newLog: ActivityLog = {
      ...log,
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    this.set(STORAGE_KEYS.LOGS, [newLog, ...logs]);
  }

  // NOTIFICATIONS
  getNotifications(): AppNotification[] {
    return this.get(STORAGE_KEYS.NOTIFS, INITIAL_NOTIFICATIONS);
  }

  addNotification(notification: Omit<AppNotification, "id" | "read" | "timestamp">) {
    const newNotification: AppNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      read: false,
      readBy: [],
      timestamp: new Date().toISOString(),
    };
    this.set(STORAGE_KEYS.NOTIFS, [newNotification, ...this.getNotifications()].slice(0, 50));
    addNotificationToFirestore(newNotification).catch(() => {});
  }

  markNotificationRead(id: string) {
    const notifs = this.getNotifications();
    const updated = notifs.map((n) => (n.id === id ? { ...n, read: true } : n));
    this.set(STORAGE_KEYS.NOTIFS, updated);
  }

  // TAKEAT INTEGRATION
  getTakeatRevenues(): TakeatRevenueRecord[] {
    const records = this.get<TakeatRevenueRecord[]>(STORAGE_KEYS.TAKEAT_REVENUES, []);
    // Garante que nenhum registro de mock anterior permaneça e exclui Central de Produção (sem vendas)
    return records
      .filter((r) => r && r.id && !r.id.includes("fake") && (r.unitId as string) !== "central")
;
  }

  getTakeatCredentials(keyOrUnitId: string): TakeatCredentials {
    const all = this.get<Record<string, TakeatCredentials>>(
      STORAGE_KEYS.TAKEAT_CREDS,
      {}
    );
    const stored = all[keyOrUnitId] || all[keyOrUnitId.split("_")[0]];
    const defaultCreds = getDefaultTakeatCredentials(keyOrUnitId);

    // 1. Se houver credencial salva no localStorage com email válido
    if (stored && (stored.token || (stored.email && stored.password))) {
      const token = sanitizeToken(stored.token);
      if (token && token.startsWith("tk_")) {
        return { ...stored, token: undefined };
      }
      return { ...stored, credentialKey: stored.credentialKey || keyOrUnitId, token: token || undefined };
    }

    // 2. Fallback para as credenciais padrão do repositório/ambiente (GitHub / .env)
    if (defaultCreds && (defaultCreds.email || defaultCreds.password)) {
      const token = stored?.token ? sanitizeToken(stored.token) : undefined;
      return {
        ...defaultCreds,
        token: token && !token.startsWith("tk_") ? token : undefined,
      };
    }

    // 3. Objeto base padrão vazio
    const uId = (keyOrUnitId.includes("_") ? keyOrUnitId.split("_")[0] : keyOrUnitId) as any;
    const brand = keyOrUnitId.includes("bruttus") ? "bruttus" : "house";
    return {
      unitId: uId,
      brand,
      credentialKey: keyOrUnitId,
      email: "",
    };
  }

  getAllTakeatCredentials(): Record<string, TakeatCredentials> {
    return this.get<Record<string, TakeatCredentials>>(
      STORAGE_KEYS.TAKEAT_CREDS,
      {}
    );
  }

  removeTakeatCredentials(keyOrUnitId: string) {
    const all = this.get<Record<string, TakeatCredentials>>(
      STORAGE_KEYS.TAKEAT_CREDS,
      {}
    );
    delete all[keyOrUnitId];
    this.set(STORAGE_KEYS.TAKEAT_CREDS, all);
  }

  saveTakeatCredentials(creds: TakeatCredentials) {
    const all = this.get<Record<string, TakeatCredentials>>(
      STORAGE_KEYS.TAKEAT_CREDS,
      {}
    );
    const cleanToken = sanitizeToken(creds.token);
    const key = creds.credentialKey || (creds.brand && creds.brand !== "house" ? `${creds.unitId}_${creds.brand}` : creds.unitId);
    all[key] = {
      ...creds,
      credentialKey: key,
      token: cleanToken || undefined,
    };
    this.set(STORAGE_KEYS.TAKEAT_CREDS, all);
  }

  getReceivedNfes(unitId?: string): ReceivedNfe[] {
    const all = this.get<ReceivedNfe[]>(STORAGE_KEYS.RECEIVED_NFES, []);
    if (!unitId || unitId === "all") return all;
    return all.filter((n) => n.unitId === unitId);
  }

  saveReceivedNfe(nfe: ReceivedNfe) {
    const all = this.getReceivedNfes();
    const idx = all.findIndex((n) => n.id === nfe.id || (nfe.chave && n.chave === nfe.chave));
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...nfe };
    } else {
      all.unshift(nfe);
    }
    this.set(STORAGE_KEYS.RECEIVED_NFES, all);
  }

  saveReceivedNfes(nfes: ReceivedNfe[]) {
    const all = this.getReceivedNfes();
    const map = new Map<string, ReceivedNfe>();
    for (const n of all) {
      const k = n.chave || n.id;
      map.set(k, n);
    }
    for (const n of nfes) {
      const k = n.chave || n.id;
      if (map.has(k)) {
        map.set(k, { ...map.get(k)!, ...n });
      } else {
        map.set(k, n);
      }
    }
    this.set(STORAGE_KEYS.RECEIVED_NFES, Array.from(map.values()));
  }

  markNfeAsImported(nfeId: string, payableId: string) {
    const all = this.getReceivedNfes();
    const n = all.find((x) => x.id === nfeId || x.chave === nfeId);
    if (n) {
      n.importedToPayable = true;
      n.payableId = payableId;
      this.set(STORAGE_KEYS.RECEIVED_NFES, all);
    }
  }

  clearTakeatRevenues(unitId?: string) {
    if (unitId) {
      const current = this.getTakeatRevenues().filter((r) => r.unitId !== unitId);
      this.set(STORAGE_KEYS.TAKEAT_REVENUES, current);
    } else {
      this.set(STORAGE_KEYS.TAKEAT_REVENUES, []);
    }
  }

  saveTakeatRevenue(record: TakeatRevenueRecord, isManualEdit: boolean = false) {
    // Central de Produção é estritamente ignorada pois não possui vendas comerciais
    if ((record.unitId as string) === "central") return;

    const current = this.getTakeatRevenues();

    // Deduplica pelo ID único da operação (inclui operationKey + data)
    // para não sobrepor House com Bruttus na mesma filial
    const filtered = current.filter(
      (r) => r.id !== record.id
    );
    this.set(STORAGE_KEYS.TAKEAT_REVENUES, [record, ...filtered]);
  }

  async syncTakeatUnit(
    unitId: Exclude<UnitId, "all">,
    dateStr: string,
    userRole: string = "admin",
    userUnitId: string = "all",
    brand?: BrandId,
    credentialKey?: string,
    customOpName?: string
  ): Promise<TakeatSyncResult> {
    const unitNames: Record<string, string> = {
      eunapolis: "House 190 Eunápolis",
      teixeira: "House 190 Teixeira de Freitas",
      foodpark: "House Foodpark",
      central: "Central de Produção",
    };
    const opKey = credentialKey || (brand && brand !== "house" ? `${unitId}_${brand}` : unitId);
    const unitName = customOpName || (brand === "bruttus" ? `Bruttus ${unitId === "teixeira" ? "TX" : "Eunápolis"}` : unitNames[unitId] || unitId);

    // 0. Central de Produção não realiza vendas nem possui integração com Takeat PDV
    if ((unitId as string) === "central") {
      return {
        success: false,
        unitId,
        unitName: "Central de Produção",
        date: dateStr,
        error: "A Central de Produção é uma unidade industrial e não possui vendas comerciais no Takeat.",
        errorCode: "UNAUTHORIZED_UNIT",
      };
    }

    // 1. Validação de permissões de usuário
    if (!validateUnitPermission(userRole, userUnitId, unitId)) {
      return {
        success: false,
        unitId,
        unitName,
        date: dateStr,
        error: "Acesso restrito: gerentes de unidade só podem sincronizar sua respectiva filial.",
        errorCode: "UNAUTHORIZED_UNIT",
      };
    }

    // 2. Cálculo do fuso horário de Brasília/Bahia (America/Bahia) - Suporta diário (YYYY-MM-DD) ou mensal (YYYY-MM)
    const isMonthly = /^\d{4}-\d{2}$/.test(dateStr);
    let range: { startDate: string; endDate: string };
    try {
      range = isMonthly ? getBahiaIsoMonthRange(dateStr) : getBahiaIsoDayRange(dateStr);
    } catch (e: any) {
      return {
        success: false,
        unitId,
        unitName,
        date: dateStr,
        error: e.message || "Período de data inválido.",
        errorCode: "INVALID_PERIOD",
      };
    }

    // 3. Credenciais da unidade / operação
    const creds = this.getTakeatCredentials(opKey);
    if (!creds || (!creds.token && !creds.password)) {
      return {
        success: false,
        unitId,
        unitName,
        date: dateStr,
        error: `A conta do Takeat para ${unitName} ainda não foi conectada. Clique em "Conectar Conta Takeat" para informar seu e-mail e senha de acesso.`,
        errorCode: "AUTH_FAILED",
      };
    }

    let rawResponse: TakeatGeneralCardsResponse;

    try {
      // Consulta real à API da Takeat
      rawResponse = await fetchTakeatGeneralCards(
        creds,
        range.startDate,
        range.endDate,
        (newToken) => {
          this.saveTakeatCredentials({ ...creds, token: newToken });
        }
      );
    } catch (apiError: any) {
      return {
        success: false,
        unitId,
        unitName,
        date: dateStr,
        error: apiError.message || "Erro de conexão ao consultar a API da Takeat.",
        errorCode: "API_UNAVAILABLE",
      };
    }

    // 4. Validação e processamento oficial estrito via payment_without_tax
    let record: TakeatRevenueRecord;
    try {
      record = processOfficialRevenue(unitId, dateStr, rawResponse, brand, opKey, unitName);
    } catch (parseError: any) {
      return {
        success: false,
        unitId,
        unitName,
        date: dateStr,
        error: parseError.message,
        errorCode: "MISSING_PAYMENT_DATA",
      };
    }

    // 5. Salva na base local / store
    this.saveTakeatRevenue(record);

    // 6. Registro em auditoria
    this.addLog({
      userId: "usr-sync",
      userName: `Sincronizador Takeat (${userRole})`,
      action: "Sincronização Takeat",
      entityType: "Faturamento Oficial",
      entityId: record.id,
      details: `Faturamento sincronizado da unidade ${unitName} (${dateStr}): Salão: R$ ${record.salao.toFixed(2)}, Delivery: R$ ${record.delivery.toFixed(2)}, iFood: R$ ${record.ifood.toFixed(2)} | Total Oficial: R$ ${record.totalRevenue.toFixed(2)}.`,
    });

    return {
      success: true,
      unitId,
      unitName,
      date: dateStr,
      data: record,
    };
  }

  async syncTakeatNfes(
    unitId: Exclude<UnitId, "all">,
    credentialKey?: string,
    startDate?: string,
    endDate?: string
  ): Promise<{ success: boolean; count: number; error?: string; nfes?: ReceivedNfe[] }> {
    const opKey = credentialKey || unitId;
    const creds = this.getTakeatCredentials(opKey);
    if (!creds || (!creds.token && !creds.password)) {
      return {
        success: false,
        count: 0,
        error: `Conta do Takeat para ${unitId} não configurada. Conecte com e-mail e senha.`,
      };
    }

    try {
      const nfes = await fetchTakeatReceivedNfes(
        creds,
        (newToken) => {
          this.saveTakeatCredentials({ ...creds, token: newToken });
        },
        startDate,
        endDate
      );

      if (nfes.length > 0) {
        this.saveReceivedNfes(nfes);
      }

      return {
        success: true,
        count: nfes.length,
        nfes,
      };
    } catch (e: any) {
      return {
        success: false,
        count: 0,
        error: e.message || "Falha ao consultar NF-e na Takeat.",
      };
    }
  }

  /**
   * Sincroniza todas as 5 operações configuradas (House e Bruttus em todas as unidades)
   */
  async syncAllTakeatOperations(
    dateStr?: string,
    userRole: string = "admin",
    userUnitId: string = "all"
  ): Promise<TakeatSyncResult[]> {
    const targetDate = dateStr || getYesterdayBahiaDate();
    const results: TakeatSyncResult[] = [];
    for (const op of TAKEAT_OPERATIONS) {
      const res = await this.syncTakeatUnit(
        op.unitId,
        targetDate,
        userRole,
        userUnitId,
        op.brand,
        op.key,
        op.name
      );
      results.push(res);
    }
    return results;
  }

  /**
   * Sincroniza as NF-e de entrada emitidas contra os CNPJs de todas as unidades
   */
  async syncAllTakeatNfes(): Promise<{
    success: boolean;
    totalCount: number;
    results: Array<{ unitId: string; count: number; error?: string }>;
  }> {
    const units: Exclude<UnitId, "all" | "central">[] = ["teixeira", "eunapolis", "foodpark"];
    const results: Array<{ unitId: string; count: number; error?: string }> = [];
    let totalCount = 0;

    for (const u of units) {
      const opKey = `${u}_house`;
      const res = await this.syncTakeatNfes(u, opKey);
      totalCount += res.count;
      results.push({ unitId: u, count: res.count, error: res.error });
    }

    return {
      success: results.some((r) => !r.error),
      totalCount,
      results,
    };
  }
}

export const store = new DataStore();
