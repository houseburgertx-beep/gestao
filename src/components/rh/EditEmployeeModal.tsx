"use client";

import React, { useEffect, useState } from "react";
import { store } from "@/services/store";
import { Employee, UnitId } from "@/types";
import {
  Pencil,
  User,
  Briefcase,
  CreditCard,
  Calendar,
  FileText,
  Upload,
  Building2,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  X,
} from "lucide-react";
import { nameFileForDrive, uploadFileToDrive } from "@/services/driveService";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { saveManagement } from "@/services/managementService";
import type { RecordData } from "@/domain/management/model";

interface EditEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  onSuccess?: (updated: Employee) => void;
}

export function EditEmployeeModal({
  isOpen,
  onClose,
  employee,
  onSuccess,
}: EditEmployeeModalProps) {
  const { data: mgmtData, tenantId } = useManagement();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [unitId, setUnitId] = useState<Exclude<UnitId, "all">>("teixeira");
  const [department, setDepartment] = useState("Cozinha / Produção");
  const [role, setRole] = useState("");
  const [admissionDate, setAdmissionDate] = useState("");
  const [salary, setSalary] = useState("");
  const [contractType, setContractType] = useState<"CLT" | "PJ" | "Estagio">("CLT");
  const [status, setStatus] = useState<Employee["status"]>("active");
  const [workHours, setWorkHours] = useState("44h semanais (Escala 6x1)");
  const [managerName, setManagerName] = useState("Gerência Operacional");
  const [bankData, setBankData] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAgency, setBankAgency] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankAccountType, setBankAccountType] = useState<"corrente" | "poupanca">("corrente");
  const [bankHolderCpf, setBankHolderCpf] = useState("");
  const [bankHolderName, setBankHolderName] = useState("");
  const [experienceEndDate, setExperienceEndDate] = useState("");
  const [vacationStart, setVacationStart] = useState("");
  const [vacationEnd, setVacationEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    if (employee && isOpen) {
      setName(employee.name || "");
      setCpf(employee.cpf || "");
      setBirthDate(employee.birthDate || "");
      setPhone(employee.phone || "");
      setEmail(employee.email || "");
      setAddress(employee.address || "");
      setUnitId((employee.unitId as Exclude<UnitId, "all">) || "teixeira");
      setDepartment(employee.department || "Cozinha / Produção");
      setRole(employee.role || "");
      setAdmissionDate(employee.admissionDate || "");
      setSalary(
        employee.salary
          ? employee.salary.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : ""
      );
      setContractType(employee.contractType || "CLT");
      setStatus(employee.status || "active");
      setWorkHours(employee.workHours || "44h semanais (Escala 6x1)");
      setManagerName(employee.managerName || "Gerência Operacional");
      setBankData(employee.bankData || "");
      setBankName(employee.bankName || "");
      setBankAgency(employee.bankAgency || "");
      setBankAccount(employee.bankAccount || "");
      setBankAccountType(employee.bankAccountType || "corrente");
      setBankHolderCpf(employee.bankHolderCpf || "");
      setBankHolderName(employee.bankHolderName || "");
      setExperienceEndDate(employee.experienceEndDate || "");
      setVacationStart(employee.vacationStart || "");
      setVacationEnd(employee.vacationEnd || "");
      setNotes(employee.notes || "");
      setPhotoFile(null);
    }
  }, [employee, isOpen]);

  if (!isOpen || !employee) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim()) return;

    setLoading(true);
    try {
      const parsedSalary = parseFloat(
        salary.replace(/\./g, "").replace(",", ".")
      ) || 0;

      let photoDriveFileId = employee.photoDriveFileId;
      if (photoFile) {
        try {
          const stored = await uploadFileToDrive(
            nameFileForDrive(photoFile, `Foto - ${name.trim()}`),
            "employee_photos"
          );
          photoDriveFileId = stored.fileId;
        } catch (uploadErr) {
          console.warn("Aviso ao fazer upload da foto:", uploadErr);
        }
      }

      const updatedEmployee: Employee = {
        ...employee,
        name: name.trim(),
        cpf: cpf.trim(),
        birthDate,
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        unitId,
        department,
        role: role.trim(),
        admissionDate,
        salary: parsedSalary,
        contractType,
        status,
        workHours,
        managerName: managerName.trim(),
        bankData: bankData.trim(),
        bankName: bankName.trim(),
        bankAgency: bankAgency.trim(),
        bankAccount: bankAccount.trim(),
        bankAccountType,
        bankHolderCpf: bankHolderCpf.trim(),
        bankHolderName: bankHolderName.trim(),
        experienceEndDate,
        vacationStart,
        vacationEnd,
        notes: notes.trim(),
        ...(photoDriveFileId ? { photoDriveFileId } : {}),
      };

      store.updateEmployee(updatedEmployee);

      // Central management synchronization if applicable
      try {
        const now = new Date().toISOString();
        const mgmtRecord: RecordData = {
          id: updatedEmployee.id,
          kind: "employees",
          tenantId: tenantId || "house-burgers",
          unitId: unitId || "",
          version: 0,
          createdAt: employee.admissionDate || now,
          updatedAt: now,
          createdBy: user?.uid || "system",
          updatedBy: user?.uid || "system",
          name: updatedEmployee.name,
          role: updatedEmployee.role,
          department: updatedEmployee.department,
          admissionDate: updatedEmployee.admissionDate,
          salary: Math.round(parsedSalary * 100),
          status: updatedEmployee.status === "active" ? "Ativo" : updatedEmployee.status,
          notes: notes.trim(),
        };
        await saveManagement(mgmtRecord, mgmtData);
      } catch (mgmtErr) {
        console.warn("Aviso ao atualizar colaborador na gestão central:", mgmtErr);
      }

      if (onSuccess) onSuccess(updatedEmployee);
      onClose();
    } catch (error) {
      console.error("Erro ao atualizar colaborador:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="mg-modal-shade"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="mg-modal task-modal-modern"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 840 }}
      >
        {/* Header */}
        <header className="task-modal-header">
          <div className="task-modal-title-box">
            <div className="task-modal-icon-badge" style={{ background: "#eef2ff", color: "#4f46e5" }}>
              <Pencil size={18} />
            </div>
            <div>
              <h2>Editar Informações do Colaborador</h2>
              <p>Atualize cadastro, remuneração, dados bancários e contrato de {employee.name}</p>
            </div>
          </div>
          <button
            type="button"
            className="task-modal-close"
            onClick={onClose}
            disabled={loading}
            title="Fechar"
          >
            ✕
          </button>
        </header>

        {/* Form Content */}
        <form className="task-modal-form" onSubmit={handleSubmit}>
          {/* Card 1: Identificação & Contato */}
          <div className="task-compact-card">
            <div className="flex items-center gap-2 mb-1">
              <User size={15} className="task-sec-icon" />
              <span className="text-xs font-bold text-slate-800">1. Identificação & Contato</span>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="edit-emp-name">
                  Nome Completo <span className="task-req">*</span>
                </label>
                <input
                  id="edit-emp-name"
                  type="text"
                  required
                  placeholder="Nome completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-cpf">
                  CPF <span className="task-req">*</span>
                </label>
                <input
                  id="edit-emp-cpf"
                  type="text"
                  required
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-birth">Data de Nascimento</label>
                <input
                  id="edit-emp-birth"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="edit-emp-phone">
                  <Phone size={12} /> WhatsApp / Telefone
                </label>
                <input
                  id="edit-emp-phone"
                  type="text"
                  placeholder="(73) 99999-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-email">
                  <Mail size={12} /> E-mail
                </label>
                <input
                  id="edit-emp-email"
                  type="email"
                  placeholder="colaborador@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-photo">
                  <Upload size={12} /> Atualizar Foto (Drive)
                </label>
                <input
                  id="edit-emp-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="task-field-group full">
              <label htmlFor="edit-emp-address">
                <MapPin size={12} /> Endereço Residencial
              </label>
              <input
                id="edit-emp-address"
                type="text"
                placeholder="Rua, Número, Bairro, Cidade - UF"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Card 2: Cargo, Lotação & Contrato */}
          <div className="task-compact-card">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase size={15} className="task-sec-icon" />
              <span className="text-xs font-bold text-slate-800">2. Lotação & Remuneração</span>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="edit-emp-unit">
                  Unidade / Filial <span className="task-req">*</span>
                </label>
                <select
                  id="edit-emp-unit"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value as Exclude<UnitId, "all">)}
                  required
                >
                  <option value="teixeira">House 190 Teixeira de Freitas</option>
                  <option value="eunapolis">House 190 Eunápolis</option>
                  <option value="foodpark">House Food Park</option>
                  <option value="central">Matriz / Central</option>
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-dept">
                  Departamento <span className="task-req">*</span>
                </label>
                <select
                  id="edit-emp-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                >
                  <option value="Cozinha / Produção">Cozinha / Produção</option>
                  <option value="Salão / Atendimento">Salão / Atendimento</option>
                  <option value="Bar / Bebidas">Bar / Bebidas</option>
                  <option value="Estoque / Compras">Estoque / Compras</option>
                  <option value="Gerência / Administrativo">Gerência / Administrativo</option>
                  <option value="Limpeza / Apoio">Limpeza / Apoio</option>
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-role">
                  Cargo / Função <span className="task-req">*</span>
                </label>
                <input
                  id="edit-emp-role"
                  type="text"
                  required
                  placeholder="Ex: Chapeiro Líder"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="edit-emp-status">Status do Colaborador</label>
                <select
                  id="edit-emp-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Employee["status"])}
                >
                  <option value="active">Ativo</option>
                  <option value="vacation">Em Férias</option>
                  <option value="leave">Afastado / Licença</option>
                  <option value="terminated">Desligado</option>
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-contract">Tipo de Contrato</label>
                <select
                  id="edit-emp-contract"
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value as any)}
                >
                  <option value="CLT">CLT</option>
                  <option value="PJ">PJ</option>
                  <option value="Estagio">Estágio</option>
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-salary">Salário Base (R$)</label>
                <input
                  id="edit-emp-salary"
                  type="text"
                  placeholder="Ex: 2.100,00"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                />
              </div>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="edit-emp-admission">Data de Admissão</label>
                <input
                  id="edit-emp-admission"
                  type="date"
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-workhours">Jornada / Escala</label>
                <input
                  id="edit-emp-workhours"
                  type="text"
                  placeholder="Ex: 44h semanais (Escala 6x1)"
                  value={workHours}
                  onChange={(e) => setWorkHours(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-manager">Gestor / Responsável</label>
                <input
                  id="edit-emp-manager"
                  type="text"
                  placeholder="Ex: Gerência Operacional"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Dados Bancários & PIX */}
          <div className="task-compact-card">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={15} className="task-sec-icon" />
              <span className="text-xs font-bold text-slate-800">3. Pagamento & Dados Bancários</span>
            </div>

            <div className="task-field-group full">
              <label htmlFor="edit-emp-pix">Chave PIX</label>
              <input
                id="edit-emp-pix"
                type="text"
                placeholder="Ex: (73) 99999-0000, CPF ou email@exemplo.com"
                value={bankData}
                onChange={(e) => setBankData(e.target.value)}
              />
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="edit-emp-bank-name">Instituição / Banco</label>
                <input
                  id="edit-emp-bank-name"
                  type="text"
                  placeholder="Ex: Sicoob, Bradesco, Nubank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-bank-agency">Agência</label>
                <input
                  id="edit-emp-bank-agency"
                  type="text"
                  placeholder="0001"
                  value={bankAgency}
                  onChange={(e) => setBankAgency(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-bank-account">Conta com Dígito</label>
                <input
                  id="edit-emp-bank-account"
                  type="text"
                  placeholder="12345-6"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                />
              </div>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="edit-emp-bank-type">Tipo de Conta</label>
                <select
                  id="edit-emp-bank-type"
                  value={bankAccountType}
                  onChange={(e) => setBankAccountType(e.target.value as "corrente" | "poupanca")}
                >
                  <option value="corrente">Conta Corrente</option>
                  <option value="poupanca">Conta Poupança</option>
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-holder-name">Nome do Titular</label>
                <input
                  id="edit-emp-holder-name"
                  type="text"
                  placeholder="Se diferente do colaborador"
                  value={bankHolderName}
                  onChange={(e) => setBankHolderName(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-holder-cpf">CPF do Titular</label>
                <input
                  id="edit-emp-holder-cpf"
                  type="text"
                  placeholder="000.000.000-00"
                  value={bankHolderCpf}
                  onChange={(e) => setBankHolderCpf(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Prazos, Férias & Anotações */}
          <div className="task-compact-card">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={15} className="task-sec-icon" />
              <span className="text-xs font-bold text-slate-800">4. Prazos, Experiência & Férias</span>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="edit-emp-exp">
                  Término da Experiência (90 dias)
                </label>
                <input
                  id="edit-emp-exp"
                  type="date"
                  value={experienceEndDate}
                  onChange={(e) => setExperienceEndDate(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-vac-start">Início das Férias</label>
                <input
                  id="edit-emp-vac-start"
                  type="date"
                  value={vacationStart}
                  onChange={(e) => setVacationStart(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="edit-emp-vac-end">Fim das Férias</label>
                <input
                  id="edit-emp-vac-end"
                  type="date"
                  value={vacationEnd}
                  onChange={(e) => setVacationEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="task-field-group full">
              <label htmlFor="edit-emp-notes">
                <FileText size={12} /> Observações Internas (RH)
              </label>
              <input
                id="edit-emp-notes"
                type="text"
                placeholder="Uniforme, restrições, contatos de emergência..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Fixed Footer */}
          <footer className="task-modal-footer">
            <button
              type="button"
              className="mg-button secondary task-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="workspace-primary task-save-submit"
              disabled={loading}
            >
              <CheckCircle2 size={14} />
              <span>{loading ? "Salvando alterações..." : "Salvar Alterações"}</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
