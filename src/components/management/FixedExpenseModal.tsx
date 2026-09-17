"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Repeat,
  CheckCircle2,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  currency,
  dateToday,
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

  const [description, setDescription] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [customSupplierName, setCustomSupplierName] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [categoryId, setCategoryId] = useState("");
  
  // Default first due date to 10th of this month
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const [y, m] = today.split("-");
    return `${y}-${m}-10`;
  });
  
  const [paymentMethod, setPaymentMethod] = useState("Boleto");
  const [recurrenceCount, setRecurrenceCount] = useState(12);
  const [documentNumber, setDocumentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Day is intuitively derived from firstDueDate
  const dueDay = Number(firstDueDate ? firstDueDate.split("-")[2] : 10);

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
      const defaultCat = data.categories.find(c => !c.archived && (str(c, "name").toLowerCase().includes("fixa") || str(c, "dreLine") === "Operacionais"))?.id || data.categories[0]?.id || "";

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
        categoryId: categoryId || defaultCat,
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
            <h2 id="fixed-expense-title">Cadastrar Despesa Fixa</h2>
            <p>
              Lançamento de contas recorrentes (aluguel, energia, água, internet, contabilidade) com repetição automática.
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </header>

        {error && <div className="mg-error-banner">{error}</div>}

        <form className="fixed-expense-form clean" onSubmit={handleSubmit}>
          <div className="fixed-expense-fields">
            {/* Descrição */}
            <div className="fixed-expense-field-group full">
              <label htmlFor="fe-desc">
                Nome da Conta / Descrição <span className="req">*</span>
              </label>
              <input
                id="fe-desc"
                type="text"
                autoFocus
                placeholder="Ex.: Aluguel Loja Centro, Energia Elétrica Neoenergia ou Link de Internet"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            {/* Valor Mensal */}
            <div className="fixed-expense-field-group">
              <label htmlFor="fe-amount">
                Valor Mensal Estimado (R$) <span className="req">*</span>
              </label>
              <input
                id="fe-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                required
              />
            </div>

            {/* Unidade */}
            <div className="fixed-expense-field-group">
              <label htmlFor="fe-unit">
                Unidade / Loja <span className="req">*</span>
              </label>
              <select
                id="fe-unit"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                required
              >
                <option value="">Geral / Todas as Unidades</option>
                {data.units
                  .filter((u) => !u.archived)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Categoria */}
            <div className="fixed-expense-field-group">
              <label htmlFor="fe-category">
                Categoria DRE / Financeira
              </label>
              <select
                id="fe-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">(Automático / Operacionais)</option>
                {data.categories
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {String(c.name || c.id)}
                    </option>
                  ))}
              </select>
            </div>

            {/* Data do 1º Vencimento */}
            <div className="fixed-expense-field-group">
              <label htmlFor="fe-first-date">
                Data do 1º Vencimento <span className="req">*</span>
              </label>
              <input
                id="fe-first-date"
                type="date"
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
                required
              />
              <span className="fixed-expense-helper">
                O dia <strong>{dueDay}</strong> será o vencimento fixo dos meses seguintes.
              </span>
            </div>

            {/* Forma de Pagamento */}
            <div className="fixed-expense-field-group">
              <label htmlFor="fe-method">
                Forma de Pagamento Prevista
              </label>
              <select
                id="fe-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PRIMARY_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Fornecedor / Favorecido */}
            <div className="fixed-expense-field-group full">
              <label htmlFor="fe-supplier">
                Fornecedor ou Favorecido (opcional)
              </label>
              <select
                id="fe-supplier"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">Selecione um fornecedor cadastrado (opcional)</option>
                <option value="__new__">+ Digitar outro fornecedor / favorecido</option>
                {data.suppliers
                  .filter((s) => !s.archived)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {str(s, "name")}
                    </option>
                  ))}
              </select>
            </div>

            {selectedSupplierId === "__new__" && (
              <div className="fixed-expense-field-group full">
                <label htmlFor="fe-custom-supplier">
                  Nome da Empresa ou Prestador <span className="req">*</span>
                </label>
                <input
                  id="fe-custom-supplier"
                  type="text"
                  placeholder="Ex.: Imobiliária Central, Coelba, Embasa..."
                  value={customSupplierName}
                  onChange={(e) => setCustomSupplierName(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Programação de Recorrência */}
            <div className="fixed-expense-field-group full">
              <label>Programação de Recorrência Automática</label>
              <div className="fixed-recurrence-selector">
                {[
                  { count: 1, label: "1 mês", sub: "Competência atual" },
                  { count: 3, label: "3 meses", sub: "Trimestre" },
                  { count: 6, label: "6 meses", sub: "Semestre" },
                  { count: 12, label: "12 meses", sub: "1 ano completo", badge: "Recomendado" },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.count}
                    className={`fixed-recurrence-card ${recurrenceCount === opt.count ? "active" : ""}`}
                    onClick={() => setRecurrenceCount(opt.count)}
                  >
                    <div className="fixed-recurrence-card-head">
                      <strong>{opt.label}</strong>
                      {opt.badge && <span className="fixed-rec-badge">{opt.badge}</span>}
                    </div>
                    <small>{opt.sub}</small>
                  </button>
                ))}
              </div>
            </div>

            {/* Código do Contrato / Referência */}
            <div className="fixed-expense-field-group">
              <label htmlFor="fe-doc">
                Nº Contrato / Código (opcional)
              </label>
              <input
                id="fe-doc"
                type="text"
                placeholder="Ex.: Conta contrato nº 123456"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </div>

            {/* Observações */}
            <div className="fixed-expense-field-group">
              <label htmlFor="fe-notes">
                Observações internas (opcional)
              </label>
              <input
                id="fe-notes"
                type="text"
                placeholder="Ex.: Reajuste em outubro pelo IPCA"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="fixed-expense-recurrence-hint clean">
            <CheckCircle2 size={18} />
            <span>
              {recurrenceCount > 1
                ? `Serão geradas ${recurrenceCount} contas mensais no valor de ${amountInput ? currency(Math.round(Number(amountInput.replace(",", ".")) * 100)) : "R$ 0,00"}, com vencimento no dia ${dueDay} de cada mês.`
                : `Será gerada 1 conta com vencimento em ${firstDueDate.split("-").reverse().join("/")}.`}
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
              {busy ? "Salvando despesa..." : "Confirmar Despesa Fixa"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
