import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "outline";
  size?: "sm" | "md";
}

export function Badge({
  className,
  variant = "default",
  size = "sm",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900",
    secondary: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/50",
    warning: "bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/50",
    danger: "bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/50",
    info: "bg-sky-50 text-sky-700 border border-sky-200/60 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/50",
    outline: "border border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs font-medium",
    md: "px-2.5 py-1 text-xs font-medium",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md transition-colors",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "paid":
    case "approved":
    case "done":
    case "completed":
    case "active":
      return <Badge variant="success">Pago / Aprovado</Badge>;
    case "pending_approval":
      return <Badge variant="warning">Aguardando Aprovação</Badge>;
    case "scheduled":
      return <Badge variant="info">Agendado</Badge>;
    case "overdue":
    case "danger":
      return <Badge variant="danger">Vencido</Badge>;
    case "upcoming":
    case "todo":
      return <Badge variant="secondary">A Vencer</Badge>;
    case "in_progress":
      return <Badge variant="info">Em Andamento</Badge>;
    case "waiting":
      return <Badge variant="warning">Aguardando</Badge>;
    case "draft":
      return <Badge variant="outline">Rascunho</Badge>;
    case "canceled":
      return <Badge variant="secondary">Cancelado</Badge>;
    case "vacation":
      return <Badge variant="info">Férias</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
