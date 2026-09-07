"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Users,
  Calendar,
  UserPlus,
  UserMinus,
  MessageSquare,
  Search,
  Filter,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  Shield,
} from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { Employee, EmployeeVacation } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";

function RHContent() {
  const { filterByUnit } = useUnit();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"colaboradores" | "ferias" | "admissoes" | "desligamentos" | "gestao">("colaboradores");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "ferias") setActiveTab("ferias");
    const id = searchParams.get("id");
    if (id) setSelectedEmployeeId(id);
  }, [searchParams]);

  const employees = filterByUnit(store.getEmployees());
  const vacations = filterByUnit(store.getVacations());

  const filteredEmployees = employees.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q)
    );
  });

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  // Metrics
  const activeCount = employees.filter((e) => e.status === "active").length;
  const onVacationCount = employees.filter((e) => e.status === "vacation").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            RH & Gestão de Pessoas
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Colaboradores, controle de férias, admissões, feedbacks e ocorrências
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            <span>Novo Colaborador</span>
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Total Colaboradores
          </div>
          <div className="mt-1 text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
            {employees.length}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {activeCount} em atividade plena
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Em Férias Atuais
          </div>
          <div className="mt-1 text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
            {onVacationCount}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Retorno previsto em breve
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Férias Próximas (30 dias)
          </div>
          <div className="mt-1 text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
            {vacations.filter((v) => v.status === "approved").length}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Escala programada
          </div>
        </div>

        <div className="p-4 rounded-lg border border-zinc-200/80 bg-white dark:bg-zinc-900 dark:border-zinc-800">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            Folha Salarial Mensal
          </div>
          <div className="mt-1 text-xl font-bold font-mono text-zinc-900 tabular-nums dark:text-zinc-100">
            {formatCurrency(employees.reduce((acc, cur) => acc + cur.salary, 0))}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            Acesso reservado à diretoria
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-6">
        {[
          { key: "colaboradores", label: "Colaboradores", count: employees.length },
          { key: "ferias", label: "Calendário de Férias", count: vacations.length },
          { key: "admissoes", label: "Funil de Admissão", count: 1 },
          { key: "desligamentos", label: "Desligamentos", count: 0 },
          { key: "gestao", label: "Gestão & 1:1s", count: 3 },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`flex items-center gap-2 pb-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-400 hover:text-zinc-700"
            }`}
          >
            <span>{t.label}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 font-mono text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* TAB 1: Colaboradores */}
      {activeTab === "colaboradores" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por nome, cargo ou departamento..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8.5 pl-8.5 pr-3 text-xs rounded-md border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  viewMode === "cards" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-zinc-600"
                }`}
              >
                Cards
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  viewMode === "table" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white border-zinc-200 text-zinc-600"
                }`}
              >
                Tabela
              </button>
            </div>
          </div>

          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEmployees.map((emp) => (
                <div
                  key={emp.id}
                  onClick={() => setSelectedEmployeeId(emp.id)}
                  className="p-5 rounded-lg border border-zinc-200/80 bg-white hover:border-zinc-300 cursor-pointer transition-all space-y-3 dark:bg-zinc-900 dark:border-zinc-800 shadow-2xs"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={emp.photoUrl}
                      alt={emp.name}
                      className="h-11 w-11 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-semibold text-zinc-900 truncate dark:text-zinc-100">
                        {emp.name}
                      </h3>
                      <p className="text-[11px] text-zinc-500 truncate">{emp.role}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="uppercase text-[9px] font-mono px-1 py-0.2 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {emp.unitId}
                        </span>
                        <StatusBadge status={emp.status} />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 space-y-1">
                    <div>Departamento: <strong className="text-zinc-700 dark:text-zinc-300">{emp.department}</strong></div>
                    <div>Admissão: {formatDate(emp.admissionDate)} • {emp.contractType}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Colaborador</th>
                    <th className="py-3 px-4">Cargo</th>
                    <th className="py-3 px-4">Unidade</th>
                    <th className="py-3 px-4">Departamento</th>
                    <th className="py-3 px-4">Admissão</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredEmployees.map((emp) => (
                    <tr
                      key={emp.id}
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      className="hover:bg-zinc-50/50 cursor-pointer dark:hover:bg-zinc-800/50"
                    >
                      <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                        {emp.name}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {emp.role}
                      </td>
                      <td className="py-3 px-4 uppercase text-[10px] font-mono text-zinc-500">
                        {emp.unitId}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                        {emp.department}
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        {formatDate(emp.admissionDate)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <StatusBadge status={emp.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Férias com Alerta de Conflito */}
      {activeTab === "ferias" && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-amber-200/80 bg-amber-50/30 text-xs flex items-start gap-3 dark:bg-amber-950/20 dark:border-amber-900/40">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-900 dark:text-amber-300">
                Alerta de Cobertura Operacional:
              </span>
              <p className="text-zinc-600 dark:text-zinc-300 mt-0.5">
                Rodrigo Mendonça (Chefe de Chapa em Teixeira) está em gozo de férias até 15/09. A escala de apoio da Central está alocada para suprir o turno da noite.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200/80 bg-white p-5 space-y-4 dark:bg-zinc-900 dark:border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Escala de Férias Programadas (2026)
            </h3>

            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {vacations.map((vac) => (
                <div key={vac.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {vac.employeeName}
                    </span>
                    <div className="text-[11px] text-zinc-500">
                      Unidade: <span className="uppercase font-mono">{vac.unitId}</span> • Período Aquisitivo: {formatDate(vac.vestingPeriodStart)} a {formatDate(vac.vestingPeriodEnd)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {formatDate(vac.startDate)} até {formatDate(vac.endDate)}
                      </div>
                      <span className="text-[10px] text-zinc-400">{vac.daysCount} dias</span>
                    </div>
                    <StatusBadge status={vac.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Funil de Admissões */}
      {activeTab === "admissoes" && (
        <div className="space-y-4">
          <div className="p-5 rounded-lg border border-zinc-200/80 bg-white space-y-3 dark:bg-zinc-900 dark:border-zinc-800">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Processo de Admissão: Atendente de Salão (House Eunápolis)
                </h3>
                <p className="text-[11px] text-zinc-500">Candidato: Felipe Ribeiro dos Santos</p>
              </div>
              <Badge variant="warning">Em Andamento (Exame Admissional)</Badge>
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
              {[
                { title: "Candidato Aprovado na Entrevista", done: true },
                { title: "Documentação Pessoal Recebida (RG, CPF, Carteira)", done: true },
                { title: "Agendamento e Realização de ASO Admissional", done: true },
                { title: "Assinatura do Contrato de Trabalho CLT", done: false },
                { title: "Cadastro no eSocial e Sistema de Folha", done: false },
                { title: "Integração e Treinamento com Manual de Boas Práticas", done: false },
              ].map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <CheckCircle2
                    className={`h-4 w-4 ${step.done ? "text-emerald-600" : "text-zinc-300"}`}
                  />
                  <span className={step.done ? "text-zinc-800 line-through dark:text-zinc-400" : "text-zinc-700 dark:text-zinc-300"}>
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Desligamentos */}
      {activeTab === "desligamentos" && (
        <div className="p-8 rounded-lg border border-zinc-200/80 bg-white text-center text-xs text-zinc-400 dark:bg-zinc-900 dark:border-zinc-800">
          Nenhum processo de rescisão ou desligamento em andamento na competência.
        </div>
      )}

      {/* TAB 5: Gestão & 1:1s */}
      {activeTab === "gestao" && (
        <div className="space-y-3">
          {[
            {
              title: "Reunião 1:1 Quinzenal de Alinhamento",
              emp: "Marina Duarte Silva (Gerente Operações)",
              author: "Diretoria",
              date: "05/09/2026",
              text: "Revisão dos indicadores de tempo de preparo de Eunápolis e Teixeira. Tempo médio de saída atingiu 14 minutos, cumprindo a meta com folga.",
            },
            {
              title: "Elogio Formal por Liderança de Turno",
              emp: "Camila Guimarães Castro (Foodpark)",
              author: "Marina Duarte Silva",
              date: "03/09/2026",
              text: "Excelente gestão de equipe durante pico de movimento do festival gastronômico no Foodpark sem nenhuma reclamação de clientes.",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="p-4 rounded-lg border border-zinc-200/80 bg-white space-y-2 dark:bg-zinc-900 dark:border-zinc-800 text-xs"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</h4>
                  <span className="text-[11px] text-zinc-500">
                    Colaborador: {item.emp} • Registrado por {item.author}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 tabular-nums">{item.date}</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed bg-zinc-50 p-3 rounded dark:bg-zinc-800/40">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Employee Profile Drawer */}
      <Drawer
        isOpen={!!selectedEmployee}
        onClose={() => setSelectedEmployeeId(null)}
        title={selectedEmployee?.name || "Perfil do Colaborador"}
        subtitle={`${selectedEmployee?.role} • Unidade: ${selectedEmployee?.unitId.toUpperCase()}`}
        width="lg"
      >
        {selectedEmployee && (
          <div className="space-y-6 text-xs">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
              <img
                src={selectedEmployee.photoUrl}
                alt={selectedEmployee.name}
                className="h-16 w-16 rounded-full object-cover border"
              />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {selectedEmployee.name}
                </h3>
                <p className="text-zinc-500">{selectedEmployee.role} ({selectedEmployee.department})</p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedEmployee.status} />
                  <span className="text-zinc-400">• Gestor: {selectedEmployee.managerName}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 rounded-lg border border-zinc-200/80 text-zinc-600 dark:text-zinc-300 dark:border-zinc-800">
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-medium">CPF</span>
                <span className="font-mono">{selectedEmployee.cpf}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-medium">Nascimento</span>
                <span>{formatDate(selectedEmployee.birthDate)}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-medium">Data de Admissão</span>
                <span>{formatDate(selectedEmployee.admissionDate)}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-medium">Contrato & Jornada</span>
                <span>{selectedEmployee.contractType} ({selectedEmployee.workHours})</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-medium">Salário Base</span>
                <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                  {formatCurrency(selectedEmployee.salary)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block uppercase font-medium">Contato</span>
                <span>{selectedEmployee.phone}</span>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default function RHPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-xs text-zinc-400">Carregando RH...</div>}>
      <RHContent />
    </React.Suspense>
  );
}
