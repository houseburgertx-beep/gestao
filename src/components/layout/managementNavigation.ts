import { Settings, TrendingUp, Users, ReceiptText, Truck } from "lucide-react";
export const MANAGEMENT_NAV = [
  { title: "Contas a pagar", href: "/", icon: ReceiptText },
  { title: "Fornecedores", href: "/fornecedores", icon: Truck },
  { title: "Vendas", href: "/faturamento", icon: TrendingUp },
  { title: "Equipe", href: "/rh", icon: Users },
  { title: "Ajustes", href: "/bases", icon: Settings },
];
