"use client";
import React, { useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useManagement } from "@/contexts/ManagementContext";
import { RecordData, cents } from "@/domain/management/model";
import { RecordForm } from "./RecordTable";
const SOURCES: Record<string, { label: string; kind: string }> = {
  accounts_payable: { label: "Contas a pagar anteriores", kind: "payables" },
  daily_revenues: { label: "Faturamentos anteriores", kind: "revenues" },
  unit_goals: { label: "Metas anteriores", kind: "goals" },
  employees: { label: "Funcionários anteriores", kind: "employees" },
  suppliers: { label: "Fornecedores anteriores", kind: "suppliers" },
};
export function LegacyImport() {
  const { user } = useAuth();
  const { tenantId, allowedUnit, data } = useManagement();
  const [source, setSource] = useState("accounts_payable");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<RecordData | null>(null);
  const [message, setMessage] = useState("");
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const ref = collection(db, source);
      const snapshot = await getDocs(
        allowedUnit === "all" || source === "suppliers"
          ? ref
          : query(ref, where("unitId", "==", allowedUnit)),
      );
      setRows(snapshot.docs.map((d) => ({ ...d.data(), id: d.id })));
    } catch {
      setError("Não foi possível consultar a base anterior.");
    } finally {
      setBusy(false);
    }
  };
  const review = (r: Record<string, unknown>) => {
    if (!user) return;
    const now = new Date().toISOString(),
      kind = SOURCES[source].kind;
    const result: RecordData = {
      id: `legacy-${source}-${r.id}`,
      kind,
      tenantId,
      unitId: "",
      version: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: user.uid,
      updatedBy: user.uid,
      legacySource: source,
      legacyId: String(r.id),
      notes: `Importado com revisão de ${source}/${r.id}. Unidade original: ${String(r.unitId || "não informada")}.`,
    };
    const text = (k: string) =>
      typeof r[k] === "string" ? (r[k] as string) : null;
    const money = (k: string) =>
      typeof r[k] === "number" ? cents(r[k] as number) : null;
    if (source === "accounts_payable") {
      Object.assign(result, {
        description: text("description"),
        competence: text("competence")?.includes("/")
          ? String(r.competence).split("/").reverse().join("-")
          : text("competence"),
        dueDate: text("dueDate"),
        amount: money("finalAmount"),
        status: r.status === "scheduled" ? "Agendado" : "Pendente",
        paymentMethod: text("paymentMethod"),
      });
      if (r.status === "paid" || r.status === "canceled") {
        setError(
          "Título já pago/cancelado: preserve no histórico anterior. Não importe como obrigação aberta.",
        );
        return;
      }
    }
    if (source === "daily_revenues") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) {
        setError(
          "Registro agregado sem data diária. Mantenha no histórico; não distribua por dia sem documento de origem.",
        );
        return;
      }
      Object.assign(result, {
        date: text("date"),
        gross: money("grossRevenue"),
        discounts: money("discounts"),
        cancellations: money("cancellations"),
        externalId: `legacy-${r.id}`,
      });
    }
    if (source === "unit_goals") {
      const start = `${r.year}-${String(r.month).padStart(2, "0")}-01`;
      const end = new Date(Date.UTC(Number(r.year), Number(r.month), 0, 12))
        .toISOString()
        .slice(0, 10);
      Object.assign(result, {
        description: "Meta mensal importada",
        frequency: "Mensal",
        start,
        end,
        target: money("targetAmount"),
        superTarget: money("superTargetAmount"),
      });
    }
    if (source === "employees")
      Object.assign(result, {
        name: text("name"),
        role: text("role"),
        department: text("department"),
        admissionDate: text("admissionDate"),
        salary: money("salary"),
        status:
          r.status === "active"
            ? "Ativo"
            : r.status === "vacation"
              ? "Férias"
              : r.status === "terminated"
                ? "Desligado"
                : "Afastado",
      });
    if (source === "suppliers")
      Object.assign(result, {
        name: text("tradeName") || text("legalName"),
        document: text("cnpjCpf"),
        email: text("email"),
        phone: text("phone"),
      });
    if (data[kind].some((x) => x.id === result.id)) {
      setError("Este registro já foi importado. Edite-o na base nova.");
      return;
    }
    setDraft(result);
  };
  return (
    <section className="mg-panel">
      <h2>Revisão dos dados anteriores</h2>
      <p className="mg-method mt-3">
        Os registros existentes permanecem preservados. Confira a unidade e
        complete os campos ausentes antes de importar cada registro. Não importe
        novamente no sistema anterior após a transição. Cadastros sem
        documentação não serão usados como valores reais.
      </p>
      <div className="mg-toolbar mt-4">
        <select
          aria-label="Base anterior"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setRows([]);
            setError("");
          }}
        >
          {Object.entries(SOURCES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <button className="mg-button secondary" disabled={busy} onClick={load}>
          {busy ? "Consultando…" : "Consultar base anterior"}
        </button>
      </div>
      {error && <p className="mg-error">{error}</p>}
      {message && <p className="mg-status-message">{message}</p>}
      <div className="mg-table-wrap">
        <table className="mg-table">
          <thead>
            <tr>
              <th>Origem</th>
              <th>Unidade anterior</th>
              <th>Identificação</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)}>
                <td>
                  {String(
                    r.description || r.name || r.tradeName || r.date || r.id,
                  )}
                </td>
                <td>{String(r.unitId || "—")}</td>
                <td>{String(r.id)}</td>
                <td>
                  <button
                    className="mg-button secondary"
                    onClick={() => review(r)}
                  >
                    Revisar e importar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <RecordForm
          kind={draft.kind}
          record={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            setMessage(
              "Importação revisada salva. O registro anterior foi preservado.",
            );
          }}
        />
      )}
    </section>
  );
}
