import { TrendingUp, Users, ReceiptText, Truck, Columns3, FolderLock, Landmark, ClipboardCheck, BadgeCheck } from "lucide-react";
export const MANAGEMENT_NAV = [
  { title: "Contas a pagar", href: "/", icon: ReceiptText, roles: ["admin","accountant"] },
  { title: "Bancos", href: "/bancos", icon: Landmark, roles: ["admin","accountant"] },
  { title: "Fornecedores", href: "/fornecedores", icon: Truck, roles: ["admin","accountant"] },
  { title: "Tarefas", href: "/tarefas", icon: Columns3, roles: ["admin","accountant","manager"] },
  { title: "Vendas", href: "/faturamento", icon: TrendingUp, roles: ["admin","accountant","manager"] },
  { title: "Fechamento de caixa", href: "/fechamento-caixa", icon: ClipboardCheck, roles: ["admin","accountant","operator"] },
  { title: "Conferência de caixa", href: "/conferencia-caixa", icon: BadgeCheck, roles: ["admin","accountant"] },
  { title: "Equipe", href: "/rh", icon: Users, roles: ["admin","accountant"] },
  { title: "Documentos", href: "/documentos", icon: FolderLock, roles: ["admin","accountant"] },
];
export const navigationForRole = (role?: string) =>
  MANAGEMENT_NAV.filter((item) => !role || item.roles.includes(role));

export function homeForRole(role?: string) {
  return role === "manager"
    ? "/faturamento"
    : role === "operator"
      ? "/fechamento-caixa"
      : "/";
}

export function normalizePath(pathname?: string | null): string {
  if (!pathname) return "/";
  let clean = pathname.replace(/^\/gestao/, "");
  if (!clean.startsWith("/")) clean = "/" + clean;
  return clean;
}

export function roleCanAccess(role: string | undefined, pathname: string) {
  if (!role) return false;
  if (role === "admin" || role === "accountant") return true;
  const path = normalizePath(pathname);
  if (role === "manager")
    return path.startsWith("/tarefas") || path.startsWith("/faturamento") || path.startsWith("/integracoes/takeat");
  if (role === "operator")
    return path.startsWith("/fechamento-caixa");
  return false;
}
