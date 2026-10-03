"use client";

import React, { useState, useEffect } from "react";
import { IfoodCredentials, IfoodOrder, IfoodOrderEventType, IfoodUnitId } from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import {
  ShoppingBag,
  Clock,
  Bike,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChefHat,
  PackageCheck,
  Send,
  User,
  Phone,
  MapPin,
  CreditCard,
  AlertTriangle,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
}

export function IfoodOrdersTab({ unitId, credentials }: Props) {
  const [orders, setOrders] = useState<IfoodOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollingActive, setPollingActive] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "PLACED" | "PREPARATION" | "DISPATCHED">("ALL");

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await IfoodService.getOrders(unitId);
      setOrders(data);
      if (data.length > 0 && !selectedOrderId) {
        setSelectedOrderId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [unitId]);

  // Polling loop simulado / ativo
  useEffect(() => {
    if (!pollingActive) return;
    const interval = setInterval(async () => {
      try {
        const events = await IfoodService.pollEvents(unitId);
        if (events && events.length > 0) {
          // Acknowledge events automaticamente para liberar a fila
          const eventIds = events.map((e) => e.id);
          await IfoodService.acknowledgeEvents(unitId, eventIds);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 20000); // a cada 20s

    return () => clearInterval(interval);
  }, [pollingActive, unitId]);

  const handleOrderAction = async (
    orderId: string,
    action: "confirm" | "startPreparation" | "readyToPickup" | "dispatch" | "requestCancellation"
  ) => {
    setActionLoading(true);
    try {
      await IfoodService.executeOrderAction(unitId, orderId, action);
      const newStatusMap: Record<string, IfoodOrderEventType> = {
        confirm: "CONFIRMED",
        startPreparation: "PREPARATION_STARTED",
        readyToPickup: "READY_TO_PICKUP",
        dispatch: "DISPATCHED",
        requestCancellation: "CANCELLED",
      };

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatusMap[action] || o.status } : o))
      );

      const actionLabels: Record<string, string> = {
        confirm: "Pedido confirmado com sucesso!",
        startPreparation: "Preparo iniciado na cozinha!",
        readyToPickup: "Pedido marcado como pronto para retirada!",
        dispatch: "Pedido despachado para entrega!",
        requestCancellation: "Solicitação de cancelamento enviada!",
      };

      setFeedback(actionLabels[action]);
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback(`Erro ao executar ação: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);

  const filteredOrders = orders.filter((o) => {
    if (filter === "PLACED") return o.status === "PLACED";
    if (filter === "PREPARATION") return o.status === "CONFIRMED" || o.status === "PREPARATION_STARTED";
    if (filter === "DISPATCHED") return o.status === "READY_TO_PICKUP" || o.status === "DISPATCHED";
    return true;
  });

  const getStatusBadge = (status: IfoodOrderEventType) => {
    switch (status) {
      case "PLACED":
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 animate-pulse">Novo Pedido</span>;
      case "CONFIRMED":
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">Confirmado</span>;
      case "PREPARATION_STARTED":
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">Em Preparo</span>;
      case "READY_TO_PICKUP":
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">Pronto</span>;
      case "DISPATCHED":
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">Em Rota</span>;
      case "CANCELLED":
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">Cancelado</span>;
      default:
        return <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controller */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <span
              className={`w-3 h-3 rounded-full block ${
                pollingActive ? "bg-emerald-500 animate-ping" : "bg-zinc-400"
              }`}
            />
            <span
              className={`w-3 h-3 rounded-full absolute inset-0 ${
                pollingActive ? "bg-emerald-500" : "bg-zinc-400"
              }`}
            />
          </div>
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            {pollingActive ? "Monitoramento em Tempo Real Ativo" : "Monitoramento Pausado"}
          </span>
          <span className="text-[11px] text-zinc-400">
            (Events Polling a cada 20s)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPollingActive(!pollingActive)}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium transition"
          >
            {pollingActive ? "Pausar Polling" : "Retomar Polling"}
          </button>
          <button
            onClick={loadOrders}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Main Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Orders List (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex flex-col h-[650px]">
          {/* Filters */}
          <div className="flex items-center gap-1 border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-3">
            {[
              { id: "ALL", label: "Todos" },
              { id: "PLACED", label: "Novos" },
              { id: "PREPARATION", label: "Preparo" },
              { id: "DISPATCHED", label: "Despachados" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                  filter === tab.id
                    ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 font-semibold"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {filteredOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400">
                Nenhum pedido encontrado nesta categoria.
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isSelected = order.id === selectedOrderId;
                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      isSelected
                        ? "border-red-500 bg-red-50/40 dark:bg-red-950/20 shadow-sm"
                        : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/40 dark:bg-zinc-800/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">
                        {order.displayId}
                      </span>
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {order.customer.name}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/60 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>{order.items.length} {order.items.length === 1 ? "item" : "itens"}</span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        R$ {order.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Order Detail & Actions (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col h-[650px] overflow-y-auto">
          {selectedOrder ? (
            <div className="space-y-5">
              {/* Header Info */}
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      Pedido {selectedOrder.displayId}
                    </h3>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                  <span className="text-xs text-zinc-400">
                    Criado há alguns minutos • ID: {selectedOrder.id}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs text-zinc-400 block">Total do Pedido</span>
                  <span className="text-lg font-bold text-red-600 dark:text-red-400">
                    R$ {selectedOrder.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">
                  Ações Rápidas do Pedido
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedOrder.status === "PLACED" && (
                    <button
                      onClick={() => handleOrderAction(selectedOrder.id, "confirm")}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Confirmar Pedido
                    </button>
                  )}

                  {selectedOrder.status === "CONFIRMED" && (
                    <button
                      onClick={() => handleOrderAction(selectedOrder.id, "startPreparation")}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition flex items-center gap-1.5"
                    >
                      <ChefHat className="w-3.5 h-3.5" />
                      Iniciar Preparo
                    </button>
                  )}

                  {selectedOrder.status === "PREPARATION_STARTED" && (
                    <button
                      onClick={() => handleOrderAction(selectedOrder.id, "readyToPickup")}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition flex items-center gap-1.5"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      Pronto p/ Retirada
                    </button>
                  )}

                  {(selectedOrder.status === "PREPARATION_STARTED" || selectedOrder.status === "READY_TO_PICKUP") && (
                    <button
                      onClick={() => handleOrderAction(selectedOrder.id, "dispatch")}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Despachar Pedido
                    </button>
                  )}

                  {selectedOrder.status !== "CANCELLED" && (
                    <button
                      onClick={() => handleOrderAction(selectedOrder.id, "requestCancellation")}
                      disabled={actionLoading}
                      className="px-3 py-1.5 text-xs font-medium rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition flex items-center gap-1 ml-auto"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* Customer & Address */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-800/20 space-y-1.5">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    Cliente
                  </span>
                  <p className="font-medium text-zinc-800 dark:text-zinc-200">{selectedOrder.customer.name}</p>
                  <p className="text-zinc-500 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {selectedOrder.customer.phone?.number || "Sem telefone"}
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-800/20 space-y-1.5">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                    Entrega
                  </span>
                  <p className="text-zinc-700 dark:text-zinc-300">
                    {selectedOrder.deliveryAddress?.formattedAddress}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Bairro: {selectedOrder.deliveryAddress?.neighborhood}
                  </p>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 block">
                  Itens do Pedido ({selectedOrder.items.length})
                </span>
                <div className="space-y-2">
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 text-xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-zinc-900 dark:text-zinc-100">
                        <span>
                          {item.quantity}x {item.name}
                        </span>
                        <span>R$ {item.totalPrice.toFixed(2)}</span>
                      </div>

                      {item.options && item.options.length > 0 && (
                        <div className="mt-1 pl-3 border-l-2 border-red-500/40 space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                          {item.options.map((opt, i) => (
                            <div key={i} className="flex justify-between">
                              <span>+ {opt.quantity}x {opt.name}</span>
                              {opt.price > 0 && <span>+ R$ {opt.price.toFixed(2)}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {item.observations && (
                        <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>Obs: {item.observations}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs space-y-1 text-zinc-600 dark:text-zinc-400">
                <div className="flex justify-between">
                  <span>Subtotal itens</span>
                  <span>R$ {selectedOrder.subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Taxa de entrega</span>
                  <span>R$ {selectedOrder.deliveryFee.toFixed(2)}</span>
                </div>
                {selectedOrder.benefits > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Desconto / Cupom</span>
                    <span>- R$ {selectedOrder.benefits.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-zinc-900 dark:text-zinc-100 pt-1 border-t border-zinc-200 dark:border-zinc-700 text-sm">
                  <span>Total</span>
                  <span>R$ {selectedOrder.total.toFixed(2)}</span>
                </div>
                <div className="text-[11px] text-zinc-400 pt-1 flex items-center gap-1">
                  <CreditCard className="w-3 h-3" />
                  Forma de pagamento: {selectedOrder.payments.map((p) => p.name).join(", ")}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 text-xs">
              <ShoppingBag className="w-10 h-10 stroke-[1.2] mb-2 text-zinc-300 dark:text-zinc-600" />
              Selecione um pedido ao lado para visualizar os detalhes e comandas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
