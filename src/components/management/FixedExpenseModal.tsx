"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Repeat,
  Building2,
  Zap,
  Droplets,
  Wifi,
  Monitor,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  currency,
  dateToday,
  monthEnd,
  PRIMARY_PAYMENT_METHODS,
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

interface FixedExpenseModalProps {
  initialUnitId?: string;
  onClose: () => void;
  onSaved: (message?: string) => void;
}

interface QuickPreset {
  id: string;
  label: string;
  icon: React.ElementType;
  defaultDesc: string;
  defaultMethod: string;
  supplierHint?: string;
}

const PRESETS: QuickPreset[] = [
  {
    id: "rent",
    label: "Aluguel",
    icon: Building2,
    defaultDesc: "Aluguel do Ponto Comercial",
    defaultMethod: "Boleto",
    supplierHint: "Locador do Imóvel",
  },
  {
    id: "energy",
    label: "Energia Elétrica",
    icon: Zap,
    defaultDesc: "Conta de Energia Elétrica - Coelba/Neoenergia",
    defaultMethod: "Débito automático",
    supplierHint: "Neoenergia Coelba",
  },
  {
    id: "water",
    label: "Água / Esgoto",
    icon: Droplets,
    defaultDesc: "Conta de Água e Esgoto - Embasa",
    defaultMethod: "Débito automático",
    supplierHint: "Embasa",
  },
  {
    id: "internet",
    label: "Internet / Telefonia",
    icon: Wifi,
    defaultDesc: "Link de Internet e Telefonia",
    defaultMethod: "Boleto",
    supplierHint: "Operadora de Internet",
  },
  {
    id: "software",
    label: "Sistemas & PDV",
    icon: Monitor,
    defaultDesc: "Mensalidade Sistema PDV / BEEP / Gestão",
    defaultMethod: "Cartão de Crédito",
    supplierHint: "Provedor de Software",
  },
  {
    id: "accounting",
    label: "Contabilidade",
    icon: FileSpreadsheet,
    defaultDesc: "Honorários Contábeis",
    defaultMethod: "PIX",
    supplierHint: "Assessoria Contábil",
  },
  {
    id: "security",
    label: "Segurança / Monitoramento",
    icon: ShieldCheck,
    defaultDesc: "Alarme e Monitoramento Patrimonial",
    defaultMethod: "Boleto",
    supplierHint: "Empresa de Segurança",
  },
];

