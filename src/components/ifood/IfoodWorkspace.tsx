"use client";

import React, { useState, useEffect } from "react";
import { useUnit } from "@/contexts/UnitContext";
import { IfoodUnitId, IfoodCredentials, IfoodTokenState } from "@/types/ifood";
import { loadIfoodCredentials } from "@/config/ifoodCredentials";
import { IfoodService } from "@/services/ifoodService";
import { IfoodAuthTab } from "./tabs/IfoodAuthTab";
import { IfoodMerchantTab } from "./tabs/IfoodMerchantTab";
import { IfoodOrdersTab } from "./tabs/IfoodOrdersTab";
import { IfoodFinancialTab } from "./tabs/IfoodFinancialTab";
import { IfoodCatalogTab } from "./tabs/IfoodCatalogTab";
import { IfoodShippingTab } from "./tabs/IfoodShippingTab";
import { IfoodReviewsTab } from "./tabs/IfoodReviewsTab";
import { IfoodApiExplorerTab } from "./tabs/IfoodApiExplorerTab";
import {
  ShieldCheck,
  Store,
  ShoppingBag,
  DollarSign,
  UtensilsCrossed,
  Bike,
  Star,
  Terminal,
  Building,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export function IfoodWorkspace() {
  const { currentUnit } = useUnit();
  // Se 'all' for selecionado no contexto global, adotamos 'teixeira' como padrão para chamadas de API de loja
  const activeUnitId: IfoodUnitId =
    currentUnit === "all" ? "teixeira" : (currentUnit as IfoodUnitId);

  const [credentials, setCredentials] = useState<IfoodCredentials>(() =>
    loadIfoodCredentials(activeUnitId)
  );

  const [tokenState, setTokenState] = useState<IfoodTokenState>(() =>
    IfoodService.getTokenState(activeUnitId)
  );

  const isConnected = tokenState.status === "connected" && Boolean(credentials.isConfigured);

  const [activeTab, setActiveTab] = useState<
    "auth" | "merchant" | "orders" | "financial" | "catalog" | "shipping" | "reviews" | "explorer"
  >(() => (credentials.isConfigured ? "orders" : "auth"));

  useEffect(() => {
    setCredentials(loadIfoodCredentials(activeUnitId));
    setTokenState(IfoodService.getTokenState(activeUnitId));
  }, [activeUnitId]);

  const refreshCredentials = () => {
    setCredentials(loadIfoodCredentials(activeUnitId));
  };

  const refreshTokenState = () => {
    setTokenState(IfoodService.getTokenState(activeUnitId));
  };

interface TabItem {
  id: "orders" | "financial" | "merchant" | "catalog" | "shipping" | "reviews" | "auth" | "explorer";
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const TABS: TabItem[] = [
  { id: "orders", label: "Pedidos ao Vivo", icon: ShoppingBag, badge: "3" },
  { id: "financial", label: "Financeiro v3.0", icon: DollarSign },
  { id: "merchant", label: "Loja & Operação", icon: Store },
  { id: "catalog", label: "Cardápio & Estoque", icon: UtensilsCrossed },
  { id: "shipping", label: "iFood Entrega", icon: Bike },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "auth", label: "Conexão & OAuth", icon: ShieldCheck },
  { id: "explorer", label: "API Explorer", icon: Terminal },
];

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-red-600 via-red-700 to-rose-700 rounded-2xl p-6 text-white shadow-xl shadow-red-950/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white/20 text-white backdrop-blur">
                iFood Merchant API v1.0 / v2.0 / v3.0
              </span>
              <span
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium backdrop-blur ${
                  isConnected
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                    : "bg-amber-500/20 text-amber-200 border border-amber-400/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  }`}
                />
                {isConnected ? "Conexão Ativa" : "Demonstração / Configurar"}
              </span>
            </div>

            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              iFood Integration Hub
            </h1>

            <p className="text-xs text-red-100/90 max-w-xl">
              Gestão centralizada de pedidos em tempo real, conciliação financeira de repasses, controle de estoque do cardápio e solicitação de entregadores.
            </p>
          </div>

          {/* Unidade Ativa Indicator */}
          <div className="bg-black/20 backdrop-blur-md rounded-xl p-3 border border-white/10 text-xs self-start md:self-auto min-w-[200px]">
            <div className="flex items-center gap-2 text-red-200 text-[11px] mb-1">
              <Building className="w-3.5 h-3.5" />
              <span>Unidade Integrada:</span>
            </div>
            <div className="font-bold text-white text-sm">
              {credentials.unitName}
            </div>
            <div className="text-[10px] text-red-200/80 font-mono mt-0.5 truncate">
              ID: {credentials.merchantId}
            </div>
          </div>
        </div>
      </div>

      {/* Alert se não configurado */}
      {!isConnected && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1 space-y-1">
            <span className="font-bold text-sm block text-amber-900 dark:text-amber-200">
              Modo Demonstração Ativo (Dados Fictícios)
            </span>
            <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
              Como as chaves oficiais da sua loja do iFood (Client ID e Client Secret) ainda não foram informadas, o sistema está exibindo produtos, pedidos e faturamento fictícios de exemplo.
            </p>
            <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100 pt-0.5">
              👉 Para carregar o cardápio real da sua loja, pedidos ao vivo e faturamento oficial, insira as chaves na aba <strong>Conexão & OAuth</strong> ou me envie aqui no chat!
            </p>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-1 overflow-x-auto pb-px">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-lg transition whitespace-nowrap border-b-2 relative ${
                isActive
                  ? "border-red-600 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-red-600 text-white dark:bg-red-500">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === "orders" && (
          <IfoodOrdersTab unitId={activeUnitId} credentials={credentials} />
        )}
        {activeTab === "financial" && (
          <IfoodFinancialTab unitId={activeUnitId} credentials={credentials} />
        )}
        {activeTab === "merchant" && (
          <IfoodMerchantTab unitId={activeUnitId} credentials={credentials} />
        )}
        {activeTab === "catalog" && (
          <IfoodCatalogTab unitId={activeUnitId} credentials={credentials} />
        )}
        {activeTab === "shipping" && (
          <IfoodShippingTab unitId={activeUnitId} credentials={credentials} />
        )}
        {activeTab === "reviews" && (
          <IfoodReviewsTab unitId={activeUnitId} credentials={credentials} />
        )}
        {activeTab === "auth" && (
          <IfoodAuthTab
            unitId={activeUnitId}
            credentials={credentials}
            onCredentialsUpdated={refreshCredentials}
            tokenState={tokenState}
            onTokenUpdated={refreshTokenState}
          />
        )}
        {activeTab === "explorer" && (
          <IfoodApiExplorerTab unitId={activeUnitId} credentials={credentials} />
        )}
      </div>
    </div>
  );
}
