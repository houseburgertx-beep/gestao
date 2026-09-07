"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckSquare,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  User,
  Tag,
  CheckCircle2,
  Circle,
  MessageSquare,
  Paperclip,
  RotateCw,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { Task, TaskStatus, TaskPriority } from "@/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { QuickCreateModal } from "@/components/layout/QuickCreateModal";

function TarefasContent() {
  const { filterByUnit } = useUnit();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<"kanban" | "lista">("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    setTasks(filterByUnit(store.getTasks()));
    const handleUpdate = () => {
      setTasks(filterByUnit(store.getTasks()));
      setTick((t) => t + 1);
    };
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, [filterByUnit]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedTaskId(id);
  }, [searchParams]);

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.assigneeName.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  const selectedTask = tasks.find((t) => t.id === selectedTaskId);

  const columns: { key: TaskStatus; label: string }[] = [
    { key: "todo", label: "A Fazer" },
    { key: "in_progress", label: "Em Andamento" },
    { key: "waiting", label: "Aguardando" },
    { key: "done", label: "Concluído" },
  ];

  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    store.updateTaskStatus(taskId, newStatus);
  };

  const handleToggleChecklist = (taskId: string, checkId: string) => {
    store.toggleChecklistItem(taskId, checkId);
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText || !selectedTask) return;

    selectedTask.comments.push({
      id: `cm-${Date.now()}`,
      user: "Lucas Vasconcelos",
      text: newCommentText,
      date: new Date().toISOString(),
    });
    setNewCommentText("");
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Tarefas & Projetos
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Gestão visual de fluxos de trabalho, prazos e atividades operacionais das unidades
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Switcher */}
          <div className="flex items-center rounded-md border border-zinc-200 bg-white p-0.5 dark:bg-zinc-900 dark:border-zinc-800">
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === "kanban"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setViewMode("lista")}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                viewMode === "lista"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              Lista
            </button>
          </div>

          <Button
            size="sm"
            onClick={() => setIsQuickCreateOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nova Tarefa</span>
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por título, responsável ou tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8.5 pl-8.5 pr-3 text-xs rounded-md border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* KANBAN VIEW */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {columns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.key);

            return (
              <div
                key={col.key}
                className="rounded-lg bg-zinc-100/60 p-3 border border-zinc-200/60 dark:bg-zinc-900/50 dark:border-zinc-800 flex flex-col min-h-[500px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/80 dark:border-zinc-800">
                  <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider dark:text-zinc-300">
                    {col.label}
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {colTasks.length}
                  </span>
                </div>

                {/* Task Cards */}
                <div className="space-y-2.5 flex-1">
                  {colTasks.map((task) => {
                    const priorityVariants = {
                      low: "secondary",
                      medium: "secondary",
                      high: "warning",
                      urgent: "danger",
                    } as const;

                    const completedChecks = task.checklist.filter((c) => c.done).length;

                    return (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                        className="p-3.5 rounded-md bg-white border border-zinc-200/80 hover:border-zinc-300 shadow-2xs cursor-pointer transition-all space-y-2.5 dark:bg-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-700"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-semibold text-zinc-900 leading-snug dark:text-zinc-100">
                            {task.title}
                          </h3>
                        </div>

                        {task.description && (
                          <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        {/* Checklist progress badge if present */}
                        {task.checklist.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>
                              {completedChecks}/{task.checklist.length} concluídos
                            </span>
                          </div>
                        )}

                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 text-zinc-500">
                            <Clock className="h-3 w-3 text-zinc-400" />
                            <span>{formatDate(task.dueDate)}</span>
                          </div>

                          <Badge variant={priorityVariants[task.priority]}>
                            {task.priority === "urgent"
                              ? "Urgente"
                              : task.priority === "high"
                              ? "Alta"
                              : "Normal"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div className="h-24 flex items-center justify-center text-[11px] text-zinc-400 border border-dashed border-zinc-200 rounded-md dark:border-zinc-800">
                      Nenhuma tarefa nesta etapa
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === "lista" && (
        <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4">Tarefa</th>
                <th className="py-3 px-4">Projeto / Tags</th>
                <th className="py-3 px-4">Responsável</th>
                <th className="py-3 px-4">Prazo</th>
                <th className="py-3 px-4">Prioridade</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredTasks.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  className="hover:bg-zinc-50/50 cursor-pointer dark:hover:bg-zinc-800/50"
                >
                  <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-zinc-100">
                    <div className="flex items-center gap-2">
                      <span>{t.title}</span>
                      {t.isRecurring && (
                        <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-100 text-zinc-500 font-mono dark:bg-zinc-800">
                          Recorrente
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-zinc-500">
                    {t.project || t.tags.join(", ") || "-"}
                  </td>
                  <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300">
                    {t.assigneeName}
                  </td>
                  <td className="py-3 px-4 tabular-nums">
                    {formatDate(t.dueDate)}
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={t.priority === "urgent" ? "danger" : t.priority === "high" ? "warning" : "secondary"}>
                      {t.priority}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="uppercase text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Task Drawer */}
      <Drawer
        isOpen={!!selectedTask}
        onClose={() => setSelectedTaskId(null)}
        title={selectedTask?.title || "Detalhes da Tarefa"}
        subtitle={`Projeto: ${selectedTask?.project || "Geral"} • Responsável: ${selectedTask?.assigneeName}`}
        width="lg"
      >
        {selectedTask && (
          <div className="space-y-6 text-xs">
            {/* Status Switcher Header in Drawer */}
            <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800">
              <span className="text-zinc-500 font-medium">Status da Tarefa:</span>
              <div className="flex gap-1.5">
                {(["todo", "in_progress", "waiting", "done"] as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(selectedTask.id, s)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      selectedTask.status === s
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {s === "todo" ? "A Fazer" : s === "in_progress" ? "Em Andamento" : s === "waiting" ? "Aguardando" : "Concluído"}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                Descrição
              </h4>
              <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed bg-zinc-50/60 p-3 rounded-md border border-zinc-100 dark:bg-zinc-800/30 dark:border-zinc-800">
                {selectedTask.description || "Nenhuma descrição informada."}
              </p>
            </div>

            {/* Checklist */}
            <div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Checklist de Execução
              </h4>
              <div className="space-y-2">
                {selectedTask.checklist.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleToggleChecklist(selectedTask.id, c.id)}
                    className="flex items-center gap-2.5 p-2 rounded hover:bg-zinc-50 cursor-pointer transition-colors dark:hover:bg-zinc-800/50"
                  >
                    <input
                      type="checkbox"
                      checked={c.done}
                      onChange={() => {}}
                      className="rounded text-zinc-900 focus:ring-0"
                    />
                    <span className={c.done ? "line-through text-zinc-400" : "text-zinc-800 dark:text-zinc-200"}>
                      {c.text}
                    </span>
                  </div>
                ))}

                {selectedTask.checklist.length === 0 && (
                  <p className="text-[11px] text-zinc-400">Nenhum item no checklist.</p>
                )}
              </div>
            </div>

            {/* Comments Thread */}
            <div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Comentários & Atualizações
              </h4>
              <div className="space-y-3 mb-3">
                {selectedTask.comments.map((cm) => (
                  <div
                    key={cm.id}
                    className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800 text-xs"
                  >
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{cm.user}</span>
                      <span>{formatDateTime(cm.date)}</span>
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-300">{cm.text}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Escrever um comentário na tarefa..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  className="flex-1 h-8.5 px-3 text-xs rounded border border-zinc-200 bg-white focus:outline-none dark:bg-zinc-900 dark:border-zinc-800"
                />
                <Button type="submit" size="sm">
                  Enviar
                </Button>
              </form>
            </div>
          </div>
        )}
      </Drawer>

      <QuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
        defaultTab="task"
      />
    </div>
  );
}

export default function TarefasPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-xs text-zinc-400">Carregando Tarefas...</div>}>
      <TarefasContent />
    </React.Suspense>
  );
}
