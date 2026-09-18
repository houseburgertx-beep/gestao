"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Wallet,
  Utensils,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageCircle,
  CheckCheck,
  RotateCcw,
  Building2,
  Plus,
  ArrowUpRight,
  Filter,
  Copy,
  Receipt,
  Search,
  Eye,
  Check,
  Pencil,
  X,
  Send,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { saveManagement } from "@/services/managementService";
import { store } from "@/services/store";
import { saveEmployeeToFirestore } from "@/services/firestoreService";
import type { RecordData } from "@/domain/management/model";
import { Employee, UnitId } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface PayrollClosingTabProps {
  employees: Employee[];
  onOpenValeModal: (emp?: Employee) => void;
  onSelectEmployee?: (emp: Employee) => void;
}

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const UNITS_MAP: Record<string, string> = {
  teixeira: "Teixeira de Freitas",
  eunapolis: "Eunápolis",
  foodpark: "Food Park",
  central: "Central / Administrativo",
};

export function PayrollClosingTab({
  employees,
  onOpenValeModal,
  onSelectEmployee,
}: PayrollClosingTabProps) {
  const { data, tenantId } = useManagement();
  const { user } = useAuth();

  // Navigation Month YYYY-MM
  const [currentYearMonth, setCurrentYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Unit filter: "all" | "teixeira" | "eunapolis" | "foodpark" | "central"
  const [selectedUnit, setSelectedUnit] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [savingAction, setSavingAction] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Edição ágil de salário (FGTS/INSS/faltas)
  const [editingSalaryEmpId, setEditingSalaryEmpId] = useState<string | null>(null);
  const [tempSalaryStr, setTempSalaryStr] = useState("");
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, number>>({});

  // Geração de Contas a Pagar por colaborador
  const [generatingPayables, setGeneratingPayables] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Parse current year and month for display
  const [yearNum, monthNum] = useMemo(() => {
    const [y, m] = currentYearMonth.split("-").map(Number);
    return [y, m];
  }, [currentYearMonth]);

  const monthLabel = useMemo(() => {
    return `${MONTH_NAMES[monthNum - 1]} de ${yearNum}`;
  }, [yearNum, monthNum]);

  // Cálculo do 5º dia útil do mês seguinte para vencimento da folha
  const fifthBusinessDay = useMemo(() => {
    let targetYear = yearNum;
    let targetMonth = monthNum + 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
    let count = 0;
    let day = 1;
    while (count < 5 && day <= 31) {
      const d = new Date(targetYear, targetMonth - 1, day);
      const dayOfWeek = d.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      if (count === 5) {
        return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
      day++;
    }
    return `${targetYear}-${String(targetMonth).padStart(2, "0")}-07`;
  }, [yearNum, monthNum]);

  // Contas a pagar de folha já geradas neste mês
  const existingPayrollPayables = useMemo(() => {
    return (data.payables || []).filter(
      (p) =>
        !p.archived &&
        String(p.competence || "").slice(0, 7) === currentYearMonth &&
        p.obligationType === "Folha / Pessoal" &&
        String(p.sourceId || "").startsWith("payroll-")
    );
  }, [data.payables, currentYearMonth]);

  // Navigate months
  const handlePrevMonth = () => {
    let nextY = yearNum;
    let nextM = monthNum - 1;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    setCurrentYearMonth(`${nextY}-${String(nextM).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    let nextY = yearNum;
    let nextM = monthNum + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    setCurrentYearMonth(`${nextY}-${String(nextM).padStart(2, "0")}`);
  };

  // All vales from management data
  const valesRecords = useMemo(() => {
    return (data.employeeVales || []).filter(
      (r) => !r.archived && String(r.competence || "").slice(0, 7) === currentYearMonth
    );
  }, [data.employeeVales, currentYearMonth]);

  // Active employees scoped to unit filter
  const scopedEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (emp.status === "terminated") return false;
      if (selectedUnit !== "all" && emp.unitId !== selectedUnit) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = (emp.name || "").toLowerCase().includes(q);
        const matchRole = (emp.role || "").toLowerCase().includes(q);
        if (!matchName && !matchRole) return false;
      }
      return true;
    });
  }, [employees, selectedUnit, searchTerm]);

  // Group vales by employeeId
  const valesByEmployee = useMemo(() => {
    const map = new Map<string, RecordData[]>();
    for (const r of valesRecords) {
      const empId = String(r.employeeId || "");
      if (!empId) continue;
      const list = map.get(empId) || [];
      list.push(r);
      map.set(empId, list);
    }
    return map;
  }, [valesRecords]);

  // 4 Top Indicator Calculations
  const metrics = useMemo(() => {
    let grossTotal = 0;
    for (const emp of scopedEmployees) {
      const sal = salaryOverrides[emp.id] ?? Number(emp.salary || 0);
      grossTotal += sal;
    }

    let valesAvulsosTotalCents = 0;
    let consumoLojaTotalCents = 0;

    for (const r of valesRecords) {
      // Filter by unit if not "all"
      if (selectedUnit !== "all" && r.unitId !== selectedUnit) continue;

      const amt = typeof r.amount === "number" ? r.amount : 0;
      if (r.type === "Vale Avulso") {
        valesAvulsosTotalCents += amt;
      } else {
        consumoLojaTotalCents += amt;
      }
    }

    const valesAvulsosTotal = valesAvulsosTotalCents / 100;
    const consumoLojaTotal = consumoLojaTotalCents / 100;
    const netTotal = Math.max(0, grossTotal - valesAvulsosTotal - consumoLojaTotal);

    return {
      grossTotal,
      valesAvulsosTotal,
      consumoLojaTotal,
      netTotal,
    };
  }, [scopedEmployees, valesRecords, selectedUnit, salaryOverrides]);

  // Calculate individual employee values
  const employeeRows = useMemo(() => {
    return scopedEmployees.map((emp) => {
      const items = valesByEmployee.get(emp.id) || [];
      const valesList = items.filter((i) => i.type === "Vale Avulso");
      const consumoList = items.filter((i) => i.type === "Consumo da Loja");

      const valesTotalCents = valesList.reduce(
        (acc, cur) => acc + (typeof cur.amount === "number" ? cur.amount : 0),
        0
      );
      const consumoTotalCents = consumoList.reduce(
        (acc, cur) => acc + (typeof cur.amount === "number" ? cur.amount : 0),
        0
      );

      const valesTotal = valesTotalCents / 100;
      const consumoTotal = consumoTotalCents / 100;
      const baseSalary = salaryOverrides[emp.id] ?? Number(emp.salary || 0);
      const netSalary = Math.max(0, baseSalary - valesTotal - consumoTotal);

      const pendingCount = items.filter((i) => i.status !== "Abatido").length;
      const allAbatidos = items.length > 0 && pendingCount === 0;

      return {
        emp,
        items,
        valesList,
        consumoList,
        valesTotal,
        consumoTotal,
        baseSalary,
        netSalary,
        pendingCount,
        allAbatidos,
        hasVales: items.length > 0,
      };
    });
  }, [scopedEmployees, valesByEmployee]);

  // Bulk action: Liquidar / Abater todos do mês
  const handleSettleAllInMonth = async () => {
    const pendingRecords = valesRecords.filter((r) => {
      if (selectedUnit !== "all" && r.unitId !== selectedUnit) return false;
      return r.status !== "Abatido";
    });

    if (pendingRecords.length === 0) {
      alert("Não há vales ou consumos pendentes neste mês para liquidar.");
      return;
    }

    if (
      !confirm(
        `Deseja marcar ${pendingRecords.length} lançamentos pendentes como "Abatidos" neste mês?`
      )
    ) {
      return;
    }

    setSavingAction(true);
    try {
      const now = new Date().toISOString();
      for (const rec of pendingRecords) {
        const updated: RecordData = {
          ...rec,
          status: "Abatido",
          updatedAt: now,
          updatedBy: user?.uid || "system",
        };
        await saveManagement(updated, data);
      }
    } catch (err) {
      console.error("Erro ao liquidar vales:", err);
      alert("Erro ao liquidar vales. Verifique a conexão.");
    } finally {
      setSavingAction(false);
    }
  };

  // Toggle status for all vales of a specific employee in this month
  const handleToggleEmployeeValesStatus = async (
    empId: string,
    items: RecordData[],
    currentStatusAllAbatido: boolean
  ) => {
    if (items.length === 0) return;
    const targetStatus = currentStatusAllAbatido ? "Pendente" : "Abatido";

    setSavingAction(true);
    try {
      const now = new Date().toISOString();
      for (const rec of items) {
        const updated: RecordData = {
          ...rec,
          status: targetStatus,
          updatedAt: now,
          updatedBy: user?.uid || "system",
        };
        await saveManagement(updated, data);
      }
    } catch (err) {
      console.error("Erro ao alternar status:", err);
      alert("Erro ao alterar status dos vales.");
    } finally {
      setSavingAction(false);
    }
  };

  // Salvar edição ágil de salário (FGTS/INSS/faltas/adicionais)
  const handleSaveSalary = async (emp: Employee) => {
    const parsed = parseFloat(tempSalaryStr.replace(/\./g, "").replace(",", ".")) || 0;
    if (parsed < 0) return;

    try {
      // 1. Atualiza no store local
      store.updateEmployee({ ...emp, salary: parsed });

      // 2. Atualiza no Firestore employees
      await saveEmployeeToFirestore({ ...emp, salary: parsed }).catch(console.warn);

      // 3. Atualiza em gestao_employees se presente
      const mgmtEmp = (data.employees || []).find(
        (e) => e.id === emp.id || (e.cpf && emp.cpf && e.cpf === emp.cpf)
      );
      if (mgmtEmp) {
        await saveManagement(
          {
            ...mgmtEmp,
            salary: Math.round(parsed * 100),
            updatedAt: new Date().toISOString(),
            updatedBy: user?.uid || "system",
          },
          data
        ).catch(console.warn);
      }

      setSalaryOverrides((prev) => ({ ...prev, [emp.id]: parsed }));
      setEditingSalaryEmpId(null);
    } catch (err) {
      console.error("Erro ao salvar salário:", err);
      alert("Erro ao salvar o salário do colaborador.");
    }
  };

  // Geração de Contas a Pagar: cria 1 débito por colaborador com saldo líquido
  const handleGeneratePayables = async () => {
    const eligibleRows = employeeRows.filter((r) => r.netSalary > 0);
    if (eligibleRows.length === 0) {
      alert("Nenhum colaborador com saldo líquido a pagar nesta competência.");
      return;
    }

    const totalNet = eligibleRows.reduce((acc, r) => acc + r.netSalary, 0);
    const [fYear, fMonth, fDay] = fifthBusinessDay.split("-");
    const dueDateDisplay = `${fDay}/${fMonth}/${fYear}`;

    const confirmMsg =
      `Deseja gerar os débitos da folha no Contas a Pagar para ${eligibleRows.length} colaboradores?\n\n` +
      `• Competência: ${monthLabel}\n` +
      `• Previsão de Pagamento (5º dia útil): ${dueDateDisplay}\n` +
      `• Valor Total Líquido: ${formatCurrency(totalNet)}\n\n` +
      `Cada colaborador virará um débito individual em Contas a Pagar.`;

    if (!confirm(confirmMsg)) return;

    setGeneratingPayables(true);
    setFeedbackMsg(null);

    try {
      const now = new Date().toISOString();
      let count = 0;

      for (const row of eligibleRows) {
        const { emp, baseSalary, valesTotal, consumoTotal, netSalary } = row;
        const payableId = `payroll-${currentYearMonth}-${emp.id}`;
        const amountCents = Math.round(netSalary * 100);

        const payableRecord: RecordData = {
          id: payableId,
          kind: "payables",
          tenantId: tenantId || "house-burgers",
          unitId: emp.unitId || "teixeira",
          version: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: user?.uid || "system",
          updatedBy: user?.uid || "system",
          obligationType: "Folha / Pessoal",
          description: `Folha Líquida: ${emp.name} (${monthLabel})`,
          competence: currentYearMonth,
          dueDate: fifthBusinessDay,
          originalAmount: amountCents,
          amount: amountCents,
          paymentMethod:
            emp.bankData?.toLowerCase().includes("dinheiro")
              ? "Dinheiro em espécie"
              : "PIX",
          nature: "Operacional",
          status: "Pendente",
          notes: `Fechamento de folha ${monthLabel}. Salário base: ${formatCurrency(
            baseSalary
          )}, Vales: -${formatCurrency(valesTotal)}, Consumo (20% OFF): -${formatCurrency(
            consumoTotal
          )}. Saldo líquido a pagar: ${formatCurrency(netSalary)}.`,
          sourceId: payableId,
        };

        await saveManagement(payableRecord, data);
        count++;
      }

      setFeedbackMsg({
        type: "success",
        text: `${count} débitos de folha gerados/atualizados no Contas a Pagar com vencimento em ${dueDateDisplay}!`,
      });
    } catch (err) {
      console.error("Erro ao gerar débitos de folha:", err);
      setFeedbackMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Erro ao gerar contas a pagar.",
      });
    } finally {
      setGeneratingPayables(false);
    }
  };

  // Format WhatsApp message & trigger copy/open
  const handleSendWhatsApp = (row: (typeof employeeRows)[0]) => {
    const { emp, baseSalary, valesList, consumoList, valesTotal, consumoTotal, netSalary } =
      row;
    const unitTitle = UNITS_MAP[emp.unitId] || emp.unitId || "House Burguer";

    let message = `🍔 *HOUSE BURGUER — FECHAMENTO DE FOLHA*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `Olá, *${emp.name}*!\n`;
    message += `Segue o demonstrativo da sua folha referente a *${monthLabel}*:\n\n`;
    message += `🏢 *Unidade:* ${unitTitle}\n`;
    message += `💼 *Cargo:* ${emp.role || "Colaborador"}\n\n`;
    message += `💵 *Salário Base:* ${formatCurrency(baseSalary)}\n\n`;

    if (valesList.length > 0) {
      message += `🔻 *Vales Avulsos / Adiantamentos:*\n`;
      valesList.forEach((v) => {
        const dayStr = String(v.date || "").slice(8, 10);
        const monthPart = String(v.date || "").slice(5, 7);
        const dFmt = dayStr && monthPart ? `${dayStr}/${monthPart}` : "";
        const desc = v.description ? ` (${v.description})` : "";
        const amt = formatCurrency(Number(v.amount || 0) / 100);
        message += `   • ${dFmt ? `${dFmt}: ` : ""}${amt}${desc}\n`;
      });
      message += `   *Subtotal Vales:* -${formatCurrency(valesTotal)}\n\n`;
    } else {
      message += `🔻 *Vales Avulsos:* R$ 0,00\n\n`;
    }

    if (consumoList.length > 0) {
      message += `🍔 *Consumo da Loja (com 20% de desconto):*\n`;
      consumoList.forEach((c) => {
        const dayStr = String(c.date || "").slice(8, 10);
        const monthPart = String(c.date || "").slice(5, 7);
        const dFmt = dayStr && monthPart ? `${dayStr}/${monthPart}` : "";
        const desc = c.description ? ` (${c.description})` : "Consumo";
        const amt = formatCurrency(Number(c.amount || 0) / 100);
        message += `   • ${dFmt ? `${dFmt}: ` : ""}${amt} (${desc})\n`;
      });
      message += `   *Subtotal Consumo:* -${formatCurrency(consumoTotal)}\n\n`;
    } else {
      message += `🍔 *Consumo da Loja:* R$ 0,00\n\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `💰 *TOTAL LÍQUIDO A RECEBER:* *${formatCurrency(netSalary)}*\n`;
    message += `🗓 *Previsão de Pagamento:* 5º dia útil\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `_Em caso de dúvidas ou divergências, procure a gerência ou o RH._`;

    // Copy to clipboard
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(message);
      setCopiedId(emp.id);
      setTimeout(() => setCopiedId(null), 3000);
    }

    // Open WhatsApp
    const rawPhone = String(emp.phone || "").replace(/\D/g, "");
    if (rawPhone.length >= 10) {
      const fullPhone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
      window.open(
        `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer"
      );
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Barra de Controles: Mês, Unidade, Botão Minimalista Contas a Pagar e Novo Vale */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "16px 20px",
          backgroundColor: "#ffffff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {/* Navegação Mês a Mês */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              padding: "2px 4px",
            }}
          >
            <button
              type="button"
              onClick={handlePrevMonth}
              title="Mês anterior"
              style={{
                background: "none",
                border: "none",
                padding: "6px 8px",
                cursor: "pointer",
                color: "#475569",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 10px",
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                minWidth: 160,
                justifyContent: "center",
              }}
            >
              <Calendar size={15} style={{ color: "#2563eb" }} />
              <span>{monthLabel}</span>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              title="Próximo mês"
              style={{
                background: "none",
                border: "none",
                padding: "6px 8px",
                cursor: "pointer",
                color: "#475569",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Filtro por Unidade */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Building2 size={16} style={{ color: "#64748b" }} />
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="mg-input"
              style={{
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                color: "#1e293b",
                borderRadius: 8,
              }}
            >
              <option value="all">Todas as Unidades</option>
              <option value="teixeira">Teixeira de Freitas</option>
              <option value="eunapolis">Eunápolis</option>
              <option value="foodpark">Food Park</option>
              <option value="central">Central / Admin</option>
            </select>
          </div>
        </div>

        {/* Lado Direito: Ações (Novo Vale, Liquidar Todos, Link Minimalista Contas a Pagar) */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Botão solicitado pelo usuário: Criar débito da folha para o contas a pagar por colaborador */}
          <button
            type="button"
            onClick={handleGeneratePayables}
            disabled={generatingPayables}
            className="workspace-secondary"
            title="Criar débitos da folha no Contas a Pagar para cada colaborador deste mês"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              padding: "7px 12px",
              borderRadius: 8,
              backgroundColor: existingPayrollPayables.length > 0 ? "#f0fdf4" : "#f8fafc",
              borderColor: existingPayrollPayables.length > 0 ? "#86efac" : "#cbd5e1",
              color: existingPayrollPayables.length > 0 ? "#15803d" : "#334155",
              cursor: "pointer",
            }}
          >
            <Send size={14} style={{ color: existingPayrollPayables.length > 0 ? "#16a34a" : "#2563eb" }} />
            <span>
              {generatingPayables
                ? "Gerando débitos…"
                : existingPayrollPayables.length > 0
                ? `Atualizar no Contas a Pagar (${existingPayrollPayables.length})`
                : "Lançar Folha no Contas a Pagar"}
            </span>
          </button>

          {/* Atalho minimalista para abrir o Contas a Pagar */}
          <Link
            href="/contas-a-pagar"
            title="Ir para o módulo de Contas a Pagar"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontWeight: 500,
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              backgroundColor: "#ffffff",
              color: "#64748b",
              textDecoration: "none",
              transition: "all 0.15s ease",
            }}
          >
            <ExternalLink size={13} style={{ color: "#64748b" }} />
            <span>Ver Contas a Pagar</span>
          </Link>

          {/* Botão Liquidar Todos do Mês */}
          <button
            type="button"
            className="workspace-secondary"
            onClick={handleSettleAllInMonth}
            disabled={savingAction}
            title="Marcar todos os vales e consumos pendentes deste mês como abatidos"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              padding: "7px 12px",
              borderRadius: 8,
            }}
          >
            <CheckCheck size={16} style={{ color: "#16a34a" }} />
            <span>Liquidar Todos</span>
          </button>

          {/* Botão de Lançamento Ágil de Vale */}
          <button
            type="button"
            className="workspace-primary"
            onClick={() => onOpenValeModal()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 700,
              padding: "7px 14px",
              borderRadius: 8,
              backgroundColor: "#2563eb",
            }}
          >
            <Plus size={16} />
            <span>+ Lançar Vale / Consumo</span>
          </button>
        </div>
      </div>

      {/* Banner de Feedback da Geração de Contas a Pagar */}
      {feedbackMsg && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 16px",
            borderRadius: 8,
            backgroundColor: feedbackMsg.type === "success" ? "#f0fdf4" : "#fef2f2",
            border: feedbackMsg.type === "success" ? "1px solid #86efac" : "1px solid #fecaca",
            color: feedbackMsg.type === "success" ? "#166534" : "#991b1b",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {feedbackMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 4 Indicadores Automáticos no Topo */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
        }}
      >
        {/* 1. Folha Bruta Total */}
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: "#f1f5f9",
              color: "#334155",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircleDollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              FOLHA BRUTA TOTAL
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#0f172a" }}>
              {formatCurrency(metrics.grossTotal)}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>
              {scopedEmployees.length} colaboradores ativos
            </div>
          </div>
        </div>

        {/* 2. Total de Vales Avulsos */}
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: "#eff6ff",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Wallet size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 600 }}>
              TOTAL DE VALES AVULSOS
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#1e3a8a" }}>
              {formatCurrency(metrics.valesAvulsosTotal)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              Adiantamentos em PIX / Dinheiro
            </div>
          </div>
        </div>

        {/* 3. Total de Consumo da Loja */}
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "16px 18px",
            borderRadius: 12,
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: "#fffbeb",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Utensils size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#d97706", fontWeight: 600 }}>
              CONSUMO DA LOJA
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#92400e" }}>
              {formatCurrency(metrics.consumoLojaTotal)}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>
              Lanches, bebidas e produtos
            </div>
          </div>
        </div>

        {/* 4. Líquido a Pagar no 5º dia útil */}
        <div
          style={{
            backgroundColor: "#f0fdf4",
            padding: "16px 18px",
            borderRadius: 12,
            border: "1.5px solid #86efac",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: "#dcfce7",
              color: "#16a34a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}>
              LÍQUIDO A PAGAR (5º DIA ÚTIL)
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#14532d" }}>
              {formatCurrency(metrics.netTotal)}
            </div>
            <div style={{ fontSize: 11, color: "#166534" }}>
              Salários (-) Vales (-) Consumo
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Acerto Individual */}
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        {/* Cabeçalho com Busca Rápida */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              Tabela de Acerto Individual — {monthLabel}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748b" }}>
              Cálculo exato de abatimentos por colaborador com demonstrativo pronto para WhatsApp
            </p>
          </div>

          <div style={{ position: "relative", width: 260 }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#94a3b8",
              }}
            />
            <input
              type="text"
              className="mg-input"
              placeholder="Buscar colaborador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: 32, fontSize: 13, height: 36 }}
            />
          </div>
        </div>

        {/* Tabela */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", color: "#475569" }}>
                  COLABORADOR
                </th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#475569" }}>
                  UNIDADE
                </th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "#475569" }}>
                  SALÁRIO BASE
                </th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "#2563eb" }}>
                  VALES AVULSOS
                </th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "#d97706" }}>
                  CONSUMO LOJA
                </th>
                <th style={{ textAlign: "right", padding: "10px 14px", color: "#166534" }}>
                  LÍQUIDO A RECEBER
                </th>
                <th style={{ textAlign: "center", padding: "10px 12px", color: "#475569" }}>
                  STATUS VALES
                </th>
                <th style={{ textAlign: "center", padding: "10px 16px", color: "#475569" }}>
                  AÇÕES
                </th>
              </tr>
            </thead>
            <tbody>
              {employeeRows.map((row) => {
                const {
                  emp,
                  items,
                  valesList,
                  consumoList,
                  valesTotal,
                  consumoTotal,
                  baseSalary,
                  netSalary,
                  pendingCount,
                  allAbatidos,
                  hasVales,
                } = row;

                return (
                  <tr
                    key={emp.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      transition: "background 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    {/* Colaborador */}
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            backgroundColor: "#e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#475569",
                            fontWeight: 700,
                            fontSize: 12,
                            flexShrink: 0,
                          }}
                        >
                          {emp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              color: "#0f172a",
                              cursor: onSelectEmployee ? "pointer" : "default",
                            }}
                            onClick={() => onSelectEmployee && onSelectEmployee(emp)}
                          >
                            {emp.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {emp.role || "Colaborador"}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Unidade */}
                    <td style={{ padding: "12px 12px" }}>
                      <span
                        style={{
                          backgroundColor: "#f1f5f9",
                          color: "#475569",
                          padding: "3px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {UNITS_MAP[emp.unitId] || emp.unitId || "Geral"}
                      </span>
                    </td>

                    {/* Salário Base (com edição rápida de FGTS/faltas/ajustes) */}
                    <td
                      style={{
                        padding: "12px 12px",
                        textAlign: "right",
                        fontWeight: 600,
                        color: "#334155",
                      }}
                    >
                      {editingSalaryEmpId === emp.id ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 4,
                          }}
                        >
                          <input
                            type="text"
                            inputMode="decimal"
                            className="mg-input"
                            value={tempSalaryStr}
                            onChange={(e) => setTempSalaryStr(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveSalary(emp);
                              if (e.key === "Escape") setEditingSalaryEmpId(null);
                            }}
                            autoFocus
                            placeholder="0,00"
                            style={{
                              width: 80,
                              height: 28,
                              fontSize: 12,
                              padding: "2px 6px",
                              textAlign: "right",
                              fontWeight: 700,
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveSalary(emp)}
                            title="Salvar novo salário"
                            style={{
                              background: "#16a34a",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: 4,
                              width: 22,
                              height: 22,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSalaryEmpId(null)}
                            title="Cancelar"
                            style={{
                              background: "#e2e8f0",
                              color: "#475569",
                              border: "none",
                              borderRadius: 4,
                              width: 22,
                              height: 22,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: 6,
                          }}
                        >
                          <span>{formatCurrency(baseSalary)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSalaryEmpId(emp.id);
                              setTempSalaryStr(
                                baseSalary ? baseSalary.toFixed(2).replace(".", ",") : "0,00"
                              );
                            }}
                            title="Ajustar salário / descontos (FGTS, faltas, adicionais)"
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: "2px 4px",
                              borderRadius: 4,
                              color: "#94a3b8",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "#2563eb";
                              e.currentTarget.style.backgroundColor = "#eff6ff";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "#94a3b8";
                              e.currentTarget.style.backgroundColor = "transparent";
                            }}
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Vales Avulsos */}
                    <td
                      style={{
                        padding: "12px 12px",
                        textAlign: "right",
                        color: valesTotal > 0 ? "#2563eb" : "#94a3b8",
                        fontWeight: valesTotal > 0 ? 700 : 400,
                      }}
                    >
                      {valesTotal > 0 ? (
                        <div>
                          <div>-{formatCurrency(valesTotal)}</div>
                          <small style={{ fontSize: 10, color: "#64748b" }}>
                            {valesList.length} adiantamento(s)
                          </small>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Consumo Loja */}
                    <td
                      style={{
                        padding: "12px 12px",
                        textAlign: "right",
                        color: consumoTotal > 0 ? "#d97706" : "#94a3b8",
                        fontWeight: consumoTotal > 0 ? 700 : 400,
                      }}
                    >
                      {consumoTotal > 0 ? (
                        <div>
                          <div>-{formatCurrency(consumoTotal)}</div>
                          <small style={{ fontSize: 10, color: "#64748b" }}>
                            {consumoList.length} item(ns)
                          </small>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    {/* Líquido a Receber */}
                    <td style={{ padding: "12px 14px", textAlign: "right" }}>
                      <span
                        style={{
                          backgroundColor: "#f0fdf4",
                          color: "#15803d",
                          padding: "4px 10px",
                          borderRadius: 8,
                          fontWeight: 800,
                          fontSize: 14,
                          display: "inline-block",
                        }}
                      >
                        {formatCurrency(netSalary)}
                      </span>
                    </td>

                    {/* Status Vales */}
                    <td style={{ padding: "12px 12px", textAlign: "center" }}>
                      {!hasVales ? (
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>Sem vales</span>
                      ) : allAbatidos ? (
                        <span
                          style={{
                            backgroundColor: "#dcfce7",
                            color: "#15803d",
                            padding: "3px 8px",
                            borderRadius: 99,
                            fontSize: 11,
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <CheckCircle2 size={12} /> Abatidos
                        </span>
                      ) : (
                        <span
                          style={{
                            backgroundColor: "#fef3c7",
                            color: "#b45309",
                            padding: "3px 8px",
                            borderRadius: 99,
                            fontSize: 11,
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <AlertCircle size={12} /> {pendingCount} pendente(s)
                        </span>
                      )}
                    </td>

                    {/* Ações */}
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {/* Botão WhatsApp em 1 clique */}
                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(row)}
                          title="Enviar demonstrativo via WhatsApp e copiar texto"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "5px 10px",
                            borderRadius: 6,
                            border: "1px solid #86efac",
                            backgroundColor: "#f0fdf4",
                            color: "#15803d",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          <MessageCircle size={14} />
                          <span>{copiedId === emp.id ? "Copiado!" : "WhatsApp"}</span>
                        </button>

                        {/* Botão Novo Vale Individual */}
                        <button
                          type="button"
                          onClick={() => onOpenValeModal(emp)}
                          title="Lançar novo vale para este colaborador"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "5px 7px",
                            borderRadius: 6,
                            border: "1px solid #cbd5e1",
                            backgroundColor: "#ffffff",
                            color: "#475569",
                            cursor: "pointer",
                          }}
                        >
                          <Plus size={14} />
                        </button>

                        {/* Alternar Status (se houver vales) */}
                        {hasVales && (
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleEmployeeValesStatus(emp.id, items, allAbatidos)
                            }
                            disabled={savingAction}
                            title={
                              allAbatidos
                                ? "Reverter para Pendente"
                                : "Marcar todos como Abatidos"
                            }
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "5px 7px",
                              borderRadius: 6,
                              border: allAbatidos
                                ? "1px solid #fed7aa"
                                : "1px solid #bbf7d0",
                              backgroundColor: allAbatidos ? "#fff7ed" : "#f0fdf4",
                              color: allAbatidos ? "#c2410c" : "#166534",
                              cursor: "pointer",
                            }}
                          >
                            {allAbatidos ? (
                              <RotateCcw size={13} />
                            ) : (
                              <CheckCheck size={14} />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {employeeRows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      padding: "36px 20px",
                      color: "#64748b",
                    }}
                  >
                    Nenhum colaborador encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
