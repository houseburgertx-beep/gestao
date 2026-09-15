"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Columns3, FolderLock, ReceiptText, Search, TrendingUp, Truck, Users, X } from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { currency, str } from "@/domain/management/model";
import { outstanding } from "@/domain/management/engine";

export function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data, filters } = useManagement();
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) setTimeout(() => input.current?.focus(), 30);
    else setSearch("");
  }, [isOpen]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  if (!isOpen) return null;

  const query = search.trim().toLocaleLowerCase();
  const pages = [
    { title: "Contas a pagar", detail: "Boletos, impostos e vencimentos", href: "/", icon: ReceiptText },
    { title: "Fornecedores", detail: "Cadastros ligados ao financeiro", href: "/fornecedores", icon: Truck },
    { title: "Tarefas", detail: "Kanban dos gerentes", href: "/tarefas", icon: Columns3 },
    { title: "Equipe", detail: "Colaboradores e salários", href: "/rh", icon: Users },
    { title: "Vendas", detail: "Faturamento e metas", href: "/faturamento", icon: TrendingUp },
    { title: "Documentos", detail: "Contratos, alvarás e vencimentos", href: "/documentos", icon: FolderLock },
  ].filter((item) => !query || `${item.title} ${item.detail}`.toLocaleLowerCase().includes(query));
  const suppliers = data.suppliers.filter((item) => !item.archived && (!query || `${item.name} ${item.document}`.toLocaleLowerCase().includes(query))).slice(0, 4);
  const payables = data.payables.filter((item) => !item.archived && (!query || `${item.description} ${item.documentNumber}`.toLocaleLowerCase().includes(query))).slice(0, 4);
  const tasks = data.actions.filter((item) => !item.archived && (!query || `${item.problem} ${item.owner}`.toLocaleLowerCase().includes(query))).slice(0, 4);
  const go = (href: string) => { router.push(href); onClose(); };

  return (
    <div className="command-overlay">
      <button className="command-backdrop" aria-label="Fechar pesquisa" onClick={onClose} />
      <section className="command-dialog" role="dialog" aria-modal="true" aria-label="Pesquisa geral">
        <label className="command-input"><Search size={19} /><input ref={input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conta, fornecedor, tarefa ou página" />{search && <button onClick={() => setSearch("")}><X size={16} /></button>}</label>
        <div className="command-results">
          {!!pages.length && <Group title="Áreas">{pages.map((item) => <Result key={item.href} icon={item.icon} title={item.title} detail={item.detail} onClick={() => go(item.href)} />)}</Group>}
          {!!payables.length && <Group title="Contas a pagar">{payables.map((item) => <Result key={item.id} icon={ReceiptText} title={str(item, "description")} detail={`${currency(outstanding(item, data, filters.today))} · ${str(item, "dueDate")}`} onClick={() => go("/")} />)}</Group>}
          {!!suppliers.length && <Group title="Fornecedores">{suppliers.map((item) => <Result key={item.id} icon={Truck} title={str(item, "name")} detail={str(item, "document") || "Documento pendente"} onClick={() => go("/fornecedores")} />)}</Group>}
          {!!tasks.length && <Group title="Tarefas">{tasks.map((item) => <Result key={item.id} icon={Columns3} title={str(item, "problem")} detail={`${str(item, "owner")} · ${str(item, "status")}`} onClick={() => go("/tarefas")} />)}</Group>}
          {!pages.length && !payables.length && !suppliers.length && !tasks.length && <div className="command-empty">Nenhum resultado encontrado.</div>}
        </div>
        <footer><span>Dados reais do Firebase</span><kbd>ESC para fechar</kbd></footer>
      </section>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="command-group"><h3>{title}</h3>{children}</div>;
}
function Result({ icon: Icon, title, detail, onClick }: { icon: typeof Search; title: string; detail: string; onClick: () => void }) {
  return <button className="command-result" onClick={onClick}><span><Icon size={16} /></span><div><strong>{title}</strong><small>{detail}</small></div><ArrowRight size={15} /></button>;
}
