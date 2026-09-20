import { TrendingUp, Users, ReceiptText, Truck, Columns3, FolderLock, Landmark, ClipboardCheck, BadgeCheck, FileText, Bike } from "lucide-react";
export const MANAGEMENT_NAV = [
  { title: "Contas a pagar", href: "/", icon: ReceiptText, roles: ["admin","accountant"] },
  { title: "NF Recebidas", href: "/nfe-recebida", icon: FileText, roles: ["admin","accountant"] },
  { title: "Bancos", href: "/bancos", icon: Landmark, roles: ["admin","accountant"] },
  { title: "Fornecedores", href: "/fornecedores", icon: Truck, roles: ["admin","accountant"] },
  { title: "Tarefas", href: "/tarefas", icon: Columns3, roles: ["admin","accountant","manager"] },
  { title: "Vendas", href: "/faturamento", icon: TrendingUp, roles: ["admin","accountant","manager"] },
  { title: "Fechamento de caixa", href: "/fechamento-caixa", icon: ClipboardCheck, roles: ["admin","accountant","operator"] },
  { title: "Auditoria de motoboys & notas", href: "/auditoria-caixa", icon: Bike, roles: ["admin","accountant","operator"] },
  { title: "Conferência de caixa", href: "/conferencia-caixa", icon: BadgeCheck, roles: ["admin","accountant"] },
  { title: "Equipe", href: "/rh", icon: Users, roles: ["admin","accountant"] },
  { title: "Documentos", href: "/documentos", icon: FolderLock, roles: ["admin","accountant"] },
];
export function normalizeRole(role?: string): "admin" | "manager" | "operator" | "accountant" {
  if (!role) return "admin";
  const r = role.toLowerCase().trim();
  if (r === "admin" || r === "administrador" || r === "proprietario" || r === "dono" || r === "diretoria" || r === "diretor" || r === "gestao") return "admin";
  if (r === "accountant" || r === "contador" || r === "contadora" || r === "financeiro") return "accountant";
  if (r === "manager" || r === "gerente") return "manager";
  return "operator";
}

export const navigationForRole = (role?: string) => {
  const norm = normalizeRole(role);
  return MANAGEMENT_NAV.filter((item) => item.roles.includes(norm));
};

export function homeForRole(role?: string): string {
  const norm = normalizeRole(role);
  if (norm === "manager") return "/faturamento/";
  if (norm === "operator") return "/fechamento-caixa/";
  return "/";
}

export function normalizePath(pathname?: string | null): string {
  if (!pathname) return "/";
  let clean = pathname.replace(/^\/gestao/, "");
  if (!clean.startsWith("/")) clean = "/" + clean;
  // normalize trailing slash consistency for matching
  return clean;
}

export function roleCanAccess(role: string | undefined, pathname?: string | null): boolean {
  const norm = normalizeRole(role);
  if (norm === "admin" || norm === "accountant") return true;
  const path = normalizePath(pathname);
  if (norm === "manager") {
    return path.startsWith("/tarefas") || path.startsWith("/faturamento") || path.startsWith("/integracoes/takeat") || path.startsWith("/nfe-recebida");
  }
  if (norm === "operator") {
    return path.startsWith("/fechamento-caixa") || path.startsWith("/auditoria-caixa");
  }
  return false;
}

