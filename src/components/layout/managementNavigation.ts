import { TrendingUp, Users, ReceiptText, Truck, Columns3, FolderLock } from "lucide-react";
export const MANAGEMENT_NAV = [
  { title: "Contas a pagar", href: "/", icon: ReceiptText },
  { title: "Fornecedores", href: "/fornecedores", icon: Truck },
  { title: "Tarefas", href: "/tarefas", icon: Columns3 },
  { title: "Vendas", href: "/faturamento", icon: TrendingUp },
  { title: "Equipe", href: "/rh", icon: Users },
  { title: "Documentos", href: "/documentos", icon: FolderLock },
];
