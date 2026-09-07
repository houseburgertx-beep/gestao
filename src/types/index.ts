export type UnitId = 'all' | 'central' | 'eunapolis' | 'teixeira' | 'foodpark';

export interface Unit {
  id: UnitId;
  name: string;
  shortName: string;
  code: string;
  cnpj?: string;
  address?: string;
}

export type AccountStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'scheduled'
  | 'paid'
  | 'overdue'
  | 'canceled';

export interface AccountPayable {
  id: string;
  unitId: Exclude<UnitId, 'all'>;
  companyCnpj: string;
  supplierId: string;
  supplierName: string;
  supplierCnpjCpf?: string;
  description: string;
  category: string;
  subcategory?: string;
  costCenter: string;
  competence: string; // MM/YYYY
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  amount: number;
  interest: number;
  penalty: number;
  discount: number;
  finalAmount: number;
  paymentMethod: 'pix' | 'boleto' | 'transferencia' | 'debito' | 'cartao';
  bankAccount?: string;
  status: AccountStatus;
  responsibleUser: string;
  notes?: string;
  invoiceNumber?: string;
  barcode?: string;
  attachments?: { name: string; url: string; type: string }[];
  installmentNumber?: number;
  totalInstallments?: number;
  installmentGroupId?: string;
  approvalTier?: 'auto' | 'manager' | 'director';
  approvedBy?: string;
  approvedAt?: string;
  paidAt?: string;
  paymentProof?: string;
  createdAt: string;
  deletedAt?: string | null;
}

export interface Supplier {
  id: string;
  legalName: string;
  tradeName: string;
  cnpjCpf: string;
  phone: string;
  whatsapp?: string;
  email: string;
  address: string;
  category: string;
  bankData?: {
    bank: string;
    agency: string;
    account: string;
  };
  pixKey?: string;
  notes?: string;
  documents?: { title: string; url: string; date: string }[];
  createdAt: string;
}

export interface PaymentApproval {
  id: string;
  accountId: string;
  description: string;
  supplierName: string;
  unitId: Exclude<UnitId, 'all'>;
  amount: number;
  dueDate: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'adjustment_requested';
  approvalTier: 'manager' | 'director';
  reviewerName?: string;
  reviewedAt?: string;
  comments?: string;
}

export interface TaxRecord {
  id: string;
  companyCnpj: string;
  unitId: Exclude<UnitId, 'all'>;
  taxType: 'DAS' | 'ICMS' | 'PIS/COFINS' | 'INSS' | 'FGTS' | 'ISS' | 'IRPJ/CSLL';
  competence: string;
  amount: number;
  dueDate: string;
  status: 'upcoming' | 'pending_payment' | 'paid' | 'overdue' | 'installment';
  barcode?: string;
  guideUrl?: string;
  proofUrl?: string;
  notes?: string;
  isInstallment?: boolean;
  installmentNumber?: number;
  totalInstallments?: number;
}

export interface DailyRevenue {
  id: string;
  unitId: Exclude<UnitId, 'all'>;
  date: string; // YYYY-MM-DD
  grossRevenue: number;
  discounts: number;
  cancellations: number;
  netRevenue: number;
  notes?: string;
}

export interface UnitGoal {
  id: string;
  unitId: Exclude<UnitId, 'all'>;
  month: number; // 1-12
  year: number;
  targetAmount: number;
  currentRealized: number;
  previousMonthRealized: number;
  dailyAverageTarget?: number;
  currentDailyAverage?: number;
  projectedClose?: number;
}

export type EmployeeStatus = 'active' | 'vacation' | 'leave' | 'terminated';

export interface Employee {
  id: string;
  photoUrl: string;
  name: string;
  cpf: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  unitId: Exclude<UnitId, 'all'>;
  department: string;
  role: string;
  admissionDate: string;
  salary: number;
  contractType: 'CLT' | 'PJ' | 'Estagio';
  workHours: string;
  managerName: string;
  status: EmployeeStatus;
  bankData?: string;
  documentsCount: number;
  notes?: string;
}

export interface EmployeeVacation {
  id: string;
  employeeId: string;
  employeeName: string;
  unitId: Exclude<UnitId, 'all'>;
  vestingPeriodStart: string;
  vestingPeriodEnd: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: 'planned' | 'requested' | 'approved' | 'in_progress' | 'completed';
}

export interface AdmissionProcess {
  id: string;
  candidateName: string;
  role: string;
  unitId: Exclude<UnitId, 'all'>;
  stage:
    | 'approved'
    | 'docs_requested'
    | 'docs_received'
    | 'medical_exam'
    | 'contract'
    | 'integration'
    | 'finished';
  checklist: { id: string; text: string; done: boolean }[];
  startDate: string;
}

export interface TerminationProcess {
  id: string;
  employeeId: string;
  employeeName: string;
  unitId: Exclude<UnitId, 'all'>;
  date: string;
  terminationType: 'demissao_sem_justa_causa' | 'pedido_demissao' | 'acordo' | 'demissao_justa_causa';
  reason: string;
  responsibleUser: string;
  checklist: { id: string; text: string; done: boolean }[];
  status: 'in_progress' | 'completed';
}

export interface PeopleFeedback {
  id: string;
  employeeId: string;
  employeeName: string;
  authorName: string;
  type: 'feedback' | 'praise' | 'occurrence' | 'warning' | 'pip' | 'one_on_one' | 'review';
  date: string;
  title: string;
  description: string;
  confidential: boolean;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'done' | 'canceled';

export interface Task {
  id: string;
  title: string;
  description: string;
  unitId: UnitId;
  project?: string;
  assigneeName: string;
  assigneeAvatar?: string;
  participants?: string[];
  priority: TaskPriority;
  startDate?: string;
  dueDate: string;
  status: TaskStatus;
  tags: string[];
  checklist: { id: string; text: string; done: boolean }[];
  comments: { id: string; user: string; text: string; date: string }[];
  attachmentsCount: number;
  isRecurring?: boolean;
  recurrenceRule?: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  category: 'finance' | 'fiscal' | 'hr' | 'contracts' | 'suppliers' | 'employees' | 'companies' | 'other';
  unitId: UnitId;
  expirationDate?: string;
  uploadDate: string;
  size: string;
  format: 'pdf' | 'xlsx' | 'docx' | 'png' | 'zip';
  url: string;
  tags: string[];
}

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export interface AppNotification {
  id: string;
  type: 'payable' | 'approval' | 'tax' | 'task' | 'goal' | 'vacation' | 'doc';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  timestamp: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
}
