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
        <TaskModal
          task={editing || undefined}
          suggestedUnit={selectedUnit}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage("Tarefa salva no Firebase e compartilhada com a equipe.");
          }}
        />
      )}
    </div>
  );
}

function TaskModal({
  task,
  suggestedUnit = "",
  onClose,
  onSaved,
}: {
  task?: RecordData;
  suggestedUnit?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { user, userProfile } = useAuth();
  const [unit, setUnit] = useState(() => task?.unitId || suggestedUnit || (allowedUnit !== "all" ? allowedUnit : (data.units[0]?.id || "")));
  const [problem, setProblem] = useState(() => (task ? str(task, "problem") : ""));
  const [action, setAction] = useState(() => (task ? str(task, "action") : ""));
  const [owner, setOwner] = useState(() => (task ? str(task, "owner") : "") || userProfile?.displayName || "");
  const [dueDate, setDueDate] = useState(() => (task ? str(task, "dueDate") : "") || dateToday());
  const [priority, setPriority] = useState(() => (task ? str(task, "priority") : "") || "Normal");
  const [status, setStatus] = useState(() => (task ? str(task, "status") : "") || "Pendente");
  const [notes, setNotes] = useState(() => (task ? str(task, "notes") : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const employees = useMemo(() => {
    const fromStaff = data.employees.filter((e) => !e.archived && (!unit || e.unitId === unit)).map((e) => str(e, "name"));
    const fromTasks = data.actions.map((t) => str(t, "owner")).filter(Boolean);
    return Array.from(new Set([...fromStaff, ...fromTasks, userProfile?.displayName || ""])).filter(Boolean).sort();
  }, [data.employees, data.actions, unit, userProfile]);

  const setQuickDate = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    setDueDate(d.toISOString().slice(0, 10));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!problem.trim()) {
      setError("Informe o título da tarefa.");
      return;
    }
    if (!owner.trim()) {
      setError("Informe o responsável pela tarefa.");
      return;
    }
    if (!dueDate) {
      setError("Informe o prazo de vencimento.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      const now = new Date().toISOString();
      const updated: RecordData = {
        ...task,
        id: task?.id || crypto.randomUUID(),
        kind: "actions",
        tenantId,
        unitId: unit,
        problem: problem.trim(),
        action: action.trim(),
        owner: owner.trim(),
        dueDate,
        priority,
        status,
        notes: notes.trim(),
        version: (task?.version || 0) + 1,
        createdAt: task?.createdAt || now,
        updatedAt: now,
        createdBy: task?.createdBy || user.uid,
        updatedBy: user.uid,
      };

      await saveManagement(updated, data);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a tarefa.");
    } finally {
      setBusy(false);
    }
  };

  const isNew = !task;

  return (
    <div className="mg-modal-shade" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="mg-modal task-modal-modern" role="dialog" aria-modal="true">
        <header className="task-modal-header">
          <div className="task-modal-title-box">
            <div className="task-modal-icon-badge">
              <ListChecks size={20} />
            </div>
            <div>
              <h2>{isNew ? "Nova Tarefa" : "Editar Tarefa"}</h2>
              <p>{isNew ? "Defina o que precisa ser feito, o responsável e o prazo de entrega." : `Atualizando tarefa: ${problem}`}</p>
            </div>
          </div>
          <button type="button" className="task-modal-close" onClick={onClose} disabled={busy} title="Fechar">
            ✕
          </button>
        </header>

        <form className="task-modal-form" onSubmit={handleSave}>
          {/* Top Unit & Status Row */}
          <div className="task-modal-row-two">
            <div className="task-field-group">
              <label htmlFor="task-unit">Unidade responsável</label>
              <select
                id="task-unit"
                value={unit}
                disabled={allowedUnit !== "all"}
                onChange={(e) => setUnit(e.target.value)}
                required
              >
                {data.units
                  .filter((u) => !u.archived && (allowedUnit === "all" || u.id === allowedUnit))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {str(u, "name")}
                    </option>
                  ))}
              </select>
            </div>

            <div className="task-field-group">
              <label>Status atual</label>
              <div className="task-status-chips">
                {COLUMNS.map((col) => (
                  <button
                    key={col.status}
                    type="button"
                    className={`task-chip-btn ${col.color} ${status === col.status ? "selected" : ""}`}
                    onClick={() => setStatus(col.status)}
                  >
                    <span className={`task-column-dot ${col.color}`} />
                    {col.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Title input */}
          <div className="task-field-group full">
            <label htmlFor="task-title">
              Título da tarefa <span className="task-req">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              autoFocus
              className="task-input-title"
              placeholder="Ex.: Trocar filtro da coifa, conferir estoque de embalagens, fechar escala..."
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div className="task-field-group full">
            <label htmlFor="task-action">Descrição detalhada (como fazer, orientações)</label>
            <textarea
              id="task-action"
              rows={3}
              placeholder="Explique o que deve ser feito passo a passo, critérios de conclusão ou detalhes importantes..."
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>

          {/* Priority, Owner, and Due Date Grid */}
          <div className="task-modal-grid-details">
            {/* Owner */}
            <div className="task-field-group">
              <label htmlFor="task-owner">
                Responsável <span className="task-req">*</span>
              </label>
              <div className="task-input-with-icon">
                <UserRound size={16} />
                <input
                  id="task-owner"
                  type="text"
                  list="employee-owners"
                  placeholder="Nome do colaborador ou gerente"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  required
                />
                <datalist id="employee-owners">
                  {employees.map((emp) => (
                    <option key={emp} value={emp} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Due Date & Quick Buttons */}
            <div className="task-field-group">
              <label htmlFor="task-duedate">
                Prazo de entrega <span className="task-req">*</span>
              </label>
              <div className="task-input-with-icon">
                <CalendarDays size={16} />
                <input
                  id="task-duedate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
              </div>
              <div className="task-quick-dates">
                <button type="button" onClick={() => setQuickDate(0)}>Hoje</button>
                <button type="button" onClick={() => setQuickDate(1)}>Amanhã</button>
                <button type="button" onClick={() => setQuickDate(3)}>Em 3 dias</button>
                <button type="button" onClick={() => setQuickDate(7)}>1 semana</button>
              </div>
            </div>

            {/* Priority Select with Badges */}
            <div className="task-field-group">
              <label>Nível de prioridade</label>
              <div className="task-priority-chips">
                {[
                  { key: "Baixa", label: "Baixa", tone: "baixa" },
                  { key: "Normal", label: "Normal", tone: "normal" },
                  { key: "Alta", label: "Alta", tone: "alta" },
                  { key: "Urgente", label: "Urgente", tone: "urgente" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`task-priority-chip ${item.tone} ${priority === item.key ? "selected" : ""}`}
                    onClick={() => setPriority(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Internal notes */}
          <div className="task-field-group full">
            <label htmlFor="task-notes">Observações internas / checklist rápido</label>
            <textarea
              id="task-notes"
              rows={2}
              placeholder="Observações complementares, fornecedores a acionar ou links relevantes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <div className="mg-error">{error}</div>}

          <footer className="task-modal-footer">
            <button
              type="button"
              className="mg-button secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="workspace-primary task-save-submit"
              disabled={busy}
            >
              {busy ? "Salvando tarefa..." : isNew ? "Criar Tarefa" : "Salvar Alterações"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, tone, label, value }: { icon: typeof ListChecks; tone: string; label: string; value: number }) {
  return <div className={`workspace-metric ${tone}`}><span><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong></div></div>;
}
