"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Calendar,
  Barcode,
  CreditCard,
  Repeat,
  Calculator,
  Landmark,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  currency,
  dateToday,
  addDays,
  monthEnd,
  RecordData,
  str,
} from "@/domain/management/model";
import { saveManagement } from "@/services/managementService";
import { addNotificationToFirestore } from "@/services/firestoreService";
import { backupPayablesSpreadsheet } from "@/services/payablesBackupService";

const safeUUID = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

export type PayableAccountType =
  | "Boleto"
  | "Cheque"
  | "Conta fixa"
  | "Contabilidade"
  | "Empréstimo";

const ACCOUNT_TYPES: {
  key: PayableAccountType;
  label: string;
  icon: React.ElementType;
  activeTone: string;
}[] = [
  { key: "Boleto", label: "Boleto", icon: Barcode, activeTone: "border-blue-500 bg-blue-50 text-blue-700 shadow-sm" },
  { key: "Cheque", label: "Cheque", icon: CreditCard, activeTone: "border-amber-500 bg-amber-50 text-amber-700 shadow-sm" },
  { key: "Conta fixa", label: "Conta Fixa", icon: Repeat, activeTone: "border-purple-500 bg-purple-50 text-purple-700 shadow-sm" },
  { key: "Contabilidade", label: "Contabilidade", icon: Calculator, activeTone: "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm" },
  { key: "Empréstimo", label: "Empréstimo", icon: Landmark, activeTone: "border-rose-500 bg-rose-50 text-rose-700 shadow-sm" },
];

interface SimplifiedPayableModalProps {
  initialUnitId?: string;
  initialRecord?: RecordData;
  onClose: () => void;
  onSaved: (message?: string) => void;
}

