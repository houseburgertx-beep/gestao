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
    cnpj: "45.190.190/0001-90",
    address: "Av. das Indústrias, 190 - Eunápolis/BA",
  },
  {
    id: "eunapolis",
    name: "House 190 Eunápolis",
    shortName: "Eunápolis",
    code: "EUN",
    cnpj: "45.190.190/0002-71",
    address: "Av. Porto Seguro, 450 - Centro, Eunápolis/BA",
  },
  {
    id: "teixeira",
    name: "House 190 Teixeira de Freitas",
    shortName: "Teixeira",
    code: "TXF",
    cnpj: "45.190.190/0003-52",
    address: "Av. Getúlio Vargas, 1820 - Teixeira de Freitas/BA",
  },
  {
    id: "foodpark",
    name: "House Foodpark",
    shortName: "Foodpark",
    code: "FDP",
    cnpj: "45.190.190/0004-33",
    address: "Espaço Gastronômico, Box 04 - Eunápolis/BA",
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
