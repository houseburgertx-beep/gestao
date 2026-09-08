"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { store } from "@/services/store";
import { saveEmployeeToFirestore, addNotificationToFirestore } from "@/services/firestoreService";
import { Employee, UnitId } from "@/types";
import { UserPlus, Check, Building2 } from "lucide-react";

interface NewEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function NewEmployeeModal({ isOpen, onClose, onSuccess }: NewEmployeeModalProps) {
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
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim()) return;

    setLoading(true);
    try {
      const parsedSalary = parseFloat(
        salary.replace(/\./g, "").replace(",", ".")
      ) || 0;

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
        photoUrl: "",
        notes: notes.trim(),
      };

      // 1. Salva no Store Local (reativo imediato)
      store.addEmployee(employeeData);

      // 2. Salva em tempo real no banco de dados Firestore da House 190
      await saveEmployeeToFirestore({
        ...employeeData,
        documentsCount: 0,
      });

      // 3. Registra notificação e auditoria
      await addNotificationToFirestore({
        title: "Novo Colaborador Cadastrado",
        message: `${employeeData.name} foi adicionado(a) como ${employeeData.role} na filial ${unitId === "eunapolis" ? "Eunápolis" : "Teixeira"}.`,
        severity: "success",
        type: "vacation",
        read: false,
        timestamp: new Date().toISOString(),
      });

      // Limpa campos
      setName("");
      setCpf("");
      setRole("");
      setSalary("");
      setEmail("");
      setPhone("");
      setBankData("");

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error("Erro ao cadastrar colaborador:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cadastrar Novo Colaborador"
      subtitle="Adicionar membro à equipe com registro em nuvem no Firestore"
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dados Básicos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Nome Completo *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Carlos Henrique de Jesus"
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              CPF *
            </label>
            <input
              type="text"
              required
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>

        {/* Contato */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Telefone / WhatsApp
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(73) 99999-0000"
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colaborador@gmail.com"
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>

        {/* Filial e Cargo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Unidade / Filial *
            </label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value as any)}
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            >
              <option value="teixeira">House 190 Teixeira de Freitas</option>
              <option value="eunapolis">House 190 Eunápolis</option>
              <option value="foodpark">House Food Park</option>
              <option value="central">Matriz / Central</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Departamento *
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            >
              <option value="Cozinha / Produção">Cozinha / Produção</option>
              <option value="Salão / Atendimento">Salão / Atendimento</option>
              <option value="Bar / Bebidas">Bar / Bebidas</option>
              <option value="Estoque / Compras">Estoque / Compras</option>
              <option value="Gerência / Administrativo">Gerência / Administrativo</option>
              <option value="Limpeza / Apoio">Limpeza / Apoio</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Cargo / Função *
            </label>
            <input
              type="text"
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ex: Chapeiro Líder"
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>

        {/* Contrato e Remuneração */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Tipo de Contrato
            </label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value as any)}
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            >
              <option value="CLT">CLT</option>
              <option value="PJ">PJ</option>
              <option value="Estagio">Estágio</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Salário Base (R$)
            </label>
            <input
              type="text"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="Ex: 2.100,00"
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Data de Admissão
            </label>
            <input
              type="date"
              value={admissionDate}
              onChange={(e) => setAdmissionDate(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>

        {/* Escala e Dados Bancários */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Jornada / Escala
            </label>
            <input
              type="text"
              value={workHours}
              onChange={(e) => setWorkHours(e.target.value)}
              placeholder="Ex: 44h semanais (Escala 6x1)"
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Dados Bancários / Chave PIX
            </label>
            <input
              type="text"
              value={bankData}
              onChange={(e) => setBankData(e.target.value)}
              placeholder="PIX: 000.000.000-00 ou Banco Inter Ag 0001 C/C 1234-5"
              className="w-full text-xs px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        </div>

        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" disabled={loading} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            <span>{loading ? "Salvando no Firestore..." : "Confirmar e Salvar"}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
