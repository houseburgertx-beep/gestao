import {
  Unit,
  Supplier,
  AccountPayable,
  TaxRecord,
  DailyRevenue,
  UnitGoal,
  Employee,
  EmployeeVacation,
  AdmissionProcess,
  TerminationProcess,
  PeopleFeedback,
  Task,
  DocumentItem,
  ActivityLog,
  AppNotification,
} from "@/types";

export const UNITS: Unit[] = [
  {
    id: "all",
    name: "Visão Geral (Todas as Unidades)",
    shortName: "Visão Geral",
    code: "GERAL",
  },
  {
    id: "central",
    name: "Central de Produção",
    shortName: "Central",
    code: "CP",
  },
  {
    id: "eunapolis",
    name: "House 190 Eunápolis",
    shortName: "Eunápolis",
    code: "EUN",
  },
  {
    id: "teixeira",
    name: "House 190 Teixeira de Freitas",
    shortName: "Teixeira",
    code: "TXF",
  },
  {
    id: "foodpark",
    name: "House Foodpark",
    shortName: "Foodpark",
    code: "FDP",
  },
];

// Dados zerados prontos para alimentação de informações 100% reais pelo usuário
export const INITIAL_SUPPLIERS: Supplier[] = [];
export const INITIAL_ACCOUNTS_PAYABLE: AccountPayable[] = [];
export const INITIAL_TAXES: TaxRecord[] = [];
export const INITIAL_GOALS: UnitGoal[] = [];
export const INITIAL_DAILY_REVENUE: DailyRevenue[] = [];
export const INITIAL_EMPLOYEES: Employee[] = [];
export const INITIAL_VACATIONS: EmployeeVacation[] = [];
export const INITIAL_TASKS: Task[] = [];
export const INITIAL_DOCUMENTS: DocumentItem[] = [];
export const INITIAL_ACTIVITY_LOGS: ActivityLog[] = [];
export const INITIAL_NOTIFICATIONS: AppNotification[] = [];
