"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileUp,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { readDocumentPages } from "@/services/documentTextReader";
import {
  parseMultiPageEmployeeDocument,
  ParsedEmployeeDocument,
} from "@/domain/management/documentParsing";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { store } from "@/services/store";
import { saveManagement } from "@/services/managementService";
import type { RecordData } from "@/domain/management/model";
import type { Employee, UnitId } from "@/types";

/* ─── types ─────────────────────────────────────────────── */

type RowStatus = "ok" | "incomplete" | "duplicate" | "saved" | "error";

interface BatchRow extends ParsedEmployeeDocument {
  /** unique key within this batch */
  rowId: string;
  status: RowStatus;
  /** populated after save attempt */
  errorMsg?: string;
  /** whether the row is selected for saving */
  selected: boolean;
}

interface BatchEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

const UNITS: { value: Exclude<UnitId, "all">; label: string }[] = [
  { value: "teixeira", label: "Teixeira de Freitas" },
  { value: "eunapolis", label: "Eunápolis" },
  { value: "foodpark", label: "Food Park" },
  { value: "central", label: "Central / Administrativo" },
];

const DEPARTMENTS = [
  "Cozinha / Produção",
  "Salão / Atendimento",
  "Bar / Bebidas",
  "Gerência / Administrativo",
  "Estoque / Compras",
  "Limpeza / Apoio",
];

const CONTRACT_TYPES: { value: "CLT" | "PJ" | "Estagio"; label: string }[] = [
  { value: "CLT", label: "CLT" },
  { value: "PJ", label: "PJ" },
  { value: "Estagio", label: "Estágio" },
];

/* ─── helpers ────────────────────────────────────────────── */