export function FixedExpenseModal({
  initialUnitId = "",
  onClose,
  onSaved,
}: FixedExpenseModalProps) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { user } = useAuth();
  const modalRoot = useRef<HTMLDivElement>(null);

  const today = dateToday();
  const [unitId, setUnitId] = useState(() =>
    initialUnitId && initialUnitId !== "all"
      ? initialUnitId
      : allowedUnit !== "all"
        ? allowedUnit
        : data.units[0]?.id || "",
  );

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [customSupplierName, setCustomSupplierName] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [dueDay, setDueDay] = useState(10);
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const [y, m] = today.split("-");
    const d = "10";
    return `${y}-${m}-${d}`;
  });
  const [paymentMethod, setPaymentMethod] = useState("Boleto");
  const [recurrenceCount, setRecurrenceCount] = useState(12);
  const [documentNumber, setDocumentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Update initial firstDueDate whenever dueDay changes
  const handleDueDayChange = (day: number) => {
    const cleanDay = Math.min(31, Math.max(1, day));
    setDueDay(cleanDay);
    const [y, m] = firstDueDate.split("-");
    const padDay = String(cleanDay).padStart(2, "0");
    const maxInMonth = Number(monthEnd(`${y}-${m}-01`).slice(8, 10));
    const validDay = Math.min(cleanDay, maxInMonth);
    setFirstDueDate(`${y}-${m}-${String(validDay).padStart(2, "0")}`);
  };

  const applyPreset = (preset: QuickPreset) => {
    setSelectedPresetId(preset.id);
    setDescription(preset.defaultDesc);
    setPaymentMethod(preset.defaultMethod);
    // Find matching supplier if exists
    if (preset.supplierHint) {
      const match = data.suppliers.find((s) =>
        str(s, "name").toLowerCase().includes(preset.supplierHint!.toLowerCase()),
      );
      if (match) {
        setSelectedSupplierId(match.id);
        setCustomSupplierName("");
      } else {
        setSelectedSupplierId("__new__");
        setCustomSupplierName(preset.supplierHint);
      }
    }
  };

  // Keyboard escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!description.trim()) {
      setError("Informe a descrição da despesa fixa.");
      return;
    }
    const valNum = Number(amountInput.replace(",", "."));
    if (!valNum || valNum <= 0) {
      setError("Informe um valor mensal válido.");
      return;
    }
    if (!firstDueDate) {
      setError("Informe a data de vencimento inicial.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const now = new Date().toISOString();
      const centsAmount = Math.round(valNum * 100);
      const isNewSupplier = selectedSupplierId === "__new__";
      const finalSupplierId = isNewSupplier ? "" : selectedSupplierId;

      const primaryRecordId = safeUUID();
      const record: RecordData = {
        id: primaryRecordId,
        kind: "payables",
        tenantId,
        unitId: unitId || "",
        version: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
        obligationType: "Despesa Fixa",
        description: description.trim(),
        supplierId: finalSupplierId,
        scannedSupplierName: isNewSupplier ? customSupplierName.trim() : undefined,
        competence: firstDueDate.slice(0, 7),
        dueDate: firstDueDate,
        amount: centsAmount,
        originalAmount: centsAmount,
        paymentMethod: paymentMethod || "Boleto",
        documentNumber: documentNumber.trim(),
        nature: "Operacional",
        status: "Pendente",
        installments: 1,
        recurrenceCount: recurrenceCount > 1 ? recurrenceCount : 1,
        notes: notes.trim()
          ? `${notes.trim()} (Despesa fixa recorrente programada)`
          : "Despesa fixa recorrente programada",
      };

      const savedRows = await saveManagement(record, data);

      // Notification
      const unitName = String(
        data.units.find((u) => u.id === unitId)?.name || "Geral / Matriz",
      );
      void addNotificationToFirestore({
        type: "payable",
        title: "Nova Despesa Fixa Cadastrada",
        details: [
          { label: "Conta", value: description },
          { label: "Valor Mensal", value: currency(centsAmount) },
          { label: "Vencimento Inicial", value: firstDueDate.split("-").reverse().join("/") },
          { label: "Unidade", value: unitName },
          { label: "Recorrência", value: `${recurrenceCount} mês(es)` },
        ],
        message: `Despesa fixa "${description}" cadastrada para ${unitName} (${currency(centsAmount)}/mês - ${recurrenceCount} meses).`,
        link: "/contas-a-pagar/",
        severity: "info",
        read: false,
        timestamp: new Date().toISOString(),
      });

      void backupPayablesSpreadsheet(data, savedRows).catch((err) =>
        console.warn("Backup de planilha pendente:", err),
      );

      onSaved(
        recurrenceCount > 1
          ? `Despesa fixa cadastrada! ${recurrenceCount} meses de vencimentos foram pré-gerados com sucesso.`
          : `Despesa fixa cadastrada com sucesso!`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível cadastrar a despesa fixa.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mg-modal-shade" ref={modalRoot}>
      <div
        className="mg-modal fixed-expense-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fixed-expense-title"
      >
        <header>
          <div className="fixed-expense-title-group">
            <span className="fixed-expense-tag">
              <Repeat size={13} /> DESPESA FIXA / RECORRENTE
            </span>
            <h2 id="fixed-expense-title">Lançar Despesa Fixa</h2>
            <p>
              Cadastre contas recorrentes da loja (aluguel, luz, água, internet, sistemas e
              contabilidade) com repetição automática.
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            <X size={22} />
          </button>
        </header>

        {error && <div className="mg-error-banner">{error}</div>}

        <div className="fixed-expense-presets-bar">
          <span className="fixed-expense-presets-label">
            <Sparkles size={14} /> Atalhos rápidos:
          </span>
          <div className="fixed-expense-presets-list">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              const isActive = selectedPresetId === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`fixed-preset-pill ${isActive ? "active" : ""}`}
                  onClick={() => applyPreset(p)}
                  title={`Preencher dados de ${p.label}`}
                >
                  <Icon size={13} /> {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <form className="fixed-expense-form" onSubmit={handleSubmit}>
          <div className="fixed-expense-fields">
            <label>
              Unidade / Loja *
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                required
              >
                <option value="">Geral / Matriz (Todas as lojas)</option>
                {data.units
                  .filter((u) => !u.archived)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              Fornecedor / Favorecido
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">Selecione ou deixe em aberto</option>
                <option value="__new__">+ Digitar outro fornecedor / favorecido</option>
                {data.suppliers
                  .filter((s) => !s.archived)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {str(s, "name")}
                    </option>
                  ))}
              </select>
            </label>

            {selectedSupplierId === "__new__" && (
              <label className="full">
                Nome do Favorecido / Empresa *
                <input
                  type="text"
                  placeholder="Ex: Imobiliária Central ou Coelba"
                  value={customSupplierName}
                  onChange={(e) => setCustomSupplierName(e.target.value)}
                  required
                />
              </label>
            )}

            <label className="full">
              Descrição da Despesa Fixa *
              <input
                type="text"
                placeholder="Ex: Aluguel Loja Centro ou Energia Elétrica Neoenergia"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>

            <label>
              Valor Mensal Estimado ou Fixo (R$) *
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                required
              />
            </label>

            <label>
              Dia de Vencimento Fixo (todo mês) *
              <input
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => handleDueDayChange(Number(e.target.value))}
                required
              />
            </label>

            <label>
              Primeiro Vencimento *
              <input
                type="date"
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
                required
              />
            </label>

            <label>
              Forma de Pagamento Prevista
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PRIMARY_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Meses para pré-gerar automaticamente
              <select
                value={recurrenceCount}
                onChange={(e) => setRecurrenceCount(Number(e.target.value))}
              >
                <option value={1}>Apenas 1 mês (Competência atual)</option>
                <option value={3}>Próximos 3 meses (Trimestre)</option>
                <option value={6}>Próximos 6 meses (Semestre)</option>
                <option value={12}>Próximos 12 meses (1 ano completo - Recomendado)</option>
              </select>
            </label>

            <label>
              Código de barras / Chave PIX / Referência
              <input
                type="text"
                placeholder="Opcional: conta contrato ou chave PIX"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </label>

            <label className="full">
              Observações / Contrato / Informações adicionais
              <textarea
                rows={2}
                placeholder="Ex: Contrato assinado em 2026, reajuste pelo IPCA em outubro, conta contrato nº 123456"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="fixed-expense-recurrence-hint">
            <CheckCircle2 size={18} />
            <span>
              Ao selecionar <strong>{recurrenceCount} meses</strong>, o sistema criará
              automaticamente as {recurrenceCount} contas mensais programadas para todo dia{" "}
              <strong>{dueDay}</strong>, mantendo as competências e vencimentos organizados.
            </span>
          </div>

          <footer className="fixed-expense-footer">
            <button
              type="button"
              className="workspace-secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="workspace-primary mg-button-fixed-submit"
              disabled={busy}
            >
              <Repeat size={16} />
              {busy ? "Salvando despesa..." : "Salvar Despesa Fixa"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
