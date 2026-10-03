"use client";

import React, { useState, useEffect } from "react";
import { IfoodCredentials, IfoodCatalogProduct, IfoodUnitId } from "@/types/ifood";
import { IfoodService } from "@/services/ifoodService";
import {
  UtensilsCrossed,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Tag,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";

interface Props {
  unitId: IfoodUnitId;
  credentials: IfoodCredentials;
}

export function IfoodCatalogTab({ unitId, credentials }: Props) {
  const [products, setProducts] = useState<IfoodCatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const merchantId = credentials.merchantId || "b0954b6b-f99c-44b6-ba1e-987f32b2b22a";

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const data = await IfoodService.getCatalogProducts(unitId, merchantId);
      setProducts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [unitId, merchantId]);

  const handleToggleStatus = async (product: IfoodCatalogProduct) => {
    setTogglingId(product.id);
    const newStatus = product.status === "AVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
    try {
      await IfoodService.updateProductStatus(unitId, merchantId, product.id, newStatus);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: newStatus } : p))
      );
      setFeedback(
        `Item "${product.name}" agora está ${newStatus === "AVAILABLE" ? "DISPONÍVEL" : "PAUSADO / ESGOTADO"} no iFood!`
      );
      setTimeout(() => setFeedback(null), 3500);
    } catch (err: any) {
      setFeedback(`Erro ao atualizar item: ${err.message}`);
    } finally {
      setTogglingId(null);
    }
  };

  const categories = Array.from(new Set(products.map((p) => p.categoryName)));

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.externalCode && p.externalCode.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCat = selectedCategory === "ALL" || p.categoryName === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const availableCount = products.filter((p) => p.status === "AVAILABLE").length;
  const pausedCount = products.filter((p) => p.status === "UNAVAILABLE").length;

  return (
    <div className="space-y-5">
      {/* Header & Status Summary */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Cardápio & Controle de Estoque (Catalog v2.0)
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Gerencie a disponibilidade instantânea de pratos e acompanhamentos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {availableCount} Disponíveis
          </span>
          <span className="px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            {pausedCount} Pausados
          </span>
          <button
            onClick={loadCatalog}
            disabled={loading}
            className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome do produto ou código SKU..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedCategory("ALL")}
            className={`px-3 py-2 text-xs rounded-lg font-medium whitespace-nowrap transition ${
              selectedCategory === "ALL"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            Todas
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-2 text-xs rounded-lg font-medium whitespace-nowrap transition ${
                selectedCategory === cat
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                  : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((prod) => {
          const isAvailable = prod.status === "AVAILABLE";
          const isToggling = togglingId === prod.id;
          return (
            <div
              key={prod.id}
              className={`bg-white dark:bg-zinc-900 border rounded-xl p-4 shadow-sm flex flex-col justify-between transition ${
                isAvailable
                  ? "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                  : "border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10 opacity-75"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    {prod.categoryName}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      isAvailable
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                    }`}
                  >
                    {isAvailable ? "Ativo no Cardápio" : "Pausado (Sem Estoque)"}
                  </span>
                </div>

                <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 mb-1">
                  {prod.name}
                </h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-3">
                  {prod.description}
                </p>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-zinc-400 block">Preço de Venda</span>
                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    R$ {prod.price.toFixed(2)}
                  </span>
                </div>

                <button
                  onClick={() => handleToggleStatus(prod)}
                  disabled={isToggling}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-sm ${
                    isAvailable
                      ? "bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-900/60"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {isToggling ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : isAvailable ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      Pausar Item
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      Ativar Item
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
