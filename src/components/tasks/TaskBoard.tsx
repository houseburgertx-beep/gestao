"use client";

import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Draggable, Droppable, DropResult } from "@hello-pangea/dnd";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, ListChecks, Plus, Search, UserRound } from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useAuth } from "@/contexts/AuthContext";
import { RecordData, dateToday, str } from "@/domain/management/model";
import { saveManagement } from "@/services/managementService";
import { RecordForm } from "@/components/management/RecordTable";
import "@/components/management/management.css";

const COLUMNS = [
  { status: "Pendente", label: "A fazer", color: "purple" },
  { status: "Em andamento", label: "Em andamento", color: "blue" },
  { status: "Aguardando", label: "Aguardando", color: "orange" },
  { status: "Concluído", label: "Concluído", color: "green" },
];

function shortDate(value: string) {
  return value ? value.split("-").reverse().slice(0, 2).join("/") : "Sem prazo";
}

export function TaskBoard() {
  const { data, filters, allowedUnit } = useManagement();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const [editing, setEditing] = useState<RecordData | false | null>(null);
  const [message, setMessage] = useState("");
  const today = dateToday();
  const selectedUnit = allowedUnit === "all" ? filters.unitId : allowedUnit;

  useEffect(() => {
    const open = () => setEditing(false);
    window.addEventListener("open-task-form", open);
    if (new URLSearchParams(window.location.search).get("novo") === "1") open();
    return () => window.removeEventListener("open-task-form", open);
  }, []);

  const tasks = useMemo(
    () => data.actions
      .filter((task) =>
        !task.archived &&
        (!selectedUnit || task.unitId === selectedUnit) &&
        (!owner || str(task, "owner") === owner) &&
        (!search || `${task.problem} ${task.action} ${task.owner}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
      )
      .sort((a, b) => str(a, "dueDate").localeCompare(str(b, "dueDate"))),
    [data.actions, owner, search, selectedUnit],
  );
  const owners = Array.from(new Set(data.actions.map((task) => str(task, "owner")).filter(Boolean))).sort();
  const openTasks = tasks.filter((task) => task.status !== "Concluído");
  const overdue = openTasks.filter((task) => str(task, "dueDate") < today);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dueWeek = openTasks.filter((task) => str(task, "dueDate") >= today && str(task, "dueDate") <= weekEnd);

  const onDragEnd = async ({ destination, draggableId }: DropResult) => {
    if (!destination || !user) return;
    const task = data.actions.find((item) => item.id === draggableId);
    const status = COLUMNS[Number(destination.droppableId)]?.status;
    if (!task || !status || task.status === status) return;
    setMessage("");
    try {
      await saveManagement({ ...task, status, updatedBy: user.uid, updatedAt: new Date().toISOString() }, data);
      setMessage(`Tarefa movida para ${status.toLocaleLowerCase()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível mover a tarefa.");
    }
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <div><span className="workspace-eyebrow">OPERAÇÃO DAS LOJAS</span><h1>Quadro de tarefas</h1><p>Gerentes acompanham responsáveis, prazos e andamento no mesmo lugar.</p></div>
        <button className="workspace-primary" onClick={() => setEditing(false)}><Plus size={17} /> Nova tarefa</button>
      </header>

      <section className="workspace-metrics task-metrics">
        <Metric icon={ListChecks} tone="purple" label="Em aberto" value={openTasks.length} />
        <Metric icon={Clock3} tone="blue" label="Em andamento" value={tasks.filter((task) => task.status === "Em andamento").length} />
        <Metric icon={AlertCircle} tone="red" label="Atrasadas" value={overdue.length} />
        <Metric icon={CalendarDays} tone="orange" label="Vencem em 7 dias" value={dueWeek.length} />
        <Metric icon={CheckCircle2} tone="green" label="Concluídas" value={tasks.filter((task) => task.status === "Concluído").length} />
      </section>

      <section className="workspace-toolbar">
        <label className="workspace-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar tarefa, descrição ou responsável" /></label>
        <label className="workspace-select"><UserRound size={15} /><select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="">Todos os responsáveis</option>{owners.map((name) => <option key={name}>{name}</option>)}</select></label>
      </section>
      {message && <p className="workspace-message">{message}</p>}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="task-board">
          {COLUMNS.map((column, columnIndex) => {
            const columnTasks = tasks.filter((task) => task.status === column.status || (column.status === "Pendente" && !task.status));
            return (
              <Droppable droppableId={String(columnIndex)} key={column.status}>
                {(provided, snapshot) => (
                  <section className={`task-column ${snapshot.isDraggingOver ? "dragging-over" : ""}`} ref={provided.innerRef} {...provided.droppableProps}>
                    <header><span className={`task-column-dot ${column.color}`} /><strong>{column.label}</strong><b>{columnTasks.length}</b></header>
                    <div className="task-column-list">
                      {columnTasks.map((task, index) => {
                        const isOverdue = task.status !== "Concluído" && str(task, "dueDate") < today;
                        const unit = data.units.find((item) => item.id === task.unitId);
                        const priority = str(task, "priority") || "Normal";
                        return (
                          <Draggable draggableId={task.id} index={index} key={task.id}>
                            {(drag, dragging) => (
                              <article ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} className={`task-card ${dragging.isDragging ? "is-dragging" : ""}`} onClick={() => setEditing(task)}>
                                <div className="task-card-top"><span className={`task-priority ${priority.toLocaleLowerCase()}`}>{priority}</span><small>{unit?.name || "Unidade pendente"}</small></div>
                                <h3>{str(task, "problem")}</h3>
                                {task.action && <p>{str(task, "action")}</p>}
                                <footer><span><UserRound size={13} /> {str(task, "owner")}</span><span className={isOverdue ? "overdue" : ""}><CalendarDays size={13} /> {shortDate(str(task, "dueDate"))}</span></footer>
                              </article>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {!columnTasks.length && <div className="task-empty">Arraste uma tarefa para cá</div>}
                    </div>
                  </section>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {editing !== null && (
        <RecordForm kind="actions" record={editing || undefined} suggestedUnit={selectedUnit} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage("Tarefa salva no Firebase e compartilhada com os gerentes."); }} />
      )}
    </div>
  );
}

function Metric({ icon: Icon, tone, label, value }: { icon: typeof ListChecks; tone: string; label: string; value: number }) {
  return <div className={`workspace-metric ${tone}`}><span><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong></div></div>;
}
