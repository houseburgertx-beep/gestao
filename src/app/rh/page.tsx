"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, CalendarDays, CircleDollarSign, Download, FileText, Mail, MapPin, Phone, Plus, Search, Upload, UserCheck, UserRound, UsersRound } from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";
import { useAuth } from "@/contexts/AuthContext";
import { Employee } from "@/types";
import { subscribeEmployees } from "@/services/firestoreService";
import { formatCurrency, formatDate } from "@/lib/utils";
import { NewEmployeeModal } from "@/components/rh/NewEmployeeModal";
import { Drawer } from "@/components/ui/Drawer";
import { store } from "@/services/store";
import { downloadFileFromDrive, formatFileSize, nameFileForDrive, uploadFileToDrive } from "@/services/driveService";
import type { DocumentItem } from "@/types";
import "@/components/management/management.css";

const STATUS: Record<Employee["status"], string> = {
  active: "Ativo",
  vacation: "Férias",
  leave: "Afastado",
  terminated: "Desligado",
};

export default function RhPage() {
  const { filterByUnit, activeUnitData } = useUnit();
  const { userProfile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeEmployees((rows) => {
      setEmployees(rows);
      setLoading(false);
    });
    setDocuments(store.getDocuments());
    const refreshDocs=()=>setDocuments(store.getDocuments()); window.addEventListener("house190_data_updated",refreshDocs);
    const open = () => setIsNewOpen(true);
    window.addEventListener("open-employee-form", open);
    if (new URLSearchParams(window.location.search).get("novo") === "1") open();
    return () => { unsubscribe(); window.removeEventListener("open-employee-form", open); window.removeEventListener("house190_data_updated",refreshDocs); };
  }, []);

  const scoped = useMemo(() => filterByUnit(employees), [employees, filterByUnit]);
  const filtered = scoped.filter((employee) => {
    const query = search.toLocaleLowerCase();
    return (!status || employee.status === status) && (!query || `${employee.name} ${employee.role} ${employee.department}`.toLocaleLowerCase().includes(query));
  });
  const active = scoped.filter((employee) => employee.status === "active");
  const vacation = scoped.filter((employee) => employee.status === "vacation");
  const leave = scoped.filter((employee) => employee.status === "leave");
  const payroll = active.reduce((total, employee) => total + Number(employee.salary || 0), 0);
  const canSeePayroll = userProfile?.role === "admin" || userProfile?.role === "accountant";
  const today = new Date().toISOString().slice(0,10);
  const in30 = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const experienceAlerts=scoped.filter(e=>e.experienceEndDate&&e.experienceEndDate>=today&&e.experienceEndDate<=in30);
  const vacationAlerts=scoped.filter(e=>e.vacationStart&&e.vacationStart>=today&&e.vacationStart<=in30);

  return (
    <div className="workspace-shell people-workspace">
      <header className="workspace-header">
        <div><span className="workspace-eyebrow">GESTÃO DE PESSOAS</span><h1>Equipe</h1><p>Colaboradores ativos, férias, afastamentos e custo salarial por loja.</p></div>
        <button className="workspace-primary" onClick={() => setIsNewOpen(true)}><Plus size={17} /> Novo colaborador</button>
      </header>

      <section className="people-hero">
        <div><span>UNIDADE SELECIONADA</span><h2>{activeUnitData.name}</h2><p>Informações sincronizadas com o Firebase.</p></div>
        <div className="people-hero-number"><UsersRound size={26} /><strong>{scoped.length}</strong><span>pessoas cadastradas</span></div>
      </section>

      <section className="workspace-metrics">
        <Metric icon={UserCheck} tone="green" label="Em atividade" value={String(active.length)} />
        <Metric icon={CalendarDays} tone="purple" label="Em férias" value={String(vacation.length)} />
        <Metric icon={UserRound} tone="orange" label="Afastados" value={String(leave.length)} />
        <Metric icon={BriefcaseBusiness} tone="blue" label="Setores" value={String(new Set(active.map((employee) => employee.department)).size)} />
        <Metric icon={CircleDollarSign} tone="red" label="Salários ativos" value={canSeePayroll ? formatCurrency(payroll) : "Restrito"} compact />
      </section>

      {(experienceAlerts.length>0||vacationAlerts.length>0)&&<section className="people-alerts"><h2><AlertTriangle size={17}/> Alertas de pessoas — próximos 30 dias</h2>{experienceAlerts.map(e=><button key={`exp-${e.id}`} onClick={()=>setSelected(e)}><strong>Experiência</strong><span>{e.name}</span><b>{formatDate(e.experienceEndDate!)}</b></button>)}{vacationAlerts.map(e=><button key={`vac-${e.id}`} onClick={()=>setSelected(e)}><strong>Férias</strong><span>{e.name}</span><b>{formatDate(e.vacationStart!)}</b></button>)}</section>}

      <section className="workspace-toolbar">
        <label className="workspace-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, cargo ou setor" /></label>
        <label className="workspace-select"><UserRound size={15} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos os status</option>{Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </section>

      {loading ? (
        <div className="people-empty">Carregando colaboradores…</div>
      ) : filtered.length ? (
        <section className="people-grid">
          {filtered.map((employee) => (
            <article className="people-card" key={employee.id} onClick={() => setSelected(employee)}>
              <div className="people-avatar">
                {employee.photoUrl ? <img src={employee.photoUrl} alt="" /> : <span>{employee.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span>}
                <i className={employee.status} />
              </div>
              <div className="people-card-main"><h3>{employee.name}</h3><p>{employee.role || "Cargo pendente"}</p><span>{employee.department || "Setor pendente"}</span></div>
              <div className="people-card-meta"><b className={employee.status}>{STATUS[employee.status]}</b><span>Admissão {formatDate(employee.admissionDate)}</span></div>
            </article>
          ))}
        </section>
      ) : (
        <div className="people-empty"><UsersRound size={32} /><strong>Nenhum colaborador encontrado</strong><span>Cadastre pessoas reais ou ajuste os filtros.</span></div>
      )}

      <Drawer isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name || "Colaborador"} subtitle={`${selected?.role || "Cargo pendente"} · ${selected?.department || "Setor pendente"}`} width="lg">
        {selected && (
          <div className="people-detail">
            <div className="people-detail-status"><span className={selected.status}>{STATUS[selected.status]}</span><small>{activeUnitData.name}</small></div>
            <section><h3>Contato</h3><p><Phone size={15} /> {selected.phone || "DADO PENDENTE"}</p><p><Mail size={15} /> {selected.email || "DADO PENDENTE"}</p><p><MapPin size={15} /> {selected.address || "DADO PENDENTE"}</p></section>
            <section><h3>Contrato</h3><dl><div><dt>Admissão</dt><dd>{formatDate(selected.admissionDate)}</dd></div><div><dt>Contrato</dt><dd>{selected.contractType}</dd></div><div><dt>Horário</dt><dd>{selected.workHours || "DADO PENDENTE"}</dd></div><div><dt>Gestor</dt><dd>{selected.managerName || "DADO PENDENTE"}</dd></div>{canSeePayroll && <div><dt>Salário</dt><dd>{formatCurrency(selected.salary)}</dd></div>}</dl></section>
            <section><h3>Datas importantes</h3><dl><div><dt>Fim da experiência</dt><dd>{selected.experienceEndDate?formatDate(selected.experienceEndDate):"DADO PENDENTE"}</dd></div><div><dt>Próximas férias</dt><dd>{selected.vacationStart?`${formatDate(selected.vacationStart)} a ${selected.vacationEnd?formatDate(selected.vacationEnd):"DADO PENDENTE"}`:"DADO PENDENTE"}</dd></div></dl></section>
            {canSeePayroll&&<section><h3>Dados bancários</h3><dl><div><dt>Banco</dt><dd>{selected.bankName||"DADO PENDENTE"}</dd></div><div><dt>Agência</dt><dd>{selected.bankAgency||"DADO PENDENTE"}</dd></div><div><dt>Conta</dt><dd>{selected.bankAccount||"DADO PENDENTE"} {selected.bankAccountType?`(${selected.bankAccountType})`:""}</dd></div><div><dt>Titular</dt><dd>{selected.bankHolderName||"DADO PENDENTE"}</dd></div><div><dt>CPF</dt><dd>{selected.bankHolderCpf||"DADO PENDENTE"}</dd></div></dl></section>}
            <EmployeeFiles employee={selected} documents={documents.filter(doc=>doc.employeeId===selected.id)} onSaved={()=>setDocuments(store.getDocuments())}/>
            {selected.notes && <section><h3>Observações</h3><p>{selected.notes}</p></section>}
          </div>
        )}
      </Drawer>
      <NewEmployeeModal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} />
    </div>
  );
}

