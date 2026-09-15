import { CheckSquare, Settings, TrendingUp, Users, Wallet, LayoutDashboard } from "lucide-react";
export const MANAGEMENT_NAV = [
  { title: "Visão geral", href: "/", icon: LayoutDashboard },
  { title: "Vendas e metas", href: "/faturamento", icon: TrendingUp },
  { title: "Financeiro", href: "/financeiro", icon: Wallet },
  { title: "Equipe", href: "/rh", icon: Users },
  { title: "Ações", href: "/tarefas", icon: CheckSquare },
  { title: "Ajustes", href: "/bases", icon: Settings },
];
