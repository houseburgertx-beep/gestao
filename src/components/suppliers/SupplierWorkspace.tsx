"use client";

import { AlertCircle, Building2, CircleDollarSign, Plus, ReceiptText, Truck } from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { currency } from "@/domain/management/model";
import { outstanding } from "@/domain/management/engine";
import { RecordTable } from "@/components/management/RecordTable";
import "@/components/management/management.css";

export function SupplierWorkspace() {
  const { data, filters } = useManagement();
  const suppliers = data.suppliers.filter((supplier) => !supplier.archived);
  const openPayables = data.payables.filter((row) => !row.archived && outstanding(row, data, filters.today) > 0);
  const linked = new Set(openPayables.map((row) => row.supplierId).filter(Boolean));
  const openAmount = openPayables.reduce((total, row) => total + outstanding(row, data, filters.today), 0);
  const missingDocument = suppliers.filter((supplier) => !supplier.document).length;

  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <div><span className="workspace-eyebrow">REDE DE FORNECIMENTO</span><h1>Fornecedores</h1><p>Cadastros usados diretamente nos boletos e contas a pagar.</p></div>
        <button className="workspace-primary" onClick={() => window.dispatchEvent(new CustomEvent("open-supplier-form"))}><Plus size={17} /> Novo fornecedor</button>
      </header>
      <section className="supplier-hero">
        <div><Truck size={27} /><div><span>BASE CENTRALIZADA</span><h2>Fornecedor cadastrado aparece na nova conta</h2><p>Sem duplicidade entre financeiro e cadastro.</p></div></div>
        <b>{suppliers.length}<small> fornecedores</small></b>
      </section>
      <section className="workspace-metrics supplier-metrics">
        <Metric icon={Building2} tone="purple" label="Cadastrados" value={String(suppliers.length)} />
        <Metric icon={ReceiptText} tone="blue" label="Com contas em aberto" value={String(linked.size)} />
        <Metric icon={CircleDollarSign} tone="green" label="Total em aberto" value={currency(openAmount)} compact />
        <Metric icon={AlertCircle} tone="orange" label="Documento pendente" value={String(missingDocument)} />
      </section>
      <RecordTable kind="suppliers" filters={filters} filterPeriod={false} />
    </div>
  );
}

function Metric({ icon: Icon, tone, label, value, compact = false }: { icon: typeof Truck; tone: string; label: string; value: string; compact?: boolean }) {
  return <div className={`workspace-metric ${tone}`}><span><Icon size={18} /></span><div><small>{label}</small><strong className={compact ? "compact" : ""}>{value}</strong></div></div>;
}
