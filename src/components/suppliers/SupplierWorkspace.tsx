"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Mail,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { currency, RecordData, str } from "@/domain/management/model";
import { outstanding } from "@/domain/management/engine";
import { saveManagement } from "@/services/managementService";
import { RecordForm } from "@/components/management/RecordTable";
import "@/components/management/management.css";

function formatDocument(doc: string | undefined | null): string {
  if (!doc) return "Sem documento";
  const digits = doc.replace(/\D/g, "");
  if (!digits || /^0+$/.test(digits)) return "Sem documento";
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return doc;
}

function getInitials(name: string): string {
  if (!name) return "FO";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "linear-gradient(135deg, #6366f1, #818cf8)",
  "linear-gradient(135deg, #0284c7, #38bdf8)",
  "linear-gradient(135deg, #059669, #34d399)",
  "linear-gradient(135deg, #d97706, #fbbf24)",
  "linear-gradient(135deg, #7c3aed, #a78bfa)",
  "linear-gradient(135deg, #db2777, #f472b6)",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function SupplierWorkspace() {
  const { data, filters, allowedUnit } = useManagement();
  const { user, userProfile } = useAuth();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "open" | "clear" | "no_doc">("all");
  const [editingSupplier, setEditingSupplier] = useState<RecordData | false | null>(null);
  const [message, setMessage] = useState("");

  const canWrite =
    userProfile?.role === "admin" ||
    userProfile?.role === "accountant";

  useEffect(() => {
    const open = () => setMessage("");
    window.addEventListener("open-supplier-form", () => setEditingSupplier(false));
    return () => window.removeEventListener("open-supplier-form", () => setEditingSupplier(false));
  }, []);

  const suppliers = useMemo(
    () => data.suppliers.filter((s) => !s.archived),
    [data.suppliers],
  );

  const openPayables = useMemo(
    () =>
      data.payables.filter(
        (row) => !row.archived && outstanding(row, data, filters.today) > 0,
      ),
    [data.payables, data, filters.today],
  );

  const linkedSupplierIds = useMemo(
    () => new Set(openPayables.map((row) => row.supplierId).filter(Boolean)),
    [openPayables],
  );

  const openAmount = useMemo(
    () =>
      openPayables.reduce(
        (total, row) => total + outstanding(row, data, filters.today),
        0,
      ),
    [openPayables, data, filters.today],
  );

  const missingDocumentCount = useMemo(
    () =>
      suppliers.filter((s) => {
        const digits = str(s, "document").replace(/\D/g, "");
        return !digits || /^0+$/.test(digits);
      }).length,
    [suppliers],
  );

  // Filtered suppliers
  const filteredList = useMemo(() => {
    return suppliers
      .filter((s) => {
        // Tab filter
        const hasOpen = linkedSupplierIds.has(s.id);
        const docDigits = str(s, "document").replace(/\D/g, "");
        const isDocMissing = !docDigits || /^0+$/.test(docDigits);

        if (filterTab === "open" && !hasOpen) return false;
        if (filterTab === "clear" && hasOpen) return false;
        if (filterTab === "no_doc" && !isDocMissing) return false;

        // Search filter
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const name = str(s, "name").toLowerCase();
          const doc = str(s, "document").toLowerCase();
          const email = str(s, "email").toLowerCase();
          const phone = str(s, "phone").toLowerCase();
          return (
            name.includes(q) ||
            doc.includes(q) ||
            email.includes(q) ||
            phone.includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => str(a, "name").localeCompare(str(b, "name")));
  }, [suppliers, filterTab, search, linkedSupplierIds]);

  const handleDelete = async (s: RecordData) => {
    if (!user || !canWrite) return;
    const linked = openPayables.filter((p) => p.supplierId === s.id);
    if (linked.length > 0) {
      alert(
        `Não é possível excluir o fornecedor "${s.name}": existem ${linked.length} conta(s) vinculadas em aberto. Quite ou remova as contas antes de excluir.`,
      );
      return;
    }
    const name = s.name || "este fornecedor";
    if (!confirm(`Tem certeza que deseja excluir o fornecedor "${name}"?`))
      return;
    try {
      await saveManagement(
        {
          ...s,
          archived: true,
          updatedBy: user.uid,
          updatedAt: new Date().toISOString(),
        },
        data,
        true,
      );
      setMessage(`Fornecedor "${name}" excluído com sucesso.`);
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o fornecedor.",
      );
    }
  };

  return (
    <div className="workspace-shell supplier-shell-modern">
      {/* Header */}
      <header className="workspace-header">
        <div>
          <span className="workspace-eyebrow">REDE DE FORNECIMENTO & COMPRAS</span>
          <h1>Fornecedores e Favorecidos</h1>
          <p>
            Cadastro centralizado de parceiros e distribuidores integrados diretamente ao Contas a Pagar.
          </p>
        </div>
        {canWrite && (
          <button
            className="workspace-primary supplier-btn-new"
            onClick={() => setEditingSupplier(false)}
          >
            <Plus size={16} /> Novo fornecedor
          </button>
        )}
      </header>

      {/* Metrics Row */}
      <section className="workspace-metrics supplier-metrics">
        <Metric
          icon={Building2}
          tone="purple"
          label="Fornecedores Cadastrados"
          value={String(suppliers.length)}
        />
        <Metric
          icon={ReceiptText}
          tone="blue"
          label="Com Contas em Aberto"
          value={String(linkedSupplierIds.size)}
        />
        <Metric
          icon={CircleDollarSign}
          tone="green"
          label="Total a Pagar (Fornecedores)"
          value={currency(openAmount)}
          compact
        />
        <Metric
          icon={AlertCircle}
          tone="orange"
          label="Documento Pendente"
          value={String(missingDocumentCount)}
        />
      </section>

      {message && <div className="mg-success-banner">{message}</div>}

      {/* Modern Supplier Container */}
      <div className="supplier-main-card">
        {/* Toolbar */}
        <div className="supplier-toolbar">
          <div className="supplier-filter-tabs">
            <button
              type="button"
              className={`supplier-tab-btn ${filterTab === "all" ? "active" : ""}`}
              onClick={() => setFilterTab("all")}
            >
              Todos <span className="tab-pill">{suppliers.length}</span>
            </button>
            <button
              type="button"
              className={`supplier-tab-btn ${filterTab === "open" ? "active" : ""}`}
              onClick={() => setFilterTab("open")}
            >
              Com contas a pagar <span className="tab-pill alert">{linkedSupplierIds.size}</span>
            </button>
            <button
              type="button"
              className={`supplier-tab-btn ${filterTab === "clear" ? "active" : ""}`}
              onClick={() => setFilterTab("clear")}
            >
              Sem pendências <span className="tab-pill clear">{suppliers.length - linkedSupplierIds.size}</span>
            </button>
            <button
              type="button"
              className={`supplier-tab-btn ${filterTab === "no_doc" ? "active" : ""}`}
              onClick={() => setFilterTab("no_doc")}
            >
              Sem CNPJ/CPF <span className="tab-pill">{missingDocumentCount}</span>
            </button>
          </div>

          <div className="supplier-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Buscar por nome, documento, e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch("")}
                title="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="supplier-table-wrap">
          {filteredList.length > 0 ? (
            <table className="supplier-modern-table">
              <thead>
                <tr>
                  <th>Fornecedor / Razão Social</th>
                  <th>CNPJ / CPF</th>
                  <th>Canais de Contato</th>
                  <th>Situação no Financeiro</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((s) => {
                  const sName = str(s, "name") || "Sem identificação";
                  const sDoc = str(s, "document");
                  const formattedDoc = formatDocument(sDoc);
                  const isDocPendente = formattedDoc === "Sem documento";
                  const sEmail = str(s, "email");
                  const sPhone = str(s, "phone");

                  const supplierOpenBills = openPayables.filter(
                    (p) => p.supplierId === s.id,
                  );
                  const supplierOpenSum = supplierOpenBills.reduce(
                    (acc, p) => acc + outstanding(p, data, filters.today),
                    0,
                  );

                  return (
                    <tr key={s.id} className="supplier-row">
                      {/* Fornecedor */}
                      <td>
                        <div className="supplier-identity">
                          <div
                            className="supplier-avatar"
                            style={{ background: getAvatarColor(sName) }}
                          >
                            {getInitials(sName)}
                          </div>
                          <div className="supplier-title-box">
                            <strong>{sName}</strong>
                            <small>{str(s, "category") || "Fornecedor cadastrado"}</small>
                          </div>
                        </div>
                      </td>

                      {/* CNPJ / CPF */}
                      <td>
                        <span
                          className={`supplier-doc-badge ${isDocPendente ? "pending" : ""}`}
                        >
                          {formattedDoc}
                        </span>
                      </td>

                      {/* Contatos */}
                      <td>
                        <div className="supplier-contacts-cluster">
                          {sEmail ? (
                            <span className="supplier-contact-item" title={sEmail}>
                              <Mail size={12} /> {sEmail}
                            </span>
                          ) : null}
                          {sPhone ? (
                            <span className="supplier-contact-item" title={sPhone}>
                              <Phone size={12} /> {sPhone}
                            </span>
                          ) : null}
                          {!sEmail && !sPhone && (
                            <span className="supplier-muted-empty">Não informado</span>
                          )}
                        </div>
                      </td>

                      {/* Situação no Financeiro */}
                      <td>
                        {supplierOpenBills.length > 0 ? (
                          <div className="supplier-status-pill open" title={`${supplierOpenBills.length} conta(s) em aberto no financeiro`}>
                            <AlertTriangle size={13} />
                            <span>
                              <strong>{supplierOpenBills.length} pendência(s)</strong> · {currency(supplierOpenSum)}
                            </span>
                          </div>
                        ) : (
                          <div className="supplier-status-pill clean">
                            <CheckCircle2 size={13} />
                            <span>Em dia / Sem pendências</span>
                          </div>
                        )}
                      </td>

                      {/* Ações */}
                      <td>
                        <div className="supplier-actions-cluster">
                          <button
                            type="button"
                            className="supplier-action-btn edit"
                            onClick={() => setEditingSupplier(s)}
                            title="Editar dados do fornecedor"
                          >
                            <Pencil size={12} /> Editar
                          </button>
                          {canWrite && (
                            <button
                              type="button"
                              className="supplier-action-btn delete"
                              onClick={() => handleDelete(s)}
                              title="Excluir fornecedor"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="supplier-empty-state">
              <Truck size={36} />
              <h3>Nenhum fornecedor encontrado</h3>
              <p>
                {search
                  ? `Nenhum resultado corresponde à busca "${search}".`
                  : "Não há fornecedores nesta categoria."}
              </p>
              {search && (
                <button
                  type="button"
                  className="workspace-secondary"
                  onClick={() => setSearch("")}
                >
                  Limpar busca
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Cadastro/Edição de Fornecedor */}
      {editingSupplier !== null && (
        <RecordForm
          kind="suppliers"
          record={editingSupplier || undefined}
          suggestedUnit={allowedUnit === "all" ? "" : allowedUnit}
          onClose={() => setEditingSupplier(null)}
          onSaved={(msg) => {
            setEditingSupplier(null);
            setMessage(msg || "Dados do fornecedor salvos com sucesso.");
          }}
        />
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  tone,
  label,
  value,
  compact = false,
}: {
  icon: typeof Truck;
  tone: string;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`workspace-metric ${tone}`}>
      <span>
        <Icon size={18} />
      </span>
      <div>
        <small>{label}</small>
        <strong className={compact ? "compact" : ""}>{value}</strong>
      </div>
    </div>
  );
}
