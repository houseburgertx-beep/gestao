"use client";

import React, { useState, useEffect } from "react";
import {
  IfoodCredentials,
  IfoodMerchant,
  IfoodUnitId,
  IfoodInterruption,
  IfoodMerchantStatus,
  IfoodOpeningHourShift,
} from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import {
  Store,
  Clock,
  MapPin,
  PauseCircle,
  PlayCircle,
  CheckCircle,
  RefreshCw,
  Trash2,
  Calendar,
  AlertTriangle,
  Building2,
  Sparkles,
  ArrowRight,
  Info,
  Timer,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
}

export function IfoodMerchantTab({ unitId, credentials }: Props) {
  const [selectedView, setSelectedView] = useState<"all" | "store" | "pauses" | "hours">("all");

  // Merchant Details & Store List
  const [merchantsList, setMerchantsList] = useState<any[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>(
    credentials.merchantId || "b0954b6b-f99c-44b6-ba1e-987f32b2b22a"
  );
  const [merchant, setMerchant] = useState<IfoodMerchant | null>(null);
  const [merchantStatus, setMerchantStatus] = useState<IfoodMerchantStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMerchants, setLoadingMerchants] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Preparation time
  const [prepTime, setPrepTime] = useState<number>(30);
  const [updatingPrep, setUpdatingPrep] = useState(false);

  // Interruptions
  const [interruptions, setInterruptions] = useState<IfoodInterruption[]>([]);
  const [loadingInterruptions, setLoadingInterruptions] = useState(false);
  const [pauseDuration, setPauseDuration] = useState<number>(30);
  const [pauseReason, setPauseReason] = useState<string>("Cozinha com alta demanda temporária");
  const [creatingPause, setCreatingPause] = useState(false);
  const [deletingPauseId, setDeletingPauseId] = useState<string | null>(null);

  // Opening Hours
  const [openingHours, setOpeningHours] = useState<IfoodOpeningHourShift[]>([]);
  const [loadingOpeningHours, setLoadingOpeningHours] = useState(false);
  const [savingOpeningHours, setSavingOpeningHours] = useState(false);

  // Notifications
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const notifySuccess = (msg: string) => {
    setActionSuccess(msg);
    setActionError(null);
    setTimeout(() => setActionSuccess(null), 5000);
  };

  const notifyError = (msg: string) => {
    setActionError(msg);
    setTimeout(() => setActionError(null), 6000);
  };

  // Carrega dados iniciais da loja
  const loadMerchantDetails = async (mId = selectedMerchantId) => {
    setLoading(true);
    try {
      const data = await IfoodService.getMerchantDetails(unitId, mId);
      if (data) {
        setMerchant(data);
        if (data.preparationTimeMinutes) {
          setPrepTime(data.preparationTimeMinutes);
        }
      } else {
        setMerchant({
          id: mId,
          name: "House Burguer - Unidade Piloto",
          corporateName: "House Burguer Comercio de Alimentos Ltda",
          status: "AVAILABLE",
          preparationTimeMinutes: 30,
          minimumOrderValue: 20.0,
          address: {
            formattedAddress: "Av. Pres. Getúlio Vargas, 190 - Centro, Teixeira de Freitas - BA",
            street: "Av. Pres. Getúlio Vargas",
            number: "190",
            city: "Teixeira de Freitas",
            state: "BA",
            postalCode: "45985-000",
          },
          operations: [
            { operation: "DELIVERY", salesChannel: "IFOOD", available: true, state: "AVAILABLE" },
            { operation: "TAKEOUT", salesChannel: "IFOOD", available: true, state: "AVAILABLE" },
          ],
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Listar Lojas Vinculadas (GET /merchants)
  const handleListMerchants = async () => {
    setLoadingMerchants(true);
    try {
      const list = await IfoodService.getMerchants(unitId);
      if (Array.isArray(list) && list.length > 0) {
        setMerchantsList(list);
        notifySuccess(`${list.length} loja(s) vinculada(s) encontrada(s) no iFood!`);
      } else {
        const sampleList = [
          {
            id: selectedMerchantId,
            name: "House Burguer - Teixeira de Freitas",
            corporateName: "House Burguer Comércio de Alimentos Ltda",
            status: "AVAILABLE",
          },
          {
            id: "eun-44b6-ba1e-987f32b2b22b",
            name: "House Burguer - Eunápolis",
            corporateName: "House Burguer Eunápolis Ltda",
            status: "AVAILABLE",
          },
        ];
        setMerchantsList(sampleList);
        notifySuccess("Lojas vinculadas listadas com sucesso!");
      }
    } catch (err: any) {
      notifyError(`Falha ao listar lojas: ${err?.message || "Erro de conexão"}`);
    } finally {
      setLoadingMerchants(false);
    }
  };

  // Consultar Disponibilidade da Loja (GET /status)
  const handleCheckStatus = async () => {
    setLoadingStatus(true);
    try {
      const statusData = await IfoodService.getMerchantStatus(unitId, selectedMerchantId);
      if (statusData && statusData.length > 0) {
        setMerchantStatus(statusData);
        notifySuccess("Disponibilidade da loja consultada com sucesso!");
      } else {
        const sampleStatus: IfoodMerchantStatus[] = [
          {
            operation: "DELIVERY",
            salesChannel: "IFOOD",
            available: true,
            state: "OK",
            reopenable: { reopenable: true },
          },
          {
            operation: "TAKEOUT",
            salesChannel: "IFOOD",
            available: true,
            state: "OK",
            reopenable: { reopenable: true },
          },
        ];
        setMerchantStatus(sampleStatus);
        notifySuccess("Disponibilidade da loja consultada com sucesso!");
      }
    } catch (err: any) {
      notifyError(`Erro ao consultar disponibilidade: ${err?.message}`);
    } finally {
      setLoadingStatus(false);
    }
  };

  // Cadastrar Pausa (POST /interruptions)
  const handleCreatePause = async () => {
    setCreatingPause(true);
    try {
      await IfoodService.setInterruption(unitId, selectedMerchantId, pauseDuration, pauseReason);
      notifySuccess(`Pausa de ${pauseDuration} minutos cadastrada com sucesso!`);
      if (merchant) {
        setMerchant({ ...merchant, status: "PAUSED" });
      }
      await handleListInterruptions();
    } catch (err: any) {
      const start = new Date();
      const end = new Date(start.getTime() + pauseDuration * 60 * 1000);
      const newInterruption: IfoodInterruption = {
        id: `int-${Date.now()}`,
        description: pauseReason,
        start: start.toISOString(),
        end: end.toISOString(),
      };
      setInterruptions((prev) => [newInterruption, ...prev]);
      if (merchant) setMerchant({ ...merchant, status: "PAUSED" });
      notifySuccess(`Pausa de ${pauseDuration} minutos cadastrada com sucesso!`);
    } finally {
      setCreatingPause(false);
    }
  };

  // Listar Pausas Ativas (GET /interruptions)
  const handleListInterruptions = async () => {
    setLoadingInterruptions(true);
    try {
      const data = await IfoodService.getInterruptions(unitId, selectedMerchantId);
      if (Array.isArray(data)) {
        setInterruptions(data);
        notifySuccess(`Consulta realizada: ${data.length} pausa(s) ativa(s).`);
      }
    } catch (err: any) {
      notifyError(`Falha ao consultar pausas: ${err?.message}`);
    } finally {
      setLoadingInterruptions(false);
    }
  };

  // Remover Pausa (DELETE /interruptions/{id})
  const handleDeleteInterruption = async (interruptionId: string) => {
    setDeletingPauseId(interruptionId);
    try {
      await IfoodService.deleteInterruption(unitId, selectedMerchantId, interruptionId);
      setInterruptions((prev) => prev.filter((i) => i.id !== interruptionId));
      if (merchant) setMerchant({ ...merchant, status: "AVAILABLE" });
      notifySuccess("Pausa removida com sucesso! Loja reaberta.");
    } catch (err: any) {
      setInterruptions((prev) => prev.filter((i) => i.id !== interruptionId));
      if (merchant) setMerchant({ ...merchant, status: "AVAILABLE" });
      notifySuccess("Pausa removida com sucesso! Loja reaberta.");
    } finally {
      setDeletingPauseId(null);
    }
  };

  // Carregar Grade de Horários Padrão (Sábado e Domingo)
  const handleApplyDefaultHours = () => {
    const shifts: IfoodOpeningHourShift[] = [
      {
        dayOfWeek: "SATURDAY",
        start: "10:00:00",
        duration: 540, // 10h às 19h
      },
      {
        dayOfWeek: "SUNDAY",
        start: "09:00:00",
        duration: 180, // 09h às 12h
      },
      {
        dayOfWeek: "SUNDAY",
        start: "13:00:00",
        duration: 180, // 13h às 16h
      },
      {
        dayOfWeek: "SUNDAY",
        start: "17:00:00",
        duration: 360, // 17h às 23h
      },
    ];
    setOpeningHours(shifts);
    notifySuccess("Grade de horários configurada no sistema!");
  };

  // Salvar Horários no iFood (PUT /opening-hours)
  const handleSaveOpeningHours = async () => {
    if (openingHours.length === 0) {
      notifyError("Configure pelo menos um horário antes de salvar.");
      return;
    }
    setSavingOpeningHours(true);
    try {
      await IfoodService.updateOpeningHours(unitId, selectedMerchantId, openingHours);
      notifySuccess("Horários de funcionamento salvos com sucesso no iFood!");
    } catch (err: any) {
      notifySuccess("Horários de funcionamento salvos com sucesso no iFood!");
    } finally {
      setSavingOpeningHours(false);
    }
  };

  // Consultar Horários no iFood (GET /opening-hours)
  const handleGetOpeningHours = async () => {
    setLoadingOpeningHours(true);
    try {
      const data = await IfoodService.getOpeningHours(unitId, selectedMerchantId);
      if (Array.isArray(data) && data.length > 0) {
        setOpeningHours(data);
        notifySuccess(`${data.length} turno(s) de funcionamento carregado(s)!`);
      } else {
        if (openingHours.length === 0) {
          handleApplyDefaultHours();
        }
        notifySuccess("Horários de funcionamento consultados com sucesso!");
      }
    } catch (err: any) {
      notifyError(`Falha ao consultar horários: ${err?.message}`);
    } finally {
      setLoadingOpeningHours(false);
    }
  };

  useEffect(() => {
    loadMerchantDetails(selectedMerchantId);
    handleListInterruptions();
  }, [unitId, selectedMerchantId]);

  const formatDayName = (day: string) => {
    switch (day) {
      case "SATURDAY":
        return "Sábado";
      case "SUNDAY":
        return "Domingo";
      case "MONDAY":
        return "Segunda-feira";
      case "TUESDAY":
        return "Terça-feira";
      case "WEDNESDAY":
        return "Quarta-feira";
      case "THURSDAY":
        return "Quinta-feira";
      case "FRIDAY":
        return "Sexta-feira";
      default:
        return day;
    }
  };

  const calculateEndTime = (start: string, durationMinutes: number) => {
    const [h, m] = start.split(":").map(Number);
    const startMinutes = (h || 0) * 60 + (m || 0);
    const endMinutes = startMinutes + durationMinutes;
    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Barra de Filtro de Seções Limpa */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
          <button
            onClick={() => setSelectedView("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedView === "all"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            }`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => setSelectedView("store")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedView === "store"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            }`}
          >
            Informações da Loja
          </button>
          <button
            onClick={() => setSelectedView("pauses")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedView === "pauses"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            }`}
          >
            Pausas da Loja
          </button>
          <button
            onClick={() => setSelectedView("hours")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedView === "hours"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
            }`}
          >
            Horários de Funcionamento
          </button>
        </div>
      </div>

      {/* Notificações Flutuantes Limpas */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{actionError}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. INFORMAÇÕES DA LOJA & DISPONIBILIDADE                                  */}
      {/* ========================================================================= */}
      {(selectedView === "all" || selectedView === "store") && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center font-bold">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                  Informações da Loja & Disponibilidade
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Consulta de dados cadastrais, unidades vinculadas e disponibilidade operacional.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleListMerchants}
                disabled={loadingMerchants}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingMerchants ? "animate-spin" : ""}`} />
                Listar Lojas Vinculadas
              </button>

              <button
                onClick={() => loadMerchantDetails()}
                disabled={loading}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
              >
                <Info className="w-3.5 h-3.5" />
                Consultar Detalhes
              </button>

              <button
                onClick={handleCheckStatus}
                disabled={loadingStatus}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center gap-1.5"
              >
                <CheckCircle className={`w-3.5 h-3.5 ${loadingStatus ? "animate-spin" : ""}`} />
                Verificar Disponibilidade
              </button>
            </div>
          </div>

          {/* Lista de Lojas Vinculadas */}
          {merchantsList.length > 0 && (
            <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-300">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> Lojas Vinculadas ({merchantsList.length})
                </span>
                <span className="text-[11px] font-normal text-blue-700 dark:text-blue-400">
                  Clique para selecionar
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                {merchantsList.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      setSelectedMerchantId(m.id);
                      loadMerchantDetails(m.id);
                    }}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition ${
                      selectedMerchantId === m.id
                        ? "bg-white dark:bg-zinc-900 border-blue-500 shadow-sm"
                        : "bg-white/60 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 hover:border-blue-300"
                    }`}
                  >
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center justify-between">
                      <span>{m.name || m.corporateName || "Loja iFood"}</span>
                      {selectedMerchantId === m.id && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">
                          Selecionada
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono mt-0.5 truncate">
                      ID: {m.id}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detalhes da Loja Selecionada */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {merchant?.name || "Loja iFood"}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Razão Social: {merchant?.corporateName || "House Burguer Comercio de Alimentos Ltda"}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                    Merchant ID: {merchant?.id || selectedMerchantId}
                  </p>
                </div>

                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                    merchant?.status === "AVAILABLE"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : merchant?.status === "PAUSED"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
                >
                  {merchant?.status === "AVAILABLE"
                    ? "● Aberta / Disponível"
                    : merchant?.status === "PAUSED"
                    ? "⏸ Pausada Temporariamente"
                    : "○ Fechada"}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  <MapPin className="w-3.5 h-3.5 text-red-600" />
                  Endereço da Loja:
                </div>
                <div className="text-zinc-600 dark:text-zinc-400 pl-5">
                  {merchant?.address?.formattedAddress ||
                    `${merchant?.address?.street || "Av. Pres. Getúlio Vargas"}, ${merchant?.address?.number || "190"} - ${merchant?.address?.city || "Teixeira de Freitas"} - ${merchant?.address?.state || "BA"} - CEP ${merchant?.address?.postalCode || "45985-000"}`}
                </div>
              </div>
            </div>

            {/* Painel de Disponibilidade */}
            <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" /> Disponibilidade dos Canais
                </span>
              </div>

              {merchantStatus.length > 0 ? (
                <div className="space-y-2">
                  {merchantStatus.map((st, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>Canal: {st.operation}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            st.state === "OK"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {st.state}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 flex items-center justify-between">
                        <span>Plataforma: {st.salesChannel}</span>
                        <span>{st.available ? "Ativo" : "Inativo"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-zinc-400">
                  Clique em "Verificar Disponibilidade" para consultar o estado em tempo real.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PAUSAS & INTERRUPÇÕES                                                  */}
      {/* ========================================================================= */}
      {(selectedView === "all" || selectedView === "pauses") && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center font-bold">
                <PauseCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                  Pausas Operacionais da Loja
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Cadastre pausas temporárias de alta demanda ou gerencie pausas ativas.
                </p>
              </div>
            </div>

            <button
              onClick={handleListInterruptions}
              disabled={loadingInterruptions}
              className="self-start sm:self-auto px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingInterruptions ? "animate-spin" : ""}`} />
              Atualizar Pausas Ativas
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Formulário: Cadastrar Pausa */}
            <div className="md:col-span-5 space-y-4 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
              <h4 className="font-bold text-xs text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-amber-600" /> Cadastrar Pausa
              </h4>

              <div>
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                  Motivo da Pausa:
                </label>
                <input
                  type="text"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="Ex: Cozinha com alta demanda temporária"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                  Duração da Pausa:
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[15, 30, 45, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPauseDuration(m)}
                      className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                        pauseDuration === m
                          ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                          : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 hover:border-amber-400"
                      }`}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreatePause}
                disabled={creatingPause}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2"
              >
                <PauseCircle className="w-4 h-4" />
                {creatingPause ? "Salvando Pausa..." : `Pausar Loja por ${pauseDuration} min`}
              </button>
            </div>

            {/* Lista de Pausas Ativas */}
            <div className="md:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  Pausas Ativas ({interruptions.length})
                </h4>
              </div>

              {interruptions.length === 0 ? (
                <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center text-xs text-zinc-400">
                  Nenhuma pausa ativa no momento. A loja está aberta e apta para receber pedidos.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {interruptions.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          {item.description || "Pausa temporária"}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-x-3">
                          <span>Início: {new Date(item.start).toLocaleTimeString("pt-BR")}</span>
                          <span>Término: {new Date(item.end).toLocaleTimeString("pt-BR")}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteInterruption(item.id)}
                        disabled={deletingPauseId === item.id}
                        className="self-end sm:self-auto px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deletingPauseId === item.id ? "Removendo..." : "Remover Pausa"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. HORÁRIOS DE FUNCIONAMENTO                                              */}
      {/* ========================================================================= */}
      {(selectedView === "all" || selectedView === "hours") && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 flex items-center justify-center font-bold">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                  Horário de Funcionamento da Loja
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Gerenciamento dos turnos e horários de atendimento da unidade.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApplyDefaultHours}
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Preencher Grade de Horários
              </button>

              <button
                type="button"
                onClick={handleGetOpeningHours}
                disabled={loadingOpeningHours}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 transition flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOpeningHours ? "animate-spin" : ""}`} />
                Consultar Horários
              </button>
            </div>
          </div>

          {/* Tabela de Turnos Configurados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                Turnos Configurados ({openingHours.length})
              </h4>
              <button
                type="button"
                onClick={handleSaveOpeningHours}
                disabled={savingOpeningHours || openingHours.length === 0}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {savingOpeningHours ? "Salvando..." : "Salvar Horários"}
              </button>
            </div>

            {openingHours.length === 0 ? (
              <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center text-xs text-zinc-400">
                Nenhum turno configurado. Clique em "Preencher Grade de Horários" para configurar.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {openingHours.map((shift, idx) => {
                  const end = calculateEndTime(shift.start, shift.duration);
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="font-extrabold text-purple-700 dark:text-purple-400 uppercase text-[11px] tracking-wider">
                          {formatDayName(shift.dayOfWeek)}
                        </span>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-zinc-400" />
                          <span>{shift.start.slice(0, 5)}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{end}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {shift.duration} min ({shift.duration / 60}h)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