function normalizeToDate(s: string): string {
  if (!s) return "";
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

function rowStatusLabel(status: RowStatus) {
  if (status === "ok") return { label: "OK", color: "#16a34a", bg: "#dcfce7" };
  if (status === "incomplete") return { label: "Incompleto", color: "#b45309", bg: "#fef3c7" };
  if (status === "duplicate") return { label: "Duplicado", color: "#dc2626", bg: "#fee2e2" };
  if (status === "saved") return { label: "Salvo ✓", color: "#0369a1", bg: "#e0f2fe" };
  return { label: "Erro", color: "#dc2626", bg: "#fee2e2" };
}

/* ─── component ──────────────────────────────────────────── */

export function BatchEmployeeModal({ isOpen, onClose, onSuccess }: BatchEmployeeModalProps) {
  const { data, tenantId } = useManagement();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── classify row ── */
  const classifyRow = useCallback(
    (row: Omit<BatchRow, "status">): RowStatus => {
      // Check duplicate against existing employees
      const existingCpfs = new Set(
        (data.employees || [])
          .map((e) => String(e.cpf || "").replace(/\D/g, ""))
          .filter(Boolean)
      );
      const rowCpf = row.cpf.replace(/\D/g, "");
      if (rowCpf && existingCpfs.has(rowCpf)) return "duplicate";
      if (!row.name.trim() || !row.role.trim()) return "incomplete";
      return "ok";
    },
    [data.employees]
  );

  /* ── file selection ── */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    setParseProgress("Lendo documentos…");
    const allRows: BatchRow[] = [];
    const seenCpfsInBatch = new Set<string>();

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      setParseProgress(`Processando arquivo ${fi + 1}/${files.length}: ${file.name}`);
      try {
        const pages = await readDocumentPages(file);
        const parsed = parseMultiPageEmployeeDocument(pages);
        for (const p of parsed) {
          const normCpf = p.cpf.replace(/\D/g, "");
          let base: Omit<BatchRow, "status"> = {
            ...p,
            rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            selected: true,
            admissionDate: normalizeToDate(p.admissionDate) || p.admissionDate,
            birthDate: normalizeToDate(p.birthDate) || p.birthDate,
          };

          let status = classifyRow(base);

          // Also detect duplicates within the same batch
          if (status !== "duplicate" && normCpf && seenCpfsInBatch.has(normCpf)) {
            status = "duplicate";
          }
          if (normCpf) seenCpfsInBatch.add(normCpf);

          allRows.push({ ...base, status, selected: status === "ok" });
        }
      } catch (err) {
        console.warn(`[BatchImport] Erro ao processar ${file.name}:`, err);
      }
    }

    setRows(allRows);
    setParsing(false);
    if (allRows.length > 0) setStep(2);
    else setParseProgress("Nenhum funcionário encontrado nos arquivos selecionados.");
  };

  /* ── update a row field ── */
  const updateRow = (rowId: string, patch: Partial<BatchRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const updated = { ...r, ...patch };
        updated.status = classifyRow(updated);
        return updated;
      })
    );
  };

  /* ── remove a row ── */
  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  /* ── save all selected rows ── */
  const handleSaveAll = async () => {
    const toSave = rows.filter((r) => r.selected && r.status === "ok");
    if (toSave.length === 0) return;
    setSaving(true);
    setSaveProgress(0);
    let saved = 0;
    let errors = 0;

    for (let i = 0; i < toSave.length; i++) {
      const row = toSave[i];
      const now = new Date().toISOString();
      const parsedSalary = row.salary || 0;
      const empId = `emp-${Date.now()}-${i}`;

      try {
        const employeeData: Omit<Employee, "documentsCount"> = {
          id: empId,
          name: row.name.trim(),
          cpf: row.cpf.trim(),
          birthDate: row.birthDate,
          phone: "",
          email: "",
          address: row.address.trim(),
          unitId: row.unitId as Exclude<UnitId, "all">,
          department: row.department,
          role: row.role.trim(),
          admissionDate: row.admissionDate,
          salary: parsedSalary,
          contractType: row.contractType,
          workHours: row.workHours,
          managerName: "Gerência Operacional",
          status: "active",
          bankData: "",
          bankName: "",
          bankAgency: "",
          bankAccount: "",
          bankAccountType: "corrente",
          bankHolderCpf: "",
          bankHolderName: "",
          photoUrl: "",
          notes: row.notes.trim(),
        };

        store.addEmployee(employeeData);

        const mgmtRecord: RecordData = {
          id: empId,
          kind: "employees",
          tenantId: tenantId || "house190",
          unitId: row.unitId || "teixeira",
          version: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: user?.uid || "system",
          updatedBy: user?.uid || "system",
          name: employeeData.name,
          cpf: employeeData.cpf,
          birthDate: employeeData.birthDate,
          role: employeeData.role,
          department: employeeData.department,
          admissionDate: employeeData.admissionDate,
          salary: Math.round(parsedSalary * 100),
          status: "Ativo",
          notes: row.notes.trim(),
        };
        await saveManagement(mgmtRecord, data);

        setRows((prev) =>
          prev.map((r) => (r.rowId === row.rowId ? { ...r, status: "saved" } : r))
        );
        saved++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        setRows((prev) =>
          prev.map((r) => (r.rowId === row.rowId ? { ...r, status: "error", errorMsg: msg } : r))
        );
        errors++;
      }
      setSaveProgress(Math.round(((i + 1) / toSave.length) * 100));
    }

    setSavedCount(saved);
    setErrorCount(errors);
    setSaving(false);
    setStep(3);
    if (onSuccess && saved > 0) onSuccess(saved);
  };

  /* ── reset ── */
  const handleReset = () => {
    setStep(1);
    setRows([]);
    setParsing(false);
    setParseProgress("");
    setSaveProgress(0);
    setSavedCount(0);
    setErrorCount(0);
    setEditingRowId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (!isOpen) return null;

  const toSaveCount = rows.filter((r) => r.selected && r.status === "ok").length;
  const duplicateCount = rows.filter((r) => r.status === "duplicate").length;
  const incompleteCount = rows.filter((r) => r.selected && r.status === "incomplete").length;

  return (
    <div
      className="mg-modal-shade"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !parsing) onClose();
      }}
    >
      <div
        className="mg-modal task-modal-modern"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 1060, width: "96vw" }}
      >
        {/* Header */}
        <header className="task-modal-header">
          <div className="task-modal-title-box">
            <div className="task-modal-icon-badge">
              <Users size={20} />
            </div>
            <div>
              <h2>Importação em Lote</h2>
              <p>
                {step === 1 && "Selecione um ou mais arquivos PDF com fichas de registro de empregado."}
                {step === 2 && `${rows.length} registro${rows.length !== 1 ? "s" : ""} extraído${rows.length !== 1 ? "s" : ""} — revise e corrija antes de salvar.`}
                {step === 3 && `Importação concluída — ${savedCount} salvo${savedCount !== 1 ? "s" : ""}, ${errorCount} erro${errorCount !== 1 ? "s" : ""}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="task-modal-close"
            onClick={onClose}
            disabled={saving}
          >
            <X size={18} />
          </button>
        </header>

        {/* Step indicators */}
        <div style={{ display: "flex", gap: 8, padding: "12px 24px 0", alignItems: "center" }}>
          {[
            { n: 1, label: "Upload" },
            { n: 2, label: "Revisão" },
            { n: 3, label: "Resultado" },
          ].map(({ n, label }, idx) => (
            <React.Fragment key={n}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: step === n ? 700 : 400,
                  opacity: step < n ? 0.4 : 1,
                  fontSize: 13,
                  color: step === n ? "var(--color-primary, #2563eb)" : "inherit",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: step >= n ? "var(--color-primary, #2563eb)" : "#e5e7eb",
                    color: step >= n ? "#fff" : "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {n}
                </span>
                {label}
              </div>
              {idx < 2 && (
                <ChevronRight size={14} style={{ opacity: 0.35, flexShrink: 0 }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "16px 24px 24px", overflowY: "auto", maxHeight: "72vh" }}>

          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div>
              <div
                style={{
                  border: "2px dashed #cbd5e1",
                  borderRadius: 12,
                  padding: "48px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: "#f8fafc",
                  transition: "border-color 0.15s",
                }}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
              >
                {parsing ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <Loader2 size={36} className="spin" style={{ color: "#2563eb" }} />
                    <p style={{ margin: 0, color: "#374151" }}>{parseProgress}</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <FileUp size={40} style={{ color: "#94a3b8" }} />
                    <div>
                      <strong style={{ fontSize: 15 }}>Arraste o PDF aqui ou clique para selecionar</strong>
                      <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 13 }}>
                        Suporta fichas de empregado com múltiplas páginas (ex: 5035-Ficha de Empregado.pdf)
                      </p>
                    </div>
                    <button
                      type="button"
                      className="workspace-primary"
                      style={{ marginTop: 4 }}
                      onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                    >
                      <Upload size={15} /> Selecionar arquivo(s)
                    </button>
                  </div>
                )}
              </div>
              {parseProgress && !parsing && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    background: "#fef3c7",
                    borderRadius: 8,
                    color: "#92400e",
                    fontSize: 13,
                  }}
                >
                  <AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
                  {parseProgress}
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          )}

          {/* ── Step 2: Review table ── */}
          {step === 2 && (
            <div>
              {/* Summary bar */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 14,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>
                  ✅ {toSaveCount} para salvar
                </span>
                {duplicateCount > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>
                    🔴 {duplicateCount} duplicado{duplicateCount !== 1 ? "s" : ""}
                  </span>
                )}
                {incompleteCount > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#b45309" }}>
                    ⚠️ {incompleteCount} incompleto{incompleteCount !== 1 ? "s" : ""}
                  </span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="workspace-secondary"
                    style={{ fontSize: 12, padding: "5px 10px" }}
                    onClick={handleReset}
                  >
                    <RotateCcw size={13} /> Novo upload
                  </button>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ padding: "8px 6px", textAlign: "left", width: 32 }}>
                        <input
                          type="checkbox"
                          checked={rows.filter(r => r.status === "ok").every(r => r.selected)}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((r) =>
                                r.status === "ok" ? { ...r, selected: e.target.checked } : r
                              )
                            )
                          }
                        />
                      </th>
                      <th style={{ padding: "8px 6px", textAlign: "left" }}>Status</th>
                      <th style={{ padding: "8px 6px", textAlign: "left", minWidth: 200 }}>Nome</th>
                      <th style={{ padding: "8px 6px", textAlign: "left", minWidth: 130 }}>CPF</th>
                      <th style={{ padding: "8px 6px", textAlign: "left", minWidth: 140 }}>Cargo</th>
                      <th style={{ padding: "8px 6px", textAlign: "left", minWidth: 100 }}>Admissão</th>
                      <th style={{ padding: "8px 6px", textAlign: "left", minWidth: 100 }}>Salário</th>
                      <th style={{ padding: "8px 6px", textAlign: "left", minWidth: 130 }}>Unidade</th>
                      <th style={{ padding: "8px 6px", textAlign: "left", width: 80 }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const st = rowStatusLabel(row.status);
                      const isEditing = editingRowId === row.rowId;
                      return (
                        <React.Fragment key={row.rowId}>
                          <tr
                            style={{
                              borderBottom: "1px solid #e2e8f0",
                              background: row.status === "duplicate" ? "#fff5f5" : row.status === "incomplete" ? "#fffbeb" : "white",
                              opacity: row.status === "duplicate" ? 0.7 : 1,
                            }}
                          >
                            <td style={{ padding: "8px 6px" }}>
                              <input
                                type="checkbox"
                                checked={row.selected && row.status === "ok"}
                                disabled={row.status !== "ok"}
                                onChange={(e) => updateRow(row.rowId, { selected: e.target.checked })}
                              />
                            </td>
                            <td style={{ padding: "8px 6px" }}>
                              <span
                                style={{
                                  background: st.bg,
                                  color: st.color,
                                  padding: "2px 8px",
                                  borderRadius: 99,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {st.label}
                              </span>
                            </td>
                            <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                              {row.name || <em style={{ color: "#ef4444" }}>— não encontrado —</em>}
                            </td>
                            <td style={{ padding: "8px 6px", fontFamily: "monospace", fontSize: 12 }}>
                              {row.cpf || <em style={{ color: "#9ca3af" }}>—</em>}
                            </td>
                            <td style={{ padding: "8px 6px" }}>
                              {row.role || <em style={{ color: "#ef4444" }}>— faltando —</em>}
                            </td>
                            <td style={{ padding: "8px 6px" }}>
                              {row.admissionDate
                                ? new Date(row.admissionDate + "T00:00:00").toLocaleDateString("pt-BR")
                                : <em style={{ color: "#9ca3af" }}>—</em>}
                            </td>
                            <td style={{ padding: "8px 6px" }}>
                              {row.salary
                                ? row.salary.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                                : <em style={{ color: "#9ca3af" }}>—</em>}
                            </td>
                            <td style={{ padding: "8px 6px" }}>
                              {UNITS.find((u) => u.value === row.unitId)?.label || row.unitId}
                            </td>
                            <td style={{ padding: "8px 6px" }}>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  type="button"
                                  title="Editar"
                                  onClick={() => setEditingRowId(isEditing ? null : row.rowId)}
                                  style={{
                                    background: isEditing ? "#dbeafe" : "#f1f5f9",
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "4px 6px",
                                    cursor: "pointer",
                                    color: isEditing ? "#2563eb" : "#374151",
                                  }}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  title="Remover"
                                  onClick={() => removeRow(row.rowId)}
                                  style={{
                                    background: "#fef2f2",
                                    border: "none",
                                    borderRadius: 6,
                                    padding: "4px 6px",
                                    cursor: "pointer",
                                    color: "#dc2626",
                                  }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Inline edit row */}
                          {isEditing && (
                            <tr style={{ background: "#eff6ff", borderBottom: "2px solid #bfdbfe" }}>
                              <td colSpan={9} style={{ padding: "12px 16px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Nome Completo *</span>
                                    <input
                                      type="text"
                                      className="mg-input"
                                      value={row.name}
                                      onChange={(e) => updateRow(row.rowId, { name: e.target.value })}
                                      style={{ fontSize: 13 }}
                                    />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>CPF</span>
                                    <input
                                      type="text"
                                      className="mg-input"
                                      value={row.cpf}
                                      onChange={(e) => updateRow(row.rowId, { cpf: e.target.value })}
                                      style={{ fontSize: 13 }}
                                    />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Cargo / Função *</span>
                                    <input
                                      type="text"
                                      className="mg-input"
                                      value={row.role}
                                      onChange={(e) => updateRow(row.rowId, { role: e.target.value })}
                                      style={{ fontSize: 13 }}
                                    />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Data de Nascimento</span>
                                    <input
                                      type="date"
                                      className="mg-input"
                                      value={row.birthDate}
                                      onChange={(e) => updateRow(row.rowId, { birthDate: e.target.value })}
                                      style={{ fontSize: 13 }}
                                    />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Data de Admissão</span>
                                    <input
                                      type="date"
                                      className="mg-input"
                                      value={row.admissionDate}
                                      onChange={(e) => updateRow(row.rowId, { admissionDate: e.target.value })}
                                      style={{ fontSize: 13 }}
                                    />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Salário (R$)</span>
                                    <input
                                      type="number"
                                      className="mg-input"
                                      value={row.salary || ""}
                                      onChange={(e) => updateRow(row.rowId, { salary: parseFloat(e.target.value) || 0 })}
                                      style={{ fontSize: 13 }}
                                      step="0.01"
                                      min="0"
                                    />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Unidade</span>
                                    <select
                                      className="mg-input"
                                      value={row.unitId}
                                      onChange={(e) => updateRow(row.rowId, { unitId: e.target.value as any })}
                                      style={{ fontSize: 13 }}
                                    >
                                      {UNITS.map((u) => (
                                        <option key={u.value} value={u.value}>{u.label}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Departamento</span>
                                    <select
                                      className="mg-input"
                                      value={row.department}
                                      onChange={(e) => updateRow(row.rowId, { department: e.target.value })}
                                      style={{ fontSize: 13 }}
                                    >
                                      {DEPARTMENTS.map((d) => (
                                        <option key={d} value={d}>{d}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Tipo de Contrato</span>
                                    <select
                                      className="mg-input"
                                      value={row.contractType}
                                      onChange={(e) => updateRow(row.rowId, { contractType: e.target.value as any })}
                                      style={{ fontSize: 13 }}
                                    >
                                      {CONTRACT_TYPES.map((c) => (
                                        <option key={c.value} value={c.value}>{c.label}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Endereço</span>
                                    <input
                                      type="text"
                                      className="mg-input"
                                      value={row.address}
                                      onChange={(e) => updateRow(row.rowId, { address: e.target.value })}
                                      style={{ fontSize: 13 }}
                                    />
                                  </label>
                                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, gridColumn: "span 2" }}>
                                    <span style={{ fontWeight: 600, color: "#374151" }}>Observações (CTPS, CBO, eSocial)</span>
                                    <input
                                      type="text"
                                      className="mg-input"
                                      value={row.notes}
                                      onChange={(e) => updateRow(row.rowId, { notes: e.target.value })}
                                      style={{ fontSize: 13 }}
                                    />
                                  </label>
                                </div>
                                <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                                  <button
                                    type="button"
                                    className="workspace-primary"
                                    style={{ fontSize: 12, padding: "5px 14px" }}
                                    onClick={() => setEditingRowId(null)}
                                  >
                                    <CheckCircle2 size={13} /> Confirmar edição
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ padding: "24px", textAlign: "center", color: "#9ca3af" }}>
                          Nenhum registro. Faça um novo upload.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Saving progress bar */}
              {saving && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151", marginBottom: 4 }}>
                    <span>Salvando colaboradores…</span>
                    <span>{saveProgress}%</span>
                  </div>
                  <div style={{ height: 6, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        background: "#2563eb",
                        width: `${saveProgress}%`,
                        transition: "width 0.3s",
                        borderRadius: 99,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Result ── */}
          {step === 3 && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              {errorCount === 0 ? (
                <CheckCircle2 size={52} style={{ color: "#16a34a", marginBottom: 12 }} />
              ) : (
                <AlertTriangle size={52} style={{ color: "#f59e0b", marginBottom: 12 }} />
              )}
              <h3 style={{ margin: "0 0 8px" }}>
                {savedCount} colaborador{savedCount !== 1 ? "es" : ""} importado{savedCount !== 1 ? "s" : ""}!
              </h3>
              {errorCount > 0 && (
                <p style={{ color: "#dc2626", fontSize: 14 }}>
                  {errorCount} registro{errorCount !== 1 ? "s" : ""} com erro — verifique abaixo e tente novamente.
                </p>
              )}

              {/* Error list */}
              {rows.filter((r) => r.status === "error").length > 0 && (
                <div style={{ marginTop: 16, textAlign: "left" }}>
                  <strong style={{ fontSize: 13 }}>Registros com erro:</strong>
                  {rows.filter((r) => r.status === "error").map((r) => (
                    <div
                      key={r.rowId}
                      style={{
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: 8,
                        padding: "8px 12px",
                        marginTop: 6,
                        fontSize: 13,
                      }}
                    >
                      <XCircle size={13} style={{ color: "#dc2626", marginRight: 6, verticalAlign: "middle" }} />
                      <strong>{r.name || r.cpf}</strong>: {r.errorMsg}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center" }}>
                <button type="button" className="workspace-secondary" onClick={handleReset}>
                  <RotateCcw size={15} /> Nova importação
                </button>
                <button type="button" className="workspace-primary" onClick={onClose}>
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {step === 2 && (
          <footer
            style={{
              padding: "14px 24px",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              background: "#f8fafc",
            }}
          >
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              {toSaveCount === 0 ? (
                <span style={{ color: "#dc2626" }}>Nenhum registro válido selecionado.</span>
              ) : (
                <span>
                  <strong style={{ color: "#16a34a" }}>{toSaveCount}</strong> registro{toSaveCount !== 1 ? "s" : ""} ser{toSaveCount !== 1 ? "ão" : "á"} salvo{toSaveCount !== 1 ? "s" : ""}.
                  {duplicateCount > 0 && (
                    <span style={{ color: "#dc2626", marginLeft: 8 }}>
                      {duplicateCount} duplicado{duplicateCount !== 1 ? "s" : ""} ignorado{duplicateCount !== 1 ? "s" : ""}.
                    </span>
                  )}
                </span>
              )}
            </div>
            <button
              type="button"
              className="workspace-primary"
              onClick={handleSaveAll}
              disabled={saving || toSaveCount === 0}
            >
              {saving ? (
                <><Loader2 size={15} className="spin" /> Salvando…</>
              ) : (
                <><Save size={15} /> Salvar {toSaveCount} colaborador{toSaveCount !== 1 ? "es" : ""}</>
              )}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
