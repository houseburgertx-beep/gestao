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
    
    // Log activity
    this.addLog({
      userId: "usr-current",
      userName: "Você (Gestor)",
      action: "Novo Lançamento",
      entityType: "Conta a Pagar",
      entityId: createdList[0].id,
      details: `Lançou conta "${account.description}" para ${account.supplierName} no valor de R$ ${account.amount.toFixed(2)}${installmentsCount > 1 ? ` em ${installmentsCount}x` : ""}.`,
    });

    return createdList;
  }

  updateAccountStatus(id: string, status: AccountPayable["status"], details?: string) {
    const accounts = this.getAccounts();
    const updated = accounts.map((acc) => (acc.id === id ? { ...acc, status } : acc));
    this.set(STORAGE_KEYS.ACCOUNTS, updated);

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

    this.addLog({
      userId: "usr-current",
      userName: reviewerName,
      action: "Aprovação de Pagamento",
      entityType: "Conta a Pagar",
      entityId: id,
      details: `Aprovou o pagamento da conta ${id}.${comment ? ` Comentário: ${comment}` : ""}`,
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

    this.addLog({
      userId: "usr-current",
      userName: reviewerName,
      action: "Recusa de Pagamento",
      entityType: "Conta a Pagar",
      entityId: id,
      details: `Recusou o pagamento da conta ${id}. Motivo: ${reason}`,
    });
  }

  payAccount(id: string, bankAccount: string, proofName?: string) {
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
          }
        : acc
    );
    this.set(STORAGE_KEYS.ACCOUNTS, updated);

    this.addLog({
      userId: "usr-current",
      userName: "Financeiro House",
      action: "Baixa de Pagamento",
      entityType: "Conta a Pagar",
      entityId: id,
      details: `Liquidou pagamento da conta ${id} via conta "${bankAccount}".`,
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
    return newTax;
  }

  // REVENUES
  getRevenues(): DailyRevenue[] {
    return this.get(STORAGE_KEYS.REVENUES, INITIAL_DAILY_REVENUE);
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

  // GOALS
  getGoals(): UnitGoal[] {
    return this.get(STORAGE_KEYS.GOALS, INITIAL_GOALS);
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

  saveTakeatRevenue(record: TakeatRevenueRecord) {
    const current = this.getTakeatRevenues();
    const filtered = current.filter(
      (r) => !(r.unitId === record.unitId && r.date === record.date)
    );
    this.set(STORAGE_KEYS.TAKEAT_REVENUES, [record, ...filtered]);

    // Sincroniza também no faturamento diário da plataforma
    const currentRevs = this.getRevenues();
    const existingIndex = currentRevs.findIndex(
      (r) => r.unitId === record.unitId && r.date === record.date
    );

    const updatedRevItem: DailyRevenue = {
      id: `rev-takeat-${record.unitId}-${record.date}`,
      unitId: record.unitId,
      date: record.date,
      grossRevenue: record.totalRevenue,
      discounts: 0,
      cancellations: 0,
      netRevenue: record.totalRevenue,
      notes: `Sincronizado via API Takeat (Salão: R$ ${record.salao.toFixed(2)}, Delivery: R$ ${record.delivery.toFixed(2)}, iFood: R$ ${record.ifood.toFixed(2)})`,
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

    // 2. Cálculo do fuso horário de Brasília/Bahia (America/Bahia)
    let range: { startDate: string; endDate: string };
    try {
      range = getBahiaIsoDayRange(dateStr);
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

