"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  Utensils,
  Calendar,
  DollarSign,
  User,
  X,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
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

const COMMON_CONSUMO_PRESETS = [
  "Hambúrguer no plantão",
  "Lanche e Bebida",
  "Refrigerante / Bebida",
  "Sobremesa",
  "Combo Plantão",
];

const COMMON_VALE_PRESETS = [
  "Adiantamento PIX",
  "Vale emergencial",
  "Adiantamento quinzenal",
  "Despesas de transporte",
  "Farmácia / Saúde",
];

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

  // Initialize or reset when opened
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

  // Sync payment method default when type changes
  useEffect(() => {
    if (type === "Consumo da Loja") {
      setPaymentMethod("Consumo / Produto");
    } else {
      setPaymentMethod("PIX");
    }
  }, [type]);

  if (!isOpen) return null;

  // Find active employee details
  const selectedEmployee = defaultEmployee || employees.find((e) => e.id === employeeId);

  const parsedAmount = Math.max(
    0,
    parseFloat(amountStr.replace(/\./g, "").replace(",", ".")) || 0
  );
  const amountCents = Math.round(parsedAmount * 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) {
      setError("Selecione um colaborador.");
      return;
    }
    if (amountCents <= 0) {
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

      // 1. Registro principal: employeeVales
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
        amount: amountCents,
        paymentMethod: type === "Consumo da Loja" ? "Consumo / Produto" : paymentMethod,
        status: "Pendente",
        description: description.trim(),
        payableId,
        notes: notes.trim(),
      };

      // 2. Criação automática no Contas a Pagar (payables)
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
        description: `${type === "Consumo da Loja" ? "Consumo da Loja" : "Vale/Adiantamento"}: ${selectedEmployee.name}${
          description.trim() ? ` - ${description.trim()}` : ""
        }`,
        competence: competence || date.slice(0, 7),
        dueDate: date,
        originalAmount: amountCents,
        amount: amountCents,
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
        notes: `Lançado via RH (Vales & Consumo) para o colaborador ${selectedEmployee.name}. ID Vale: ${valeId}`,
        sourceId: valeId,
      };

      // Salva no banco
      await saveManagement(valeRecord, data);
      await saveManagement(payableRecord, data);

      setSuccessMsg(
        `${type} de ${formatCurrency(parsedAmount)} registrado com sucesso e enviado ao Contas a Pagar!`
      );

      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      console.error("Erro ao salvar vale:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar o vale. Verifique a conexão e permissões."
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
        style={{ maxWidth: 540, width: "95vw" }}
      >
        {/* Header */}
        <header className="task-modal-header">
          <div className="task-modal-title-box">
            <div
              className="task-modal-icon-badge"
              style={{
                backgroundColor: type === "Vale Avulso" ? "#eff6ff" : "#fef3c7",
                color: type === "Vale Avulso" ? "#2563eb" : "#d97706",
              }}
            >
              {type === "Vale Avulso" ? <Wallet size={20} /> : <Utensils size={20} />}
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Lançamento Ágil (Vale / Consumo)
              </h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
                Abatimento direto na folha com lançamento automático em Contas a Pagar
              </p>
            </div>
          </div>
          <button
            type="button"
            className="task-modal-close"
            onClick={onClose}
            disabled={loading}
            title="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ padding: "18px 24px" }}>
          {error && (
            <div
              style={{
                backgroundColor: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#b91c1c",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                backgroundColor: "#dcfce7",
                border: "1px solid #86efac",
                color: "#15803d",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tipo de Lançamento (Toggle Cards) */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "#475569",
                marginBottom: 6,
              }}
            >
              TIPO DE ABATIMENTO *
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() => setType("Vale Avulso")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border:
                    type === "Vale Avulso"
                      ? "2px solid #2563eb"
                      : "1px solid #e2e8f0",
                  backgroundColor: type === "Vale Avulso" ? "#eff6ff" : "#ffffff",
                  color: type === "Vale Avulso" ? "#1d4ed8" : "#334155",
                  fontWeight: type === "Vale Avulso" ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    backgroundColor: type === "Vale Avulso" ? "#dbeafe" : "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: type === "Vale Avulso" ? "#2563eb" : "#64748b",
                  }}
                >
                  <Wallet size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.2 }}>Vale Avulso</div>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>
                    PIX / Dinheiro
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType("Consumo da Loja")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border:
                    type === "Consumo da Loja"
                      ? "2px solid #d97706"
                      : "1px solid #e2e8f0",
                  backgroundColor: type === "Consumo da Loja" ? "#fffbeb" : "#ffffff",
                  color: type === "Consumo da Loja" ? "#b45309" : "#334155",
                  fontWeight: type === "Consumo da Loja" ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    backgroundColor: type === "Consumo da Loja" ? "#fef3c7" : "#f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: type === "Consumo da Loja" ? "#d97706" : "#64748b",
                  }}
                >
                  <Utensils size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 13, lineHeight: 1.2 }}>Consumo Loja</div>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>
                    Lanches / Bebidas
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Colaborador */}
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "#475569",
                marginBottom: 5,
              }}
            >
              COLABORADOR *
            </label>
            {defaultEmployee ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: "#e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#475569",
                  }}
                >
                  <User size={15} />
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

          {/* Valor & Data (Linha Dupla) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: 5,
                }}
              >
                VALOR DO ABATIMENTO (R$) *
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
                  style={{
                    paddingLeft: 34,
                    fontSize: 16,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                />
              </div>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: 5,
                }}
              >
                DATA DO FATO *
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
          </div>

          {/* Competência (Mês de desconto) & Forma de Pagamento */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1.2fr",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: 5,
                }}
              >
                MÊS DE DESCONTO *
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

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: 5,
                }}
              >
                FORMA DE PAGAMENTO
              </label>
              {type === "Consumo da Loja" ? (
                <input
                  type="text"
                  className="mg-input"
                  value="Consumo / Produto Interno"
                  disabled
                  style={{ backgroundColor: "#f8fafc", color: "#64748b", fontSize: 13 }}
                />
              ) : (
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
              )}
            </div>
          </div>

          {/* Descrição / Observação */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 5,
              }}
            >
              <label
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#475569",
                }}
              >
                DESCRIÇÃO / OBSERVAÇÃO OPCIONAL
              </label>
            </div>
            <input
              type="text"
              className="mg-input"
              placeholder={
                type === "Consumo da Loja"
                  ? 'Ex.: "Hambúrguer no plantão de sábado", "Refrigerante"'
                  : 'Ex.: "Adiantamento PIX", "Vale de emergência"'
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ fontSize: 13, marginBottom: 6 }}
            />

            {/* Presets rápidos */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {(type === "Consumo da Loja"
                ? COMMON_CONSUMO_PRESETS
                : COMMON_VALE_PRESETS
              ).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDescription(preset)}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    borderRadius: 99,
                    fontSize: 11,
                    color: "#475569",
                    padding: "2px 8px",
                    cursor: "pointer",
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Box de Informação: Contas a Pagar Integrado */}
          <div
            style={{
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 8,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              color: "#166534",
              marginBottom: 18,
            }}
          >
            <FileSpreadsheet size={18} style={{ flexShrink: 0, color: "#16a34a" }} />
            <div>
              <strong>Integração Financeira Automática:</strong> Este vale criará
              automaticamente uma obrigação em <em>Contas a Pagar</em> na categoria{" "}
              <strong>Folha / Pessoal</strong> para conciliação.
            </div>
          </div>

          {/* Ações */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              borderTop: "1px solid #e2e8f0",
              paddingTop: 14,
            }}
          >
            <button
              type="button"
              className="workspace-secondary"
              onClick={onClose}
              disabled={loading}
              style={{ fontSize: 13 }}
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
                backgroundColor: type === "Vale Avulso" ? "#2563eb" : "#d97706",
              }}
            >
              {loading ? (
                "Salvando…"
              ) : (
                <>
                  Confirmar {type} de {formatCurrency(parsedAmount || 0)}
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
