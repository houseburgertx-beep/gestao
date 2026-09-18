"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Next.js Global Error capturou exceção no layout raiz:", error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-zinc-200 p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-zinc-900">
              HOUSE 190 — Reinicializando sessão
            </h2>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Ocorreu uma falha inesperada no carregamento dos módulos. Clique abaixo para atualizar o sistema.
            </p>
            {error?.message && (
              <div className="p-3 bg-zinc-50 rounded-lg text-left overflow-hidden">
                <span className="text-[11px] font-mono text-zinc-600 break-words line-clamp-3">
                  {error.message}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => reset()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 text-white text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Recarregar aplicação
            </button>

            <a
              href="/"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-100 text-zinc-700 text-xs font-medium"
            >
              <Home className="w-3.5 h-3.5" />
              Voltar ao Início
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
