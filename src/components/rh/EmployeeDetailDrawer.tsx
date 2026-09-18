"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Trash2,
  Upload,
  User,
  UserMinus,
  UserCheck,
  Building2,
  ExternalLink,
  CreditCard,
  ShieldCheck,
  Clock3,
  Pencil,
  Wallet,
  Utensils,
  Plus,
  CircleDollarSign,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Employee, DocumentItem } from "@/types";
import { calculateTenure, getExperienceInfo, getTodayDateStr } from "@/lib/tenureUtils";
import { formatCurrency, formatDate } from "@/lib/utils";
import { store } from "@/services/store";
import { EditEmployeeModal } from "./EditEmployeeModal";
import { ValeQuickModal } from "./ValeQuickModal";
import {
  uploadFileToDrive,
  nameFileForDrive,
  formatFileSize,
  downloadFileFromDrive,
} from "@/services/driveService";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { saveManagement } from "@/services/managementService";
import type { RecordData } from "@/domain/management/model";

interface EmployeeDetailDrawerProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  canSeePayroll: boolean;
  documents: DocumentItem[];
  onEmployeeUpdated: (updated: Employee) => void;
  onDocumentsUpdated: () => void;
  unitName: string;
}

const DOCUMENT_CATEGORIES = [
  { key: "all", label: "Todos" },
  { key: "contracheque", label: "Contracheques / Holerites", tag: "Contracheque" },
  { key: "atestado", label: "Atestados Médicos", tag: "Atestado" },
  { key: "contrato", label: "Contrato & Termos", tag: "Contrato" },
  { key: "pessoal", label: "Documentos Pessoais", tag: "Documentos Pessoais" },
  { key: "aso", label: "Exames / ASO", tag: "Exame / ASO" },
  { key: "outros", label: "Outros", tag: "Outros" },
] as const;

const TERMINATION_TYPES = [
  "Demissão sem justa causa (pela empresa)",
  "Pedido de demissão (pelo colaborador)",
  "Término de contrato de experiência (45 ou 90 dias)",
  "Rescisão antecipada do contrato de experiência",
  "Demissão com justa causa (Art. 482 CLT)",
  "Acordo comum entre as partes (Art. 484-A CLT)",
  "Término de contrato por prazo determinado",
] as const;

const NOTICE_TYPES = [
  "Aviso prévio trabalhado",
  "Aviso prévio indenizado",
  "Aviso prévio dispensado",
  "Não aplicável (Término de experiência/contrato)",
] as const;

