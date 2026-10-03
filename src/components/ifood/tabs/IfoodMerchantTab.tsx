"use client";

import React, { useState, useEffect } from "react";
import { IfoodCredentials, IfoodMerchant, IfoodUnitId } from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import {
  Store,
  Clock,
  MapPin,
  PauseCircle,
  PlayCircle,
  CheckCircle,
  RefreshCw,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
}

export function IfoodMerchantTab({ unitId, credentials }: Props) {
  const [merchant, setMerchant] = useState<IfoodMerchant | null>(null);
  const [loading, setLoading] = useState(false);
  const [prepTime, setPrepTime] = useState<number>(30);
  const [updatingPrep, setUpdatingPrep] = useState(false);
  const [pauseDuration, setPauseDuration] = useState<number>(30);
  const [pauseReason, setPauseReason] = useState<string>("Cozinha com alta demanda temporária");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const merchantId = credentials.merchantId || "b0954b6b-f99c-44b6-ba1e-987f32b2b22a";

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await IfoodService.getMerchantDetails(unitId, merchantId);
      setMerchant(data);
      if (data?.preparationTimeMinutes) {
        setPrepTime(data.preparationTimeMinutes);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [unitId, merchantId]);

  const handleUpdatePrepTime = async (minutes: number) => {
    setUpdatingPrep(true);
    try {
      await IfoodService.updatePreparationTime(unitId, merchantId, minutes);
      setPrepTime(minutes);
      setActionSuccess(`Tempo de preparo ajustado para ${minutes} minutos no iFood!`);
      setTimeout(() => setActionSuccess(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingPrep(false);
    }
  };

  const handlePauseStore = async () => {
    setLoading(true);
    try {
      await IfoodService.setInterruption(unitId, merchantId, pauseDuration, pauseReason);
      if (merchant) {
        setMerchant({ ...merchant, status: "PAUSED" });
      }
      setActionSuccess(`Loja pausada por ${pauseDuration} minutos no iFood.`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeStore = async () => {
    setLoading(true);
    try {
      if (merchant) {
        setMerchant({ ...merchant, status: "AVAILABLE" });
      }
      setActionSuccess("Loja reaberta com sucesso no iFood!");
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-red-600/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 flex items-center justify-center font-bold">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                  {merchant?.name || "Loja iFood Não Conectada"}
                </h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    merchant?.status === "AVAILABLE"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : merchant?.status === "PAUSED"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {merchant?.status === "AVAILABLE"
                    ? "Aberta / Recebendo Pedidos"
                    : merchant?.status === "PAUSED"
                    ? "Pausada Temporariamente"
                    : merchant ? "Fechada" : "Desconectada"}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1">
                <MapPin className="w-3.5 h-3.5" />
                {merchant?.address?.formattedAddress || "Conecte sua conta do iFood para carregar os dados reais da sua unidade."}
              </p>
            </div>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="self-start md:self-auto px-3 py-1.5 text-xs font-medium rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar Status
          </button>
        </div>

        {actionSuccess && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
      </div>

      {/* Grid: Tempo de Preparo & Controle de Pausa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Tempo de Preparo */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-600" />
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                Tempo de Preparo (Cozinha)
              </h4>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {prepTime} min
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Ajuste em tempo real o tempo estimado que o iFood exibe aos clientes no aplicativo antes de pedir.
          </p>

          <div className="grid grid-cols-5 gap-2 pt-1">
            {[15, 20, 30, 45, 60].map((min) => (
              <button
                key={min}
                onClick={() => handleUpdatePrepTime(min)}
                disabled={updatingPrep}
                className={`py-2 text-xs font-semibold rounded-lg border transition ${
                  prepTime === min
                    ? "bg-red-600 text-white border-red-600 shadow-sm"
                    : "bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-red-400"
                }`}
              >
                {min}m
              </button>
            ))}
          </div>
        </div>

        {/* Pausa Operacional Emergencial */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PauseCircle className="w-4 h-4 text-amber-500" />
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                Pausa Operacional Emergencial
              </h4>
            </div>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Caso a cozinha esteja sobrecarregada, pause a loja temporariamente sem perder relevância.
          </p>

          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2">
              {[15, 30, 45, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => setPauseDuration(m)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition ${
                    pauseDuration === m
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent font-semibold"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {merchant?.status === "PAUSED" ? (
                <button
                  onClick={handleResumeStore}
                  disabled={loading}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-1.5 transition"
                >
                  <PlayCircle className="w-4 h-4" />
                  Reabrir Loja Agora
                </button>
              ) : (
                <button
                  onClick={handlePauseStore}
                  disabled={loading}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-sm flex items-center justify-center gap-1.5 transition"
                >
                  <PauseCircle className="w-4 h-4" />
                  Pausar Loja por {pauseDuration} min
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
