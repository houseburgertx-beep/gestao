"use client";
import React, { useEffect, useRef, useState } from "react";
import { Plus, X, Pencil, Check, ArrowDownUp } from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  RecordData,
  Field,
  DEFINITIONS,
  Database,
  currency,
  dateToday,
  str,
} from "@/domain/management/model";
import { parseField, settlement } from "@/domain/management/operations";
import {
  Filters,
  outstanding,
  payableStatus,
} from "@/domain/management/engine";
import {
  saveManagement,
  commitRecords,
  reverseSettlement,
} from "@/services/managementService";
import { Empty } from "./ManagementPage";
const fieldDisplay = (r: RecordData, f: Field, db: Database) => {
  const v = r[f.key];
  if (v === null || v === undefined || v === "") return "DADO PENDENTE";
  if (f.type === "money") return currency(Number(v));
  if (f.type === "check") return v ? "Sim" : "Não";
  if (f.type === "ref") {
    const ref = db[f.ref!]?.find((x) => x.id === v);
    return ref
      ? String(ref.name || ref.description || ref.contract || ref.bank || v)
      : "Referência pendente";
  }
  return String(v);
};
export function RecordTable({
  kind,
  filters,
  filterPeriod = true,
}: {
  kind: string;
  filters: Filters;
  filterPeriod?: boolean;
}) {
  const { data, errors, allowedUnit } = useManagement();
  const { userProfile, user } = useAuth();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<RecordData | false | null>(null);
  const [paying, setPaying] = useState<RecordData | null>(null);
  const [message, setMessage] = useState("");
  const def = DEFINITIONS[kind];
  const canWrite =
    userProfile?.role === "admin" ||
    userProfile?.role === "accountant" ||
    (userProfile?.role === "manager" &&
      !DEFINITIONS[kind].global &&
      !["closings", "coverage", "positions"].includes(kind));
  const unitIds = new Set(
    data.units
      .filter(
        (u) =>
          (!filters.unitId || u.id === filters.unitId) &&
          (!filters.companyId || u.companyId === filters.companyId) &&
          (!filters.brandId || u.brandId === filters.brandId) &&
          (!filters.group ||
            str(u, "groups")
              .split(",")
              .map((s) => s.trim())
              .includes(filters.group)),
      )
      .map((u) => u.id),
  );
  const list = (data[kind] || [])
    .filter(
      (r) =>
        !r.archived &&
        (def.global || unitIds.has(r.unitId)) &&
        (!filters.channel || !r.channel || r.channel === filters.channel) &&
        (!search ||
          Object.values(r).some((v) =>
            String(v).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
          )),
    )
    .filter(
      (r) =>
        !filterPeriod ||
        !def.dated ||
        ["payables", "receivables"].includes(kind) ||
        (str(r, def.dated).slice(0, 7) >= filters.start.slice(0, 7) &&
          str(r, def.dated).slice(0, 7) <= filters.end.slice(0, 7)),
    );
  const columns = def.fields
    .filter((f) => f.type !== "textarea" && f.type !== "check")
    .slice(0, 5);
  return (
    <section className="mg-panel">
      <div className="mg-toolbar">
        <h2>
          {def.label} <span className="mg-tag">{list.length}</span>
        </h2>
        <input
          aria-label={`Buscar em ${def.label}`}
          placeholder="Buscar registros…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className="mg-button"
          disabled={!canWrite || !!errors[kind]}
          onClick={() => {
            setMessage("");
            setEditing(false);
          }}
        >
          <Plus size={16} /> Novo registro
        </button>
      </div>
      {message && (
        <p role="status" className="mg-status-message">
          {message}
        </p>
      )}
      {list.length ? (
        <div className="mg-table-wrap">
          <table className="mg-table">
            <thead>
              <tr>
                {!def.global && <th>Unidade</th>}
                {columns.map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                {["payables", "receivables"].includes(kind) && (
                  <>
                    <th>Em aberto</th>
                    <th>Status</th>
                  </>
                )}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    {!def.global && (
                      <td>
                        {String(
                          data.units.find((u) => u.id === r.unitId)?.name ||
                            "DADO PENDENTE",
                        )}
                      </td>
                    )}
                    {columns.map((f) => (
                      <td key={f.key}>{fieldDisplay(r, f, data)}</td>
                    ))}
                    {["payables", "receivables"].includes(kind) && (
                      <>
                        <td>{currency(outstanding(r, data, filters.today))}</td>
                        <td>
                          <span
                            className={
                              "mg-tag " +
                              (payableStatus(r, data, filters.today) ===
                              "Vencido"
                                ? "bad"
                                : payableStatus(r, data, filters.today) ===
                                    "Pago"
                                  ? "good"
                                  : "")
                            }
                          >
                            {kind === "receivables" &&
                            payableStatus(r, data, filters.today) === "Pago"
                              ? "Recebido"
                              : payableStatus(r, data, filters.today)}
                          </span>
                        </td>
                      </>
                    )}
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="mg-button secondary"
                          disabled={!canWrite || Boolean(r.obligationId)}
                          onClick={() =>
                            setEditing(
                              r.sourceKind
                                ? data[str(r, "sourceKind")]?.find(
                                    (x) => x.id === r.sourceId,
                                  ) || r
                                : r,
                            )
                          }
                        >
                          <Pencil size={13} />{" "}
                          {r.obligationId
                            ? "Liquidação"
                            : r.sourceKind
                              ? "Origem"
                              : "Editar"}
                        </button>
                        {["payables", "receivables"].includes(kind) &&
                          outstanding(r, data, filters.today) > 0 && (
                            <button
                              className="mg-button"
                              disabled={!canWrite}
                              onClick={() => setPaying(r)}
                            >
                              Baixar
                            </button>
                          )}
                        {r.obligationId &&
                          !r.reversalOf &&
                          !data.transactions.some(
                            (t) => t.reversalOf === r.id,
                          ) && (
                            <button
                              className="mg-button secondary"
                              disabled={!canWrite}
                              onClick={async () => {
                                if (!user) return;
                                try {
                                  await reverseSettlement(
                                    r,
                                    data,
                                    user.uid,
                                    dateToday(),
                                  );
                                  setMessage(
                                    "Estorno registrado na data de hoje; o título voltou ao saldo em aberto.",
                                  );
                                } catch (error) {
                                  setMessage(
                                    error instanceof Error
                                      ? error.message
                                      : "Não foi possível estornar.",
                                  );
                                }
                              }}
                            >
                              Estornar hoje
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={10}>
                      <details>
                        <summary>Detalhes e origem</summary>
                        <div className="mg-form py-3">
                          {def.fields.map((f) => (
                            <div key={f.key}>
                              <span className="mg-label">{f.label}</span>
                              <p>{fieldDisplay(r, f, data)}</p>
                            </div>
                          ))}
                          <div>
                            <span className="mg-label">Identificação</span>
                            <p>{r.id}</p>
                          </div>
                          <div>
                            <span className="mg-label">Última atualização</span>
                            <p>{r.updatedAt}</p>
                          </div>
                        </div>
                      </details>
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          text={
            errors[kind] ? "DADO PENDENTE" : "Nenhum registro neste recorte"
          }
          detail={
            errors[kind]
              ? "A base ainda não está disponível."
              : "Cadastre informações reais. Ausência de registros não confirma saldo zero."
          }
        />
      )}
      {editing !== null && (
        <RecordForm
          kind={editing ? editing.kind : kind}
          record={editing || undefined}
          suggestedUnit={
            filters.unitId || (allowedUnit === "all" ? "" : allowedUnit)
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage("Registro salvo e confirmado na nuvem.");
          }}
        />
      )}
      {paying && (
        <SettlementForm
          record={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            setMessage("Baixa registrada na obrigação e no caixa.");
          }}
        />
      )}
    </section>
  );
}
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    root.current?.querySelector<HTMLElement>("button,input,select")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input,select,textarea,a[href]",
          ) || [],
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div className="mg-modal-shade">
      <div
        className="mg-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={root}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function RecordForm({
  kind,
  record,
  suggestedUnit = "",
  onClose,
  onSaved,
}: {
  kind: string;
  record?: RecordData;
  suggestedUnit?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { user } = useAuth();
  const def = DEFINITIONS[kind];
  const [id] = useState(() => record?.id || crypto.randomUUID());
  const [unit, setUnit] = useState(record?.unitId || suggestedUnit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData(e.currentTarget);
      const now = new Date().toISOString();
      const next: RecordData = {
        ...record,
        id,
        kind,
        tenantId,
        unitId: def.global ? "" : unit,
        version: record?.version || 0,
        createdAt: record?.createdAt || now,
        updatedAt: now,
        createdBy: record?.createdBy || user.uid,
        updatedBy: user.uid,
      };
      for (const field of def.fields)
        next[field.key] = parseField(field, form.get(field.key));
      if (kind === "units") next.unitId = "";
      await saveManagement(next, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title={`${record ? "Editar" : "Cadastrar"} ${def.singular}`}
      onClose={() => !busy && onClose()}
    >
      <form className="mg-form" onSubmit={save}>
        {!def.global && (
          <label className="full">
            Unidade
            <select
              value={unit}
              required
              disabled={allowedUnit !== "all"}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="">Selecione</option>
              {data.units
                .filter(
                  (u) =>
                    !u.archived &&
                    (allowedUnit === "all" || u.id === allowedUnit),
                )
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {str(u, "name")}
                  </option>
                ))}
            </select>
          </label>
        )}
        {def.fields.map((field) => {
          const value = record?.[field.key];
          const inputType =
            field.type === "money" ||
            field.type === "number" ||
            field.type === "percent"
              ? "number"
              : field.type === "date"
                ? "date"
                : field.type === "month"
                  ? "month"
                  : "text";
          return field.type === "check" ? (
            <label key={field.key} className="check-field full">
              <input
                type="checkbox"
                name={field.key}
                defaultChecked={value === true}
              />
              {field.label}
            </label>
          ) : (
            <label
              key={field.key}
              className={field.type === "textarea" ? "full" : ""}
            >
              {field.label}
              {field.required ? " *" : ""}
              {field.type === "select" ? (
                <select
                  name={field.key}
                  required={field.required}
                  defaultValue={String(value || "")}
                >
                  <option value="">Selecione</option>
                  {field.options?.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : field.type === "ref" ? (
                <select
                  name={field.key}
                  required={field.required}
                  defaultValue={String(value || "")}
                >
                  <option value="">Selecione</option>
                  {data[field.ref!]
                    ?.filter(
                      (r) =>
                        !r.archived &&
                        (DEFINITIONS[field.ref!].global || r.unitId === unit),
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {String(
                          r.name ||
                            r.description ||
                            r.contract ||
                            r.bank ||
                            r.id,
                        )}
                      </option>
                    ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  name={field.key}
                  required={field.required}
                  rows={3}
                  defaultValue={String(value || "")}
                />
              ) : (
                <input
                  name={field.key}
                  required={field.required}
                  type={inputType}
                  step={
                    ["money", "number", "percent"].includes(field.type || "")
                      ? "0.01"
                      : undefined
                  }
                  defaultValue={
                    value === undefined || value === null
                      ? ""
                      : field.type === "money"
                        ? Number(value) / 100
                        : String(value)
                  }
                />
              )}{" "}
              {field.hint && <small>{field.hint}</small>}
            </label>
          );
        })}
        {kind === "payroll" && (
          <p className="mg-method full">
            Férias = base ÷ 12; adicional = férias ÷ 3; 13º = base ÷ 12. FGTS e
            encargos usam exclusivamente as alíquotas informadas. Não inclua os
            mesmos valores novamente em “Encargos patronais”.
          </p>
        )}
        {kind === "taxes" && (
          <p className="mg-method full">
            O valor gera uma obrigação vinculada. Para guias já reconhecidas na
            folha, escolha “Sem efeito na DRE” para evitar dupla despesa;
            registre a obrigação apenas uma vez.
          </p>
        )}
        {error && (
          <p role="alert" className="mg-error">
            {error}
          </p>
        )}
        <footer>
          <button
            type="button"
            className="mg-button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="mg-button" disabled={busy}>
            {busy ? "Salvando…" : "Salvar na nuvem"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
function SettlementForm({
  record,
  onClose,
  onSaved,
}: {
  record: RecordData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data } = useManagement();
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [id] = useState(() => crypto.randomUUID());
  const today = dateToday();
  return (
    <ModalShell
      title={
        record.kind === "receivables"
          ? "Registrar recebimento"
          : "Registrar pagamento"
      }
      onClose={() => !busy && onClose()}
    >
      <form
        className="mg-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) return;
          setBusy(true);
          setError("");
          try {
            const form = new FormData(e.currentTarget);
            const row = settlement(
              record,
              data,
              Math.round(Number(form.get("amount")) * 100),
              String(form.get("date")),
              String(form.get("bank")),
              user.uid,
              id,
            );
            await commitRecords([row], data, row);
            onSaved();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Falha ao registrar baixa.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="full">
          {str(record, "description")} · em aberto:{" "}
          <b>{currency(outstanding(record, data, today))}</b>
        </p>
        <label>
          Valor da baixa
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            max={outstanding(record, data, today) / 100}
            defaultValue={outstanding(record, data, today) / 100}
            required
          />
        </label>
        <label>
          Data efetiva
          <input
            name="date"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
        </label>
        <label className="full">
          Conta bancária
          <select name="bank" required>
            <option value="">Selecione</option>
            {data.bankAccounts
              .filter((b) => !b.archived && b.unitId === record.unitId)
              .map((b) => (
                <option value={b.id} key={b.id}>
                  {str(b, "name")}
                </option>
              ))}
          </select>
        </label>
        <p className="full mg-method">
          Esta ação registra uma liquidação já realizada. O sistema não faz
          transferência bancária.
        </p>
        {error && <p className="mg-error">{error}</p>}
        <footer>
          <button
            type="button"
            className="mg-button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="mg-button" disabled={busy}>
            {busy ? "Registrando…" : "Confirmar registro da baixa"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}
export function Tables({
  kinds,
  filters,
}: {
  kinds: string[];
  filters: Filters;
}) {
  const [active, setActive] = useState(kinds[0]);
  useEffect(() => {
    if (!kinds.includes(active)) setActive(kinds[0]);
  }, [kinds.join("|")]);
  return (
    <>
      <nav className="mg-tabs" aria-label="Bases do módulo">
        {kinds.map((k) => (
          <button
            key={k}
            className={active === k ? "active" : ""}
            onClick={() => setActive(k)}
          >
            {DEFINITIONS[k].label}
          </button>
        ))}
      </nav>
      <RecordTable
        kind={active}
        filters={filters}
        filterPeriod={
          ![
            "companies",
            "brands",
            "units",
            "categories",
            "costCenters",
            "suppliers",
            "bankAccounts",
            "products",
            "policies",
            "coverage",
            "actions",
            "employees",
            "loans",
          ].includes(active)
        }
      />
    </>
  );
}
