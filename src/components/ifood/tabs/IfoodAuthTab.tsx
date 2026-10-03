"use client";

import React, { useState, useEffect } from "react";
import { IfoodCredentials, IfoodTokenState, IfoodUnitId } from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import { saveIfoodCredentials } from "@/config/ifoodCredentials";
import {
  ShieldCheck,
  Key,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Unplug,
  ExternalLink,
  Store,
  Sparkles,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
  onCredentialsUpdated: () => void;
  tokenState: IfoodTokenState;
  onTokenUpdated: () => void;
}

export function IfoodAuthTab({
  unitId,
  credentials,
  onCredentialsUpdated,
  tokenState,
  onTokenUpdated,
}: Props) {
  const [clientId, setClientId] = useState(credentials.clientId || "");
  const [clientSecret, setClientSecret] = useState(credentials.clientSecret || "");
  const [merchantId, setMerchantId] = useState(credentials.merchantId || "");
  const [manualToken, setManualToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [merchantsList, setMerchantsList] = useState<any[]>([]);
  const [fetchingMerchants, setFetchingMerchants] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    setClientId(credentials.clientId || "");
    setClientSecret(credentials.clientSecret || "");
    setMerchantId(credentials.merchantId || "");
  }, [credentials, unitId]);

  const handleSave = () => {
    saveIfoodCredentials(unitId, {
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      merchantId: merchantId.trim(),
    });
    onCredentialsUpdated();
    setMessage({ type: "success", text: "Credenciais salvas com sucesso!" });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleConnect = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setMessage({
        type: "error",
        text: "Por favor, preencha o Client ID e o Client Secret para conectar ao iFood.",
      });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      saveIfoodCredentials(unitId, {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        merchantId: merchantId.trim(),
      });
      onCredentialsUpdated();

      await IfoodService.authenticate({
        ...credentials,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        merchantId: merchantId.trim(),
      });
      onTokenUpdated();
      setMessage({ type: "success", text: "Autenticado com sucesso no iFood!" });
      // Tenta listar as lojas automaticamente
      handleListMerchants();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro ao conectar com o iFood." });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyManualToken = async () => {
    if (!manualToken.trim()) return;
    try {
      IfoodService.setManualToken(unitId, manualToken.trim());
      onTokenUpdated();
      setMessage({ type: "success", text: "Token Bearer aplicado com sucesso!" });
      setManualToken("");
      // Busca lojas
      handleListMerchants();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro ao aplicar token." });
    }
  };

  const handleListMerchants = async () => {
    setFetchingMerchants(true);
    try {
      const stores = await IfoodService.getMerchants(unitId);
      setMerchantsList(stores);
      if (stores && stores.length > 0) {
        setMessage({
          type: "success",
          text: `Encontradas ${stores.length} loja(s) vinculadas no seu iFood!`,
        });
      }
    } catch (err: any) {
      console.warn(err);
    } finally {
      setFetchingMerchants(false);
    }
  };

  const handleSelectMerchant = (m: any) => {
    const id = m.id || m.merchantId;
    setMerchantId(id);
    saveIfoodCredentials(unitId, {
      merchantId: id,
    });
    onCredentialsUpdated();
    setMessage({
      type: "success",
      text: `Loja "${m.name || id}" selecionada como ativa para esta unidade!`,
    });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleDisconnect = () => {
    IfoodService.disconnect(unitId);
    onTokenUpdated();
    setMerchantsList([]);
    setMessage({ type: "info", text: "Desconectado do iFood." });
  };

  const isConnected = tokenState.status === "connected";
  const expiresMinutes = tokenState.expiresAt
    ? Math.max(0, Math.round((tokenState.expiresAt - Date.now()) / 60000))
    : 0;

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-md ${
                isConnected
                  ? "bg-emerald-600 shadow-emerald-950/20"
                  : "bg-zinc-700 shadow-zinc-950/20"
              }`}
            >
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                  Status da Conexão iFood
                </h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                    isConnected
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    }`}
                  />
                  {isConnected ? "Conectado & Token Ativo" : "Não Conectado (Sem Credenciais)"}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {isConnected
                  ? `Token Bearer ativo com validade de mais ~${expiresMinutes} minutos.`
                  : "Informe seu Client ID e Client Secret ou cole um Token Bearer válido."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isConnected && (
              <button
                onClick={handleDisconnect}
                className="px-3.5 py-2 text-xs font-medium rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition flex items-center gap-1.5"
              >
                <Unplug className="w-3.5 h-3.5" />
                Desconectar
              </button>
            )}
            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {isConnected ? "Renovar Conexão" : "Conectar ao iFood"}
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
              message.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                : message.type === "error"
                ? "bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                : "bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
            }`}
          >
            {message.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {message.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}
      </div>

      {/* Lojas Detectadas Automaticamente (se conectou com sucesso) */}
      {isConnected && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-2">
                <Store className="w-4 h-4 text-red-600" />
                Lojas Autorizadas no iFood
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Selecione qual loja corresponde à unidade atual ({credentials.unitName}).
              </p>
            </div>
            <button
              onClick={handleListMerchants}
              disabled={fetchingMerchants}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${fetchingMerchants ? "animate-spin" : ""}`} />
              Buscar Lojas
            </button>
          </div>

          {merchantsList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {merchantsList.map((m: any) => {
                const id = m.id || m.merchantId;
                const isSelected = merchantId === id;
                return (
                  <div
                    key={id}
                    onClick={() => handleSelectMerchant(m)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? "border-red-600 bg-red-50/50 dark:bg-red-950/20 shadow-sm"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                        {m.name || "Loja iFood"}
                      </span>
                      {isSelected && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 text-white">
                          Ativa
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400 block truncate">
                      ID: {id}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
              Clique em "Buscar Lojas" para consultar suas lojas cadastradas via API.
            </div>
          )}
        </div>
      )}

      {/* Formulário: Client ID & Secret */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
              1. Credenciais da Loja ({credentials.unitName})
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Geradas no Portal do Desenvolvedor iFood (developer.ifood.com.br).
            </p>
          </div>
          <a
            href="https://developer.ifood.com.br/pt-BR/docs/references#authentication"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 hover:underline"
          >
            Portal do Desenvolvedor
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-zinc-400" />
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Cole seu Client ID aqui..."
              className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-zinc-400" />
              Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Cole seu Client Secret aqui..."
              className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
              Merchant ID (ID da Loja no iFood)
            </label>
            <input
              type="text"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              placeholder="UUID da sua loja no iFood (ex: b0954b6b-f99c-44b6-ba1e-987f32b2b22a)..."
              className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 transition"
          >
            Salvar Chaves
          </button>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Conectando..." : "Autenticar & Conectar Loja"}
          </button>
        </div>
      </div>

      {/* Opção Alternativa: Colar Token Bearer Diretamente */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-3">
        <div>
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-600" />
            2. Ou Cole um Access Token (Bearer Token)
          </h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Se você já gerou um token no Swagger da documentação do iFood, cole-o aqui para conectar imediatamente.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
            className="flex-1 text-xs font-mono px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button
            onClick={handleApplyManualToken}
            disabled={!manualToken.trim()}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition disabled:opacity-40"
          >
            Aplicar Token
          </button>
        </div>
      </div>
    </div>
  );
}
