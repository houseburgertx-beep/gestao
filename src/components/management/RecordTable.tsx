"use client";
import React, { useEffect, useRef, useState } from "react";
import { Plus, X, Pencil, Paperclip, Download, Cloud, Zap } from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  RecordData,
  Field,
  DEFINITIONS,
  Database,
  currency,
  dateToday,
  addDays,
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
import {
  downloadFileFromDrive,
  nameFileForDrive,
  uploadFileToDrive,
} from "@/services/driveService";
import { backupPayablesSpreadsheet } from "@/services/payablesBackupService";
import { addNotificationToFirestore } from "@/services/firestoreService";

function readBrazilianAmount(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function documentFields(text: string, suppliers: RecordData[]) {
  const compact = text.replace(/\s+/g, " ").trim();
  const barcode = compact.match(/(?:\d[ .-]?){44,48}/)?.[0]?.replace(/\D/g, "") || "";
  const dateMatch = compact.match(/(?:vencimento|vence em|data de vencimento).{0,35}?(\d{2}[/-]\d{2}[/-]\d{4})/i) || compact.match(/\d{2}[/-]\d{2}[/-]\d{4}/);
  const dueDate = dateMatch?.[1] || dateMatch?.[0] || "";
  const valueMatch = compact.match(/(?:valor(?:\s+(?:do\s+)?documento|\s+a\s+pagar)?|total).{0,35}?(R?\$?\s*[\d.]+,\d{2})/i) || compact.match(/R?\$?\s*[\d.]+,\d{2}/);
  const supplier = suppliers.find((item) => {
    const name = str(item, "name").trim().toLowerCase();
    return name.length > 2 && compact.toLowerCase().includes(name);
  });
  return {
    documentNumber: barcode,
    dueDate: dueDate ? dueDate.replace(/(\d{2})[/-](\d{2})[/-](\d{4})/, "$3-$2-$1") : "",
    amount: valueMatch ? readBrazilianAmount(valueMatch[1] || valueMatch[0]) : 0,
    supplier,
  };
}
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
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [editing, setEditing] = useState<RecordData | false | null>(null);
  const [paying, setPaying] = useState<RecordData | null>(null);
  const [message, setMessage] = useState("");
  const def = {...DEFINITIONS[kind],label:kind === "revenues" ? "Lançamentos manuais de faturamento" : DEFINITIONS[kind].label};
  const canWrite =
    userProfile?.role === "admin" ||
    userProfile?.role === "accountant" ||
    (userProfile?.role === "manager" && kind === "actions") ||
    (userProfile?.role === "operator" && kind === "cashClosings");
  useEffect(() => {
    if (!["payables", "suppliers", "cashClosings", "cashConferences"].includes(kind)) return;
    const open = () => {
      setMessage("");
      setEditing(false);
    };
    const eventName = kind === "payables" ? "open-payable-form" : kind === "suppliers" ? "open-supplier-form" : `open-${kind}-form`;
    window.addEventListener(eventName, open);
    if (new URLSearchParams(window.location.search).get("novo") === "1") open();
    return () => window.removeEventListener(eventName, open);
  }, [kind]);
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
    )
    .filter((r) => {
      if (kind !== "payables" || statusFilter === "Todos") return true;
      const status = payableStatus(r, data, filters.today);
      if (statusFilter === "Próximos 7 dias")
        return outstanding(r, data, filters.today) > 0 && str(r, "dueDate") >= filters.today && str(r, "dueDate") <= addDays(filters.today, 7);
      return status === statusFilter;
    });
  const columns = (kind === "payables"
    ? ["dueDate", "description", "obligationType", "paymentMethod", "amount"]
        .map((key) => def.fields.find((field) => field.key === key))
        .filter(Boolean) as Field[]
    : def.fields
    .filter(
      (f) =>
        f.type !== "textarea" &&
        f.type !== "check" &&
        !(kind === "units" && ["companyId", "brandId"].includes(f.key)),
    )
    .slice(0, 5));
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
          <Plus size={16} /> {kind === "payables" ? "Nova conta" : "Novo registro"}
        </button>
      </div>
      {message && (
        <p role="status" className="mg-status-message">
          {message}
        </p>
      )}
      {kind === "payables" && (
        <nav className="payables-table-filters" aria-label="Filtrar contas por situação">
          {["Todos", "Vencido", "Vencendo", "Próximos 7 dias", "Pago"].map((status) => (
            <button
              key={status}
              className={statusFilter === status ? "active" : ""}
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </nav>
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
                  <tr id={`record-${r.id}`}>
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
                        {kind === "payables" && r.documentFileId && (
                          <button
                            className="mg-button secondary"
                            title={str(r, "documentFileName") || "Baixar boleto"}
                            onClick={() =>
                              downloadFileFromDrive(
                                str(r, "documentFileId"),
                                str(r, "documentFileName") || "boleto",
                              )
                            }
                          >
                            <Download size={13} /> Boleto
                          </button>
                        )}
                        {kind === "payables" && (() => {
                          const proof = data.transactions.find((item) => item.obligationId === r.id && item.paymentProofFileId && !item.reversalOf);
                          return proof ? <button className="mg-button secondary" onClick={() => downloadFileFromDrive(str(proof, "paymentProofFileId"), str(proof, "paymentProofFileName") || "comprovante")}><Download size={13}/> Comprovante</button> : null;
                        })()}
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
                              className="mg-button instant"
                              disabled={!canWrite}
                              onClick={() => setPaying(r)}
                            >
                              <Zap size={13}/> Pagar agora
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
                                  const reversal = await reverseSettlement(
                                    r,
                                    data,
                                    user.uid,
                                    dateToday(),
                                  );
                                  try {
                                    await backupPayablesSpreadsheet(data, [reversal]);
                                    setMessage("Estorno registrado e planilha de backup atualizada.");
                                  } catch {
                                    setMessage("Estorno registrado. O backup em planilha não pôde ser criado agora.");
                                  }
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
          onSaved={(savedMessage) => {
            setEditing(null);
            setMessage(savedMessage || "Registro salvo e confirmado na nuvem.");
          }}
        />
      )}
      {paying && (
        <SettlementForm
          record={paying}
          onClose={() => setPaying(null)}
          onSaved={(savedMessage) => {
            setPaying(null);
            setMessage(savedMessage || "Baixa registrada na obrigação e no caixa.");
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
  onSaved: (message?: string) => void;
}) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { user } = useAuth();
  const def = DEFINITIONS[kind];
  const [id] = useState(() => record?.id || crypto.randomUUID());
  const [unit, setUnit] = useState(record?.unitId || suggestedUnit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readingDocument, setReadingDocument] = useState(false);
  const [documentReadMessage, setDocumentReadMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const scanPayableDocument = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setDocumentReadMessage("Para preencher automaticamente, envie uma foto legível do boleto ou da nota fiscal.");
      return;
    }
    setReadingDocument(true);
    setDocumentReadMessage("Lendo documento…");
    try {
      const { recognize } = await import("tesseract.js");
      const result = await recognize(file, "por");
      const found = documentFields(result.data.text, data.suppliers);
      const form = formRef.current;
      if (!form) return;
      const setValue = (name: string, value: string) => {
        const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (field && value) field.value = value;
      };
      setValue("documentNumber", found.documentNumber);
      setValue("dueDate", found.dueDate);
      if (found.amount) {
        setValue("amount", (found.amount / 100).toFixed(2));
        setValue("originalAmount", (found.amount / 100).toFixed(2));
      }
      if (found.supplier) {
        setValue("supplierId", found.supplier.id);
        setValue("description", `Documento de ${str(found.supplier, "name")}`);
      }
      const filled = [found.supplier && "fornecedor", found.dueDate && "vencimento", found.amount && "valor", found.documentNumber && "código"].filter(Boolean);
      setDocumentReadMessage(filled.length ? `Preenchido automaticamente: ${filled.join(", ")}. Confira antes de salvar.` : "Não encontrei os dados com segurança. Preencha os campos manualmente.");
    } catch {
      setDocumentReadMessage("Não foi possível ler esta imagem. Tente uma foto mais nítida, sem reflexos e com todo o boleto visível.");
    } finally {
      setReadingDocument(false);
    }
  };
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
      if (kind === "payables") {
        next.competence = next.competence || str(next, "dueDate").slice(0, 7);
        next.status = next.status || "Pendente";
        next.nature = next.nature || "Operacional";
        next.originalAmount = next.originalAmount || next.amount;
        const document = form.get("documentFile");
        if (document instanceof File && document.size > 0) {
          const named = nameFileForDrive(
            document,
            `${str(next, "description")} - ${str(next, "dueDate")}`,
          );
          const stored = await uploadFileToDrive(named, "payment_proofs");
          next.documentFileId = stored.fileId;
          next.documentFileName = stored.fileName;
          next.documentMimeType = stored.mimeType;
          next.documentSize = stored.size;
        }
      }
      const savedRows = await saveManagement(next, data);
      if (savedRows.some((row) => row.kind === "payables")) {
        const dueDate = str(next, "dueDate");
        const today = dateToday();
        if (dueDate && dueDate <= today) {
          await addNotificationToFirestore({
            type: str(next, "obligationType") === "Imposto" ? "tax" : "payable",
            title: dueDate < today ? "Conta já vencida incluída" : "Conta vence hoje",
            message: `${str(next, "description")} · ${currency(Number(next.amount || 0))} · vencimento ${dueDate.split("-").reverse().join("/")}.`,
            link: "/contas-a-pagar/",
            severity: dueDate < today ? "danger" : "warning",
            read: false,
            timestamp: new Date().toISOString(),
          });
        }
        try {
          await backupPayablesSpreadsheet(data, savedRows);
          onSaved("Conta salva e planilha de backup criada no Google Drive.");
        } catch {
          onSaved("Conta salva no sistema. O backup em planilha não pôde ser criado agora.");
        }
      } else onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };
  const payableMainFields = new Set([
    "obligationType",
    "description",
    "supplierId",
    "dueDate",
    "originalAmount",
    "amount",
    "paymentMethod",
    "documentNumber",
  ]);
  const renderField = (field: Field) => {
    const value = record?.[field.key];
    const inputType =
      field.type === "money" || field.type === "number" || field.type === "percent"
        ? "number"
        : field.type === "date"
          ? "date"
          : field.type === "month"
            ? "month"
            : "text";
    return field.type === "check" ? (
      <label key={field.key} className="check-field full">
        <input type="checkbox" name={field.key} defaultChecked={value === true} />
        {field.label}
      </label>
    ) : (
      <label key={field.key} className={field.type === "textarea" ? "full" : ""}>
        {field.label}{field.required ? " *" : ""}
        {field.type === "select" ? (
          <select
            name={field.key}
            required={field.required}
            defaultValue={String(value || (field.key === "status" ? "Pendente" : ""))}
          >
            <option value="">Selecione</option>
            {field.options?.map((option) => <option key={option}>{option}</option>)}
          </select>
        ) : field.type === "ref" ? (
          <select name={field.key} required={field.required} defaultValue={String(value || "")}>
            <option value="">Selecione</option>
            {data[field.ref!]
              ?.filter((item) => !item.archived && (DEFINITIONS[field.ref!].global || item.unitId === unit))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {String(item.name || item.description || item.contract || item.bank || item.id)}
                </option>
              ))}
          </select>
        ) : field.type === "textarea" ? (
          <textarea name={field.key} required={field.required} rows={3} defaultValue={String(value || "")} />
        ) : (
          <input
            name={field.key}
            required={field.required}
            type={inputType}
            step={["money", "number", "percent"].includes(field.type || "") ? "0.01" : undefined}
            defaultValue={
              value === undefined || value === null
                ? ""
                : field.type === "money"
                  ? Number(value) / 100
                  : String(value)
            }
          />
        )}
        {field.hint && <small>{field.hint}</small>}
      </label>
    );
  };
  return (
    <ModalShell
      title={`${record ? "Editar" : "Cadastrar"} ${def.singular}`}
      onClose={() => !busy && onClose()}
    >
      <form ref={formRef} className="mg-form" onSubmit={save}>
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
        {(kind === "payables"
          ? def.fields.filter((field) => payableMainFields.has(field.key))
          : def.fields
        ).map(renderField)}
        {kind === "payables" && (
          <>
            <label className="full mg-file-field">
              <span><Paperclip size={15} /> Anexar boleto, guia ou comprovante</span>
              <input name="documentFile" type="file" accept=".pdf,image/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) scanPayableDocument(file); }} />
              {record?.documentFileName && (
                <small>Arquivo atual: {str(record, "documentFileName")}</small>
              )}
              <small>{readingDocument ? "Lendo a foto…" : documentReadMessage || "Envie uma foto do boleto ou da nota fiscal para preencher fornecedor, vencimento, valor e código."}</small>
            </label>
            <details className="full mg-form-advanced">
              <summary>Mais detalhes</summary>
              <div className="mg-form">
                {def.fields.filter((field) => !payableMainFields.has(field.key)).map(renderField)}
              </div>
            </details>
            <p className="full mg-backup-note">
              <Cloud size={16} /> Ao salvar, o sistema cria automaticamente uma planilha de backup no Google Drive.
            </p>
          </>
        )}
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
  onSaved: (message?: string) => void;
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
            const proof = form.get("paymentProof");
            if (proof instanceof File && proof.size > 0) {
              const named = nameFileForDrive(proof, `Comprovante - ${str(record, "description")} - ${String(form.get("date"))}`);
              const stored = await uploadFileToDrive(named, "payment_proofs");
              row.paymentProofFileId = stored.fileId;
              row.paymentProofFileName = stored.fileName;
              row.paymentProofMimeType = stored.mimeType;
              row.paymentProofSize = stored.size;
            }
            await commitRecords([row], data, row);
            try {
              await backupPayablesSpreadsheet(data, [row]);
              onSaved("Pagamento registrado e planilha de backup atualizada no Google Drive.");
            } catch {
              onSaved("Pagamento registrado. O backup em planilha não pôde ser criado agora.");
            }
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
        <label className="full mg-file-field">
          <span><Paperclip size={15}/> Comprovante de pagamento no Google Drive</span>
          <input name="paymentProof" type="file" accept=".pdf,image/*" />
          <small>Opcional. O arquivo fica no Drive e vinculado permanentemente a esta baixa.</small>
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
            {k === "revenues" ? "Lançamentos manuais" : DEFINITIONS[k].label}
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