export function SimplifiedPayableModal({
  initialUnitId = "",
  initialRecord,
  onClose,
  onSaved,
}: SimplifiedPayableModalProps) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { user } = useAuth();
  const today = dateToday();

  // Unit selection
  const [unitId, setUnitId] = useState(() => {
    if (initialRecord?.unitId) return initialRecord.unitId;
    if (initialUnitId && initialUnitId !== "all") return initialUnitId;
    if (allowedUnit && allowedUnit !== "all") return allowedUnit;
    return data.units[0]?.id || "";
  });

  // 1. Nome / Descrição
  const [name, setName] = useState(() => (initialRecord ? str(initialRecord, "description") : ""));

  // 2. Fornecedor
  const [supplierId, setSupplierId] = useState(() => (initialRecord ? str(initialRecord, "supplierId") : ""));
  const [newSupplierMode, setNewSupplierMode] = useState(false);
  const [customSupplierName, setCustomSupplierName] = useState(() => (initialRecord ? str(initialRecord, "scannedSupplierName") : ""));

  // 3. Data de validade (vencimento)
  const [dueDate, setDueDate] = useState(() => (initialRecord ? str(initialRecord, "dueDate") : today));

  // 4. Valor original (R$)
  const [originalAmountStr, setOriginalAmountStr] = useState(() => {
    if (!initialRecord) return "";
    const orig = initialRecord.originalAmount ?? initialRecord.amount;
    return orig ? (Number(orig) / 100).toFixed(2) : "";
  });

  // 5. Valor com juros (R$)
  const [amountWithInterestStr, setAmountWithInterestStr] = useState(() => {
    if (!initialRecord?.amount) return "";
    return (Number(initialRecord.amount) / 100).toFixed(2);
  });
  const [interestManual, setInterestManual] = useState(false);

  // 6. Parcelamento (ex: 1/10)
  const [installmentInput, setInstallmentInput] = useState(() => {
    if (initialRecord?.installmentText) return String(initialRecord.installmentText);
    if (initialRecord?.installments && Number(initialRecord.installments) > 1) {
      return `1/${initialRecord.installments}`;
    }
    return "1/1";
  });
  const [generateAllInstallments, setGenerateAllInstallments] = useState(false);

  // 7. Tipo de conta
  const [accountType, setAccountType] = useState<PayableAccountType>(() => {
    const t = initialRecord ? str(initialRecord, "obligationType") : "";
    if (t === "Cheque") return "Cheque";
    if (t === "Conta fixa" || t === "Despesa Fixa") return "Conta fixa";
    if (t === "Contabilidade") return "Contabilidade";
    if (t === "Empréstimo" || t === "Empréstimo / Financiamento") return "Empréstimo";
    return "Boleto";
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Auto-sync Valor com Juros when Valor Original changes (unless user explicitly edited it)
  const handleOriginalAmountChange = (val: string) => {
    setOriginalAmountStr(val);
    if (!interestManual) {
      setAmountWithInterestStr(val);
    }
  };

  const handleInterestAmountChange = (val: string) => {
    setAmountWithInterestStr(val);
    setInterestManual(true);
  };

  // Keyboard shortcut Esc
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Quick date shortcuts
  const setQuickDate = (type: "today" | "tomorrow" | "7days" | "15days" | "monthEnd") => {
    if (type === "today") setDueDate(today);
    else if (type === "tomorrow") setDueDate(addDays(today, 1));
    else if (type === "7days") setDueDate(addDays(today, 7));
    else if (type === "15days") setDueDate(addDays(today, 15));
    else if (type === "monthEnd") setDueDate(monthEnd(today));
  };

  // Parse installment format: "1/10" -> current: 1, total: 10
  const parsedInstallment = React.useMemo(() => {
    const clean = installmentInput.trim();
    const match = clean.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      return { current, total, isValid: current > 0 && total >= current };
    }
    const single = parseInt(clean, 10);
    if (!isNaN(single) && single > 0) {
      return { current: 1, total: single, isValid: true };
    }
    return { current: 1, total: 1, isValid: false };
  }, [installmentInput]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!name.trim()) {
      setError("Informe o nome / descrição da conta.");
      return;
    }

    const origCents = Math.round(Number(originalAmountStr.replace(",", ".")) * 100);
    const finalCents = Math.round(Number(amountWithInterestStr.replace(",", ".")) * 100);

    if (isNaN(origCents) || origCents <= 0) {
      setError("Informe um valor original válido maior que zero.");
      return;
    }

    if (isNaN(finalCents) || finalCents <= 0) {
      setError("Informe um valor com juros válido.");
      return;
    }

    if (!dueDate) {
      setError("Informe a data de validade (vencimento).");
      return;
    }

    const foundSupplier = data.suppliers.find((s) => s.id === supplierId);
    const suppName: string = newSupplierMode
      ? customSupplierName.trim()
      : (foundSupplier ? str(foundSupplier, "name") : "");

    setBusy(true);
    setError("");

    try {
      const now = new Date().toISOString();
      const baseId = initialRecord?.id || safeUUID();

      // Check if user wants to generate multiple monthly installments
      const totalInstallments = parsedInstallment.total;
      const shouldGenerateMultiple =
        generateAllInstallments && totalInstallments > 1 && !initialRecord;

      const recordsToSave: RecordData[] = [];

      if (shouldGenerateMultiple) {
        for (let i = 0; i < totalInstallments; i++) {
          const installmentDueDate = addDays(dueDate, i * 30);
          const partNumber = i + 1;
          const partId = i === 0 ? baseId : `${baseId}-p${partNumber}`;
          const partDesc = `${name.trim()} (${partNumber}/${totalInstallments})`;

          recordsToSave.push({
            id: partId,
            kind: "payables",
            tenantId,
            unitId: unitId || "",
            version: 0,
            createdAt: now,
            updatedAt: now,
            createdBy: user.uid,
            updatedBy: user.uid,
            description: partDesc,
            supplierId: newSupplierMode ? "" : supplierId,
            scannedSupplierName: newSupplierMode ? suppName : "",
            dueDate: installmentDueDate,
            competence: installmentDueDate.slice(0, 7),
            originalAmount: origCents,
            amount: finalCents,
            obligationType: accountType,
            paymentMethod: accountType === "Boleto" ? "Boleto" : accountType === "Cheque" ? "Cheque" : "Outros",
            nature: accountType === "Empréstimo" ? "Financiamento" : "Operacional",
            status: "Pendente",
            installments: 1,
            installmentText: `${partNumber}/${totalInstallments}`,
            installmentNumber: partNumber,
            originalInstallments: totalInstallments,
            installmentGroupId: baseId,
          });
        }
      } else {
        const installmentLabel = parsedInstallment.isValid
          ? `${parsedInstallment.current}/${parsedInstallment.total}`
          : installmentInput.trim() || "1/1";

        const formattedDesc = installmentLabel !== "1/1" && !name.includes("(")
          ? `${name.trim()} (${installmentLabel})`
          : name.trim();

        recordsToSave.push({
          ...(initialRecord || {}),
          id: baseId,
          kind: "payables",
          tenantId,
          unitId: unitId || "",
          version: initialRecord?.version ? Number(initialRecord.version) : 0,
          createdAt: initialRecord?.createdAt || now,
          updatedAt: now,
          createdBy: initialRecord?.createdBy || user.uid,
          updatedBy: user.uid,
          description: formattedDesc,
          supplierId: newSupplierMode ? "" : supplierId,
          scannedSupplierName: newSupplierMode ? suppName : (initialRecord?.scannedSupplierName || ""),
          dueDate,
          competence: dueDate.slice(0, 7),
          originalAmount: origCents,
          amount: finalCents,
          obligationType: accountType,
          paymentMethod: accountType === "Boleto" ? "Boleto" : accountType === "Cheque" ? "Cheque" : (initialRecord?.paymentMethod || "Outros"),
          nature: accountType === "Empréstimo" ? "Financiamento" : (initialRecord?.nature || "Operacional"),
          status: initialRecord?.status || "Pendente",
          installments: 1,
          installmentText: installmentLabel,
        });
      }

      // Save each record
      let lastSavedRows: RecordData[] = [];
      for (const rec of recordsToSave) {
        const saved = await saveManagement(rec, data);
        lastSavedRows = [...lastSavedRows, ...saved];
      }

      // Notification
      const isPast = dueDate < today;
      const isToday = dueDate === today;
      void addNotificationToFirestore({
        type: "payable",
        title: isPast ? "Conta já vencida incluída" : isToday ? "Conta vence hoje" : "Nova conta cadastrada",
        details: [
          { label: "Conta", value: name.trim() },
          { label: "Fornecedor", value: String(suppName || "Não informado") },
          { label: "Valor Original", value: currency(origCents) },
          { label: "Valor Final", value: currency(finalCents) },
          { label: "Vencimento", value: dueDate.split("-").reverse().join("/") },
          { label: "Parcela", value: installmentInput.trim() || "1/1" },
          { label: "Tipo", value: accountType },
        ],
        message: `${name.trim()} · ${currency(finalCents)} · vencimento ${dueDate.split("-").reverse().join("/")} (${accountType}).`,
        link: "/",
        severity: isPast ? "danger" : isToday ? "warning" : "info",
        read: false,
        timestamp: now,
      });

      // Google Sheets Backup
      void backupPayablesSpreadsheet(data, lastSavedRows).catch((err) =>
        console.warn("Backup em planilha pendente:", err)
      );

      onSaved(
        recordsToSave.length > 1
          ? `${recordsToSave.length} parcelas geradas com sucesso!`
          : "Conta salva com sucesso no Contas a Pagar!"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar conta a pagar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Modo Claro) */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-sm">
              <Plus size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">
                {initialRecord ? "Editar Conta a Pagar" : "Nova Conta a Pagar"}
              </h2>
              <p className="text-xs text-zinc-500">
                Preencha os dados essenciais para controle do financeiro
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
            title="Fechar (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body (Modo Claro & Sem elementos sobrepostos) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Nome da Conta */}
          <div>
            <label className="block text-zinc-700 font-semibold mb-1.5">
              Nome / Descrição da Conta <span className="text-purple-600">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ex: Aluguel Loja Centro, Carnes OESA, Internet Fibra..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 placeholder-zinc-400 text-xs font-medium focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>

          {/* 2. Fornecedor */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-zinc-700 font-semibold">
                Fornecedor <span className="text-purple-600">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setNewSupplierMode(!newSupplierMode);
                  setCustomSupplierName("");
                }}
                className="text-xs text-purple-600 hover:text-purple-700 font-semibold flex items-center gap-1 transition"
              >
                {newSupplierMode ? "← Selecionar da lista" : "+ Novo fornecedor"}
              </button>
            </div>

            {newSupplierMode ? (
              <input
                type="text"
                placeholder="Digite o nome do novo fornecedor..."
                value={customSupplierName}
                onChange={(e) => setCustomSupplierName(e.target.value)}
                className="w-full h-11 px-3.5 bg-purple-50/50 border border-purple-300 rounded-xl text-zinc-900 placeholder-zinc-400 text-xs font-medium focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition"
              />
            ) : (
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-11 px-3.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 text-xs font-medium focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition"
              >
                <option value="">Selecione um fornecedor cadastrado...</option>
                {data.suppliers
                  .filter((s) => !s.archived)
                  .sort((a, b) => str(a, "name").localeCompare(str(b, "name")))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {str(s, "name")}
                    </option>
                  ))}
              </select>
            )}
          </div>

          {/* 3. Data de Validade (Vencimento) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-zinc-700 font-semibold flex items-center gap-1.5">
                <Calendar size={14} className="text-purple-600" />
                Data de Validade (Vencimento) <span className="text-purple-600">*</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setQuickDate("today")}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[11px] font-medium transition"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate("tomorrow")}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[11px] font-medium transition"
                >
                  Amanhã
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate("7days")}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[11px] font-medium transition"
                >
                  +7d
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDate("monthEnd")}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[11px] font-medium transition"
                >
                  Fim do Mês
                </button>
              </div>
            </div>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-11 px-3.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 text-xs font-medium focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition"
            />
          </div>

          {/* 4 & 5. Valores: Original e Com Juros (Limpos, sem caracteres sobrepostos) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-zinc-700 font-semibold mb-1.5">
                Valor Original (R$) <span className="text-purple-600">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0,00"
                value={originalAmountStr}
                onChange={(e) => handleOriginalAmountChange(e.target.value)}
                className="w-full h-11 px-3.5 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 placeholder-zinc-400 text-xs font-semibold focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-zinc-700 font-semibold">
                  Valor com Juros (R$) <span className="text-purple-600">*</span>
                </label>
                {interestManual && (
                  <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    Ajustado manual
                  </span>
                )}
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0,00"
                value={amountWithInterestStr}
                onChange={(e) => handleInterestAmountChange(e.target.value)}
                className={`w-full h-11 px-3.5 bg-zinc-50 border rounded-xl text-zinc-900 placeholder-zinc-400 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 transition ${
                  interestManual && Number(amountWithInterestStr) > Number(originalAmountStr)
                    ? "border-amber-400 focus:border-amber-500 focus:ring-amber-100"
                    : "border-zinc-300 focus:border-purple-600 focus:ring-purple-100"
                }`}
              />
            </div>
          </div>

          {/* 6. Parcelamento (Limpo, sem ícone sobreposto) */}
          <div>
            <label className="block text-zinc-700 font-semibold mb-1.5">
              Parcelamento <span className="text-zinc-400 font-normal">(Ex: 1/10, 1/1, 2/6)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="1/1"
                value={installmentInput}
                onChange={(e) => setInstallmentInput(e.target.value)}
                className="w-24 h-11 px-3 bg-zinc-50 border border-zinc-300 rounded-xl text-zinc-900 placeholder-zinc-400 text-xs font-semibold text-center focus:bg-white focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition"
              />

              {/* Botões de atalho rápido */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {["1/1", "1/2", "1/3", "1/6", "1/10", "1/12"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setInstallmentInput(p)}
                    className={`h-9 px-3 rounded-lg border text-xs font-semibold transition ${
                      installmentInput === p
                        ? "bg-purple-600 border-purple-600 text-white shadow-sm"
                        : "bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Opção para gerar parcelas múltiplas */}
            {parsedInstallment.total > 1 && !initialRecord && (
              <label className="flex items-center gap-2 mt-2 px-1 text-xs text-zinc-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={generateAllInstallments}
                  onChange={(e) => setGenerateAllInstallments(e.target.checked)}
                  className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500"
                />
                <span>
                  Gerar automaticamente as{" "}
                  <strong className="text-purple-700">{parsedInstallment.total} parcelas</strong> com
                  vencimento mensal consecutivo no sistema
                </span>
              </label>
            )}
          </div>

          {/* 7. Tipo de Conta */}
          <div>
            <label className="block text-zinc-700 font-semibold mb-2">
              Tipo de Conta <span className="text-purple-600">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = accountType === type.key;
                return (
                  <button
                    key={type.key}
                    type="button"
                    onClick={() => setAccountType(type.key)}
                    className={`h-11 px-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold transition ${
                      isSelected
                        ? type.activeTone
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{type.label}</span>
                    {isSelected && <Check size={14} className="ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Unidade (se houver mais de uma) */}
          {data.units.length > 1 && (
            <div>
              <label className="block text-zinc-600 font-medium mb-1">
                Unidade / Loja
              </label>
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className="w-full h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-700 text-xs focus:bg-white focus:outline-none focus:border-purple-600"
              >
                {data.units
                  .filter((u) => !u.archived)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {str(u, "name")}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </form>

        {/* Footer Actions (Modo Claro) */}
        <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-10 px-5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-semibold text-xs transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSubmit}
            className="h-10 px-6 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-200 transition disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Salvando conta...
              </>
            ) : (
              <>
                <Check size={15} />
                {initialRecord ? "Salvar Alterações" : "Cadastrar Conta"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
