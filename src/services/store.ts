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
} from "@/types";
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
};

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
}

export const store = new DataStore();
