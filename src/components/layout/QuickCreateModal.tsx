"use client";

import React, { useState } from "react";
import { Plus, Check, Calendar, DollarSign, Building2, CheckSquare, TrendingUp, Receipt } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { formatCurrency } from "@/lib/utils";
import { UnitId } from "@/types";

interface QuickCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "payable" | "supplier" | "task" | "revenue" | "tax";
}

export function QuickCreateModal({ isOpen, onClose, defaultTab = "payable" }: QuickCreateModalProps) {
  const { currentUnit } = useUnit();
  const [activeTab, setActiveTab] = useState<"payable" | "supplier" | "task" | "revenue" | "tax">(defaultTab);

  // Payable state
  const [payableUnit, setPayableUnit] = useState<Exclude<UnitId, "all">>(
    currentUnit === "all" ? "eunapolis" : currentUnit
  );
  const [supplierId, setSupplierId] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Matéria-prima");
  const [amount, setAmount] = useState<number | "">("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [installments, setInstallments] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "boleto" | "transferencia">("pix");
  const [notes, setNotes] = useState("");

  // Supplier quick create state
  const [supplierTradeName, setSupplierTradeName] = useState("");
  const [supplierLegalName, setSupplierLegalName] = useState("");
  const [supplierCnpj, setSupplierCnpj] = useState("");
  const [supplierCategory, setSupplierCategory] = useState("Insumos Alimentícios");
  const [supplierPhone, setSupplierPhone] = useState("");

  // Task quick state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("Lucas Vasconcelos");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [taskDueDate, setTaskDueDate] = useState(new Date().toISOString().split("T")[0]);

  // Revenue quick state
  const [revenueGross, setRevenueGross] = useState<number | "">("");
  const [revenueDiscounts, setRevenueDiscounts] = useState<number | "">("");
  const [revenueDate, setRevenueDate] = useState(new Date().toISOString().split("T")[0]);

  // Tax quick state
  const [taxType, setTaxType] = useState<"DAS" | "ICMS" | "FGTS" | "ISS">("DAS");
  const [taxAmount, setTaxAmount] = useState<number | "">("");
  const [taxDueDate, setTaxDueDate] = useState(new Date().toISOString().split("T")[0]);

  const suppliers = store.getSuppliers();

  const handleSavePayable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount || Number(amount) <= 0) return;

    const supplier = suppliers.find((s) => s.id === supplierId) || suppliers[0];

    store.addAccount(
      {
        unitId: payableUnit,
        companyCnpj: "45.190.190/0001-90",
        supplierId: supplier.id,
        supplierName: supplier.tradeName,
        supplierCnpjCpf: supplier.cnpjCpf,
        description,
        category,
        costCenter: `Operação ${payableUnit}`,
        competence: "09/2026",
        issueDate: new Date().toISOString().split("T")[0],
        dueDate,
        amount: Number(amount),
        interest: 0,
        penalty: 0,
        discount: 0,
        paymentMethod,
        status: "pending_approval",
        responsibleUser: "Lucas Vasconcelos",
        notes,
      },
      installments
    );

    onClose();
    resetForms();
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierTradeName) return;

    store.addSupplier({
      tradeName: supplierTradeName,
      legalName: supplierLegalName || supplierTradeName,
      cnpjCpf: supplierCnpj || "00.000.000/0001-00",
      category: supplierCategory,
      phone: supplierPhone || "(73) 99999-0000",
      email: "contato@fornecedor.com.br",
      address: "Bahia, Brasil",
    });

    onClose();
    resetForms();
  };

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle) return;

    store.addTask({
      title: taskTitle,
      description: "Criada via ação rápida.",
      unitId: payableUnit,
      assigneeName: taskAssignee,
      priority: taskPriority,
      dueDate: taskDueDate,
      status: "todo",
      tags: ["Rápida"],
    });

    onClose();
    resetForms();
  };

  const handleSaveRevenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revenueGross || Number(revenueGross) <= 0) return;

    store.addRevenue({
      unitId: payableUnit,
      date: revenueDate,
      grossRevenue: Number(revenueGross),
      discounts: Number(revenueDiscounts) || 0,
      cancellations: 0,
    });

    onClose();
    resetForms();
  };

  const handleSaveTax = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taxAmount || Number(taxAmount) <= 0) return;

    store.addTax({
      companyCnpj: "45.190.190/0001-90",
      unitId: payableUnit,
      taxType,
      competence: "08/2026",
      amount: Number(taxAmount),
      dueDate: taxDueDate,
      status: "upcoming",
    });

    onClose();
    resetForms();
  };

  const resetForms = () => {
    setDescription("");
    setAmount("");
    setInstallments(1);
    setSupplierTradeName("");
    setTaskTitle("");
    setRevenueGross("");
  };

  // Preview installments if > 1
  const installmentPreview = [];
  if (installments > 1 && amount && Number(amount) > 0) {
    const valPerParcel = Number(amount) / installments;
    const baseDue = new Date(dueDate + "T12:00:00Z");
    for (let i = 1; i <= installments; i++) {
      const d = new Date(baseDue);
      d.setMonth(d.getMonth() + (i - 1));
      installmentPreview.push({
        num: `${i}/${installments}`,
        date: d.toISOString().split("T")[0],
        amount: valPerParcel,
      });
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Lançamento Rápido"
      subtitle="Cadastre movimentações, parceiros ou pendências no sistema"
      maxWidth="2xl"
    >
      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 -mx-6 px-6 mb-5 gap-4">
        {[
          { key: "payable", label: "Conta a Pagar", icon: DollarSign },
          { key: "supplier", label: "Fornecedor", icon: Building2 },
          { key: "task", label: "Tarefa", icon: CheckSquare },
          { key: "revenue", label: "Faturamento", icon: TrendingUp },
          { key: "tax", label: "Imposto", icon: Receipt },
        ].map((tab) => {
          const Icon = tab.icon;
          const isCurrent = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
                isCurrent
                  ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Form: Conta a Pagar */}
      {activeTab === "payable" && (
        <form onSubmit={handleSavePayable} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Unidade
              </label>
              <select
                value={payableUnit}
                onChange={(e) => setPayableUnit(e.target.value as any)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="central">Central de Produção</option>
                <option value="eunapolis">House 190 Eunápolis</option>
                <option value="teixeira">House 190 Teixeira de Freitas</option>
                <option value="foodpark">House Foodpark</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Fornecedor
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.tradeName} ({s.category})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Descrição do Lançamento
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Fornecimento de blend bovino 500kg"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Valor Total (R$)
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? parseFloat(e.target.value) : "")}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
              </input>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Primeiro Vencimento
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Parcelas
              </label>
              <select
                value={installments}
                onChange={(e) => setInstallments(parseInt(e.target.value))}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value={1}>À vista (1x)</option>
                <option value={2}>2x mensais</option>
                <option value={3}>3x mensais</option>
                <option value={4}>4x mensais</option>
                <option value={5}>5x mensais</option>
                <option value={6}>6x mensais</option>
                <option value={12}>12x mensais</option>
              </select>
            </div>
          </div>

          {/* Real-time installment preview */}
          {installmentPreview.length > 0 && (
            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200/80 dark:bg-zinc-800/50 dark:border-zinc-700">
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Prévia das Parcelas Geradas
              </div>
              <div className="grid grid-cols-3 gap-2">
                {installmentPreview.map((item) => (
                  <div
                    key={item.num}
                    className="p-2 bg-white rounded border border-zinc-200/60 text-xs dark:bg-zinc-800 dark:border-zinc-700"
                  >
                    <div className="font-semibold text-zinc-700 dark:text-zinc-200">
                      {item.num}
                    </div>
                    <div className="text-zinc-400 text-[10px]">{item.date}</div>
                    <div className="font-medium text-zinc-900 mt-1 dark:text-zinc-100">
                      {formatCurrency(item.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="pix">PIX Chave Direta</option>
                <option value="boleto">Boleto Bancário</option>
                <option value="transferencia">TED / Transferência</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="Matéria-prima">Matéria-prima & Carnes</option>
                <option value="Panificação">Panificação & Pães</option>
                <option value="Laticínios">Laticínios</option>
                <option value="Embalagens">Embalagens & Delivery</option>
                <option value="Utilidades">Energia, Água & Gás</option>
                <option value="Marketing">Marketing & Publicidade</option>
                <option value="Manutenção">Manutenção & Reformas</option>
                <option value="Serviços">Assessoria & Jurídico</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Criar Lançamento
            </Button>
          </div>
        </form>
      )}

      {/* Form: Fornecedor */}
      {activeTab === "supplier" && (
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Nome Fantasia
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Frigorífico Central"
                value={supplierTradeName}
                onChange={(e) => setSupplierTradeName(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                CNPJ / CPF
              </label>
              <input
                type="text"
                placeholder="00.000.000/0001-00"
                value={supplierCnpj}
                onChange={(e) => setSupplierCnpj(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Categoria Principal
              </label>
              <select
                value={supplierCategory}
                onChange={(e) => setSupplierCategory(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="Insumos Alimentícios">Insumos Alimentícios</option>
                <option value="Panificação">Panificação</option>
                <option value="Laticínios">Laticínios</option>
                <option value="Bebidas">Bebidas & Cervejas</option>
                <option value="Embalagens">Embalagens</option>
                <option value="Manutenção">Manutenção de Equipamentos</option>
                <option value="Serviços">Prestação de Serviços</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                placeholder="(73) 99999-0000"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Cadastrar Fornecedor
            </Button>
          </div>
        </form>
      )}

      {/* Form: Tarefa */}
      {activeTab === "task" && (
        <form onSubmit={handleSaveTask} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Título da Tarefa
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Revisar alvará sanitário da unidade Teixeira"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Responsável
              </label>
              <select
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="Lucas Vasconcelos">Lucas Vasconcelos (Financeiro)</option>
                <option value="Marina Duarte Silva">Marina Duarte Silva (Operações)</option>
                <option value="Diretoria">Diretoria</option>
                <option value="Pulse Marketing">Pulse Marketing</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Prioridade
              </label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as any)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Prazo Final
              </label>
              <input
                type="date"
                required
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Criar Tarefa
            </Button>
          </div>
        </form>
      )}

      {/* Form: Faturamento */}
      {activeTab === "revenue" && (
        <form onSubmit={handleSaveRevenue} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Unidade
              </label>
              <select
                value={payableUnit}
                onChange={(e) => setPayableUnit(e.target.value as any)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="eunapolis">House 190 Eunápolis</option>
                <option value="teixeira">House 190 Teixeira de Freitas</option>
                <option value="foodpark">House Foodpark</option>
                <option value="central">Central de Produção</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Data do Movimento
              </label>
              <input
                type="date"
                required
                value={revenueDate}
                onChange={(e) => setRevenueDate(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Faturamento Bruto (R$)
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={revenueGross}
                onChange={(e) => setRevenueGross(e.target.value ? parseFloat(e.target.value) : "")}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Descontos / Promoções (R$)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={revenueDiscounts}
                onChange={(e) => setRevenueDiscounts(e.target.value ? parseFloat(e.target.value) : "")}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Registrar Faturamento
            </Button>
          </div>
        </form>
      )}

      {/* Form: Imposto */}
      {activeTab === "tax" && (
        <form onSubmit={handleSaveTax} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Tributo
              </label>
              <select
                value={taxType}
                onChange={(e) => setTaxType(e.target.value as any)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              >
                <option value="DAS">DAS - Simples Nacional</option>
                <option value="ICMS">ICMS Antecipação</option>
                <option value="FGTS">FGTS Digital</option>
                <option value="ISS">ISS Municipal</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Valor da Guia (R$)
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value ? parseFloat(e.target.value) : "")}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Vencimento
              </label>
              <input
                type="date"
                required
                value={taxDueDate}
                onChange={(e) => setTaxDueDate(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Lançar Guia Fiscal
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