export function EmployeeDetailDrawer({
  employee,
  isOpen,
  onClose,
  canSeePayroll,
  documents,
  onEmployeeUpdated,
  onDocumentsUpdated,
  unitName,
}: EmployeeDetailDrawerProps) {
  const { data: mgmtData } = useManagement();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "docs" | "termination" | "vales">("profile");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isValeModalOpen, setIsValeModalOpen] = useState(false);

  // Vales & Consumo State & Computations
  const employeeVales = useMemo(() => {
    if (!employee?.id) return [];
    return ((mgmtData.employeeVales || []) as RecordData[])
      .filter((v) => !v.archived && v.employeeId === employee.id)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [mgmtData.employeeVales, employee?.id]);

  const valesSummary = useMemo(() => {
    let totalValesCents = 0;
    let totalConsumoCents = 0;
    let totalPendenteCents = 0;
    let totalAbatidoCents = 0;

    for (const v of employeeVales) {
      const amt = typeof v.amount === "number" ? v.amount : 0;
      if (v.type === "Vale Avulso") {
        totalValesCents += amt;
      } else {
        totalConsumoCents += amt;
      }
      if (v.status === "Abatido") {
        totalAbatidoCents += amt;
      } else {
        totalPendenteCents += amt;
      }
    }

    return {
      totalVales: totalValesCents / 100,
      totalConsumo: totalConsumoCents / 100,
      totalPendente: totalPendenteCents / 100,
      totalAbatido: totalAbatidoCents / 100,
      totalGeneral: (totalValesCents + totalConsumoCents) / 100,
    };
  }, [employeeVales]);

  const handleToggleValeStatus = async (vale: RecordData) => {
    const nextStatus = vale.status === "Abatido" ? "Pendente" : "Abatido";
    const now = new Date().toISOString();
    try {
      const updated: RecordData = {
        ...vale,
        status: nextStatus,
        updatedAt: now,
        updatedBy: user?.uid || "system",
      };
      await saveManagement(updated, mgmtData);
    } catch (err) {
      console.error("Erro ao alterar status do vale:", err);
      alert("Erro ao alterar status do vale.");
    }
  };

  const handleDeleteVale = async (vale: RecordData) => {
    if (!confirm(`Deseja realmente excluir este lançamento de ${formatCurrency(Number(vale.amount || 0) / 100)}?`)) {
      return;
    }
    const now = new Date().toISOString();
    try {
      const archivedVale: RecordData = {
        ...vale,
        archived: true,
        updatedAt: now,
        updatedBy: user?.uid || "system",
      };
      await saveManagement(archivedVale, mgmtData);

      const payableId = String(vale.payableId || `payable-${vale.id}`);
      const payables = (mgmtData.payables || []) as RecordData[];
      const linkedPayable = payables.find((p) => p.id === payableId || p.sourceId === vale.id);
      if (linkedPayable) {
        await saveManagement(
          {
            ...linkedPayable,
            archived: true,
            updatedAt: now,
            updatedBy: user?.uid || "system",
          },
          mgmtData
        );
      }
    } catch (err) {
      console.error("Erro ao excluir vale:", err);
      alert("Erro ao excluir o vale.");
    }
  };

  // Document upload state
  const [docCategory, setDocCategory] = useState<string>("contracheque");
  const [docReference, setDocReference] = useState<string>("");
  const [docFilter, setDocFilter] = useState<string>("all");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");

  // Termination form state
  const [termDate, setTermDate] = useState(() => getTodayDateStr());
  const [termType, setTermType] = useState<string>(TERMINATION_TYPES[0]);
  const [termNotice, setTermNotice] = useState<string>(NOTICE_TYPES[0]);
  const [termReason, setTermReason] = useState("");
  const [termChecklist, setTermChecklist] = useState<Record<string, boolean>>({
    exam: false,
    materials: false,
    terms: false,
  });
  const [isTerminating, setIsTerminating] = useState(false);
  const [termSuccess, setTermSuccess] = useState(false);

  // Sync state whenever selected employee changes
  useEffect(() => {
    if (employee) {
      setActiveTab("profile");
      setDocFilter("all");
      setUploadError("");
      setUploadSuccess("");
      setTermSuccess(false);
      setTermDate(employee.terminationDate || getTodayDateStr());
      setTermType(employee.terminationType || TERMINATION_TYPES[0]);
      setTermNotice(employee.terminationNotice || NOTICE_TYPES[0]);
      setTermReason(employee.terminationReason || "");
      setTermChecklist({ exam: false, materials: false, terms: false });
    }
  }, [employee?.id]);

  // Filter documents for this employee (TOP LEVEL HOOKS - NEVER CONDITIONAL)
  const employeeDocs = useMemo(() => {
    if (!employee) return [];
    return documents.filter((d) => d.employeeId === employee.id && !d.archived);
  }, [documents, employee?.id]);

  const filteredDocs = useMemo(() => {
    if (!employee) return [];
    if (docFilter === "all") return employeeDocs;
    const cat = DOCUMENT_CATEGORIES.find((c) => c.key === docFilter);
    if (!cat || !("tag" in cat)) return employeeDocs;
    return employeeDocs.filter(
      (d) =>
        d.tags?.includes(cat.tag) ||
        d.title.toLowerCase().includes(cat.key) ||
        (d.originalFileName && d.originalFileName.toLowerCase().includes(cat.key))
    );
  }, [employeeDocs, docFilter, employee]);

  if (!employee) return null;

  const tenure = calculateTenure(
    employee.admissionDate,
    employee.status === "terminated" ? employee.terminationDate : null
  );

  const experience = getExperienceInfo(
    employee.admissionDate,
    employee.experienceEndDate,
    employee.status === "terminated"
  );

  // Handle Document Upload
  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError("");
    setUploadSuccess("");

    try {
      const selectedCategoryObj = DOCUMENT_CATEGORIES.find((c) => c.key === docCategory);
      const tagLabel = selectedCategoryObj && "tag" in selectedCategoryObj ? selectedCategoryObj.tag : "Geral";
      
      const prefix = docReference.trim()
        ? `${employee.name} - ${tagLabel} (${docReference.trim()})`
        : `${employee.name} - ${tagLabel}`;

      const saved = await uploadFileToDrive(
        nameFileForDrive(file, prefix),
        "documents"
      );

      await store.addDocument({
        title: docReference.trim() ? `${file.name} (${docReference.trim()})` : file.name,
        category: "employees",
        unitId: employee.unitId,
        employeeId: employee.id,
        size: formatFileSize(saved.size),
        format: file.name.split(".").pop() || "arquivo",
        url: `drive:${saved.fileId}`,
        driveFileId: saved.fileId,
        originalFileName: saved.fileName,
        mimeType: saved.mimeType,
        tags: ["Funcionário", tagLabel, "Google Drive"],
      });

      setUploadSuccess(`Documento "${file.name}" anexado com sucesso!`);
      setDocReference("");
      onDocumentsUpdated();
      e.target.value = "";
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Não foi possível enviar o documento.");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Employee Termination
  const handleConfirmTermination = async () => {
    if (!termDate) {
      alert("Informe a data do desligamento.");
      return;
    }
    if (!confirm(`Deseja realmente registrar o desligamento de ${employee.name}? O status será alterado para Desligado.`)) {
      return;
    }

    setIsTerminating(true);
    try {
      const updated: Employee = {
        ...employee,
        status: "terminated",
        terminationDate: termDate,
        terminationType: termType,
        terminationNotice: termNotice,
        terminationReason: termReason.trim(),
      };

      store.updateEmployee(updated);

      // Sincronizar com mgmtData central caso exista espelho
      const mgmtRow = mgmtData.employees?.find((r) => r.id === employee.id);
      if (mgmtRow) {
        const now = new Date().toISOString();
        const record: RecordData = {
          ...mgmtRow,
          status: "Desligado",
          terminationDate: termDate,
          terminationType: termType,
          updatedAt: now,
        };
        await saveManagement(record, mgmtData);
      }

      onEmployeeUpdated(updated);
      setTermSuccess(true);
      setTimeout(() => {
        setTermSuccess(false);
      }, 3000);
    } catch (err) {
      console.error("Erro ao registrar desligamento:", err);
      alert("Ocorreu um erro ao registrar o desligamento. Tente novamente.");
    } finally {
      setIsTerminating(false);
    }
  };

  // Handle Reactivate Employee
  const handleReactivateEmployee = async () => {
    if (!confirm(`Deseja reativar o cadastro de ${employee.name}? O status voltará para Ativo.`)) {
      return;
    }

    const updated: Employee = {
      ...employee,
      status: "active",
      terminationDate: undefined,
      terminationType: undefined,
      terminationNotice: undefined,
      terminationReason: undefined,
    };

    store.updateEmployee(updated);

    const mgmtRow = mgmtData.employees?.find((r) => r.id === employee.id);
    if (mgmtRow) {
      const now = new Date().toISOString();
      const record: RecordData = {
        ...mgmtRow,
        status: "Ativo",
        updatedAt: now,
      };
      await saveManagement(record, mgmtData);
    }

    onEmployeeUpdated(updated);
  };

  return (
    <>
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={employee.name}
      subtitle={`${employee.role || "Cargo pendente"} · ${employee.department || "Setor pendente"}`}
      width="xl"
    >
      <div className="rh-detail-container">
        {/* HEADER HERO RESUMO DO COLABORADOR */}
        <div className="rh-employee-hero">
          <div className="rh-employee-avatar-wrap">
            {employee.photoUrl ? (
              <img src={employee.photoUrl} alt="" className="rh-employee-avatar-img" />
            ) : (
              <span className="rh-employee-avatar-initials">
                {employee.name
                  .split(" ")
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")}
              </span>
            )}
          </div>

          <div className="rh-employee-hero-info">
            <div className="rh-employee-hero-tags">
              <span className={`rh-status-badge ${employee.status}`}>
                {employee.status === "active" && "Ativo"}
                {employee.status === "vacation" && "Férias"}
                {employee.status === "leave" && "Afastado"}
                {employee.status === "terminated" && "Desligado"}
              </span>

              {/* TEMPO DE CASA DIÁRIO */}
              <span className="rh-tenure-badge" title="Atualizado diariamente com base na data de admissão">
                <Clock3 size={13} />
                <b>{tenure.formatted} de casa</b>
              </span>

              {/* AVISO DE EXPERIÊNCIA (90 DIAS) */}
              {experience.isUnderExperience && employee.status !== "terminated" && (
                <span className={`rh-exp-badge rh-exp-${experience.badgeTone}`}>
                  {experience.urgency === "critical" ? <AlertTriangle size={13} /> : <Clock size={13} />}
                  {experience.badgeText}
                </span>
              )}
            </div>

            <p className="rh-employee-hero-sub">
              Admissão em {formatDate(employee.admissionDate)} · Unidade {unitName}
            </p>
          </div>

          {/* BOTÃO RÁPIDO DE AÇÃO */}
          <div className="rh-employee-hero-actions">
            <button
              type="button"
              className="rh-btn-action-edit"
              onClick={() => setIsEditModalOpen(true)}
              title="Editar dados cadastrais do colaborador"
            >
              <Pencil size={13} /> Editar
            </button>
            {employee.status !== "terminated" ? (
              <button
                type="button"
                className="rh-btn-action-term"
                onClick={() => setActiveTab("termination")}
                title="Abrir formulário de rescisão e desligamento"
              >
                <UserMinus size={14} /> Registrar Desligamento
              </button>
            ) : (
              <button
                type="button"
                className="rh-btn-action-reactivate"
                onClick={handleReactivateEmployee}
                title="Reativar colaborador ativo"
              >
                <RotateCcw size={14} /> Reativar
              </button>
            )}
          </div>
        </div>

        {/* NAVEGAÇÃO POR ABAS */}
        <div className="rh-tabs-nav">
          <button
            className={`rh-tab-btn ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <User size={15} /> Ficha Cadastral
          </button>
          <button
            className={`rh-tab-btn ${activeTab === "docs" ? "active" : ""}`}
            onClick={() => setActiveTab("docs")}
          >
            <FileText size={15} /> Documentos & Contracheques ({employeeDocs.length})
          </button>
          <button
            className={`rh-tab-btn ${activeTab === "termination" ? "active" : ""}`}
            onClick={() => setActiveTab("termination")}
          >
            <UserMinus size={15} /> Desligamento & Rescisão
          </button>
          {canSeePayroll && (
            <button
              className={`rh-tab-btn ${activeTab === "vales" ? "active" : ""}`}
              onClick={() => setActiveTab("vales")}
            >
              <Wallet size={15} /> Vales & Consumo ({employeeVales.length})
            </button>
          )}
        </div>

        {/* ==================================================================== */}
        {/* ABA 1: FICHA CADASTRAL */}
        {/* ==================================================================== */}
        {activeTab === "profile" && (
          <div className="rh-tab-content">
            {/* ALERTA DE EXPERIÊNCIA DESTACADO */}
            {experience.isUnderExperience && employee.status !== "terminated" && (
              <div className={`rh-card-highlight rh-highlight-${experience.badgeTone}`}>
                <div className="rh-highlight-header">
                  <div className="rh-highlight-title">
                    <Clock size={16} />
                    <strong>Período de Experiência (90 dias CLT)</strong>
                  </div>
                  <span className="rh-highlight-days">
                    Faltam <b>{experience.daysRemaining} dias</b> para o término
                  </span>
                </div>
                <div className="rh-progress-bar-bg">
                  <div
                    className={`rh-progress-bar-fill ${experience.badgeTone}`}
                    style={{ width: `${Math.min(100, Math.round((experience.daysPassed / 90) * 100))}%` }}
                  />
                </div>
                <div className="rh-highlight-footer">
                  <span>Dia {experience.daysPassed} de 90</span>
                  <span>Término da experiência: <b>{formatDate(experience.experienceEndDate)}</b></span>
                </div>
              </div>
            )}

            {/* SEÇÃO: CONTATO */}
            <div className="rh-section-box">
              <h3><Phone size={14} /> Contato & Endereço</h3>
              <dl className="rh-grid-2">
                <div>
                  <dt>Telefone / WhatsApp</dt>
                  <dd>{employee.phone || "Não informado"}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>{employee.email || "Não informado"}</dd>
                </div>
                <div className="rh-col-span-2">
                  <dt>Endereço Residencial</dt>
                  <dd>{employee.address || "Não informado"}</dd>
                </div>
              </dl>
            </div>

            {/* SEÇÃO: CONTRATO DE TRABALHO */}
            <div className="rh-section-box">
              <h3><Briefcase size={14} /> Dados Contratuais</h3>
              <dl className="rh-grid-2">
                <div>
                  <dt>Data de Admissão</dt>
                  <dd>{formatDate(employee.admissionDate)}</dd>
                </div>
                <div>
                  <dt>Tempo de Casa (Atualizado)</dt>
                  <dd className="text-indigo-900 font-bold">{tenure.formatted}</dd>
                </div>
                <div>
                  <dt>Tipo de Contrato</dt>
                  <dd>{employee.contractType || "CLT"}</dd>
                </div>
                <div>
                  <dt>Horário / Escala</dt>
                  <dd>{employee.workHours || "44h semanais (Escala 6x1)"}</dd>
                </div>
                <div>
                  <dt>Gestor Responsável</dt>
                  <dd>{employee.managerName || "Gerência da Unidade"}</dd>
                </div>
                {canSeePayroll && (
                  <div>
                    <dt>Salário Base</dt>
                    <dd className="text-emerald-700 font-bold">{formatCurrency(employee.salary)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* SEÇÃO: DADOS BANCÁRIOS */}
            {canSeePayroll && (
              <div className="rh-section-box">
                <h3><CreditCard size={14} /> Dados Bancários (Pagamento)</h3>
                <dl className="rh-grid-2">
                  <div>
                    <dt>Banco</dt>
                    <dd>{employee.bankName || "Não cadastrado"}</dd>
                  </div>
                  <div>
                    <dt>Agência / Conta</dt>
                    <dd>
                      {employee.bankAgency ? `Ag. ${employee.bankAgency}` : ""}
                      {employee.bankAccount ? ` · CC ${employee.bankAccount}` : ""}
                      {!employee.bankAgency && !employee.bankAccount && "Não informado"}
                    </dd>
                  </div>
                  <div>
                    <dt>Titular</dt>
                    <dd>{employee.bankHolderName || employee.name}</dd>
                  </div>
                  <div>
                    <dt>CPF do Titular</dt>
                    <dd>{employee.bankHolderCpf || employee.cpf || "Não informado"}</dd>
                  </div>
                </dl>
              </div>
            )}

            {/* SEÇÃO: OBSERVAÇÕES */}
            {employee.notes && (
              <div className="rh-section-box">
                <h3>Observações Gerais</h3>
                <p className="rh-notes-text">{employee.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* ABA 2: DOCUMENTOS & CONTRACHEQUES */}
        {/* ==================================================================== */}
        {activeTab === "docs" && (
          <div className="rh-tab-content">
            {/* BOX DE UPLOAD DE ARQUIVOS */}
            <div className="rh-upload-panel">
              <div className="rh-upload-top">
                <div className="rh-upload-title-wrap">
                  <div className="rh-upload-icon-circle">
                    <Upload size={18} />
                  </div>
                  <div>
                    <h4>Anexar Documento ou Contracheque</h4>
                    <p>Armazenamento sincronizado em tempo real com o Google Drive da unidade.</p>
                  </div>
                </div>
                <span className="rh-drive-badge">
                  <span className="rh-drive-dot" /> Google Drive Conectado
                </span>
              </div>

              <div className="rh-upload-controls">
                <div className="rh-control-field">
                  <label>Tipo do Documento</label>
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                    disabled={isUploading}
                  >
                    <option value="contracheque">Contracheque / Holerite</option>
                    <option value="atestado">Atestado Médico</option>
                    <option value="contrato">Contrato de Trabalho / Termos</option>
                    <option value="pessoal">Documento Pessoal (RG / CPF / CNH)</option>
                    <option value="aso">Exame / ASO (Admissional / Periódico)</option>
                    <option value="outros">Outros Documentos / Comprovantes</option>
                  </select>
                </div>

                <div className="rh-control-field">
                  <label>
                    {docCategory === "contracheque"
                      ? "Mês / Competência"
                      : docCategory === "atestado"
                      ? "Dias de Afastamento"
                      : "Identificação / Referência"}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      docCategory === "contracheque"
                        ? "Ex: 09/2026 ou Adiantamento"
                        : docCategory === "atestado"
                        ? "Ex: 2 dias ou CID"
                        : "Ex: Ficha de admissão ou CTPS"
                    }
                    value={docReference}
                    onChange={(e) => setDocReference(e.target.value)}
                    disabled={isUploading}
                  />
                </div>

                <div className="rh-control-field rh-control-file">
                  <label className={`rh-file-input-btn ${isUploading ? "loading" : ""}`}>
                    <Upload size={16} />
                    <span>{isUploading ? "Enviando ao Drive…" : "Selecionar PDF ou Foto"}</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,image/png,image/jpeg,image/jpg"
                      disabled={isUploading}
                      onChange={handleUploadDocument}
                    />
                  </label>
                </div>
              </div>

              {uploadError && <div className="rh-alert-msg rh-alert-error">{uploadError}</div>}
              {uploadSuccess && <div className="rh-alert-msg rh-alert-success">{uploadSuccess}</div>}
            </div>

            {/* FILTRO DE CATEGORIAS (SEGMENTED PILLS) */}
            <div className="rh-doc-filters-container">
              <div className="rh-doc-filters">
                {DOCUMENT_CATEGORIES.map((cat) => {
                  const count =
                    cat.key === "all"
                      ? employeeDocs.length
                      : employeeDocs.filter(
                          (d) =>
                            d.tags?.includes("tag" in cat ? cat.tag : "") ||
                            d.title.toLowerCase().includes(cat.key)
                        ).length;

                  const isActive = docFilter === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      className={`rh-doc-pill ${isActive ? "active" : ""}`}
                      onClick={() => setDocFilter(cat.key)}
                    >
                      <span>{cat.label}</span>
                      <span className={`rh-pill-count ${isActive ? "active" : ""}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* LISTA DE DOCUMENTOS */}
            <div className="rh-doc-list">
              {filteredDocs.length > 0 ? (
                filteredDocs.map((doc) => {
                  const isContracheque =
                    doc.tags?.includes("Contracheque") ||
                    doc.title.toLowerCase().includes("contracheque") ||
                    doc.title.toLowerCase().includes("holerite");
                  const isAtestado =
                    doc.tags?.includes("Atestado") || doc.title.toLowerCase().includes("atestado");
                  const isContrato =
                    doc.tags?.includes("Contrato") || doc.title.toLowerCase().includes("contrato");

                  return (
                    <div key={doc.id} className="rh-doc-card">
                      <div
                        className={`rh-doc-icon-wrap ${
                          isContracheque
                            ? "contracheque"
                            : isAtestado
                            ? "atestado"
                            : isContrato
                            ? "contrato"
                            : "geral"
                        }`}
                      >
                        {isContracheque ? (
                          <FileSpreadsheet size={20} />
                        ) : isAtestado ? (
                          <FileCheck size={20} />
                        ) : isContrato ? (
                          <ShieldCheck size={20} />
                        ) : (
                          <FileText size={20} />
                        )}
                      </div>

                      <div className="rh-doc-info">
                        <strong title={doc.title}>{doc.title}</strong>
                        <div className="rh-doc-meta">
                          <span className="rh-doc-size">{doc.size || "Arquivo"}</span>
                          <span className="rh-doc-bullet">•</span>
                          <span className="rh-doc-date">Enviado em {formatDate(doc.uploadDate)}</span>
                          {doc.tags?.length ? (
                            <span className="rh-doc-tag-badge">{doc.tags[1] || doc.tags[0]}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="rh-doc-actions">
                        {doc.driveFileId ? (
                          <button
                            type="button"
                            className="rh-btn-doc-download"
                            onClick={() =>
                              downloadFileFromDrive(
                                doc.driveFileId!,
                                doc.originalFileName || doc.title
                              )
                            }
                            title="Visualizar ou baixar arquivo do Google Drive"
                          >
                            <Download size={14} />
                            <span>Baixar</span>
                          </button>
                        ) : (
                          <span className="text-zinc-400 text-xs">Arquivo local</span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rh-docs-empty">
                  <div className="rh-empty-icon">
                    <FileText size={26} />
                  </div>
                  <p>Nenhum documento encontrado nesta categoria</p>
                  <small>Utilize o formulário acima para anexar holerites, atestados ou contratos.</small>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* ABA 3: DESLIGAMENTO & RESCISÃO */}
        {/* ==================================================================== */}
        {activeTab === "termination" && (
          <div className="rh-tab-content">
            {employee.status === "terminated" ? (
              <div className="rh-terminated-card">
                <div className="rh-term-badge-header">
                  <span className="rh-term-icon"><UserMinus size={22} /></span>
                  <div>
                    <h3>Colaborador Desligado</h3>
                    <p>O contrato foi encerrado e este cadastro encontra-se inativo no sistema.</p>
                  </div>
                </div>

                <dl className="rh-grid-2 rh-term-details">
                  <div>
                    <dt>Data da Rescisão</dt>
                    <dd>{formatDate(employee.terminationDate || "") || "Não informada"}</dd>
                  </div>
                  <div>
                    <dt>Tempo Total Trabalhado</dt>
                    <dd>{tenure.formatted}</dd>
                  </div>
                  <div className="rh-col-span-2">
                    <dt>Tipo de Desligamento</dt>
                    <dd>{employee.terminationType || "Rescisão Contratual"}</dd>
                  </div>
                  {employee.terminationNotice && (
                    <div className="rh-col-span-2">
                      <dt>Aviso Prévio</dt>
                      <dd>{employee.terminationNotice}</dd>
                    </div>
                  )}
                  {employee.terminationReason && (
                    <div className="rh-col-span-2">
                      <dt>Motivo / Observações</dt>
                      <dd>{employee.terminationReason}</dd>
                    </div>
                  )}
                </dl>

                <div className="rh-term-footer-actions">
                  <button
                    type="button"
                    className="rh-btn-reactivate-large"
                    onClick={handleReactivateEmployee}
                  >
                    <RotateCcw size={16} /> Reativar Colaborador no Quadro Ativo
                  </button>
                </div>
              </div>
            ) : (
              <div className="rh-termination-form">
                <div className="rh-term-notice">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                  <div>
                    <strong>Registro de Rescisão / Desligamento</strong>
                    <p>
                      Ao registrar o desligamento, o colaborador sairá do quadro ativo e da folha de pagamento da unidade. Todos os documentos e histórico permanecem arquivados.
                    </p>
                  </div>
                </div>

                <div className="rh-form-grid">
                  <div className="rh-form-group">
                    <label>Data do Desligamento *</label>
                    <input
                      type="date"
                      value={termDate}
                      onChange={(e) => setTermDate(e.target.value)}
                      disabled={isTerminating}
                    />
                  </div>

                  <div className="rh-form-group">
                    <label>Tipo de Desligamento *</label>
                    <select
                      value={termType}
                      onChange={(e) => setTermType(e.target.value)}
                      disabled={isTerminating}
                    >
                      {TERMINATION_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rh-form-group rh-col-span-2">
                    <label>Aviso Prévio</label>
                    <select
                      value={termNotice}
                      onChange={(e) => setTermNotice(e.target.value)}
                      disabled={isTerminating}
                    >
                      {NOTICE_TYPES.map((notice) => (
                        <option key={notice} value={notice}>
                          {notice}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="rh-form-group rh-col-span-2">
                    <label>Motivo / Justificativa / Observações (opcional)</label>
                    <textarea
                      rows={3}
                      placeholder="Descreva observações sobre a saída, cumprimento de aviso ou acordos..."
                      value={termReason}
                      onChange={(e) => setTermReason(e.target.value)}
                      disabled={isTerminating}
                    />
                  </div>

                  {/* CHECKLIST DE ENCERRAMENTO */}
                  <div className="rh-form-group rh-col-span-2 rh-checklist-box">
                    <label>Checklist de Desligamento</label>
                    <div className="rh-checklist-items">
                      <label className="rh-check-item">
                        <input
                          type="checkbox"
                          checked={termChecklist.exam}
                          onChange={(e) =>
                            setTermChecklist({ ...termChecklist, exam: e.target.checked })
                          }
                        />
                        <span>Exame médico demissional agendado / realizado</span>
                      </label>
                      <label className="rh-check-item">
                        <input
                          type="checkbox"
                          checked={termChecklist.materials}
                          onChange={(e) =>
                            setTermChecklist({ ...termChecklist, materials: e.target.checked })
                          }
                        />
                        <span>Devolução de uniforme, chaves e materiais da unidade</span>
                      </label>
                      <label className="rh-check-item">
                        <input
                          type="checkbox"
                          checked={termChecklist.terms}
                          onChange={(e) =>
                            setTermChecklist({ ...termChecklist, terms: e.target.checked })
                          }
                        />
                        <span>Termo de Rescisão (TRCT) e cálculo de verbas gerados</span>
                      </label>
                    </div>
                  </div>
                </div>

                {termSuccess && (
                  <div className="rh-alert-msg rh-alert-success">
                    Desligamento registrado com sucesso! O cadastro foi atualizado.
                  </div>
                )}

                <div className="rh-term-submit-row">
                  <button
                    type="button"
                    className="rh-btn-confirm-termination"
                    onClick={handleConfirmTermination}
                    disabled={isTerminating}
                  >
                    <UserMinus size={16} />
                    {isTerminating ? "Processando desligamento…" : "Confirmar Desligamento"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ==================================================================== */}
        {/* ABA 4: VALES & CONSUMO DA LOJA */}
        {/* ==================================================================== */}
        {activeTab === "vales" && canSeePayroll && (
          <div className="rh-tab-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Header com Resumo Financeiro */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 10,
              }}
            >
              <div style={{ backgroundColor: "#f8fafc", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>TOTAL VALES</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#2563eb" }}>{formatCurrency(valesSummary.totalVales)}</div>
              </div>
              <div style={{ backgroundColor: "#f8fafc", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>CONSUMO LOJA</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#d97706" }}>{formatCurrency(valesSummary.totalConsumo)}</div>
              </div>
              <div style={{ backgroundColor: "#fff7ed", padding: "10px 12px", borderRadius: 8, border: "1px solid #fed7aa" }}>
                <div style={{ fontSize: 11, color: "#c2410c", fontWeight: 700 }}>PENDENTE</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#9a3412" }}>{formatCurrency(valesSummary.totalPendente)}</div>
              </div>
              <div style={{ backgroundColor: "#f0fdf4", padding: "10px 12px", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                <div style={{ fontSize: 11, color: "#166534", fontWeight: 700 }}>ABATIDO</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#15803d" }}>{formatCurrency(valesSummary.totalAbatido)}</div>
              </div>
            </div>

            {/* Barra de Ação */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                Histórico de Vales e Consumos ({employeeVales.length})
              </div>
              <button
                type="button"
                className="workspace-primary"
                onClick={() => setIsValeModalOpen(true)}
                style={{ fontSize: 12, padding: "6px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Plus size={14} /> + Lançar Vale / Consumo
              </button>
            </div>

            {/* Lista / Tabela de Vales */}
            {employeeVales.length > 0 ? (
              <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569" }}>DATA / MÊS</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569" }}>TIPO</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", color: "#475569" }}>DESCRIÇÃO</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", color: "#475569" }}>VALOR</th>
                      <th style={{ textAlign: "center", padding: "8px 10px", color: "#475569" }}>STATUS</th>
                      <th style={{ textAlign: "center", padding: "8px 10px", color: "#475569" }}>AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeVales.map((vale) => {
                      const isAbatido = vale.status === "Abatido";
                      const isConsumo = vale.type === "Consumo da Loja";
                      const amt = formatCurrency(Number(vale.amount || 0) / 100);
                      const dFmt = vale.date ? formatDate(String(vale.date)) : "—";

                      return (
                        <tr key={vale.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 600, color: "#1e293b" }}>{dFmt}</div>
                            <div style={{ fontSize: 10, color: "#64748b" }}>Comp: {String(vale.competence || "—")}</div>
                          </td>
                          <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontSize: 10,
                                fontWeight: 700,
                                backgroundColor: isConsumo ? "#fef3c7" : "#eff6ff",
                                color: isConsumo ? "#92400e" : "#1e40af",
                              }}
                            >
                              {isConsumo ? <Utensils size={10} /> : <Wallet size={10} />}
                              {isConsumo ? "Consumo Loja" : "Vale Avulso"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <div style={{ color: "#334155" }}>{vale.description || "—"}</div>
                            {vale.paymentMethod && !isConsumo && (
                              <div style={{ fontSize: 10, color: "#94a3b8" }}>{String(vale.paymentMethod)}</div>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: isConsumo ? "#d97706" : "#2563eb" }}>
                            {amt}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center" }}>
                            <span
                              style={{
                                padding: "2px 6px",
                                borderRadius: 99,
                                fontSize: 10,
                                fontWeight: 700,
                                backgroundColor: isAbatido ? "#dcfce7" : "#fef3c7",
                                color: isAbatido ? "#15803d" : "#b45309",
                              }}
                            >
                              {isAbatido ? "Abatido" : "Pendente"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => handleToggleValeStatus(vale)}
                                title={isAbatido ? "Reverter para Pendente" : "Marcar como Abatido"}
                                style={{
                                  border: "none",
                                  backgroundColor: isAbatido ? "#fff7ed" : "#f0fdf4",
                                  color: isAbatido ? "#c2410c" : "#166534",
                                  padding: "3px 6px",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  fontSize: 11,
                                }}
                              >
                                {isAbatido ? <RotateCcw size={12} /> : <CheckCircle2 size={12} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteVale(vale)}
                                title="Excluir lançamento"
                                style={{
                                  border: "none",
                                  backgroundColor: "#fef2f2",
                                  color: "#dc2626",
                                  padding: "3px 6px",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 10px", backgroundColor: "#f8fafc", borderRadius: 8, border: "1px dashed #cbd5e1" }}>
                <Wallet size={24} style={{ color: "#94a3b8", marginBottom: 6 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Nenhum vale ou consumo registrado</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  Use o botão acima para lançar adiantamentos ou lanches deste colaborador.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>

    <EditEmployeeModal
      isOpen={isEditModalOpen}
      onClose={() => setIsEditModalOpen(false)}
      employee={employee}
      onSuccess={(updated) => {
        onEmployeeUpdated(updated);
        setIsEditModalOpen(false);
      }}
    />

    <ValeQuickModal
      isOpen={isValeModalOpen}
      onClose={() => setIsValeModalOpen(false)}
      defaultEmployee={employee}
    />
    </>
  );
}
