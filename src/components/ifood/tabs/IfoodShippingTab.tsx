"use client";

import React, { useState, useEffect } from "react";
import { IfoodCredentials, IfoodDeliveryAvailability, IfoodUnitId } from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import {
  Truck,
  Bike,
  Clock,
  DollarSign,
  Send,
  CheckCircle,
  MapPin,
  User,
  Phone,
  Package,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
}

export function IfoodShippingTab({ unitId, credentials }: Props) {
  const [availability, setAvailability] = useState<IfoodDeliveryAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState<{ trackingCode: string; message: string } | null>(null);

  // Form para solicitar motoboy do iFood para pedido externo (WhatsApp)
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderValue, setOrderValue] = useState("");
  const [itemsDescription, setItemsDescription] = useState("");

  const merchantId = credentials.merchantId || "b0954b6b-f99c-44b6-ba1e-987f32b2b22a";

  const loadAvailability = async () => {
    setLoading(true);
    try {
      const data = await IfoodService.getDeliveryAvailabilities(unitId, merchantId);
      setAvailability(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAvailability();
  }, [unitId, merchantId]);

  const handleRequestDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !deliveryAddress) return;

    setSubmitting(true);
    setSuccessResult(null);
    try {
      const res = await IfoodService.requestDriverForExternalOrder(unitId, merchantId, {
        customerName,
        customerPhone,
        deliveryAddress,
        orderValue: parseFloat(orderValue) || 50.0,
        itemsDescription,
      });

      setSuccessResult(res);
      // Limpa formulário
      setCustomerName("");
      setCustomerPhone("");
      setDeliveryAddress("");
      setOrderValue("");
      setItemsDescription("");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Disponibilidade da Malha Logística iFood */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-red-600/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 flex items-center justify-center font-bold">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                  iFood Entrega Sob Demanda (Shipping v1.0)
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Motoboys Disponíveis
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Utilize os entregadores parceiros do iFood para entregar pedidos recebidos pelo WhatsApp ou Balcão.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-2.5 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div>
              <span className="text-[10px] text-zinc-400 block font-medium">Tarifa Estimada</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                R$ {availability?.estimatedFee.toFixed(2) || "7.90"}
              </span>
            </div>
            <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-700" />
            <div>
              <span className="text-[10px] text-zinc-400 block font-medium">Tempo de Chegada</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                ~{availability?.estimatedTimeMinutes || 25} min
              </span>
            </div>
            <button
              onClick={loadAvailability}
              disabled={loading}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {successResult && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successResult.message}</span>
          </div>
          <p className="pl-6 text-zinc-600 dark:text-zinc-300">
            Código de Rastreamento: <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">{successResult.trackingCode}</span>. O motoboy mais próximo foi acionado e já está em deslocamento para a loja.
          </p>
        </div>
      )}

      {/* Formulário de Chamada de Motoboy */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
        <div>
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
            Solicitar Entregador para Pedido Externo
          </h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Preencha os dados do cliente para despachar o motoboy do iFood até a sua loja e realizar a entrega.
          </p>
        </div>

        <form onSubmit={handleRequestDriver} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                Nome do Cliente
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="ex: João Silva"
                className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-zinc-400" />
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="ex: (73) 99999-8888"
                className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                Endereço Completo de Entrega
              </label>
              <input
                type="text"
                required
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="ex: Rua das Flores, 250, Apto 101 - Centro"
                className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-zinc-400" />
                Valor Total do Pedido (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={orderValue}
                onChange={(e) => setOrderValue(e.target.value)}
                placeholder="ex: 75.00"
                className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-zinc-400" />
                Descrição dos Itens / Pacote
              </label>
              <input
                type="text"
                value={itemsDescription}
                onChange={(e) => setItemsDescription(e.target.value)}
                placeholder="ex: 1x House Bacon + 1x Batata + 1x Refri"
                className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition flex items-center gap-2 disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 ${submitting ? "animate-spin" : ""}`} />
              {submitting ? "Acionando Motoboy..." : "Chamar Entregador iFood Agora"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
