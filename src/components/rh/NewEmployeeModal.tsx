"use client";

import React, { useState } from "react";
import { store } from "@/services/store";
import { Employee, UnitId } from "@/types";
import {
  UserPlus,
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
  Paperclip,
} from "lucide-react";
import { formatFileSize, nameFileForDrive, uploadFileToDrive } from "@/services/driveService";
import { readDocumentText } from "@/services/documentTextReader";
import { parseEmployeeDocument } from "@/domain/management/documentParsing";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { saveManagement } from "@/services/managementService";
import type { RecordData } from "@/domain/management/model";

interface NewEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function NewEmployeeModal({ isOpen, onClose, onSuccess }: NewEmployeeModalProps) {
  const { data, tenantId } = useManagement();
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
  const [admissionDate, setAdmissionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [salary, setSalary] = useState("");
  const [contractType, setContractType] = useState<"CLT" | "PJ" | "Estagio">("CLT");
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
  const [readingDocument, setReadingDocument] = useState(false);
  const [documentReadMessage, setDocumentReadMessage] = useState("");
  const [scannedDocumentFile, setScannedDocumentFile] = useState<File | null>(null);

  const handleDocumentScan = async (file: File) => {
    setReadingDocument(true);
    setDocumentReadMessage("Lendo documento do colaborador…");
    setScannedDocumentFile(file);
    try {
      const text = await readDocumentText(file);
      const parsed = parseEmployeeDocument(text);

      if (parsed.name) setName(parsed.name);
      if (parsed.cpf) setCpf(parsed.cpf);
      if (parsed.birthDate) setBirthDate(parsed.birthDate);
      if (parsed.address) setAddress(parsed.address);
      if (parsed.role) setRole(parsed.role);
      if (parsed.salaryFormatted) setSalary(parsed.salaryFormatted);
      if (parsed.admissionDate) setAdmissionDate(parsed.admissionDate);
      if (parsed.workHours) setWorkHours(parsed.workHours);
      if (parsed.unitId) setUnitId(parsed.unitId);
      if (parsed.department) setDepartment(parsed.department);
      if (parsed.contractType) setContractType(parsed.contractType);
      if (parsed.notes) setNotes(parsed.notes);

      const filled = [
        parsed.name && "nome",
        parsed.cpf && "CPF",
        parsed.birthDate && "nascimento",
        parsed.role && "cargo",
        parsed.salaryFormatted && "salário",
        parsed.admissionDate && "admissão",
        parsed.workHours && "horário",
        parsed.address && "endereço",
      ].filter(Boolean);

      setDocumentReadMessage(
        filled.length
          ? `Preenchido automaticamente: ${filled.join(", ")}. Confira antes de salvar.`
          : "Não foi possível identificar todos os campos com certeza. Complete manualmente."
      );
    } catch (error) {
      console.error("Erro ao ler documento:", error);
      setDocumentReadMessage(
        error instanceof Error ? error.message : "Não foi possível ler o documento."
      );
    } finally {
      setReadingDocument(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim()) return;

    setLoading(true);
    try {
      const parsedSalary = parseFloat(
        salary.replace(/\./g, "").replace(",", ".")
      ) || 0;

      const storedPhoto = photoFile
        ? await uploadFileToDrive(nameFileForDrive(photoFile, `Foto - ${name.trim()}`), "employee_photos")
        : null;

      const employeeData: Omit<Employee, "documentsCount"> = {
        id: `emp-${Date.now()}`,
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
        workHours,
        managerName: managerName.trim(),
        status: "active",
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
        photoUrl: "",
        ...(storedPhoto ? { photoDriveFileId: storedPhoto.fileId } : {}),
        notes: notes.trim(),
      };

      store.addEmployee(employeeData);

      try {
        const now = new Date().toISOString();
        const mgmtRecord: RecordData = {
          id: employeeData.id,
          kind: "employees",
          tenantId: tenantId || "house190",
          unitId: unitId || "",
          version: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: user?.uid || "system",
          updatedBy: user?.uid || "system",
          name: employeeData.name,
          role: employeeData.role,
          department: employeeData.department,
          admissionDate: employeeData.admissionDate,
          salary: Math.round(parsedSalary * 100),
          status: "Ativo",
          notes: notes.trim(),
        };
        await saveManagement(mgmtRecord, data);
      } catch (mgmtErr) {
        console.warn("Aviso ao salvar colaborador na gestão central:", mgmtErr);
      }

      if (scannedDocumentFile) {
        try {
          const saved = await uploadFileToDrive(
            nameFileForDrive(scannedDocumentFile, `${name.trim()} - Ficha de Registro`),
            "documents"
          );
          await store.addDocument({
            title: scannedDocumentFile.name,
            category: "employees",
            unitId,
            employeeId: employeeData.id,
            size: formatFileSize(saved.size),
            format: scannedDocumentFile.name.split(".").pop() || "pdf",
            url: `drive:${saved.fileId}`,
            driveFileId: saved.fileId,
            originalFileName: saved.fileName,
            mimeType: saved.mimeType,
            tags: ["Funcionário", "Registro", "Google Drive"],
          });
        } catch (fileErr) {
          console.warn("Erro ao salvar documento escaneado no Drive:", fileErr);
        }
      }

      // Reset
      setName("");
      setCpf("");
      setBirthDate("");
      setPhone("");
      setEmail("");
      setAddress("");
      setRole("");
      setSalary("");
      setBankData("");
      setBankName("");
      setBankAgency("");
      setBankAccount("");
      setBankHolderCpf("");
      setBankHolderName("");
      setExperienceEndDate("");
      setVacationStart("");
      setVacationEnd("");
      setNotes("");
      setPhotoFile(null);
      setScannedDocumentFile(null);
      setDocumentReadMessage("");

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error("Erro ao cadastrar colaborador:", error);
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
      <div className="mg-modal task-modal-modern" role="dialog" aria-modal="true" style={{ maxWidth: 840 }}>
        {/* Header */}
        <header className="task-modal-header">
          <div className="task-modal-title-box">
            <div className="task-modal-icon-badge">
              <UserPlus size={20} />
            </div>
            <div>
              <h2>Novo Colaborador</h2>
              <p>Adicionar membro à equipe com registro sincronizado no Firestore</p>
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
          {/* Leitor de Documento / PDF Automático */}
          <label className={`mg-document-reader ${readingDocument ? "is-reading" : ""}`} style={{ marginBottom: 14 }}>
            <Paperclip size={20} />
            <span>
              <strong>{readingDocument ? "Lendo documento do colaborador…" : "Cadastrar por PDF ou Foto"}</strong>
              <small>
                {documentReadMessage || "Adicione o PDF ou foto do Registro de Empregado / Carteira. Nome, CPF, nascimento, cargo, admissão, salário e horário serão preenchidos sozinhos."}
              </small>
            </span>
            <b>{readingDocument ? "AGUARDE" : "ADICIONAR PDF / FOTO"}</b>
            <input
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              disabled={readingDocument || loading}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) handleDocumentScan(file);
              }}
            />
          </label>

          {/* Card 1: Identificação & Contato */}
          <div className="task-compact-card">
            <div className="flex items-center gap-2 mb-1">
              <User size={15} className="task-sec-icon" />
              <span className="text-xs font-bold text-slate-800">1. Identificação & Contato</span>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="emp-name">
                  Nome Completo <span className="task-req">*</span>
                </label>
                <input
                  id="emp-name"
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: Carlos Henrique de Jesus"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-cpf">
                  CPF <span className="task-req">*</span>
                </label>
                <input
                  id="emp-cpf"
                  type="text"
                  required
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-birth">Data de Nascimento</label>
                <input
                  id="emp-birth"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="emp-phone">
                  <Phone size={12} /> WhatsApp / Telefone
                </label>
                <input
                  id="emp-phone"
                  type="text"
                  placeholder="(73) 99999-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-email">
                  <Mail size={12} /> E-mail
                </label>
                <input
                  id="emp-email"
                  type="email"
                  placeholder="colaborador@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-photo">
                  <Upload size={12} /> Foto (Google Drive)
                </label>
                <input
                  id="emp-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="task-field-group full">
              <label htmlFor="emp-address">
                <MapPin size={12} /> Endereço Residencial (opcional)
              </label>
              <input
                id="emp-address"
                type="text"
                placeholder="Rua, Número, Bairro, Cidade - UF"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Card 2: Cargo & Contrato */}
          <div className="task-compact-card">
            <div className="flex items-center gap-2 mb-1">
              <Briefcase size={15} className="task-sec-icon" />
              <span className="text-xs font-bold text-slate-800">2. Lotação & Remuneração</span>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="emp-unit">
                  Unidade / Filial <span className="task-req">*</span>
                </label>
                <select
                  id="emp-unit"
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
                <label htmlFor="emp-dept">
                  Departamento <span className="task-req">*</span>
                </label>
                <select
                  id="emp-dept"
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
                <label htmlFor="emp-role">
                  Cargo / Função <span className="task-req">*</span>
                </label>
                <input
                  id="emp-role"
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
                <label htmlFor="emp-contract">Tipo de Contrato</label>
                <select
                  id="emp-contract"
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value as any)}
                >
                  <option value="CLT">CLT</option>
                  <option value="PJ">PJ</option>
                  <option value="Estagio">Estágio</option>
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-salary">Salário Base (R$)</label>
                <input
                  id="emp-salary"
                  type="text"
                  placeholder="Ex: 2.100,00"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-admission">Data de Admissão</label>
                <input
                  id="emp-admission"
                  type="date"
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                />
              </div>
            </div>

            <div className="task-grid-columns-two-compact">
              <div className="task-field-group">
                <label htmlFor="emp-workhours">Jornada / Escala</label>
                <input
                  id="emp-workhours"
                  type="text"
                  placeholder="Ex: 44h semanais (Escala 6x1)"
                  value={workHours}
                  onChange={(e) => setWorkHours(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-manager">Gestor / Responsável</label>
                <input
                  id="emp-manager"
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
              <label htmlFor="emp-pix">Chave PIX (opcional)</label>
              <input
                id="emp-pix"
                type="text"
                placeholder="Ex: (73) 99999-0000, CPF ou email@exemplo.com"
                value={bankData}
                onChange={(e) => setBankData(e.target.value)}
              />
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="emp-bank-name">Instituição / Banco</label>
                <input
                  id="emp-bank-name"
                  type="text"
                  placeholder="Ex: Sicoob, Bradesco, Nubank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-bank-agency">Agência</label>
                <input
                  id="emp-bank-agency"
                  type="text"
                  placeholder="0001"
                  value={bankAgency}
                  onChange={(e) => setBankAgency(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-bank-account">Conta com Dígito</label>
                <input
                  id="emp-bank-account"
                  type="text"
                  placeholder="12345-6"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                />
              </div>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="emp-bank-type">Tipo de Conta</label>
                <select
                  id="emp-bank-type"
                  value={bankAccountType}
                  onChange={(e) => setBankAccountType(e.target.value as "corrente" | "poupanca")}
                >
                  <option value="corrente">Conta Corrente</option>
                  <option value="poupanca">Conta Poupança</option>
                </select>
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-holder-name">Nome do Titular</label>
                <input
                  id="emp-holder-name"
                  type="text"
                  placeholder="Se diferente do colaborador"
                  value={bankHolderName}
                  onChange={(e) => setBankHolderName(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-holder-cpf">CPF do Titular</label>
                <input
                  id="emp-holder-cpf"
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
              <span className="text-xs font-bold text-slate-800">4. Prazos & Férias</span>
            </div>

            <div className="task-grid-columns-three">
              <div className="task-field-group">
                <label htmlFor="emp-exp">Fim da Experiência</label>
                <input
                  id="emp-exp"
                  type="date"
                  value={experienceEndDate}
                  onChange={(e) => setExperienceEndDate(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-vac-start">Início das Próximas Férias</label>
                <input
                  id="emp-vac-start"
                  type="date"
                  value={vacationStart}
                  onChange={(e) => setVacationStart(e.target.value)}
                />
              </div>

              <div className="task-field-group">
                <label htmlFor="emp-vac-end">Fim das Próximas Férias</label>
                <input
                  id="emp-vac-end"
                  type="date"
                  value={vacationEnd}
                  onChange={(e) => setVacationEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="task-field-group full">
              <label htmlFor="emp-notes">
                <FileText size={12} /> Observações Internas (RH)
              </label>
              <input
                id="emp-notes"
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
              <UserPlus size={14} />
              <span>{loading ? "Salvando no Firestore..." : "Confirmar e Salvar"}</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
