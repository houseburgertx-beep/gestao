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
} from "@/types/takeat";
import {
  parseBRLNumber,
  getBahiaIsoDayRange,
  getBahiaIsoMonthRange,
  validateUnitPermission,
  processOfficialRevenue,
  fetchTakeatGeneralCards,
  sanitizeToken,
} from "./takeatService";
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
};

export const INITIAL_TAKEAT_REVENUES: TakeatRevenueRecord[] = [];

export const INITIAL_TAKEAT_CREDENTIALS: Record<string, TakeatCredentials> = {};


class DataStore {
  constructor() {
    if (typeof window !== "undefined") {
      try {
        const purgedKey = "house190_purged_mock_v4";
        if (!localStorage.getItem(purgedKey)) {
          // Preserva estritamente as credenciais autênticas e faturamentos da Takeat
          const takeatCreds = localStorage.getItem(STORAGE_KEYS.TAKEAT_CREDS);
          const takeatRevs = localStorage.getItem(STORAGE_KEYS.TAKEAT_REVENUES);

          // Zera dados falsos/mock de todas as áreas
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
          if (takeatRevs) localStorage.setItem(STORAGE_KEYS.TAKEAT_REVENUES, takeatRevs);

          localStorage.setItem(purgedKey, "true");
        }
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
      if (m && m.id && !m.id.includes("fake") && !m.id.startsWith("rev-01") && !m.id.startsWith("rev-02")) {
        map.set(`${m.unitId}-${m.date}`, m);
      }
    }

    for (const t of takeat) {
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
    const revenues = this.getRevenues();
    const netRevenue = rev.grossRevenue - (rev.discounts || 0) - (rev.cancellations || 0);
    const newRev: DailyRevenue = {
      ...rev,
      id: `rev-${Date.now()}`,
      netRevenue,
    };
    this.set(STORAGE_KEYS.REVENUES, [newRev, ...revenues]);
    return newRev;
  }

  // GOALS (Cálculo em tempo real baseado nas metas oficiais dos documentos e faturamento Takeat)
  getGoals(): UnitGoal[] {
    let rawGoals = this.get<UnitGoal[]>(STORAGE_KEYS.GOALS, []);
    const defaultTargets: Record<string, { target: number; superTarget: number; salaoTarget: number; deliveryTarget: number; ifoodTarget: number }> = {
      teixeira: { target: 200000, superTarget: 210000, salaoTarget: 70000, deliveryTarget: 80000, ifoodTarget: 50000 },
      eunapolis: { target: 200000, superTarget: 210000, salaoTarget: 70000, deliveryTarget: 80000, ifoodTarget: 50000 },
      foodpark: { target: 180000, superTarget: 190000, salaoTarget: 90000, deliveryTarget: 60000, ifoodTarget: 30000 },
      central: { target: 0, superTarget: 0, salaoTarget: 0, deliveryTarget: 0, ifoodTarget: 0 },
    };

    if (rawGoals.length === 0 || rawGoals.some((g) => g.targetAmount === 0 && defaultTargets[g.unitId]?.target > 0)) {
      const units: Array<Exclude<UnitId, "all">> = ["eunapolis", "teixeira", "foodpark", "central"];
      rawGoals = units.map((u) => {
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

      // Se há faturamento realizado apurado (currentRealized > 0), mas Salão e iFood ficaram zerados
      // (caso onde todo o faturamento foi atribuído exclusivamente ao delivery ou apuração global):
      if (currentRealized > 0 && salaoRealized === 0 && ifoodRealized === 0) {
        const totalPlanned = conf.salaoTarget + conf.deliveryTarget + conf.ifoodTarget;
        if (totalPlanned > 0) {
          salaoRealized = Math.round((currentRealized * (conf.salaoTarget / totalPlanned)) * 100) / 100;
          deliveryRealized = Math.round((currentRealized * (conf.deliveryTarget / totalPlanned)) * 100) / 100;
          ifoodRealized = Math.round((currentRealized - salaoRealized - deliveryRealized) * 100) / 100;
        }
      }

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
      message: `${newEmp.name} foi adicionado(a) como ${newEmp.role}.`,
      link: "/rh",
      severity: "success",
    });
    return newEmp;
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
    return this.get(STORAGE_KEYS.DOCS, INITIAL_DOCUMENTS);
  }

  addDocument(doc: Omit<DocumentItem, "id" | "uploadDate">): DocumentItem {
    const docs = this.getDocuments();
    const newDoc: DocumentItem = {
      ...doc,
      id: `doc-${Date.now()}`,
      uploadDate: new Date().toISOString().split("T")[0],
    };
    this.set(STORAGE_KEYS.DOCS, [newDoc, ...docs]);
    saveDocumentToFirestore(newDoc).catch(() => {});
    this.addNotification({
      type: "doc",
      title: "Documento salvo no Drive",
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
    // Garante que nenhum registro de mock anterior permaneça
    return records.filter((r) => r && r.id && !r.id.includes("fake"));
  }

  getTakeatCredentials(unitId: string): TakeatCredentials {
    const all = this.get<Record<string, TakeatCredentials>>(
      STORAGE_KEYS.TAKEAT_CREDS,
      {}
    );
    const cred = all[unitId];
    if (!cred) {
      return {
        unitId: unitId as any,
        email: "",
      };
    }
    const token = sanitizeToken(cred.token);
    // Remove qualquer token de teste anterior (ex: tk_...)
    if (token && token.startsWith("tk_")) {
      return { ...cred, token: undefined };
    }
    return { ...cred, token: token || undefined };
  }

  removeTakeatCredentials(unitId: string) {
    const all = this.get<Record<string, TakeatCredentials>>(
      STORAGE_KEYS.TAKEAT_CREDS,
      {}
    );
    delete all[unitId];
    this.set(STORAGE_KEYS.TAKEAT_CREDS, all);
  }

  saveTakeatCredentials(creds: TakeatCredentials) {
    const all = this.get<Record<string, TakeatCredentials>>(
      STORAGE_KEYS.TAKEAT_CREDS,
      {}
    );
    const cleanToken = sanitizeToken(creds.token);
    all[creds.unitId] = {
      ...creds,
      token: cleanToken || undefined,
    };
    this.set(STORAGE_KEYS.TAKEAT_CREDS, all);
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
    const current = this.getTakeatRevenues();
    const existing = current.find((r) => r.unitId === record.unitId && r.date === record.date);

    let finalRecord = { ...record };
    if (existing && !isManualEdit) {
      // Preserva canais já lançados se a nova sincronização veio com zero neles
      const salao = record.salao > 0 ? record.salao : (existing.salao || 0);
      const ifood = record.ifood > 0 ? record.ifood : (existing.ifood || 0);
      const delivery = record.delivery > 0 ? record.delivery : (existing.delivery || 0);
      const totalRevenue = Math.round((salao + delivery + ifood) * 100) / 100;

      finalRecord = {
        ...record,
        salao,
        delivery,
        ifood,
        totalRevenue: Math.max(record.totalRevenue, totalRevenue),
      };
    }

    const filtered = current.filter(
      (r) => !(r.unitId === finalRecord.unitId && r.date === finalRecord.date)
    );
    this.set(STORAGE_KEYS.TAKEAT_REVENUES, [finalRecord, ...filtered]);

    // Sincroniza também no faturamento diário da plataforma
    const currentRevs = this.getRevenues();
    const existingIndex = currentRevs.findIndex(
      (r) => r.unitId === finalRecord.unitId && r.date === finalRecord.date
    );

    const updatedRevItem: DailyRevenue = {
      id: `rev-takeat-${finalRecord.unitId}-${finalRecord.date}`,
      unitId: finalRecord.unitId,
      date: finalRecord.date,
      grossRevenue: finalRecord.totalRevenue,
      discounts: 0,
      cancellations: 0,
      netRevenue: finalRecord.totalRevenue,
      notes: `Sincronizado via API Takeat (Salão: R$ ${finalRecord.salao.toFixed(2)}, Delivery: R$ ${finalRecord.delivery.toFixed(2)}, iFood: R$ ${finalRecord.ifood.toFixed(2)})`,
    };

    if (existingIndex >= 0) {
      currentRevs[existingIndex] = updatedRevItem;
      this.set(STORAGE_KEYS.REVENUES, [...currentRevs]);
    } else {
      this.set(STORAGE_KEYS.REVENUES, [updatedRevItem, ...currentRevs]);
    }
  }

  async syncTakeatUnit(
    unitId: Exclude<UnitId, "all">,
    dateStr: string,
    userRole: string = "admin",
    userUnitId: string = "all"
  ): Promise<TakeatSyncResult> {
    const unitNames: Record<string, string> = {
      eunapolis: "House 190 Eunápolis",
      teixeira: "House 190 Teixeira de Freitas",
      foodpark: "House Foodpark",
      central: "Central de Produção",
    };
    const unitName = unitNames[unitId] || unitId;

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

    // 3. Credenciais da unidade
    const creds = this.getTakeatCredentials(unitId);
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
      // NUNCA gera dados fictícios. Retorna o erro real ocorrido na API da Takeat.
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
      record = processOfficialRevenue(unitId, dateStr, rawResponse);
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
}

export const store = new DataStore();
