"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  Utensils,
  X,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  User,
  Percent,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { saveManagement } from "@/services/managementService";
import type { RecordData } from "@/domain/management/model";
import { formatCurrency } from "@/lib/utils";

export interface ValeEmployeeOption {
  id: string;
  name: string;
  unitId?: string;
  role?: string;
  cpf?: string;
}

interface ValeQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmployee?: ValeEmployeeOption | null;
  employees?: ValeEmployeeOption[];
  onSuccess?: () => void;
}

export function ValeQuickModal({
  isOpen,
  onClose,
  defaultEmployee,
  employees = [],
  onSuccess,
}: ValeQuickModalProps) {
  const { data, tenantId } = useManagement();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<"Vale Avulso" | "Consumo da Loja">("Vale Avulso");
  const [amountStr, setAmountStr] = useState("");
  const [date, setDate] = useState(todayStr);
  const [competence, setCompetence] = useState(currentMonthStr);
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  // Inicialização e reset ao abrir
  useEffect(() => {
    if (isOpen) {
      setError("");
      setSuccessMsg("");
      setAmountStr("");
      setDescription("");
      setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
      setCompetence(new Date().toISOString().slice(0, 7));
      setType("Vale Avulso");
      setPaymentMethod("PIX");

      if (defaultEmployee?.id) {
        setEmployeeId(defaultEmployee.id);
      } else if (employees.length > 0) {
        setEmployeeId(employees[0].id);
      } else {
        setEmployeeId("");
      }
    }
  }, [isOpen, defaultEmployee, employees]);

  // Forma de pagamento padrão por tipo
  useEffect(() => {
    if (type === "Consumo da Loja") {
      setPaymentMethod("Consumo / Produto");
    } else {
      setPaymentMethod("PIX");
    }
  }, [type]);

  if (!isOpen) return null;

  const selectedEmployee = defaultEmployee || employees.find((e) => e.id === employeeId);

  // Parse do valor digitado (valor bruto completo)
  const parsedAmount = Math.max(
    0,
    parseFloat(amountStr.replace(/\./g, "").replace(",", ".")) || 0
  );
  const rawAmountCents = Math.round(parsedAmount * 100);

  // Regra de 20% de desconto para Consumo da Loja
  // O usuário informa o valor cheio dos produtos, e o sistema desconta 20% para a folha
  const discountPercent = type === "Consumo da Loja" ? 20 : 0;
  const discountAmount = type === "Consumo da Loja" ? parsedAmount * 0.2 : 0;
  const finalAmount = type === "Consumo da Loja" ? parsedAmount * 0.8 : parsedAmount;
  const finalAmountCents = Math.round(finalAmount * 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) {
      setError("Selecione um colaborador.");
      return;
    }
    if (rawAmountCents <= 0) {
      setError("Informe um valor válido maior que zero.");
      return;
    }
    if (!date) {
      setError("Informe a data do lançamento.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const now = new Date().toISOString();
      const valeId = `vale-${selectedEmployee.id}-${Date.now()}`;
      const payableId = `payable-${valeId}`;
      const unitId = selectedEmployee.unitId || "teixeira";

      // 1. Registro principal em employeeVales (valor líquido com desconto é o abatimento da folha)
      const valeRecord: RecordData = {
        id: valeId,
        kind: "employeeVales",
        tenantId: tenantId || "house-burgers",
        unitId,
        version: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: user?.uid || "system",
        updatedBy: user?.uid || "system",
        employeeId: selectedEmployee.id,
        employeeName: selectedEmployee.name,
        type,
        date,
        competence: competence || date.slice(0, 7),
        amount: finalAmountCents, // Valor que realmente abate na folha
        originalAmount: rawAmountCents, // Valor bruto informado
        discountPercent,
        discountAmount: Math.round(discountAmount * 100),
        paymentMethod: type === "Consumo da Loja" ? "Consumo / Produto" : paymentMethod,
        status: "Pendente",
        description: description.trim() || (type === "Consumo da Loja" ? "Consumo Loja (-20%)" : "Vale Avulso"),
        payableId,
        notes: notes.trim(),
      };

      // 2. Criação automática em Contas a Pagar (payables)
      const payableRecord: RecordData = {
        id: payableId,
        kind: "payables",
        tenantId: tenantId || "house-burgers",
        unitId,
        version: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: user?.uid || "system",
        updatedBy: user?.uid || "system",
        obligationType: "Folha / Pessoal",
        description: `${
          type === "Consumo da Loja" ? "Consumo Loja (-20%)" : "Vale/Adiantamento"
        }: ${selectedEmployee.name}${description.trim() ? ` - ${description.trim()}` : ""}`,
        competence: competence || date.slice(0, 7),
        dueDate: date,
        originalAmount: rawAmountCents,
        amount: finalAmountCents,
        paymentMethod:
          type === "Consumo da Loja"
            ? "Outros"
            : paymentMethod === "PIX"
            ? "PIX"
            : paymentMethod === "Dinheiro em espécie"
            ? "Dinheiro em espécie"
            : "Outros",
        nature: "Operacional",
        status: "Pendente",
        notes: `Lançado via RH (Vales & Consumo). Colaborador: ${selectedEmployee.name}. ${
          type === "Consumo da Loja"
            ? `Bruto: ${formatCurrency(parsedAmount)} com 20% desc = ${formatCurrency(finalAmount)}.`
            : ""
        }`,
        sourceId: valeId,
      };

      // Salva no banco de dados
      await saveManagement(valeRecord, data);
      await saveManagement(payableRecord, data);

      setSuccessMsg(
        `${type} de ${formatCurrency(finalAmount)} registrado com sucesso!`
      );

      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 900);
    } catch (err) {
      console.error("Erro ao salvar vale:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar. Verifique a conexão e permissões."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="mg-modal-shade"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      style={{ zIndex: 1200 }}
    >
      <div
        className="mg-modal task-modal-modern"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 480, width: "94vw", borderRadius: 14 }}
      >
        {/* Header Minimalista */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: type === "Vale Avulso" ? "#eff6ff" : "#fef3c7",
                color: type === "Vale Avulso" ? "#2563eb" : "#d97706",
              }}
            >
              {type === "Vale Avulso" ? <Wallet size={18} /> : <Utensils size={18} />}
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#0f172a" }}>
                {type === "Vale Avulso" ? "Lançar Vale Avulso" : "Lançar Consumo da Loja"}
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
                Abatimento direto no fechamento da folha
              </p>
            </div>
          </div>
          <button
            type="button"
            className="task-modal-close"
            onClick={onClose}
            disabled={loading}
            title="Fechar"
            style={{ padding: 4 }}
          >
            <X size={18} />
          </button>
        </header>

        {/* Formulário Limpo e Direto */}
        <form onSubmit={handleSubmit} style={{ padding: "18px 20px" }}>
          {error && (
            <div
              style={{
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                backgroundColor: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#166534",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CheckCircle2 size={15} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Alternador de Tipo Minimalista */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              backgroundColor: "#f1f5f9",
              padding: 4,
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() => setType("Vale Avulso")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 7,
                border: "none",
                backgroundColor: type === "Vale Avulso" ? "#ffffff" : "transparent",
                color: type === "Vale Avulso" ? "#1d4ed8" : "#64748b",
                fontWeight: type === "Vale Avulso" ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                boxShadow:
                  type === "Vale Avulso" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <Wallet size={15} />
              <span>Vale Avulso (PIX)</span>
            </button>

            <button
              type="button"
              onClick={() => setType("Consumo da Loja")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 7,
                border: "none",
                backgroundColor: type === "Consumo da Loja" ? "#ffffff" : "transparent",
                color: type === "Consumo da Loja" ? "#b45309" : "#64748b",
                fontWeight: type === "Consumo da Loja" ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                boxShadow:
                  type === "Consumo da Loja" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <Utensils size={15} />
              <span>Consumo da Loja</span>
            </button>
          </div>

          {/* Colaborador */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              Colaborador *
            </label>
            {defaultEmployee ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    backgroundColor: "#e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#475569",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <User size={13} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                    {defaultEmployee.name}
                  </div>
                  {defaultEmployee.role && (
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {defaultEmployee.role}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <select
                className="mg-input"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                style={{ width: "100%", fontSize: 13, padding: "8px 10px" }}
              >
                <option value="">Selecione o colaborador...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} {emp.role ? `(${emp.role})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Campo de Valor com Regra de 20% no Consumo */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              {type === "Consumo da Loja"
                ? "Valor Total da Comanda / Produtos (R$) *"
                : "Valor do Vale / Adiantamento (R$) *"}
            </label>
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#64748b",
                }}
              >
                R$
              </span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                className="mg-input"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                required
                autoFocus
                style={{
                  paddingLeft: 34,
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              />
            </div>

            {/* Demonstração limpa dos 20% de desconto quando for Consumo da Loja */}
            {type === "Consumo da Loja" && parsedAmount > 0 && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  backgroundColor: "#fffbeb",
                  borderRadius: 8,
                  border: "1px solid #fde68a",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      padding: "2px 6px",
                      borderRadius: 4,
                      backgroundColor: "#fef3c7",
                      color: "#b45309",
                      fontWeight: 800,
                      fontSize: 10,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <Percent size={10} /> 20% OFF
                  </div>
                  <span style={{ color: "#78350f" }}>
                    Desc: -{formatCurrency(discountAmount)}
                  </span>
                </div>
                <div>
                  <span style={{ color: "#78350f", marginRight: 6 }}>A descontar:</span>
                  <strong style={{ color: "#b45309", fontSize: 13 }}>
                    {formatCurrency(finalAmount)}
                  </strong>
                </div>
              </div>
            )}
          </div>

          {/* Linha dupla: Data do Fato e Mês de Desconto */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                Data *
              </label>
              <input
                type="date"
                className="mg-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                style={{ fontSize: 13 }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                Mês de Desconto *
              </label>
              <input
                type="month"
                className="mg-input"
                value={competence}
                onChange={(e) => setCompetence(e.target.value)}
                required
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          {/* Forma de Pagamento (apenas para Vale Avulso) */}
          {type === "Vale Avulso" && (
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#475569",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                Forma de Pagamento
              </label>
              <select
                className="mg-input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ fontSize: 13 }}
              >
                <option value="PIX">PIX</option>
                <option value="Dinheiro em espécie">Dinheiro em espécie</option>
                <option value="Transferência bancária">Transferência bancária</option>
                <option value="Outros">Outros</option>
              </select>
            </div>
          )}

          {/* Descrição / Observação Simples e Direta */}
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
              }}
            >
              Descrição / Observação (Opcional)
            </label>
            <input
              type="text"
              className="mg-input"
              placeholder={
                type === "Consumo da Loja"
                  ? "Ex.: Hambúrguer e refrigerante"
                  : "Ex.: Adiantamento de emergência"
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>

          {/* Rodapé e Ações */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 8,
              borderTop: "1px solid #e2e8f0",
              paddingTop: 14,
            }}
          >
            <button
              type="button"
              className="workspace-secondary"
              onClick={onClose}
              disabled={loading}
              style={{ fontSize: 13, padding: "8px 14px" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="workspace-primary"
              disabled={loading || !parsedAmount}
              style={{
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 16px",
                backgroundColor: type === "Vale Avulso" ? "#2563eb" : "#d97706",
              }}
            >
              {loading ? (
                "Salvando…"
              ) : (
                <>
                  Confirmar {formatCurrency(finalAmount)}
                  <ArrowRight size={14} style={{ marginLeft: 4 }} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
