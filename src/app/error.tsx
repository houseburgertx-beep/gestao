"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export default function ErrorBoundaryPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Next.js Error Boundary capturou exceção:", error);
  }, [error]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = "/gestao/";
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Ajustando sessão e carregando sistema
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Uma divergência temporária foi identificada durante a renderização da página. Clique em recarregar ou volte ao início.
          </p>
          {error?.message && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-left overflow-hidden">
              <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 break-words line-clamp-3">
                {error.message}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <button
            onClick={() => reset()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tentar novamente
          </button>

          <a
            href="/gestao/"
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Ir para a página inicial
          </a>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair e trocar de conta
          </button>
        </div>
      </div>
    </div>
  );
}
