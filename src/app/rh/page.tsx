"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, CalendarDays, CircleDollarSign, Pencil, Plus, Search, UserCheck, UserRound, UsersRound } from "lucide-react";
import { useUnit } from "@/contexts/UnitContext";
import { useAuth } from "@/contexts/AuthContext";
import { useManagement } from "@/contexts/ManagementContext";
import { Employee } from "@/types";
import { subscribeEmployees } from "@/services/firestoreService";
import { formatCurrency, formatDate } from "@/lib/utils";
import { NewEmployeeModal } from "@/components/rh/NewEmployeeModal";
import { EditEmployeeModal } from "@/components/rh/EditEmployeeModal";
import { EmployeeDetailDrawer } from "@/components/rh/EmployeeDetailDrawer";
import { calculateTenure, getExperienceInfo } from "@/lib/tenureUtils";
import { store } from "@/services/store";
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
  const { data: mgmtData } = useManagement();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
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

  const allEmployees = useMemo(() => {
    const list = [...employees];
    const existingIds = new Set(list.map((e) => e.id));
    const existingCpfs = new Set(list.map((e) => (e.cpf || "").replace(/\D/g, "")).filter(Boolean));

    for (const row of mgmtData.employees || []) {
      const rowId = row.id;
      const rowCpf = String(row.cpf || "").replace(/\D/g, "");
      if (existingIds.has(rowId) || (rowCpf && existingCpfs.has(rowCpf))) {
        continue;
      }
      const rawStatus = String(row.status || "Ativo").toLowerCase();
      const mappedStatus: Employee["status"] =
        rawStatus.includes("férias") || rawStatus.includes("ferias") || rawStatus === "vacation"
          ? "vacation"
          : rawStatus.includes("afastad") || rawStatus === "leave"
          ? "leave"
          : rawStatus.includes("desligad") || rawStatus === "terminated"
          ? "terminated"
          : "active";

      list.push({
        id: row.id,
        name: String(row.name || ""),
        cpf: String(row.cpf || ""),
        birthDate: String(row.birthDate || ""),
        phone: String(row.phone || ""),
        email: String(row.email || ""),
        address: String(row.address || ""),
        unitId: (row.unitId as any) || "teixeira",
        department: String(row.department || "Cozinha / Produção"),
        role: String(row.role || ""),
        admissionDate: String(row.admissionDate || ""),
        salary: typeof row.salary === "number" ? row.salary / 100 : 0,
        contractType: (row.contractType as any) || "CLT",
        workHours: String(row.workHours || "44h semanais (Escala 6x1)"),
        managerName: String(row.managerName || ""),
        status: mappedStatus,
        bankData: "",
        bankName: "",
        bankAgency: "",
        bankAccount: "",
        bankAccountType: "corrente",
        bankHolderCpf: "",
        bankHolderName: "",
        photoUrl: "",
        documentsCount: 0,
        notes: String(row.notes || ""),
      });
    }
    return list;
  }, [employees, mgmtData.employees]);

  const scoped = useMemo(() => filterByUnit(allEmployees), [allEmployees, filterByUnit]);
  const filtered = scoped.filter((employee) => {
    const query = search.toLocaleLowerCase();
    const matchesQuery =
      !query ||
      `${employee.name} ${employee.role} ${employee.department}`.toLocaleLowerCase().includes(query);
    if (!matchesQuery) return false;

    if (status === "in_experience") {
      const exp = getExperienceInfo(
        employee.admissionDate,
        employee.experienceEndDate,
        employee.status === "terminated"
      );
      return employee.status === "active" && exp.inExperience;
    }

    return !status || employee.status === status;
  });

  const active = scoped.filter((employee) => employee.status === "active");
  const vacation = scoped.filter((employee) => employee.status === "vacation");
  const leave = scoped.filter((employee) => employee.status === "leave");
  const payroll = active.reduce((total, employee) => total + Number(employee.salary || 0), 0);
  const canSeePayroll = userProfile?.role === "admin" || userProfile?.role === "accountant";
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  // Alertas de experiência: colaboradores ativos em período de experiência cuja data de término está próxima (<= 30 dias)
  const experienceAlerts = scoped
    .filter((e) => {
      if (e.status !== "active") return false;
      const exp = getExperienceInfo(e.admissionDate, e.experienceEndDate, false);
      return exp.inExperience && (exp.urgency === "critical" || exp.urgency === "warning");
    })
    .sort((a, b) => {
      const expA = getExperienceInfo(a.admissionDate, a.experienceEndDate);
      const expB = getExperienceInfo(b.admissionDate, b.experienceEndDate);
      return expA.daysRemaining - expB.daysRemaining;
    });

  const vacationAlerts = scoped.filter(
    (e) => e.vacationStart && e.vacationStart >= today && e.vacationStart <= in30
  );

  return (
    <div className="workspace-shell people-workspace">
      <header className="workspace-header">
        <div>
          <span className="workspace-eyebrow">GESTÃO DE PESSOAS</span>
          <h1>Equipe</h1>
          <p>Colaboradores ativos, tempo de casa, período de experiência e controle de documentos.</p>
        </div>
        <button className="workspace-primary" onClick={() => setIsNewOpen(true)}>
          <Plus size={17} /> Novo colaborador
        </button>
      </header>

      <section className="people-hero">
        <div>
          <span>UNIDADE SELECIONADA</span>
          <h2>{activeUnitData.name}</h2>
          <p>Informações sincronizadas em tempo real.</p>
        </div>
        <div className="people-hero-number">
          <UsersRound size={26} />
          <strong>{scoped.length}</strong>
          <span>pessoas cadastradas</span>
        </div>
      </section>

      <section className="workspace-metrics">
        <Metric icon={UserCheck} tone="green" label="Em atividade" value={String(active.length)} />
        <Metric icon={CalendarDays} tone="purple" label="Em férias" value={String(vacation.length)} />
        <Metric icon={UserRound} tone="orange" label="Afastados" value={String(leave.length)} />
        <Metric
          icon={BriefcaseBusiness}
          tone="blue"
          label="Setores"
          value={String(new Set(active.map((employee) => employee.department)).size)}
        />
        <Metric
          icon={CircleDollarSign}
          tone="red"
          label="Salários ativos"
          value={canSeePayroll ? formatCurrency(payroll) : "Restrito"}
          compact
        />
      </section>

      {(experienceAlerts.length > 0 || vacationAlerts.length > 0) && (
        <section className="rh-alerts-minimal">
          <div className="rh-alerts-head">
            <div className="rh-alerts-title">
              <span className="rh-alerts-pulse" />
              <strong>Alertas e Prazos do Mês</strong>
              <span className="rh-alerts-badge">
                {experienceAlerts.length + vacationAlerts.length}
              </span>
            </div>
            <small className="rh-alerts-hint">Clique para abrir a ficha do colaborador</small>
          </div>

          <div className="rh-alerts-list">
            {experienceAlerts.map((e) => {
              const exp = getExperienceInfo(e.admissionDate, e.experienceEndDate);
              return (
                <button
                  key={`exp-${e.id}`}
                  type="button"
                  className={`rh-alert-row ${exp.urgency === "critical" ? "is-critical" : "is-warning"}`}
                  onClick={() => setSelected(e)}
                >
                  <div className="rh-alert-type">
                    <span className="rh-alert-tag">
                      {exp.urgency === "critical" ? "🚨 Término" : "⏳ Experiência"}
                    </span>
                  </div>
                  <div className="rh-alert-name">
                    <strong>{e.name}</strong>
                    <small>{e.role || "Cargo pendente"} · {e.department}</small>
                  </div>
                  <div className="rh-alert-time">
                    <b>
                      {exp.daysRemaining <= 0
                        ? "Encerra hoje!"
                        : `Faltam ${exp.daysRemaining} dias`}
                    </b>
                    <small>Término: {formatDate(exp.endDateStr)}</small>
                  </div>
                  <span className="rh-alert-arrow">Ver ficha →</span>
                </button>
              );
            })}
            {vacationAlerts.map((e) => (
              <button
                key={`vac-${e.id}`}
                type="button"
                className="rh-alert-row is-vacation"
                onClick={() => setSelected(e)}
              >
                <div className="rh-alert-type">
                  <span className="rh-alert-tag vacation">🏖️ Férias</span>
                </div>
                <div className="rh-alert-name">
                  <strong>{e.name}</strong>
                  <small>{e.role || "Cargo pendente"} · {e.department}</small>
                </div>
                <div className="rh-alert-time">
                  <b>Início em breve</b>
                  <small>{formatDate(e.vacationStart!)}</small>
                </div>
                <span className="rh-alert-arrow">Ver ficha →</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="workspace-toolbar">
        <label className="workspace-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, cargo ou setor..."
          />
        </label>
        <label className="workspace-select">
          <UserRound size={15} />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos os status</option>
            <option value="in_experience">⚡ Em experiência (&lt; 90 dias)</option>
            {Object.entries(STATUS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading ? (
        <div className="people-empty">Carregando colaboradores…</div>
      ) : filtered.length ? (
        <section className="people-grid">
          {filtered.map((employee) => {
            const tenure = calculateTenure(employee.admissionDate, employee.terminationDate);
            const exp = getExperienceInfo(
              employee.admissionDate,
              employee.experienceEndDate,
              employee.status === "terminated"
            );

            return (
              <article
                className="people-card"
                key={employee.id}
                onClick={() => setSelected(employee)}
              >
                <div className="people-avatar">
                  {employee.photoUrl ? (
                    <img src={employee.photoUrl} alt="" />
                  ) : (
                    <span>
                      {employee.name
                        .split(" ")
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")}
                    </span>
                  )}
                  <i className={employee.status} />
                </div>
                <div className="people-card-main">
                  <div className="people-card-title-row">
                    <h3>{employee.name}</h3>
                    <button
                      type="button"
                      className="people-card-edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingEmployee(employee);
                      }}
                      title="Editar informações do colaborador"
                      aria-label="Editar"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                  <p>{employee.role || "Cargo pendente"}</p>
                  <span>{employee.department || "Setor pendente"}</span>
                </div>
                <div className="people-card-meta">
                  <b className={employee.status}>{STATUS[employee.status]}</b>
                  <span
                    className="people-card-tenure"
                    title={`Admissão: ${formatDate(employee.admissionDate)}`}
                  >
                    ⏱️ {tenure.text}
                  </span>
                  {exp.inExperience && employee.status === "active" && (
                    <span
                      className={`people-card-exp-badge exp-${exp.urgency}`}
                      title={`Contrato de experiência CLT: Dia ${exp.daysPassed} de 90 (Término em ${formatDate(exp.endDateStr)})`}
                    >
                      {exp.urgency === "critical" ? "🚨" : "⏳"}{" "}
                      {exp.daysRemaining <= 0
                        ? "Fim hoje!"
                        : exp.daysRemaining <= 30
                        ? `Faltam ${exp.daysRemaining}d`
                        : `Dia ${exp.daysPassed}/90`}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="people-empty">
          <UsersRound size={32} />
          <strong>Nenhum colaborador encontrado</strong>
          <span>Cadastre pessoas reais ou ajuste os filtros.</span>
        </div>
      )}

      {/* Drawer de Detalhes Completo com Abas: Dados, Documentos (Drive) e Desligamento */}
      <EmployeeDetailDrawer
        employee={selected}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        canSeePayroll={canSeePayroll}
        documents={documents}
        onEmployeeUpdated={(updated) => {
          setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          setSelected(updated);
        }}
        onDocumentsUpdated={() => setDocuments(store.getDocuments())}
        unitName={activeUnitData.name}
      />

      <NewEmployeeModal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} />

      <EditEmployeeModal
        isOpen={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        employee={editingEmployee}
        onSuccess={(updated) => {
          setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          if (selected?.id === updated.id) {
            setSelected(updated);
          }
          setEditingEmployee(null);
        }}
      />
    </div>
  );
}

function Metric({ icon: Icon, tone, label, value, compact = false }: { icon: typeof UsersRound; tone: string; label: string; value: string; compact?: boolean }) {
  return <div className={`workspace-metric ${tone}`}><span><Icon size={18} /></span><div><small>{label}</small><strong className={compact ? "compact" : ""}>{value}</strong></div></div>;
}
