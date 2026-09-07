import React from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  context?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
  };
  progress?: {
    percent: number;
    subtext?: string;
  };
  icon?: React.ReactNode;
  urgent?: boolean;
  className?: string;
  onClick?: () => void;
}

export function MetricCard({
  label,
  value,
  context,
  trend,
  progress,
  icon,
  urgent,
  className,
  onClick,
}: MetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-lg border bg-white p-5 transition-all dark:bg-zinc-900",
        urgent
          ? "border-amber-300/80 bg-amber-50/20 dark:border-amber-800/60"
          : "border-zinc-200/90 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700",
        onClick && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 tracking-tight dark:text-zinc-400">
          {label}
        </span>
        {icon && (
          <div className="text-zinc-400 dark:text-zinc-500">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center text-xs font-medium",
              trend.isNeutral
                ? "text-zinc-500"
                : trend.isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>

      {context && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {context}
        </p>
      )}

      {progress && (
        <div className="mt-3.5 space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                progress.percent >= 100
                  ? "bg-emerald-500"
                  : progress.percent < 70
                  ? "bg-amber-500"
                  : "bg-zinc-900 dark:bg-zinc-100"
              )}
              style={{ width: `${Math.min(progress.percent, 100)}%` }}
            />
          </div>
          {progress.subtext && (
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Progresso</span>
              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                {progress.subtext}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
