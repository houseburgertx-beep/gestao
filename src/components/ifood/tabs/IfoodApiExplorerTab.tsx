"use client";

import React, { useState } from "react";
import { IfoodCredentials, IfoodUnitId } from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import {
  Terminal,
  Play,
  Copy,
  Check,
  Code2,
  Clock,
  Sparkles,
  Layers,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
}

interface EndpointPreset {
  name: string;
  category: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  defaultBody?: string;
}

const PRESETS: EndpointPreset[] = [
  // Auth
  {
    name: "Solicitar Token OAuth",
    category: "Autenticação",
    method: "POST",
    path: "/authentication/v1.0/oauth/token",
    defaultBody: JSON.stringify(
      {
        grantType: "client_credentials",
        clientId: "SEU_CLIENT_ID",
        clientSecret: "SEU_CLIENT_SECRET",
      },
      null,
      2
    ),
  },
  // Merchant
  {
    name: "Detalhes do Merchant",
    category: "Merchant v1.0",
    method: "GET",
    path: "/merchant/v1.0/merchants/{merchantId}",
  },
  {
    name: "Status da Loja",
    category: "Merchant v1.0",
    method: "GET",
    path: "/merchant/v1.0/merchants/{merchantId}/status",
  },
  {
    name: "Tempo de Preparo",
    category: "Merchant v1.0",
    method: "GET",
    path: "/merchant/v1.0/merchants/{merchantId}/myPreparationTime",
  },
  // Events & Orders
  {
    name: "Polling de Eventos (Novos Pedidos)",
    category: "Events v1.0",
    method: "GET",
    path: "/events/v1.0/events:polling",
  },
  {
    name: "Confirmar Pedido",
    category: "Order v1.0",
    method: "POST",
    path: "/order/v1.0/orders/{orderId}/confirm",
  },
  {
    name: "Despachar Pedido",
    category: "Order v1.0",
    method: "POST",
    path: "/order/v1.0/orders/{orderId}/dispatch",
  },
  // Financial
  {
    name: "Extrato de Vendas",
    category: "Financial v3.0",
    method: "GET",
    path: "/financial/v3.0/merchants/{merchantId}/sales",
  },
  {
    name: "Lançamentos e Taxas",
    category: "Financial v3.0",
    method: "GET",
    path: "/financial/v3.0/merchants/{merchantId}/financial-events",
  },
  {
    name: "Repasses Bancários (Settlements)",
    category: "Financial v3.0",
    method: "GET",
    path: "/financial/v3.0/merchants/{merchantId}/settlements",
  },
  // Catalog
  {
    name: "Listar Produtos do Cardápio",
    category: "Catalog v2.0",
    method: "GET",
    path: "/catalog/v2.0/merchants/{merchantId}/products",
  },
  // Shipping
  {
    name: "Disponibilidade de Entrega",
    category: "Shipping v1.0",
    method: "GET",
    path: "/shipping/v1.0/merchants/{merchantId}/deliveryAvailabilities",
  },
  // Reviews
  {
    name: "Resumo de Avaliações",
    category: "Review v2.0",
    method: "GET",
    path: "/review/v2.0/merchants/{merchantId}/summary",
  },
  {
    name: "Listar Comentários",
    category: "Review v2.0",
    method: "GET",
    path: "/review/v2.0/merchants/{merchantId}/reviews",
  },
];

export function IfoodApiExplorerTab({ unitId, credentials }: Props) {
  const merchantId = credentials.merchantId || "b0954b6b-f99c-44b6-ba1e-987f32b2b22a";
  const [method, setMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("GET");
  const [endpoint, setEndpoint] = useState<string>("/merchant/v1.0/merchants/{merchantId}");
  const [requestBody, setRequestBody] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [responseResult, setResponseResult] = useState<{
    status: number;
    ok: boolean;
    data: any;
    durationMs: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const applyPreset = (preset: EndpointPreset) => {
    setMethod(preset.method);
    const resolvedPath = preset.path
      .replace("{merchantId}", merchantId)
      .replace("{orderId}", "ord-101");
    setEndpoint(resolvedPath);
    setRequestBody(preset.defaultBody || "");
  };

  const handleExecute = async () => {
    setLoading(true);
    setResponseResult(null);

    const resolvedEndpoint = endpoint
      .replace("{merchantId}", merchantId)
      .replace("{orderId}", "ord-101");

    try {
      const res = await IfoodService.executeRawRequest(
        unitId,
        method,
        resolvedEndpoint,
        {},
        requestBody
      );
      setResponseResult(res);
    } catch (err: any) {
      setResponseResult({
        status: 500,
        ok: false,
        data: { error: err.message },
        durationMs: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyResponse = () => {
    if (!responseResult) return;
    navigator.clipboard.writeText(JSON.stringify(responseResult.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-800 dark:text-zinc-100">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              API Explorer & Swagger Interativo
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 font-semibold font-mono">
                Live Console
              </span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Teste chamadas diretas para qualquer endpoint da documentação iFood Merchant.
            </p>
          </div>
        </div>
      </div>

      {/* Presets rápidas */}
      <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-zinc-500" />
          Atalhos de Endpoints Oficiais:
        </span>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              onClick={() => applyPreset(p)}
              className="text-[11px] px-2.5 py-1 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-red-400 text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
            >
              <span
                className={`font-mono text-[9px] font-bold px-1 rounded ${
                  p.method === "GET"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : p.method === "POST"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {p.method}
              </span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Request Builder */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            className="w-full sm:w-28 text-xs font-bold px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>

          <div className="relative flex-1 w-full">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 font-mono hidden md:inline">
              https://merchant-api.ifood.com.br
            </span>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="/financial/v3.0/merchants/{merchantId}/sales"
              className="w-full text-xs font-mono px-3 md:pl-64 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <button
            onClick={handleExecute}
            disabled={loading}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${loading ? "animate-spin" : ""}`} />
            {loading ? "Enviando..." : "Executar"}
          </button>
        </div>

        {/* Body Editor para POST / PUT / PATCH */}
        {["POST", "PUT", "PATCH"].includes(method) && (
          <div>
            <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5" />
              Corpo da Requisição (JSON Payload):
            </label>
            <textarea
              rows={4}
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              placeholder='{ "key": "value" }'
              className="w-full text-xs font-mono p-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-950 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}
      </div>

      {/* Response Viewer */}
      {responseResult && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-lg space-y-0">
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-xs">
            <div className="flex items-center gap-3">
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                  responseResult.ok
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                    : "bg-rose-950 text-rose-300 border border-rose-800"
                }`}
              >
                {responseResult.status || 0} {responseResult.ok ? "OK" : "ERROR"}
              </span>
              <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {responseResult.durationMs}ms
              </span>
            </div>

            <button
              onClick={handleCopyResponse}
              className="text-zinc-400 hover:text-white transition flex items-center gap-1 text-[11px]"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar JSON</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 max-h-[400px] overflow-auto text-xs font-mono text-zinc-200 leading-relaxed">
            <pre>{JSON.stringify(responseResult.data, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