function EmployeeFiles({employee,documents,onSaved}:{employee:Employee;documents:DocumentItem[];onSaved:()=>void}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  return <section><h3>Documentos do funcionário</h3><label className="employee-file-upload"><Upload size={15}/><span>{busy?"Salvando no Drive…":"Enviar documento"}</span><input type="file" className="sr-only" disabled={busy} onChange={async e=>{
    const file=e.target.files?.[0];if(!file)return;
    setBusy(true);setError("");
    try {
      const saved=await uploadFileToDrive(nameFileForDrive(file,`${employee.name} - documento`),"documents");
      await store.addDocument({title:file.name,category:"employees",unitId:employee.unitId,employeeId:employee.id,size:formatFileSize(saved.size),format:file.name.split(".").pop()||"arquivo",url:`drive:${saved.fileId}`,driveFileId:saved.fileId,originalFileName:saved.fileName,mimeType:saved.mimeType,tags:["Funcionário","Google Drive"]});
      onSaved();
    } catch (cause) { setError(cause instanceof Error?cause.message:"Não foi possível salvar o documento."); }
    finally {setBusy(false);}
  }}/></label>{error&&<p className="text-rose-600" role="alert">{error}</p>}{documents.length?documents.map(doc=><button className="employee-document" key={doc.id} onClick={()=>doc.driveFileId&&downloadFileFromDrive(doc.driveFileId,doc.originalFileName||doc.title)}><FileText size={14}/><span>{doc.title}</span><Download size={13}/></button>):<p>Nenhum documento enviado.</p>}</section>;
}

function Metric({ icon: Icon, tone, label, value, compact = false }: { icon: typeof UsersRound; tone: string; label: string; value: string; compact?: boolean }) {
  return <div className={`workspace-metric ${tone}`}><span><Icon size={18} /></span><div><small>{label}</small><strong className={compact ? "compact" : ""}>{value}</strong></div></div>;
}
