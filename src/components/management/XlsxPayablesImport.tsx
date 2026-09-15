"use client";
import React, { useState } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useManagement } from "@/contexts/ManagementContext";
import { XLSX_PAYABLES_2026 } from "@/data/xlsxPayables2026";

const BATCH_SIZE = 50;

export function XlsxPayablesImport() {
  const { user, userProfile } = useAuth();
  const { tenantId, data } = useManagement();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [total] = useState(XLSX_PAYABLES_2026.length);
  const [errorMsg, setErrorMsg] = useState("");
  const [imported, setImported] = useState(0);
  const [skipped, setSkipped] = useState(0);

  if (userProfile?.role !== "admin") return null;

  const existingIds = new Set(data.payables.map((r) => r.id));

  const runImport = async () => {
    if (!user) return;
    setStatus("running");
    setProgress(0);
    setImported(0);
    setSkipped(0);
    setErrorMsg("");

    const now = new Date().toISOString();
    let imp = 0;
    let skip = 0;

    try {
      for (let i = 0; i < XLSX_PAYABLES_2026.length; i += BATCH_SIZE) {
        const batch = XLSX_PAYABLES_2026.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (record) => {
            if (existingIds.has(record.id)) {
              skip++;
              return;
            }
            const docRef = doc(db, "gestao_payables", record.id);
            await setDoc(docRef, {
              ...record,
              tenantId: tenantId || "house190",
              version: 1,
              createdAt: record.createdAt || now,
              updatedAt: now,
              createdBy: user.uid,
              updatedBy: user.uid,
            });
            imp++;
          })
        );
        setProgress(Math.min(i + BATCH_SIZE, XLSX_PAYABLES_2026.length));
        setImported(imp);
        setSkipped(skip);
        // Small pause between batches to avoid Firestore rate limiting
        await new Promise((r) => setTimeout(r, 100));
      }
      setStatus("done");
    } catch (e: unknown) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const byMonth: Record<string, { paid: number; open: number; total: number }> = {};
  for (const r of XLSX_PAYABLES_2026) {
    const m = String(r.competence || "").slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { paid: 0, open: 0, total: 0 };
    if (r.status === "Pago") byMonth[m].paid++;
    else byMonth[m].open++;
    byMonth[m].total += Number(r.amount || 0) / 100;
  }

  const totalBRL = XLSX_PAYABLES_2026.reduce((s, r) => s + Number(r.amount || 0), 0) / 100;

  return (
    <section className="mg-panel" style={{ border: "2px solid #7b6df0" }}>
      <h2 style={{ color: "#7b6df0" }}>📊 Importar Contas a Pagar 2026 (XLSX)</h2>
      <p className="mg-method">
        Arquivo: <strong>2026 - CONTAS A PAGAR ANUAL.xlsx</strong> — {total} lançamentos detectados
        — Total: <strong>R$ {totalBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
      </p>

      <div className="mg-table-wrap" style={{ marginBottom: 16 }}>
        <table className="mg-table">
          <thead>
            <tr>
              <th>Competência</th>
              <th>Pagos</th>
              <th>Em aberto</th>
              <th>Total R$</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byMonth).map(([m, s]) => (
              <tr key={m}>
                <td>{m}</td>
                <td>{s.paid}</td>
                <td>{s.open}</td>
                <td>{s.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status === "idle" && (
        <>
          <p className="mg-method" style={{ color: "#ff9f43" }}>
            ⚠️ Já importados serão ignorados automaticamente (verificação por ID). Seguro re-executar.
          </p>
          <button className="mg-btn mg-btn-primary" onClick={runImport}>
            Importar {total} lançamentos para o sistema
          </button>
        </>
      )}

      {status === "running" && (
        <div>
          <p>Importando... {progress} / {total} processados</p>
          <p>✅ Importados: {imported} | ⏭ Já existentes (ignorados): {skipped}</p>
          <div
            style={{
              width: "100%",
              background: "#29264d",
              borderRadius: 6,
              height: 12,
              overflow: "hidden",
              marginTop: 8,
            }}
          >
            <div
              style={{
                width: `${Math.round((progress / total) * 100)}%`,
                background: "#7b6df0",
                height: "100%",
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>
      )}

      {status === "done" && (
        <p style={{ color: "#00c87a", fontWeight: 600 }}>
          ✅ Importação concluída! {imported} novos registros adicionados, {skipped} já existentes ignorados.
          Acesse "Contas a pagar" no menu lateral para ver os lançamentos.
        </p>
      )}

      {status === "error" && (
        <p style={{ color: "#e84a5f" }}>
          ❌ Erro durante a importação: {errorMsg}
        </p>
      )}
    </section>
  );
}
