"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck,
  Bookmark, Calculator, Camera, Check, CheckCircle2, ChevronDown, ChevronUp,
  ClipboardCheck, Coins, CreditCard, Download, Edit3, Eye, FileCheck2,
  FileText, Image as ImageIcon, Landmark, Loader2, Paperclip, Percent, Plus,
  Receipt, RotateCcw, RotateCw, Search, Sliders, Sparkles, Store, Trash2,
  Upload, Users, Wallet, X, ZoomIn, ZoomOut
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useUnit } from "@/contexts/UnitContext";
import { useAuth } from "@/contexts/AuthContext";
import { currency, dateToday, RecordData, str } from "@/domain/management/model";
import { commitRecords, saveManagement } from "@/services/managementService";
import { db } from "@/lib/firebase";
import {
  compressImageFile,
  downloadFileFromDrive,
  formatFileSize,
  getFileBlobFromDrive,
  nameFileForDrive,
  uploadFileToDrive
} from "@/services/driveService";
import { validate } from "@/domain/management/operations";
import "@/components/management/management.css";

const safeUUID = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 11) + Date.now().toString(36);

const n=(value:FormDataEntryValue|null)=>Math.max(0,Math.round(Number(value||0)*100));
const brl=(value:number)=>currency(Math.round(value));
const parseBankAmounts=(row:RecordData):Record<string,{credit:number;debit:number;pix:number}>=>{
  try{
    return JSON.parse(str(row,"reviewedBankAmountsJson")||str(row,"bankAmountsJson")||"{}");
  }catch{
    return {};
  }
};

export type CashAttachment = {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  uploadedAt?: string;
};

const parseAttachments = (row: RecordData): CashAttachment[] => {
  try {
    const raw = row.attachmentsJson;
    if (!raw) return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const closingValue=(row:RecordData,key:string,fallback=0)=>typeof row[key]==="number"?Number(row[key]):fallback;

export const isClosingConferred = (
  closing: RecordData,
  cashConferences?: RecordData[]
): boolean => {
  if (closing.status === "Conferido") return true;
  if (closing.conferredAt || closing.conferredBy) return true;
  if (cashConferences && cashConferences.some(c => !c.archived && c.closingId === closing.id)) {
    return true;
  }
  if (
    closing.reviewedBankAmountsJson &&
    closing.reviewedBankAmountsJson !== "{}" &&
    closing.reviewedBankAmountsJson !== "null"
  ) {
    return true;
  }
  if (closing.conferenceNotes) {
    return true;
  }
  return false;
};

export function isValidPixKey(key: string): boolean {
  const clean = key.trim();
  if (!clean) return false;
  const digits = clean.replace(/\D/g, "");
  if ((digits.length === 11 || digits.length === 14) && /^\d+$/.test(digits)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return true;
  if (/^(\+?55)?\s*\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(clean)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean) || /^[0-9a-f]{32}$/i.test(clean)) return true;
  return clean.length >= 5 && !/[<>{}\\]/.test(clean);
}

export function AttachmentLightbox({
  attachment,
  onClose,
}: {
  attachment: CashAttachment | null;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!attachment) return;
    setZoom(1);
    setRotation(0);
    setError("");

    if (attachment.dataUrl) {
      setBlobUrl(attachment.dataUrl);
      setLoading(false);
      return;
    }

    if (attachment.fileId && !attachment.fileId.startsWith("local-")) {
      setLoading(true);
      let isMounted = true;
      getFileBlobFromDrive(attachment.fileId)
        .then((res) => {
          if (isMounted) {
            setBlobUrl(res.url);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setLoading(false);
            setError(
              err instanceof Error
                ? err.message
                : "Não foi possível carregar o arquivo do Drive."
            );
          }
        });
      return () => {
        isMounted = false;
      };
    } else {
      setLoading(false);
      setError("Este comprovante não possui arquivo sincronizado no Drive.");
    }
  }, [attachment]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!attachment) return null;

  const isPdf =
    attachment.mimeType === "application/pdf" ||
    attachment.fileName.toLowerCase().endsWith(".pdf");

  const handleDownload = async () => {
    try {
      if (blobUrl && !blobUrl.startsWith("blob:")) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = attachment.fileName || "comprovante.jpg";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else if (attachment.fileId && !attachment.fileId.startsWith("local-")) {
        await downloadFileFromDrive(attachment.fileId, attachment.fileName);
      } else if (blobUrl) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = attachment.fileName || "comprovante";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch {
      alert("Erro ao baixar arquivo.");
    }
  };

  return (
    <div className="att-lightbox-overlay" onClick={onClose}>
      <div className="att-lightbox-container" onClick={(e) => e.stopPropagation()}>
        <header className="att-lightbox-header">
          <div className="att-lightbox-title">
            <FileText size={18} className="text-purple-400 shrink-0" />
            <div>
              <strong>{attachment.fileName}</strong>
              <small>{formatFileSize(attachment.size)}</small>
            </div>
          </div>
          <div className="att-lightbox-controls">
            {!isPdf && blobUrl && (
              <>
                <button
                  type="button"
                  title="Girar 90°"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                >
                  <RotateCw size={14} /> Girar
                </button>
                <button
                  type="button"
                  title="Diminuir Zoom"
                  onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(1))))}
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  type="button"
                  title="Tamanho Normal"
                  onClick={() => setZoom(1)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  title="Aumentar Zoom"
                  onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.2).toFixed(1))))}
                >
                  <ZoomIn size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              className="att-download-btn"
              title="Baixar comprovante"
              onClick={handleDownload}
            >
              <Download size={14} /> Baixar
            </button>
            <button
              type="button"
              className="att-close-btn"
              title="Fechar (Esc)"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="att-lightbox-body">
          {loading && (
            <div className="att-lightbox-loading">
              <Loader2 className="animate-spin text-purple-400" size={36} />
              <span>Carregando comprovante do Drive...</span>
            </div>
          )}

          {error && !loading && (
            <div className="att-lightbox-error">
              <AlertCircle size={36} />
              <strong>Não foi possível exibir a imagem</strong>
              <p>{error}</p>
              {attachment.fileId && !attachment.fileId.startsWith("local-") && (
                <button
                  type="button"
                  className="att-download-btn mt-2"
                  onClick={handleDownload}
                >
                  <Download size={14} /> Tentar Baixar Diretamente
                </button>
              )}
            </div>
          )}

          {!loading && !error && blobUrl && (
            <div className="att-lightbox-viewport">
              {isPdf ? (
                <iframe
                  src={blobUrl}
                  title={attachment.fileName}
                  className="att-lightbox-iframe"
                />
              ) : (
                <img
                  src={blobUrl}
                  alt={attachment.fileName}
                  className="att-lightbox-img"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transition: "transform 0.15s ease",
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type ClosingCalc={systemTotal:number;confirmedTotal:number;cashExpected:number;cashFound:number;cashDifference:number;creditFound:number;creditDifference:number;debitFound:number;debitDifference:number;pixFound:number;pixDifference:number;difference:number;motoboyDifference:number;invoiceDifference:number};
const emptyCalc:ClosingCalc={systemTotal:0,confirmedTotal:0,cashExpected:0,cashFound:0,cashDifference:0,creditFound:0,creditDifference:0,debitFound:0,debitDifference:0,pixFound:0,pixDifference:0,difference:0,motoboyDifference:0,invoiceDifference:0};

export function CashWorkspace({ mode }: { mode: "closing" | "conference" }) {
  const { data } = useManagement(); const { user, userProfile } = useAuth();
  const [closingOpen, setClosingOpen] = useState(false); const [editingClosing, setEditingClosing] = useState<RecordData|null>(null); const [reviewing, setReviewing] = useState<RecordData|null>(null); const [message, setMessage] = useState("");
  const [confTab, setConfTab] = useState<"queue"|"audit"|"rates">("queue");
  const [queueFilter, setQueueFilter] = useState<string>("all");

  useEffect(() => {
    if (mode !== "closing") return;
    const open = () => { setEditingClosing(null); setClosingOpen(true); };
    window.addEventListener("open-cashClosings-form", open);
    return () => window.removeEventListener("open-cashClosings-form", open);
  }, [mode]);

  const isConferred = (row: RecordData) => isClosingConferred(row, data.cashConferences);

  const getEffectiveStatus = (row: RecordData) => {
    if (isConferred(row)) return "Conferido";
    return str(row, "status") || "Aguardando conferência";
  };

  // Auto-heal existing conferred closings that were saved with status "Com divergência"
  useEffect(() => {
    if (!user) return;
    const toHeal = data.cashClosings.filter(
      r => !r.archived && r.status !== "Conferido" && isConferred(r)
    );
    if (toHeal.length > 0) {
      const now = new Date().toISOString();
      const updates = toHeal.map(r => ({
        ...r,
        status: "Conferido",
        conferredAt: r.conferredAt || now,
        conferredBy: r.conferredBy || (userProfile?.displayName || user.email || user.uid),
        updatedAt: now,
        updatedBy: user.uid
      }));
      commitRecords(updates, data, updates[0]).catch(err => {
        console.warn("[CashWorkspace] Falha ao auto-atualizar status de caixas conferidos:", err);
      });
    }
  }, [data.cashClosings, data.cashConferences, user, userProfile]);

  const today = dateToday();
  const closings = data.cashClosings.filter(row => !row.archived).sort((a, b) => str(b, "date").localeCompare(str(a, "date")));
  const userUnit = userProfile?.unitId;
  const roleStr = String(userProfile?.role || "");
  const isOperator = roleStr === "operator" || roleStr === "operador" || roleStr === "caixa";
  const visible = mode === "closing"
    ? (isOperator && userUnit && userUnit !== "all" ? closings.filter(r => r.unitId === userUnit) : closings)
    : closings.filter(r => r.status !== "Rascunho");

  const todayRows = visible.filter(r => str(r, "date") === today);
  const difference = todayRows.reduce((sum, row) => sum + Number(row.difference || 0), 0);

  const pending = closings.filter(row => !isConferred(row) && row.status !== "Rascunho");
  const reviewed = closings.filter(row => isConferred(row));

  const filteredQueue = visible.filter(row => {
    if (queueFilter === "pending") return !isConferred(row);
    if (queueFilter === "divergent") return Number(row.difference || 0) !== 0;
    if (queueFilter === "reviewed") return isConferred(row);
    return true;
  });

  return <div className="workspace-shell cash-workspace">
    <header className="workspace-header"><div><span className="workspace-eyebrow">FECHAMENTO DE CAIXA HOUSE 190</span><h1>{mode==="closing"?"Fechamento de caixa":"Conferência financeira"}</h1><p>{mode==="closing"?"Entrada total e conciliação objetiva de Dinheiro, Crédito, Débito e PIX.":"Compare os valores apurados, revise divergências, audite motoboys e aprove os saldos líquidos dos bancos."}</p></div>{mode==="closing"&&<button className="workspace-primary" onClick={()=>{ setEditingClosing(null); setClosingOpen(true); }}><Plus size={16}/> Novo fechamento</button>}</header>
    <section className="workspace-metrics">
      <Metric icon={Wallet} tone="purple" label="Registros de hoje" value={String(todayRows.length)}/>
      <Metric icon={Calculator} tone={difference===0?"green":"red"} label="Diferença do dia" value={brl(difference)}/>
      <Metric icon={AlertTriangle} tone={pending.length>0?"red":"green"} label="Aguardando financeiro" value={String(pending.length)}/>
      <Metric icon={CheckCircle2} tone="green" label="Conferidos" value={String(reviewed.length)}/>
    </section>
    {message&&<p className="workspace-message">{message}</p>}

    {mode==="conference"&&(
      <div className="cash-subtabs">
        <button className={`cash-subtab ${confTab==="queue"?"active":""}`} onClick={()=>setConfTab("queue")}>
          <ClipboardCheck size={16}/> Caixas para conferência <b>{pending.length}</b>
        </button>
        <button className={`cash-subtab ${confTab==="audit"?"active":""}`} onClick={()=>setConfTab("audit")}>
          <FileText size={16}/> Auditoria de Motoboys & Notas <b>{closings.length}</b>
        </button>
        <button className={`cash-subtab ${confTab==="rates"?"active":""}`} onClick={()=>setConfTab("rates")}>
          <Percent size={16}/> Taxas das Máquinas & Bancos
        </button>
      </div>
    )}

    {mode==="conference"&&confTab==="audit"?(
      <AuditHistoryTab closings={closings} />
    ):mode==="conference"&&confTab==="rates"?(
      <BankRatesTab />
    ):(
      <section className="cash-list">
        <header>
          <div>
            <span>{mode==="closing"?"HISTÓRICO":"FILA FINANCEIRA"}</span>
            <h2>{mode==="closing"?"Fechamentos registrados":"Caixas para conferência"}</h2>
          </div>
          {mode==="conference"&&(
            <div className="flex items-center gap-1.5 flex-wrap">
              <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${queueFilter==="all"?"bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300":"text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} onClick={()=>setQueueFilter("all")}>
                Todos ({visible.length})
              </button>
              <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${queueFilter==="pending"?"bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300":"text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} onClick={()=>setQueueFilter("pending")}>
                Pendentes ({visible.filter(r=>!isConferred(r)).length})
              </button>
              <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${queueFilter==="divergent"?"bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300":"text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} onClick={()=>setQueueFilter("divergent")}>
                Divergências ({visible.filter(r=>Number(r.difference||0)!==0).length})
              </button>
              <button className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${queueFilter==="reviewed"?"bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300":"text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`} onClick={()=>setQueueFilter("reviewed")}>
                Conferidos ({visible.filter(r=>isConferred(r)).length})
              </button>
            </div>
          )}
          <b>{filteredQueue.length}</b>
        </header>
        {filteredQueue.length?filteredQueue.map(row=>{
          const unit=data.units.find(u=>u.id===row.unitId);
          const hasDiff=Number(row.difference||0)!==0;
          const rowConferred=isConferred(row);
          const effectiveStatus=getEffectiveStatus(row);
          return <article key={row.id}>
            <div className={`cash-status-icon ${rowConferred ? "ok" : ""}`}><ClipboardCheck size={18}/></div>
            <div>
              <strong>{unit?.name||"Unidade"}</strong>
              <span>{str(row,"date").split("-").reverse().join("/")} · Turno {str(row,"shift")} · {str(row,"operatorName")}</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {Number(row.sangriaAmount||0)>0&&(
                  <small className="cash-sangria-badge">
                    Sangria: {brl(Number(row.sangriaAmount))} ({str(row,"sangriaStatus")||"Registrada"}{str(row,"sangriaRecipient")?` · ${str(row,"sangriaRecipient")}`:""})
                  </small>
                )}
                {parseAttachments(row).length > 0 && (
                  <small className="cash-attachment-badge">
                    <Paperclip size={11} /> {parseAttachments(row).length} comprovante(s)
                  </small>
                )}
              </div>
            </div>
            <div>
              <small>Entrada total</small>
              <b>{currency(Number(row.systemTotal||0))}</b>
            </div>
            <div>
              <small>Diferença total</small>
              <b className={!hasDiff?"ok":"bad"}>{currency(Number(row.difference||0))}</b>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`cash-badge ${effectiveStatus.toLowerCase().replace(/\s+/g,"-")}`}>
                {rowConferred ? "Conferido" : effectiveStatus}
              </span>
              {rowConferred && hasDiff && (
                <span className="cash-divergence-pill" title="Divergência registrada e aprovada pelo financeiro">
                  Dif. {currency(Number(row.difference||0))}
                </span>
              )}
            </div>
            {mode==="conference"&&(
              <button
                className={rowConferred ? "workspace-secondary" : "workspace-primary"}
                onClick={()=>setReviewing(row)}
                title={rowConferred ? "Conferência concluída. Clique para rever detalhes." : "Clique para conferir o caixa."}
              >
                {rowConferred ? <Check size={14}/> : <BadgeCheck size={15}/>}
                <span>{rowConferred ? "Rever" : "Conferir Caixa"}</span>
              </button>
            )}
            {mode==="closing"&&!rowConferred&&(
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="cash-reopen-btn"
                  title="Reabrir este fechamento para corrigir ou ajustar valores antes da conferência do financeiro"
                  onClick={()=>{ setEditingClosing(row); setClosingOpen(true); }}
                >
                  <RotateCcw size={12}/> Reabrir
                </button>
                <button
                  type="button"
                  className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition border border-rose-200 dark:border-rose-900 flex items-center gap-1"
                  title="Excluir este fechamento de caixa caso tenha sido lançado com data errada ou duplicado"
                  onClick={async () => {
                    const unitName = data.units.find(u => u.id === row.unitId)?.name || row.unitId;
                    const formattedDate = str(row, "date").split("-").reverse().join("/");
                    if (!window.confirm(`Tem certeza que deseja excluir o fechamento de ${formattedDate} (${unitName})? Caso tenha lançado com a data errada, você poderá lançar novamente com a data certa.`)) return;
                    try {
                      const rowToDelete = { ...row, updatedBy: user?.uid || row.updatedBy };
                      await saveManagement(rowToDelete, data, true);
                      setMessage(`Fechamento de ${formattedDate} excluído com sucesso.`);
                    } catch (err) {
                      console.error("Erro ao excluir fechamento:", err);
                      alert("Não foi possível excluir o fechamento: " + (err instanceof Error ? err.message : String(err)));
                    }
                  }}
                >
                  <Trash2 size={12}/> Excluir
                </button>
              </div>
            )}
          </article>;
        }):<div className="people-empty"><FileCheck2 size={30}/><strong>Nenhum fechamento encontrado</strong><span>{mode==="closing"?"Use “Novo fechamento” para iniciar.":"Nenhum caixa encontrado para este filtro."}</span></div>}
      </section>
    )}

    {closingOpen&&(
      <ClosingModal
        initialClosing={editingClosing}
        onClose={()=>{ setClosingOpen(false); setEditingClosing(null); }}
        onSaved={()=>{
          const wasReopen = Boolean(editingClosing);
          setClosingOpen(false);
          setEditingClosing(null);
          setMessage(wasReopen ? "Fechamento atualizado com sucesso e reenviado ao financeiro." : "Fechamento enviado ao financeiro para conferência.");
        }}
      />
    )}
    {reviewing&&<ConferenceModal closing={reviewing} onClose={()=>setReviewing(null)} onSaved={()=>{setReviewing(null);setMessage("Conferência aprovada e saldos bancários atualizados com desconto de taxas.");}}/>}
  </div>;
}

function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){return <div className="mg-modal-shade"><div className={`mg-modal ${wide?"cash-modal-wide":""}`} role="dialog" aria-modal="true"><header><h2>{title}</h2><button onClick={onClose}><X size={20}/></button></header>{children}</div></div>}

const DRAFT_KEY = "house190_closing_draft";

function loadDraftData() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const toMoneyInput = (val: unknown) => (typeof val === "number" && val !== 0 ? String(val / 100) : "");

const parseOutflows = (json: unknown) => {
  try {
    if (typeof json === "string" && json.trim()) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return parsed.map(item => ({
        id: item.id || safeUUID(),
        name: String(item.name || ""),
        amount: typeof item.amount === "number" ? String(item.amount / 100) : String(item.amount || "")
      }));
    }
  } catch {}
  return [];
};

const parsePixRequests = (json: unknown) => {
  try {
    if (typeof json === "string" && json.trim()) {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return parsed.map(item => ({
        id: item.id || safeUUID(),
        name: String(item.name || ""),
        key: String(item.key || ""),
        description: String(item.description || ""),
        amount: typeof item.amount === "number" ? String(item.amount / 100) : String(item.amount || "")
      }));
    }
  } catch {}
  return [];
};

function ClosingModal({
  initialClosing = null,
  onClose,
  onSaved
}: {
  initialClosing?: RecordData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { currentUnit } = useUnit();
  const { user, userProfile } = useAuth();

  const [loadedClosing, setLoadedClosing] = useState<RecordData | null>(null);
  const activeTargetClosing = initialClosing || loadedClosing;

  const draft = useMemo(() => (!activeTargetClosing ? loadDraftData() : null), [activeTargetClosing]);
  const [hasDraft, setHasDraft] = useState(() => Boolean(draft));
  const [draftSavedMsg, setDraftSavedMsg] = useState("");

  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [unit, setUnit] = useState<string>(() => {
    if (activeTargetClosing?.unitId) return activeTargetClosing.unitId;
    if (draft?.unit) return draft.unit;
    if (allowedUnit !== "all") return allowedUnit;
    if (currentUnit !== "all") return currentUnit;
    return data.units[0]?.id || "";
  });
  const [date, setDate] = useState(() => {
    if (activeTargetClosing) return str(activeTargetClosing, "date") || dateToday();
    if (draft?.date) return draft.date;
    return dateToday();
  });
  const [operatorName, setOperatorName] = useState(() => {
    if (activeTargetClosing) return str(activeTargetClosing, "operatorName") || "";
    if (draft?.operatorName) return draft.operatorName;
    return userProfile?.displayName || "";
  });
  const [shift, setShift] = useState(() => {
    if (activeTargetClosing) return str(activeTargetClosing, "shift") || "Único";
    if (draft?.shift) return draft.shift;
    return "Único";
  });

  const existingForShift = useMemo(() => {
    if (activeTargetClosing) return null;
    return data.cashClosings.find(
      c => !c.archived && c.unitId === unit && str(c, "date") === date && (str(c, "shift") || "Único") === shift
    );
  }, [activeTargetClosing, data.cashClosings, unit, date, shift]);

  // Step 1: Vendas PDV (strings in R$)
  const [systemCash, setSystemCash] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemCash) : draft?.systemCash || "");
  const [systemCredit, setSystemCredit] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemCredit) : draft?.systemCredit || "");
  const [systemDebit, setSystemDebit] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemDebit) : draft?.systemDebit || "");
  const [systemPix, setSystemPix] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemPix) : draft?.systemPix || "");
  const [systemServiceFee, setSystemServiceFee] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemServiceFee) : draft?.systemServiceFee || "");
  const [showOtherChannels, setShowOtherChannels] = useState(() => {
    if (initialClosing) return Boolean(initialClosing.systemIfoodOnline || initialClosing.systemIfoodVoucher || initialClosing.systemTerm || initialClosing.systemClub || initialClosing.systemAccrual);
    return Boolean(draft?.showOtherChannels);
  });
  const [systemIfoodOnline, setSystemIfoodOnline] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemIfoodOnline) : draft?.systemIfoodOnline || "");
  const [systemIfoodVoucher, setSystemIfoodVoucher] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemIfoodVoucher) : draft?.systemIfoodVoucher || "");
  const [systemTerm, setSystemTerm] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemTerm) : draft?.systemTerm || "");
  const [systemClub, setSystemClub] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemClub) : draft?.systemClub || "");
  const [systemAccrual, setSystemAccrual] = useState(() => initialClosing ? toMoneyInput(initialClosing.systemAccrual) : draft?.systemAccrual || "");

  // Step 2: Dinheiro & Caixa
  const [openingAmount, setOpeningAmount] = useState(() => initialClosing ? toMoneyInput(initialClosing.openingAmount) : draft?.openingAmount || "");
  const [cashIn, setCashIn] = useState(() => initialClosing ? toMoneyInput(initialClosing.cashIn) : draft?.cashIn || "");
  const [sangriaAmount, setSangriaAmount] = useState(() => initialClosing ? toMoneyInput(initialClosing.sangriaAmount) : draft?.sangriaAmount || "");
  const [sangriaStatus, setSangriaStatus] = useState(() => initialClosing ? str(initialClosing, "sangriaStatus") || "Na loja" : draft?.sangriaStatus || "Na loja");
  const [sangriaRecipient, setSangriaRecipient] = useState(() => initialClosing ? str(initialClosing, "sangriaRecipient") || "" : draft?.sangriaRecipient || "");
  const [closingFloat, setClosingFloat] = useState(() => initialClosing ? toMoneyInput(initialClosing.closingFloat) : draft?.closingFloat || "");
  const [outflows, setOutflows] = useState<Array<{ id: string; name: string; amount: string }>>(() => {
    if (initialClosing) return parseOutflows(initialClosing.cashOutflowsJson);
    if (Array.isArray(draft?.outflows)) return draft.outflows;
    return [];
  });

  // Step 3: Maquininhas
  const banks = useMemo(() => data.bankAccounts.filter(row => !row.archived && row.unitId === unit), [data.bankAccounts, unit]);
  const [machines, setMachines] = useState<Record<string, { used: boolean; credit: string; debit: string; pix: string }>>(() => {
    if (initialClosing) {
      const saved = parseBankAmounts(initialClosing);
      const res: Record<string, { used: boolean; credit: string; debit: string; pix: string }> = {};
      Object.entries(saved).forEach(([bId, v]) => {
        res[bId] = {
          used: true,
          credit: v.credit ? String(v.credit / 100) : "",
          debit: v.debit ? String(v.debit / 100) : "",
          pix: v.pix ? String(v.pix / 100) : ""
        };
      });
      return res;
    }
    if (draft?.machines && typeof draft.machines === "object") return draft.machines;
    return {};
  });

  useEffect(() => {
    setMachines(prev => {
      const next: Record<string, { used: boolean; credit: string; debit: string; pix: string }> = {};
      banks.forEach(b => {
        next[b.id] = prev[b.id] || { used: false, credit: "", debit: "", pix: "" };
      });
      return next;
    });
  }, [banks]);

  // Step 4: Extras & Envio
  const [pixRequests, setPixRequests] = useState<Array<{ id: string; name: string; key: string; description: string; amount: string }>>(() => {
    if (initialClosing) return parsePixRequests(initialClosing.pixRequestsJson);
    if (Array.isArray(draft?.pixRequests)) return draft.pixRequests;
    return [];
  });
  const [motoboySystem, setMotoboySystem] = useState(() => initialClosing ? toMoneyInput(initialClosing.motoboySystem) : draft?.motoboySystem || "");
  const [motoboyPaid, setMotoboyPaid] = useState(() => initialClosing ? toMoneyInput(initialClosing.motoboyPaid) : draft?.motoboyPaid || "");
  const [ifoodAudit, setIfoodAudit] = useState(() => initialClosing ? toMoneyInput(initialClosing.ifoodAudit) : draft?.ifoodAudit || "");
  const [fiscalMachines, setFiscalMachines] = useState(() => initialClosing ? toMoneyInput(initialClosing.fiscalMachines) : draft?.fiscalMachines || "");
  const [invoiceIssued, setInvoiceIssued] = useState(() => initialClosing ? toMoneyInput(initialClosing.invoiceIssued) : draft?.invoiceIssued || "");
  const [notes, setNotes] = useState(() => initialClosing ? str(initialClosing, "notes") : draft?.notes || "");
  const [existingAttachments, setExistingAttachments] = useState<CashAttachment[]>(() =>
    initialClosing ? parseAttachments(initialClosing) : []
  );
  const [newFiles, setNewFiles] = useState<{ file: File; previewUrl: string; dataUrl: string; size: number }[]>([]);
  const [compressingFiles, setCompressingFiles] = useState(false);

  const handleLoadExisting = (c: RecordData) => {
    setLoadedClosing(c);
    setUnit(c.unitId || "");
    setDate(str(c, "date") || dateToday());
    setShift(str(c, "shift") || "Único");
    setOperatorName(str(c, "operatorName") || "");
    setSystemCash(toMoneyInput(c.systemCash));
    setSystemCredit(toMoneyInput(c.systemCredit));
    setSystemDebit(toMoneyInput(c.systemDebit));
    setSystemPix(toMoneyInput(c.systemPix));
    setSystemServiceFee(toMoneyInput(c.systemServiceFee));
    setSystemIfoodOnline(toMoneyInput(c.systemIfoodOnline));
    setSystemIfoodVoucher(toMoneyInput(c.systemIfoodVoucher));
    setSystemTerm(toMoneyInput(c.systemTerm));
    setSystemClub(toMoneyInput(c.systemClub));
    setSystemAccrual(toMoneyInput(c.systemAccrual));
    setOpeningAmount(toMoneyInput(c.openingAmount));
    setCashIn(toMoneyInput(c.cashIn));
    setSangriaAmount(toMoneyInput(c.sangriaAmount));
    setSangriaStatus(str(c, "sangriaStatus") || "Na loja");
    setSangriaRecipient(str(c, "sangriaRecipient") || "");
    setClosingFloat(toMoneyInput(c.closingFloat));
    setOutflows(parseOutflows(c.cashOutflowsJson));
    const saved = parseBankAmounts(c);
    const res: Record<string, { used: boolean; credit: string; debit: string; pix: string }> = {};
    Object.entries(saved).forEach(([bId, v]) => {
      res[bId] = {
        used: true,
        credit: v.credit ? String(v.credit / 100) : "",
        debit: v.debit ? String(v.debit / 100) : "",
        pix: v.pix ? String(v.pix / 100) : ""
      };
    });
    setMachines(res);
    setPixRequests(parsePixRequests(c.pixRequestsJson));
    setMotoboySystem(toMoneyInput(c.motoboySystem));
    setMotoboyPaid(toMoneyInput(c.motoboyPaid));
    setIfoodAudit(toMoneyInput(c.ifoodAudit));
    setFiscalMachines(toMoneyInput(c.fiscalMachines));
    setInvoiceIssued(toMoneyInput(c.invoiceIssued));
    setNotes(str(c, "notes") || "");
    setExistingAttachments(parseAttachments(c));
  };

  const handleAddFiles = async (fileList: FileList | File[]) => {
    const remaining = 5 - (existingAttachments.length + newFiles.length);
    if (remaining <= 0) {
      alert("Você pode anexar no máximo 5 comprovantes.");
      return;
    }
    const toProcess = Array.from(fileList).slice(0, remaining);
    setCompressingFiles(true);
    try {
      const processed = await Promise.all(
        toProcess.map(async (file) => {
          if (file.type && file.type.startsWith("image/")) {
            const comp = await compressImageFile(file, 1600, 0.75);
            return {
              file: comp.file,
              previewUrl: comp.dataUrl || (typeof window !== "undefined" ? URL.createObjectURL(comp.file) : ""),
              dataUrl: comp.dataUrl,
              size: comp.size,
            };
          }
          return {
            file,
            previewUrl: typeof window !== "undefined" ? URL.createObjectURL(file) : "",
            dataUrl: "",
            size: file.size,
          };
        })
      );
      setNewFiles((prev) => [...prev, ...processed]);
    } finally {
      setCompressingFiles(false);
    }
  };

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setHasDraft(false);
    setSystemCash("");
    setSystemCredit("");
    setSystemDebit("");
    setSystemPix("");
    setSystemServiceFee("");
    setShowOtherChannels(false);
    setSystemIfoodOnline("");
    setSystemIfoodVoucher("");
    setSystemTerm("");
    setSystemClub("");
    setSystemAccrual("");
    setOpeningAmount("");
    setCashIn("");
    setSangriaAmount("");
    setSangriaStatus("Na loja");
    setSangriaRecipient("");
    setClosingFloat("");
    setOutflows([]);
    setMachines({});
    setPixRequests([]);
    setMotoboySystem("");
    setMotoboyPaid("");
    setIfoodAudit("");
    setFiscalMachines("");
    setInvoiceIssued("");
    setNotes("");
  };

  const handleSaveDraft = () => {
    try {
      const draftObj = {
        unit, date, shift, operatorName, systemCash, systemCredit, systemDebit, systemPix,
        systemServiceFee, showOtherChannels, systemIfoodOnline, systemIfoodVoucher, systemTerm, systemClub,
        systemAccrual, openingAmount, cashIn, sangriaAmount, sangriaStatus, sangriaRecipient, closingFloat,
        outflows, machines, pixRequests, motoboySystem, motoboyPaid, ifoodAudit, fiscalMachines, invoiceIssued, notes,
        savedAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draftObj));
      setDraftSavedMsg("Rascunho Salvo!");
      setHasDraft(true);
      setTimeout(() => setDraftSavedMsg(""), 3000);
    } catch {
      setDraftSavedMsg("Erro ao salvar");
    }
  };

  useEffect(() => {
    if (initialClosing) return;
    const timer = setTimeout(() => {
      try {
        const hasContent = Boolean(
          systemCash || systemCredit || systemDebit || systemPix || systemServiceFee ||
          openingAmount || closingFloat || outflows.length || Object.values(machines).some(m => m.used) ||
          pixRequests.length || motoboySystem || motoboyPaid || ifoodAudit || fiscalMachines || invoiceIssued || notes
        );
        if (hasContent) {
          const draftObj = {
            unit, date, shift, operatorName, systemCash, systemCredit, systemDebit, systemPix,
            systemServiceFee, showOtherChannels, systemIfoodOnline, systemIfoodVoucher, systemTerm, systemClub,
            systemAccrual, openingAmount, cashIn, sangriaAmount, sangriaStatus, sangriaRecipient, closingFloat,
            outflows, machines, pixRequests, motoboySystem, motoboyPaid, ifoodAudit, fiscalMachines, invoiceIssued, notes,
            savedAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draftObj));
        }
      } catch {}
    }, 800);
    return () => clearTimeout(timer);
  }, [
    initialClosing, unit, date, shift, operatorName, systemCash, systemCredit, systemDebit, systemPix,
    systemServiceFee, showOtherChannels, systemIfoodOnline, systemIfoodVoucher, systemTerm, systemClub,
    systemAccrual, openingAmount, cashIn, sangriaAmount, sangriaStatus, sangriaRecipient, closingFloat,
    outflows, machines, pixRequests, motoboySystem, motoboyPaid, ifoodAudit, fiscalMachines, invoiceIssued, notes
  ]);

  // Cent helpers
  const c = (val: string) => Math.max(0, Math.round(Number(val || 0) * 100));

  const cSysCash = c(systemCash);
  const cSysCredit = c(systemCredit);
  const cSysDebit = c(systemDebit);
  const cSysPix = c(systemPix);
  const cSysServiceFee = c(systemServiceFee);
  const cOther = c(systemIfoodOnline) + c(systemIfoodVoucher) + c(systemTerm) + c(systemClub) + c(systemAccrual);
  const cSysTotal = cSysCash + cSysCredit + cSysDebit + cSysPix + cSysServiceFee + cOther;

  const cOpening = c(openingAmount);
  const cCashIn = c(cashIn);
  const cSangria = c(sangriaAmount);
  const cClosingFloat = c(closingFloat);
  const cOutflows = outflows.reduce((sum, r) => sum + c(r.amount), 0);
  const cCashExpected = cOpening + cSysCash + cCashIn - cOutflows;
  const cCashFound = cSangria + cClosingFloat;
  const cCashDiff = cCashExpected < 0 ? cCashFound - Math.abs(cCashExpected) : cCashFound - cCashExpected;

  let cCreditFound = 0;
  let cDebitFound = 0;
  let cPixFound = 0;
  Object.entries(machines).forEach(([_, m]) => {
    if (m.used) {
      cCreditFound += c(m.credit);
      cDebitFound += c(m.debit);
      cPixFound += c(m.pix);
    }
  });

  const cCreditDiff = cCreditFound - cSysCredit;
  const cDebitDiff = cDebitFound - cSysDebit;
  const cPixDiff = cPixFound - cSysPix;
  const cTotalConfirmed = cCashFound + cCreditFound + cDebitFound + cPixFound;
  const cTotalDiff = cCashDiff + cCreditDiff + cDebitDiff + cPixDiff;

  const cMotoboyDiff = c(motoboyPaid) - c(motoboySystem);
  const cInvoiceDiff = c(ifoodAudit) + c(fiscalMachines) - c(invoiceIssued);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!unit) { setError("Selecione a unidade do fechamento."); return; }
    if (!operatorName.trim()) { setError("Informe o nome do operador."); return; }
    setBusy(true);
    setError("");

    try {
      const bankAmounts: Record<string, { credit: number; debit: number; pix: number }> = {};
      Object.entries(machines).forEach(([bId, m]) => {
        if (m.used) {
          bankAmounts[bId] = {
            credit: c(m.credit),
            debit: c(m.debit),
            pix: c(m.pix)
          };
        }
      });

      if (!Object.keys(bankAmounts).length && (cSysCredit + cSysDebit + cSysPix) > 0) {
        throw new Error("Selecione e preencha ao menos uma máquina de cartão/PIX utilizada.");
      }

      const requestedPix = pixRequests.filter(item => item.name.trim() || item.key.trim() || item.description.trim() || Number(item.amount) > 0);
      if (requestedPix.some(item => !item.name.trim() || !item.key.trim() || !item.description.trim() || Number(item.amount) <= 0)) {
        throw new Error("Preencha favorecido, chave PIX, motivo e valor em todas as solicitações de PIX.");
      }
      if (requestedPix.some(item => !isValidPixKey(item.key))) {
        throw new Error("Uma ou mais chaves PIX informadas têm formato inválido (use CPF, CNPJ, e-mail, telefone ou chave aleatória).");
      }

      if (cSangria > 0 && !sangriaRecipient.trim()) {
        throw new Error("Informe para quem foi entregue a sangria ou onde está guardada na loja.");
      }

      if (existingAttachments.length + newFiles.length > 5) {
        throw new Error("Envie no máximo 5 comprovantes.");
      }

      const uploadedAttachments: CashAttachment[] = [...existingAttachments];
      for (const item of newFiles) {
        try {
          const named = nameFileForDrive(item.file, `Fechamento ${date} - ${unit}`);
          const saved = await uploadFileToDrive(named, "payment_proofs");
          uploadedAttachments.push({
            fileId: saved.fileId,
            fileName: saved.fileName,
            mimeType: saved.mimeType,
            size: saved.size,
            dataUrl: item.dataUrl && item.dataUrl.length < 350000 ? item.dataUrl : undefined,
            uploadedAt: new Date().toISOString()
          });
        } catch (uploadErr) {
          console.warn("[Fechamento] Falha ao enviar comprovante para o Drive, mantendo fallback com preview:", uploadErr);
          uploadedAttachments.push({
            fileId: `local-${Date.now()}-${item.file.name}`,
            fileName: item.file.name,
            mimeType: item.file.type || "image/jpeg",
            size: item.size,
            dataUrl: item.dataUrl || undefined,
            uploadedAt: new Date().toISOString()
          });
        }
      }

      const now = new Date().toISOString();
      const targetClosing = activeTargetClosing;
      const closingId = targetClosing?.id || `closing-${date}-${unit}-${Date.now()}`;
      const defaultCategory =
        data.categories.find(cat => !cat.archived && str(cat, "nature").toLowerCase() === "operacional")?.id ||
        data.categories.find(cat => !cat.archived && str(cat, "dreLine") === "Operacionais")?.id ||
        data.categories.find(cat => !cat.archived)?.id ||
        "";

      // If date or shift changed from an existing closing, clean up the old unique slot
      if (targetClosing && str(targetClosing, "date") && (str(targetClosing, "date") !== date || (str(targetClosing, "shift") || "Único") !== shift)) {
        try {
          const oldShift = str(targetClosing, "shift") || "Único";
          const oldUniqueRaw = JSON.stringify([tenantId, targetClosing.unitId, "cashClosings", str(targetClosing, "date"), oldShift]);
          const oldDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(oldUniqueRaw));
          const oldUniqueId = Array.from(new Uint8Array(oldDigest)).map(v => v.toString(16).padStart(2, "0")).join("");
          const { deleteDoc, doc } = await import("firebase/firestore");
          await deleteDoc(doc(db, "gestao_unique", oldUniqueId)).catch(() => {});
        } catch {}
      }

      const row: RecordData = {
        ...(targetClosing || {}),
        id: closingId,
        kind: "cashClosings",
        tenantId,
        unitId: unit,
        version: targetClosing ? Number(targetClosing.version || 0) : 0,
        createdAt: targetClosing?.createdAt || now,
        updatedAt: now,
        createdBy: targetClosing?.createdBy || user.uid,
        updatedBy: user.uid,
        date,
        shift,
        operatorName: operatorName.trim(),
        systemCash: cSysCash,
        systemCredit: cSysCredit,
        systemDebit: cSysDebit,
        systemPix: cSysPix,
        systemIfoodOnline: c(systemIfoodOnline),
        systemIfoodVoucher: c(systemIfoodVoucher),
        systemTerm: c(systemTerm),
        systemClub: c(systemClub),
        systemAccrual: c(systemAccrual),
        systemServiceFee: cSysServiceFee,
        openingAmount: cOpening,
        cashIn: cCashIn,
        cashOutflows: cOutflows,
        cashOutflowsJson: JSON.stringify(outflows.filter(item => item.name.trim() || Number(item.amount) > 0)),
        sangriaAmount: cSangria,
        sangriaStatus: cSangria > 0 ? sangriaStatus : "",
        sangriaRecipient: cSangria > 0 ? sangriaRecipient.trim() : "",
        closingFloat: cClosingFloat,
        bankAmountsJson: JSON.stringify(bankAmounts),
        systemTotal: cSysTotal,
        countedTotal: cTotalConfirmed,
        cashExpected: cCashExpected,
        cashFound: cCashFound,
        cashDifference: cCashDiff,
        creditFound: cCreditFound,
        creditDifference: cCreditDiff,
        debitFound: cDebitFound,
        debitDifference: cDebitDiff,
        pixFound: cPixFound,
        pixDifference: cPixDiff,
        difference: cTotalDiff,
        motoboySystem: c(motoboySystem),
        motoboyPaid: c(motoboyPaid),
        motoboyDifference: cMotoboyDiff,
        ifoodAudit: c(ifoodAudit),
        fiscalMachines: c(fiscalMachines),
        invoiceIssued: c(invoiceIssued),
        invoiceDifference: cInvoiceDiff,
        pixRequestsJson: JSON.stringify(requestedPix),
        attachmentsJson: JSON.stringify(uploadedAttachments),
        status: "Aguardando conferência",
        notes: notes.trim()
      };

      const payables = requestedPix.map(request => ({
        id: `pix-${closingId}-${request.id}`,
        kind: "payables" as const,
        tenantId,
        unitId: unit,
        version: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
        obligationType: "Outros",
        ...(defaultCategory ? { categoryId: defaultCategory } : {}),
        description: `PIX — ${request.description} (${request.name})`,
        competence: date.slice(0, 7),
        dueDate: date,
        amount: Math.round(Number(request.amount) * 100),
        paymentMethod: "PIX",
        status: "Pendente",
        nature: "Operacional",
        sourceId: closingId,
        pixKey: request.key,
        notes: `Solicitação criada no fechamento de caixa. Chave PIX: ${request.key}`
      })) as RecordData[];

      [row, ...payables].forEach(record => validate(record, data));

      // Retry up to 3 times for transient Firebase errors (quota, network)
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await commitRecords([row, ...payables], data, row);
          try {
            localStorage.removeItem(DRAFT_KEY);
          } catch {}
          onSaved();
          return;
        } catch (retryErr) {
          lastErr = retryErr;
          const msg = retryErr instanceof Error ? retryErr.message : "";
          const isTransient = /quota exceeded|resource exhausted|unavailable|deadline exceeded/i.test(msg);
          if (!isTransient || attempt === 2) break;
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        }
      }
      throw lastErr;
    } catch (e) {
      handleSaveDraft();
      const message = e instanceof Error ? e.message : "Não foi possível salvar o fechamento.";
      console.error("[Fechamento] Erro ao salvar:", e);
      if (/quota exceeded|resource exhausted/i.test(message)) {
        setError("O Firebase atingiu o limite temporário de requisições. Seus dados foram salvos como RASCUNHO no navegador para você não perder nada. Aguarde 1 a 2 minutos e tente enviar novamente.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const stepsList = [
    { id: 1 as const, title: "1. Vendas PDV", icon: Receipt },
    { id: 2 as const, title: "2. Dinheiro & Gaveta", icon: Coins },
    { id: 3 as const, title: "3. Maquininhas", icon: CreditCard },
    { id: 4 as const, title: "4. Auditoria & Envio", icon: Sparkles },
  ];

  return (
    <div className="mg-modal-shade" role="dialog" aria-modal="true">
      <div className="closing-modal-container">
        {/* Header */}
        <header className="closing-modal-header">
          <div>
            <h2>{initialClosing ? "Reabertura de Fechamento" : "Fechamento de Caixa"}</h2>
            <p>{initialClosing ? "Ajuste os valores deste turno e reenvie para a conferência financeira." : "Conferência simplificada e intuitiva para o operador de loja."}</p>
          </div>
          <button type="button" className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {/* Reopen or Draft Notice Banner */}
        {activeTargetClosing ? (
          <div className="mx-6 mt-3 flex items-center justify-between p-2.5 px-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-900 dark:text-indigo-200">
            <div className="flex items-center gap-2">
              <RotateCcw size={14} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              <span>Você está editando o fechamento de <b>{str(activeTargetClosing, "date").split("-").reverse().join("/")} ({str(activeTargetClosing, "operatorName")})</b>. Ajuste os valores e clique em salvar no final.</span>
            </div>
          </div>
        ) : existingForShift ? (
          <div className="mx-6 mt-3 flex items-center justify-between p-2.5 px-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>Já existe um fechamento gravado para <b>{date.split("-").reverse().join("/")} (Turno {shift})</b>.</span>
            </div>
            <button
              type="button"
              onClick={() => handleLoadExisting(existingForShift)}
              className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline transition ml-3 flex items-center gap-1 flex-shrink-0"
            >
              <RotateCcw size={12}/> Carregar dados deste fechamento
            </button>
          </div>
        ) : hasDraft ? (
          <div className="mx-6 mt-3 flex items-center justify-between p-2.5 px-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <Bookmark size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>Rascunho recuperado automaticamente. Os valores preenchidos anteriormente estão preservados.</span>
            </div>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline transition ml-3 flex-shrink-0"
            >
              Descartar rascunho
            </button>
          </div>
        ) : null}

        {/* Identification Meta Bar */}
        <div className="closing-meta-bar">
          <div className="closing-meta-item">
            <Store size={15} />
            <select
              value={unit}
              disabled={allowedUnit !== "all"}
              onChange={e => {
                setUnit(e.target.value);
                setMachines({});
              }}
            >
              <option value="">Selecione a loja</option>
              {data.units.filter(u => !u.archived && (allowedUnit === "all" || u.id === allowedUnit)).map(u => (
                <option key={u.id} value={u.id}>{str(u, "name")}</option>
              ))}
            </select>
          </div>

          <div className="closing-meta-item">
            <span>Data:</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>

          <div className="closing-meta-item">
            <span>Operador:</span>
            <input
              type="text"
              placeholder="Nome do operador"
              value={operatorName}
              onChange={e => setOperatorName(e.target.value)}
              required
            />
          </div>

          <div className="closing-meta-item">
            <span>Turno:</span>
            <select value={shift} onChange={e => setShift(e.target.value)}>
              <option value="Único">Turno Único</option>
              <option value="Almoço">Almoço</option>
              <option value="Jantar">Jantar</option>
            </select>
          </div>
        </div>

        {/* Step Navigation Tabs */}
        <div className="closing-steps-nav">
          {stepsList.map(s => {
            const Icon = s.icon;
            const isActive = activeStep === s.id;
            const isPast = activeStep > s.id;
            return (
              <button
                key={s.id}
                type="button"
                className={`closing-step-tab ${isActive ? "active" : ""}`}
                onClick={() => setActiveStep(s.id)}
              >
                <span className="step-number">{isPast ? <Check size={11} /> : s.id}</span>
                <Icon size={15} />
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="closing-modal-body">
          {/* STEP 1: VENDAS DO SISTEMA (PDV) */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div className="closing-section-lead">
                <div>
                  <h3>Valores do Sistema (PDV)</h3>
                  <p>Informe o total que apareceu no relatório de vendas do seu sistema.</p>
                </div>
                <div className="closing-summary-pill neutral">
                  Total Vendas: <b>{brl(cSysTotal)}</b>
                </div>
              </div>

              <div className="closing-cards-grid-5">
                <div className="closing-value-card">
                  <label>Dinheiro no Sistema</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={systemCash}
                      onChange={e => setSystemCash(e.target.value)}
                    />
                  </div>
                </div>

                <div className="closing-value-card">
                  <label>Cartão de Crédito</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={systemCredit}
                      onChange={e => setSystemCredit(e.target.value)}
                    />
                  </div>
                </div>

                <div className="closing-value-card">
                  <label>Cartão de Débito</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={systemDebit}
                      onChange={e => setSystemDebit(e.target.value)}
                    />
                  </div>
                </div>

                <div className="closing-value-card">
                  <label>PIX no Sistema</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={systemPix}
                      onChange={e => setSystemPix(e.target.value)}
                    />
                  </div>
                </div>

                <div className="closing-value-card">
                  <label>Taxa de Serviço</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={systemServiceFee}
                      onChange={e => setSystemServiceFee(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Collapsible Other Channels */}
              <div className="pt-2">
                <button
                  type="button"
                  className="flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition py-1"
                  onClick={() => setShowOtherChannels(!showOtherChannels)}
                >
                  {showOtherChannels ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  <span>{showOtherChannels ? "Ocultar outros canais de recebimento" : "+ Adicionar outros recebimentos (iFood, Voucher, Faturado...)"}</span>
                </button>

                {showOtherChannels && (
                  <div className="closing-cards-grid mt-3 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <div className="closing-value-card">
                      <label>iFood Online</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={systemIfoodOnline}
                          onChange={e => setSystemIfoodOnline(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="closing-value-card">
                      <label>iFood Voucher</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={systemIfoodVoucher}
                          onChange={e => setSystemIfoodVoucher(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="closing-value-card">
                      <label>Faturado / A Prazo</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={systemTerm}
                          onChange={e => setSystemTerm(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="closing-value-card">
                      <label>Resgate Clube</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={systemClub}
                          onChange={e => setSystemClub(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="closing-value-card">
                      <label>Acréscimos / Gorjetas</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={systemAccrual}
                          onChange={e => setSystemAccrual(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: DINHEIRO & CAIXA FÍSICO */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div className="closing-section-lead">
                <div>
                  <h3>Contagem do Dinheiro e Gaveta Física</h3>
                  <p>Troco inicial, suprimentos, saídas em espécie e sangria retirada.</p>
                </div>
                <div className={`closing-summary-pill ${cCashDiff === 0 ? "ok" : cCashDiff > 0 ? "warn" : "danger"}`}>
                  Diferença: <b>{cCashDiff === 0 ? "Caixa conferido" : `${cCashDiff > 0 ? "Sobra" : "Falta"} ${brl(Math.abs(cCashDiff))}`}</b>
                </div>
              </div>

              <div className="closing-cards-grid-4">
                <div className="closing-value-card">
                  <label>Troco Inicial (Abertura)</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={openingAmount}
                      onChange={e => setOpeningAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="closing-value-card">
                  <label>Suprimentos (Entradas)</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={cashIn}
                      onChange={e => setCashIn(e.target.value)}
                    />
                  </div>
                </div>

                <div className="closing-value-card">
                  <label>Sangria (Retirada)</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={sangriaAmount}
                      onChange={e => setSangriaAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="closing-value-card">
                  <label>Troco Final na Gaveta</label>
                  <div className="closing-input-wrapper">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={closingFloat}
                      onChange={e => setClosingFloat(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Sangria Destination if sangria > 0 */}
              {cSangria > 0 && (
                <div className="p-3.5 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800 flex flex-wrap items-center gap-3 text-xs">
                  <strong className="text-purple-900 dark:text-purple-300">Destino da sangria ({brl(cSangria)}):</strong>
                  <select
                    value={sangriaStatus}
                    onChange={e => setSangriaStatus(e.target.value)}
                    className="p-1.5 rounded-lg border border-purple-300 bg-white dark:bg-zinc-900 font-semibold"
                  >
                    <option value="Na loja">Está guardado na loja (Cofre)</option>
                    <option value="Entregue a responsável">Entregue a responsável</option>
                  </select>
                  <input
                    type="text"
                    value={sangriaRecipient}
                    onChange={e => setSangriaRecipient(e.target.value)}
                    placeholder="Para quem foi entregue ou onde está guardado (obrigatório)"
                    className="flex-1 min-w-[220px] p-1.5 rounded-lg border border-purple-300 bg-white dark:bg-zinc-900 font-semibold text-xs"
                    required
                  />
                </div>
              )}

              {/* Outflows (Saídas em dinheiro) */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-xs text-zinc-700 dark:text-zinc-200 font-bold">Saídas em Dinheiro (Despesas pagas da gaveta)</strong>
                    <p className="text-[11px] text-zinc-400">Registre pagamentos de motoboy avulso, compras rápidas ou fornecedores pagos em espécie.</p>
                  </div>
                  <button
                    type="button"
                    className="cash-add text-xs py-1 px-2.5"
                    onClick={() => setOutflows(rows => [...rows, { id: safeUUID(), name: "", amount: "" }])}
                  >
                    + Adicionar saída
                  </button>
                </div>

                {outflows.map((row, idx) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Descrição (ex.: Compra emergencial, motoboy)"
                      value={row.name}
                      onChange={e => setOutflows(rows => rows.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                      className="flex-1 p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                    />
                    <div className="w-36 relative">
                      <span className="absolute left-2.5 top-2 text-xs text-zinc-400">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={row.amount}
                        onChange={e => setOutflows(rows => rows.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                        className="w-full pl-8 pr-2 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold"
                      />
                    </div>
                    <button
                      type="button"
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                      onClick={() => setOutflows(rows => rows.filter(r => r.id !== row.id))}
                      aria-label={`Remover saída ${idx + 1}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}

                <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-200 dark:border-zinc-800 font-semibold">
                  <span>Total de saídas registradas:</span>
                  <b className="text-zinc-900 dark:text-zinc-100">{brl(cOutflows)}</b>
                </div>
              </div>

              {/* Real-time cash feedback card */}
              <div className={`closing-feedback-card ${cCashDiff === 0 ? "ok" : "diff"}`}>
                <div className="space-y-1">
                  <div>Esperado: <b>{brl(cCashExpected)}</b> <small className="text-[11px] opacity-75">(Troco inicial + Dinheiro PDV + Suprimentos − Saídas)</small></div>
                  <div>Contado: <b>{brl(cCashFound)}</b> <small className="text-[11px] opacity-75">(Sangria {brl(cSangria)} + Troco Gaveta {brl(cClosingFloat)})</small></div>
                </div>
                <Difference value={cCashDiff} />
              </div>
            </div>
          )}

          {/* STEP 3: MAQUININHAS & BANCOS */}
          {activeStep === 3 && (
            <div className="space-y-4">
              <div className="closing-section-lead">
                <div>
                  <h3>Conferência de Maquininhas de Cartão & Bancos</h3>
                  <p>Marque as máquinas utilizadas e digite o fechamento / comprovante de cada uma.</p>
                </div>
                <div className="closing-summary-pill neutral">
                  Total Maquininhas: <b>{brl(cCreditFound + cDebitFound + cPixFound)}</b>
                </div>
              </div>

              {/* Side-by-side comparison with step 1 PDV */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-zinc-500 font-semibold block">Crédito</span>
                    <small className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {brl(cCreditFound)} <span className="font-normal text-zinc-400">/ PDV {brl(cSysCredit)}</span>
                    </small>
                  </div>
                  <Difference value={cCreditDiff} />
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-zinc-500 font-semibold block">Débito</span>
                    <small className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {brl(cDebitFound)} <span className="font-normal text-zinc-400">/ PDV {brl(cSysDebit)}</span>
                    </small>
                  </div>
                  <Difference value={cDebitDiff} />
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-zinc-500 font-semibold block">PIX</span>
                    <small className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {brl(cPixFound)} <span className="font-normal text-zinc-400">/ PDV {brl(cSysPix)}</span>
                    </small>
                  </div>
                  <Difference value={cPixDiff} />
                </div>
              </div>

              {/* Bank Machines List */}
              {banks.length ? (
                <div className="space-y-3">
                  {banks.map(bank => {
                    const m = machines[bank.id] || { used: false, credit: "", debit: "", pix: "" };
                    const machineTotal = c(m.credit) + c(m.debit) + c(m.pix);
                    return (
                      <div key={bank.id} className={`closing-machine-card ${m.used ? "active" : ""}`}>
                        <div className="closing-machine-header">
                          <label className="flex items-center gap-2.5 cursor-pointer font-bold text-sm text-zinc-800 dark:text-zinc-100">
                            <input
                              type="checkbox"
                              checked={m.used}
                              onChange={e => setMachines(prev => ({
                                ...prev,
                                [bank.id]: { ...m, used: e.target.checked }
                              }))}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <Landmark size={17} className="text-indigo-600" />
                            <span>{str(bank, "name")}</span>
                            <small className="text-xs font-normal text-zinc-400">({str(bank, "bank") || "Conta"})</small>
                          </label>

                          {m.used && (
                            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                              Subtotal: {brl(machineTotal)}
                            </span>
                          )}
                        </div>

                        {m.used ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div className="closing-value-card">
                              <label>Crédito nesta máquina</label>
                              <div className="closing-input-wrapper">
                                <span className="prefix">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0,00"
                                  value={m.credit}
                                  onChange={e => setMachines(prev => ({
                                    ...prev,
                                    [bank.id]: { ...m, credit: e.target.value }
                                  }))}
                                />
                              </div>
                            </div>

                            <div className="closing-value-card">
                              <label>Débito nesta máquina</label>
                              <div className="closing-input-wrapper">
                                <span className="prefix">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0,00"
                                  value={m.debit}
                                  onChange={e => setMachines(prev => ({
                                    ...prev,
                                    [bank.id]: { ...m, debit: e.target.value }
                                  }))}
                                />
                              </div>
                            </div>

                            <div className="closing-value-card">
                              <label>PIX nesta máquina</label>
                              <div className="closing-input-wrapper">
                                <span className="prefix">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder="0,00"
                                  value={m.pix}
                                  onChange={e => setMachines(prev => ({
                                    ...prev,
                                    [bank.id]: { ...m, pix: e.target.value }
                                  }))}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 pl-6">Máquina não utilizada neste turno. Marque para informar comprovantes.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="people-empty py-6">
                  <Landmark size={24} />
                  <strong>Nenhuma máquina cadastrada para esta unidade.</strong>
                  <span>Selecione a loja correspondente na barra superior.</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: AUDITORIA, EXTRAS & ENVIO */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="closing-section-lead">
                <div>
                  <h3>Auditoria, Comprovantes & Resumo do Fechamento</h3>
                  <p>Confirme os valores apurados e envie para a conferência financeira.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {cSysServiceFee > 0 && (
                    <div className="closing-summary-pill ok">
                      Taxa de Serviço: <b>{brl(cSysServiceFee)}</b>
                    </div>
                  )}
                  <div className={`closing-summary-pill ${cTotalDiff === 0 ? "ok" : "danger"}`}>
                    Divergência Geral: <b>{cTotalDiff === 0 ? "Caixa Quadrado" : brl(cTotalDiff)}</b>
                  </div>
                </div>
              </div>

              {/* 4 Pillars Summary Cards */}
              <div className="closing-cards-grid-4">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-500 font-semibold block">Dinheiro Físico</span>
                  <div className="text-xs">Esp.: <b>{brl(cCashExpected)}</b></div>
                  <div className="text-xs">Cont.: <b>{brl(cCashFound)}</b></div>
                  <Difference value={cCashDiff} />
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-500 font-semibold block">Cartão Crédito</span>
                  <div className="text-xs">PDV: <b>{brl(cSysCredit)}</b></div>
                  <div className="text-xs">Máq.: <b>{brl(cCreditFound)}</b></div>
                  <Difference value={cCreditDiff} />
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-500 font-semibold block">Cartão Débito</span>
                  <div className="text-xs">PDV: <b>{brl(cSysDebit)}</b></div>
                  <div className="text-xs">Máq.: <b>{brl(cDebitFound)}</b></div>
                  <Difference value={cDebitDiff} />
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <span className="text-[11px] text-zinc-500 font-semibold block">PIX no Turno</span>
                  <div className="text-xs">PDV: <b>{brl(cSysPix)}</b></div>
                  <div className="text-xs">Máq.: <b>{brl(cPixFound)}</b></div>
                  <Difference value={cPixDiff} />
                </div>
              </div>

              {/* PIX Requests (Emergency payables) */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-xs text-zinc-700 dark:text-zinc-200 font-bold">Solicitações de PIX (Contas a Pagar)</strong>
                    <p className="text-[11px] text-zinc-400">Solicitações de pagamento para aprovação do financeiro.</p>
                  </div>
                  <button
                    type="button"
                    className="cash-add text-xs py-1 px-2.5"
                    onClick={() => setPixRequests(rows => [...rows, { id: safeUUID(), name: "", key: "", description: "", amount: "" }])}
                  >
                    + Adicionar PIX
                  </button>
                </div>

                {pixRequests.map((item, idx) => {
                  const keyValid = !item.key.trim() || isValidPixKey(item.key);
                  return (
                    <div key={item.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center p-2.5 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                      <input
                        type="text"
                        placeholder="Favorecido (nome)"
                        value={item.name}
                        onChange={e => setPixRequests(rows => rows.map(r => r.id === item.id ? { ...r, name: e.target.value } : r))}
                        className="p-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs"
                      />
                      <div>
                        <input
                          type="text"
                          placeholder="Chave PIX"
                          value={item.key}
                          onChange={e => setPixRequests(rows => rows.map(r => r.id === item.id ? { ...r, key: e.target.value } : r))}
                          className={`w-full p-1.5 rounded border text-xs ${!keyValid ? "border-rose-500 bg-rose-50" : "border-zinc-300 dark:border-zinc-700"}`}
                        />
                        {!keyValid && <span className="text-[10px] text-rose-500 block">Formato inválido</span>}
                      </div>
                      <input
                        type="text"
                        placeholder="Motivo / Descrição"
                        value={item.description}
                        onChange={e => setPixRequests(rows => rows.map(r => r.id === item.id ? { ...r, description: e.target.value } : r))}
                        className="p-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs"
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="R$ 0,00"
                          value={item.amount}
                          onChange={e => setPixRequests(rows => rows.map(r => r.id === item.id ? { ...r, amount: e.target.value } : r))}
                          className="flex-1 p-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                        />
                        <button
                          type="button"
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                          onClick={() => setPixRequests(rows => rows.filter(r => r.id !== item.id))}
                          aria-label={`Remover solicitação PIX ${idx + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Optional Audits (Motoboy & Fiscal) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <strong className="text-xs text-zinc-700 dark:text-zinc-300">Auditoria de Motoboys</strong>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] text-zinc-500">
                      Sistema
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={motoboySystem}
                        onChange={e => setMotoboySystem(e.target.value)}
                        className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-500">
                      Pago
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={motoboyPaid}
                        onChange={e => setMotoboyPaid(e.target.value)}
                        className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                      />
                    </label>
                  </div>
                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Diferença Motoboy: <b>{brl(cMotoboyDiff)}</b>
                  </div>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <strong className="text-xs text-zinc-700 dark:text-zinc-300">Auditoria Fiscal (Notas)</strong>
                  <div className="grid grid-cols-3 gap-1.5">
                    <label className="text-[11px] text-zinc-500">
                      iFood
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={ifoodAudit}
                        onChange={e => setIfoodAudit(e.target.value)}
                        className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-500">
                      Máquinas
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={fiscalMachines}
                        onChange={e => setFiscalMachines(e.target.value)}
                        className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-500">
                      Emitidas
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={invoiceIssued}
                        onChange={e => setInvoiceIssued(e.target.value)}
                        className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                      />
                    </label>
                  </div>
                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Diferença Fiscal: <b>{brl(cInvoiceDiff)}</b>
                  </div>
                </div>
              </div>

              {/* Attachments & Observations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                      Comprovantes / Fotos ({existingAttachments.length + newFiles.length}/5)
                    </label>
                    {compressingFiles && (
                      <span className="text-[11px] text-purple-600 flex items-center gap-1 font-semibold">
                        <Loader2 size={12} className="animate-spin" /> Otimizando...
                      </span>
                    )}
                  </div>

                  {(existingAttachments.length > 0 || newFiles.length > 0) && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {existingAttachments.map(att => (
                        <div key={att.fileId} className="flex items-center justify-between gap-2 p-1.5 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs">
                          <div className="flex items-center gap-2 truncate min-w-0">
                            {att.dataUrl ? (
                              <img src={att.dataUrl} alt="" className="w-7 h-7 object-cover rounded shrink-0 border border-zinc-200" />
                            ) : (
                              <FileText size={15} className="text-purple-600 shrink-0" />
                            )}
                            <span className="truncate font-medium">{att.fileName}</span>
                            <span className="text-[10px] text-zinc-400 shrink-0">({formatFileSize(att.size)})</span>
                          </div>
                          <button
                            type="button"
                            className="text-zinc-400 hover:text-red-500 p-1 shrink-0 transition"
                            title="Remover anexo"
                            onClick={() => setExistingAttachments(prev => prev.filter(a => a.fileId !== att.fileId))}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      {newFiles.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 p-1.5 bg-purple-50/70 dark:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-800 text-xs">
                          <div className="flex items-center gap-2 truncate min-w-0">
                            {item.previewUrl ? (
                              <img src={item.previewUrl} alt="" className="w-7 h-7 object-cover rounded shrink-0 border border-purple-200" />
                            ) : (
                              <FileText size={15} className="text-purple-600 shrink-0" />
                            )}
                            <span className="truncate font-medium">{item.file.name}</span>
                            <span className="text-[10px] text-zinc-400 shrink-0">({formatFileSize(item.size)})</span>
                          </div>
                          <button
                            type="button"
                            className="text-zinc-400 hover:text-red-500 p-1 shrink-0 transition"
                            title="Remover anexo"
                            onClick={() => setNewFiles(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {existingAttachments.length + newFiles.length < 5 && (
                    <div className="flex items-center gap-2 pt-1">
                      <label className="flex-1 employee-file-upload cursor-pointer justify-center text-xs py-2">
                        <Camera size={14} />
                        <span>Tirar Foto</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          disabled={compressingFiles}
                          onChange={e => e.target.files && handleAddFiles(e.target.files)}
                        />
                      </label>
                      <label className="flex-1 employee-file-upload cursor-pointer justify-center text-xs py-2">
                        <Upload size={14} />
                        <span>Escolher Arquivo</span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,image/*"
                          className="sr-only"
                          disabled={compressingFiles}
                          onChange={e => e.target.files && handleAddFiles(e.target.files)}
                        />
                      </label>
                    </div>
                  )}
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">
                    Fotos são comprimidas para envio rápido e sem erro para o financeiro.
                  </span>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                    Observações do Turno
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Explique eventuais sobras, faltas ou ocorrências..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {error && <p className="mg-error">{error}</p>}
        </div>

        {/* Persistent Sticky Footer */}
        <footer className="closing-footer-sticky">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-zinc-500">
              Passo {activeStep} de 4
            </span>
            {activeStep === 2 && (
              <span className={`closing-summary-pill ${cCashDiff === 0 ? "ok" : cCashDiff > 0 ? "warn" : "danger"}`}>
                Gaveta: {cCashDiff === 0 ? "Confere" : `${cCashDiff > 0 ? "Sobra" : "Falta"} ${brl(Math.abs(cCashDiff))}`}
              </span>
            )}
            {activeStep === 3 && (
              <span className={`closing-summary-pill ${cCreditDiff === 0 && cDebitDiff === 0 && cPixDiff === 0 ? "ok" : "warn"}`}>
                {cCreditDiff === 0 && cDebitDiff === 0 && cPixDiff === 0 ? "Maquininhas conferem" : "Diferença em maquininhas"}
              </span>
            )}
            {activeStep === 4 && (
              <span className={`closing-summary-pill ${cTotalDiff === 0 ? "ok" : "danger"}`}>
                {cTotalDiff === 0 ? "Caixa 100% quadrado" : `Divergência: ${brl(cTotalDiff)}`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!initialClosing && (
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition flex items-center gap-1.5"
                onClick={handleSaveDraft}
                title="Salvar rascunho neste navegador para não perder nenhuma informação"
              >
                <Bookmark size={13} /> {draftSavedMsg || "Salvar Rascunho"}
              </button>
            )}
            <button type="button" className="mg-button secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            {activeStep > 1 && (
              <button type="button" className="mg-button secondary" onClick={() => setActiveStep((activeStep - 1) as any)}>
                <ArrowLeft size={15} /> Voltar
              </button>
            )}
            {activeStep < 4 ? (
              <button type="button" className="mg-button" onClick={() => setActiveStep((activeStep + 1) as any)}>
                Avançar <ArrowRight size={15} />
              </button>
            ) : (
              <button type="button" className="mg-button" disabled={busy || !unit} onClick={handleSubmit}>
                {busy ? "Enviando ao financeiro..." : initialClosing ? "Salvar e Reenviar Fechamento" : "Finalizar e Enviar Fechamento"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function ConferenceModal({ closing, onClose, onSaved }: { closing: RecordData; onClose: () => void; onSaved: () => void }) {
  const { data, tenantId } = useManagement();
  const { user, userProfile } = useAuth();
  const [review, setReview] = useState(false);
  const [showDrawerDetails, setShowDrawerDetails] = useState(false);

  // Editable system sales values
  const [systemCash, setSystemCash] = useState<number>(() => closingValue(closing, "systemCash"));
  const [systemCredit, setSystemCredit] = useState<number>(() => closingValue(closing, "systemCredit"));
  const [systemDebit, setSystemDebit] = useState<number>(() => closingValue(closing, "systemDebit"));
  const [systemPix, setSystemPix] = useState<number>(() => closingValue(closing, "systemPix"));
  const [systemServiceFee, setSystemServiceFee] = useState<number>(() => closingValue(closing, "systemServiceFee"));
  const otherSales = closingValue(closing, "systemIfoodOnline") + closingValue(closing, "systemIfoodVoucher") + closingValue(closing, "systemTerm") + closingValue(closing, "systemClub") + closingValue(closing, "systemAccrual");

  // Editable physical cash drawer values
  const [openingAmount, setOpeningAmount] = useState<number>(() => closingValue(closing, "openingAmount"));
  const [cashIn, setCashIn] = useState<number>(() => closingValue(closing, "cashIn"));
  const [cashOutflows, setCashOutflows] = useState<number>(() => closingValue(closing, "cashOutflows"));
  const [sangriaAmount, setSangriaAmount] = useState<number>(() => closingValue(closing, "sangriaAmount"));
  const [closingFloat, setClosingFloat] = useState<number>(() => closingValue(closing, "closingFloat"));
  const [allowEditSystem, setAllowEditSystem] = useState(false);

  // Bank machine values (editable)
  const initialSaved = useMemo(() => parseBankAmounts(closing), [closing]);
  const allBanks = data.bankAccounts.filter(b => !b.archived && b.unitId === closing.unitId);
  const availableBanks = useMemo(() => {
    if (allBanks.length > 0) return allBanks;
    const anyBanks = data.bankAccounts.filter(b => !b.archived);
    if (anyBanks.length > 0) return anyBanks;
    return [{ id: "machine_default", name: "Máquina Principal", unitId: closing.unitId } as any];
  }, [allBanks, data.bankAccounts, closing.unitId]);

  const [bankVals, setBankVals] = useState<Record<string, { credit: number; debit: number; pix: number }>>(() => {
    const res: Record<string, { credit: number; debit: number; pix: number }> = {};
    availableBanks.forEach(b => {
      res[b.id] = {
        credit: Number(initialSaved[b.id]?.credit || (availableBanks.length === 1 ? closingValue(closing, "creditFound") : 0)),
        debit: Number(initialSaved[b.id]?.debit || (availableBanks.length === 1 ? closingValue(closing, "debitFound") : 0)),
        pix: Number(initialSaved[b.id]?.pix || (availableBanks.length === 1 ? closingValue(closing, "pixFound") : 0)),
      };
    });
    Object.entries(initialSaved).forEach(([bId, vals]) => {
      if (!res[bId]) {
        res[bId] = { credit: Number(vals.credit || 0), debit: Number(vals.debit || 0), pix: Number(vals.pix || 0) };
      }
    });
    return res;
  });

  // Active banks to display (those with values > 0 or in initialSaved, or all)
  const displayBanks = useMemo(() => {
    const list = availableBanks.filter(b => initialSaved[b.id] !== undefined || (bankVals[b.id]?.credit || 0) > 0 || (bankVals[b.id]?.debit || 0) > 0 || (bankVals[b.id]?.pix || 0) > 0 || availableBanks.length <= 3);
    return list.length > 0 ? list : availableBanks;
  }, [availableBanks, initialSaved, bankVals]);

  const [activeBankId, setActiveBankId] = useState<string>(() => {
    const firstSaved = Object.keys(initialSaved)[0];
    if (firstSaved && availableBanks.some(b => b.id === firstSaved)) return firstSaved;
    return availableBanks[0]?.id || "machine_default";
  });

  const updateActiveBank = (type: "credit" | "debit" | "pix", val: number) => {
    const targetId = activeBankId || displayBanks[0]?.id || "machine_default";
    setBankVals(prev => {
      const current = prev[targetId] || { credit: 0, debit: 0, pix: 0 };
      return {
        ...prev,
        [targetId]: { ...current, [type]: val }
      };
    });
  };

  const [checks, setChecks] = useState({ cash: false, credit: false, debit: false, pix: false, serviceFee: false });
  const [notes, setNotes] = useState(() => str(closing, "conferenceNotes") || str(closing, "notes") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  // Recalculations
  const cashExpected = openingAmount + systemCash + cashIn - cashOutflows;
  const cashFound = sangriaAmount + closingFloat;
  const cashDiff = cashExpected < 0
    ? cashFound - Math.abs(cashExpected)
    : cashFound - cashExpected;

  const totalCreditFound = Object.values(bankVals).reduce((s, b) => s + b.credit, 0);
  const totalDebitFound = Object.values(bankVals).reduce((s, b) => s + b.debit, 0);
  const totalPixFound = Object.values(bankVals).reduce((s, b) => s + b.pix, 0);

  const creditDiff = totalCreditFound - systemCredit;
  const debitDiff = totalDebitFound - systemDebit;
  const pixDiff = totalPixFound - systemPix;
  const totalDiff = cashDiff + creditDiff + debitDiff + pixDiff;
  const systemTotal = systemCash + systemCredit + systemDebit + systemPix + systemServiceFee + otherSales;

  // Fee deductions calculation per bank
  const bankCalculations = useMemo(() => {
    return displayBanks.map(bank => {
      const vals = bankVals[bank.id] || { credit: 0, debit: 0, pix: 0 };
      const creditPct = Number(bank.creditFeePct || 0);
      const debitPct = Number(bank.debitFeePct || 0);
      const pixPct = Number(bank.pixFeePct || 0);

      const grossAmount = vals.credit + vals.debit + vals.pix;
      const creditFee = Math.round(vals.credit * (creditPct / 100));
      const debitFee = Math.round(vals.debit * (debitPct / 100));
      const pixFee = Math.round(vals.pix * (pixPct / 100));
      const totalFees = creditFee + debitFee + pixFee;
      const netAmount = grossAmount - totalFees;

      return {
        bank,
        vals,
        creditPct,
        debitPct,
        pixPct,
        grossAmount,
        creditFee,
        debitFee,
        pixFee,
        totalFees,
        netAmount
      };
    });
  }, [displayBanks, bankVals]);

  const allChecked = Object.values(checks).every(Boolean);
  const hasDifference = totalDiff !== 0;

  const [attachmentsList, setAttachmentsList] = useState<CashAttachment[]>(() => parseAttachments(closing));
  const [previewAttachment, setPreviewAttachment] = useState<CashAttachment | null>(null);
  const [uploadingAtt, setUploadingAtt] = useState(false);

  const handleAddFinanceAttachment = async (fileList: FileList | File[]) => {
    if (!fileList.length) return;
    setUploadingAtt(true);
    setError("");
    try {
      const newList: CashAttachment[] = [...attachmentsList];
      for (const file of Array.from(fileList)) {
        let fileToSend = file;
        let clientDataUrl = "";
        if (file.type && file.type.startsWith("image/")) {
          const comp = await compressImageFile(file, 1600, 0.75);
          fileToSend = comp.file;
          clientDataUrl = comp.dataUrl;
        }
        try {
          const named = nameFileForDrive(fileToSend, `Conferencia ${str(closing, "date")} - ${closing.unitId}`);
          const saved = await uploadFileToDrive(named, "payment_proofs");
          newList.push({
            fileId: saved.fileId,
            fileName: saved.fileName,
            mimeType: saved.mimeType,
            size: saved.size,
            dataUrl: clientDataUrl && clientDataUrl.length < 350000 ? clientDataUrl : undefined,
            uploadedAt: new Date().toISOString()
          });
        } catch {
          newList.push({
            fileId: `local-${Date.now()}-${file.name}`,
            fileName: file.name,
            mimeType: file.type || "image/jpeg",
            size: file.size,
            dataUrl: clientDataUrl || undefined,
            uploadedAt: new Date().toISOString()
          });
        }
      }
      setAttachmentsList(newList);
      const updatedClosing: RecordData = {
        ...closing,
        attachmentsJson: JSON.stringify(newList),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid || ""
      };
      await commitRecords([updatedClosing], data, updatedClosing);
    } catch (err) {
      setError("Falha ao salvar comprovante.");
    } finally {
      setUploadingAtt(false);
    }
  };

  const handleDeleteAttachment = async (fileId: string) => {
    if (!confirm("Deseja remover este comprovante do fechamento?")) return;
    const updated = attachmentsList.filter(a => a.fileId !== fileId);
    setAttachmentsList(updated);
    try {
      const updatedClosing: RecordData = {
        ...closing,
        attachmentsJson: JSON.stringify(updated),
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid || ""
      };
      await commitRecords([updatedClosing], data, updatedClosing);
    } catch {
      alert("Erro ao remover comprovante.");
    }
  };

  const downloadAttachment = async (att: CashAttachment) => {
    try {
      setDownloading(att.fileId);
      if (att.dataUrl) {
        const link = document.createElement("a");
        link.href = att.dataUrl;
        link.download = att.fileName || "comprovante.jpg";
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      if (att.fileId && !att.fileId.startsWith("local-")) {
        await downloadFileFromDrive(att.fileId, att.fileName);
      } else {
        alert("Comprovante sem arquivo disponível para download.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao baixar arquivo do Drive.");
    } finally {
      setDownloading(null);
    }
  };

  const save = async () => {
    if (!user) return;
    if (!allChecked) { setError("Confirme as quatro conciliações antes de concluir."); return; }
    if (hasDifference && !notes.trim()) { setError("Explique a divergência antes de aprovar."); return; }
    setBusy(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const before = Object.fromEntries(displayBanks.map(b => [b.id, typeof b.balance === "number" ? b.balance : null]));
      const afterNetValues = Object.fromEntries(bankCalculations.map(c => [c.bank.id, c.netAmount]));

      let previousNetAmounts: Record<string, number> = {};
      try {
        previousNetAmounts = JSON.parse(str(closing, "netBankAmountsJson") || "{}");
      } catch {}
      const isAlreadyConferred = isClosingConferred(closing, data.cashConferences);

      // Update bank account balances with NET amounts (or delta if already conferred)
      const updates = bankCalculations.map(calcItem => {
        const prevBal = typeof calcItem.bank.balance === "number" ? Number(calcItem.bank.balance) : 0;
        const previousNet = isAlreadyConferred ? Number(previousNetAmounts[calcItem.bank.id] || 0) : 0;
        const deltaNet = calcItem.netAmount - previousNet;
        const newBalance = prevBal + deltaNet;
        const closingDate = str(closing, "date");
        const bankBalDate = str(calcItem.bank, "balanceDate");
        const nextBalanceDate = bankBalDate && bankBalDate > closingDate ? bankBalDate : closingDate;

        return {
          ...calcItem.bank,
          balance: Math.round(newBalance),
          balanceDate: nextBalanceDate,
          balanceUpdatedAt: now,
          reconciled: true,
          updatedAt: now,
          updatedBy: user.uid
        };
      });

      // Dedicated Sangria Account handling (idempotent via delta)
      const previousConferredSangria = isAlreadyConferred ? Number(closing.conferredSangriaAmount ?? closing.sangriaAmount ?? 0) : 0;
      const deltaSangria = sangriaAmount - previousConferredSangria;
      let sangriaAccountUpdate: RecordData | null = null;
      if (sangriaAmount > 0 || deltaSangria !== 0) {
        const unitObj = data.units.find(u => u.id === closing.unitId);
        const sangriaAccountName = `Caixa Sangria - ${unitObj?.name || "Unidade"}`;
        const existingSangriaAccount = data.bankAccounts.find(
          b => !b.archived && b.unitId === closing.unitId && (b.isSangriaAccount || b.name === sangriaAccountName)
        );

        if (existingSangriaAccount) {
          const prevSangriaBal = typeof existingSangriaAccount.balance === "number" ? Number(existingSangriaAccount.balance) : 0;
          const closingDate = str(closing, "date");
          const sangriaBalDate = str(existingSangriaAccount, "balanceDate");
          const nextSangriaDate = sangriaBalDate && sangriaBalDate > closingDate ? sangriaBalDate : closingDate;
          sangriaAccountUpdate = {
            ...existingSangriaAccount,
            balance: Math.round(prevSangriaBal + deltaSangria),
            balanceDate: nextSangriaDate,
            balanceUpdatedAt: now,
            reconciled: true,
            updatedAt: now,
            updatedBy: user.uid
          };
        } else if (sangriaAmount > 0) {
          sangriaAccountUpdate = {
            id: `bank-sangria-${closing.unitId}`,
            kind: "bankAccounts",
            tenantId,
            unitId: closing.unitId,
            version: 0,
            createdAt: now,
            updatedAt: now,
            createdBy: user.uid,
            updatedBy: user.uid,
            name: sangriaAccountName,
            bank: "Caixa físico de Sangria",
            balance: sangriaAmount,
            balanceDate: str(closing, "date"),
            balanceUpdatedAt: now,
            isSangriaAccount: true,
            reconciled: true,
            notes: `Conta criada automaticamente para controle das sangrias da loja ${unitObj?.name || ""}.`
          };
        }
      }

      const conference: RecordData = {
        id: `conference-${closing.id}`,
        kind: "cashConferences",
        tenantId,
        unitId: closing.unitId,
        version: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: user.uid,
        updatedBy: user.uid,
        date: str(closing, "date"),
        closingId: closing.id,
        operatorName: str(closing, "operatorName"),
        beforeBalancesJson: JSON.stringify(before),
        afterBalancesJson: JSON.stringify(afterNetValues),
        checksJson: JSON.stringify(checks),
        difference: totalDiff,
        status: "Conferido",
        reviewedBy: userProfile?.displayName || user.email || user.uid,
        notes: notes.trim() || "Conferência aprovada com conciliação bancária."
      };

      const updatedClosing: RecordData = {
        ...closing,
        attachmentsJson: JSON.stringify(attachmentsList),
        status: "Conferido",
        conferredAt: now,
        conferredBy: userProfile?.displayName || user.email || user.uid,
        conferenceId: conference.id,
        conferenceNotes: notes.trim(),
        systemCash,
        systemCredit,
        systemDebit,
        systemPix,
        systemServiceFee,
        systemTotal,
        openingAmount,
        cashIn,
        cashOutflows,
        sangriaAmount,
        closingFloat,
        cashExpected,
        cashFound,
        cashDifference: cashDiff,
        creditFound: totalCreditFound,
        creditDifference: creditDiff,
        debitFound: totalDebitFound,
        debitDifference: debitDiff,
        pixFound: totalPixFound,
        pixDifference: pixDiff,
        difference: totalDiff,
        reviewedBankAmountsJson: JSON.stringify(bankVals),
        netBankAmountsJson: JSON.stringify(afterNetValues),
        conferredSangriaAmount: sangriaAmount,
        updatedAt: now,
        updatedBy: user.uid
      };

      const recordsToCommit: RecordData[] = [...updates, conference, updatedClosing];
      if (sangriaAccountUpdate) {
        recordsToCommit.push(sangriaAccountUpdate);
      }
      // Retry up to 3 times for transient Firebase errors (quota, network)
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await commitRecords(recordsToCommit, data, conference);
          onSaved();
          return;
        } catch (retryErr) {
          lastErr = retryErr;
          const msg = retryErr instanceof Error ? retryErr.message : "";
          const isTransient = /quota exceeded|resource exhausted|unavailable|deadline exceeded/i.test(msg);
          if (!isTransient || attempt === 2) break;
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        }
      }
      throw lastErr;
    } catch (e) {
      console.error("[Conferência] Erro ao salvar:", e);
      const message = e instanceof Error ? e.message : "Não foi possível concluir a conferência.";
      setError(/quota exceeded|resource exhausted/i.test(message) ? "O Firebase atingiu o limite temporário de uso. Aguarde 1 minuto e tente novamente." : message);
    } finally {
      setBusy(false);
    }
  };

  const activeBank = availableBanks.find(b => b.id === activeBankId) || availableBanks[0] || { id: "machine_default", name: "Máquina Principal" };
  const activeCredit = bankVals[activeBank.id]?.credit || 0;
  const activeDebit = bankVals[activeBank.id]?.debit || 0;
  const activePix = bankVals[activeBank.id]?.pix || 0;
  const isAlreadyConferred = isClosingConferred(closing, data.cashConferences);

  return (
    <Modal title="Conferência Financeira do Caixa" onClose={onClose} wide>
      <div className="conference-flow space-y-4">
        {/* Summary Info */}
        <div className="conference-summary">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span>FECHAMENTO DE CAIXA</span>
              {isAlreadyConferred && (
                <span className="conf-conferred-badge">
                  <CheckCircle2 size={12} /> Conferência Concluída
                </span>
              )}
            </div>
            <strong>{str(closing, "date").split("-").reverse().join("/")} · {str(closing, "shift")}</strong>
            <small>Operador: {str(closing, "operatorName")} · Total Vendas Sistema: {currency(systemTotal)}</small>
          </div>
          {sangriaAmount > 0 && (
            <div className="conference-sangria-info">
              <span>SANGRIA REGISTRADA</span>
              <strong>{brl(sangriaAmount)}</strong>
              <small>Status: {str(closing, "sangriaStatus") || "Na loja"}{str(closing, "sangriaRecipient") ? ` · ${str(closing, "sangriaRecipient")}` : ""}</small>
            </div>
          )}
        </div>

        {/* Financial Edit Mode Banner */}
        <div className="conf-edit-banner">
          <div className="flex items-center gap-2">
            <Edit3 size={18} className="text-blue-600 shrink-0" />
            <div>
              <strong className="block text-blue-900">Modo de Edição Financeira Ativo</strong>
              <span className="text-blue-700 text-xs">Você pode corrigir qualquer valor digitado pelo operador (vendas do sistema, gaveta ou máquinas). O sistema recalcula tudo em tempo real.</span>
            </div>
          </div>
        </div>

        {/* Prominent Attachments Section for Finance */}
        <div className="conf-attachments-card">
          <div className="conf-attachments-head">
            <div className="flex items-center gap-2">
              <Paperclip size={16} className="text-purple-600 shrink-0" />
              <strong className="text-sm">Comprovantes do Turno ({attachmentsList.length})</strong>
              {attachmentsList.length > 0 && (
                <span className="conf-att-pill">{attachmentsList.length} anexo(s) disponível(is)</span>
              )}
            </div>
            <label className="conf-add-att-btn">
              {uploadingAtt ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              <span>{uploadingAtt ? "Enviando..." : "+ Anexar Comprovante"}</span>
              <input
                type="file"
                multiple
                accept=".pdf,image/*"
                className="sr-only"
                disabled={uploadingAtt}
                onChange={e => e.target.files && handleAddFinanceAttachment(e.target.files)}
              />
            </label>
          </div>

          {attachmentsList.length === 0 ? (
            <div className="conf-no-att">
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">Nenhum comprovante anexado pelo operador no momento do fechamento.</span>
              <small>Se você recebeu o comprovante via WhatsApp ou foto física, pode clicar em &ldquo;+ Anexar Comprovante&rdquo; acima para registrar na conferência.</small>
            </div>
          ) : (
            <div className="conf-att-grid">
              {attachmentsList.map(att => {
                const isPdf = att.mimeType === "application/pdf" || att.fileName.toLowerCase().endsWith(".pdf");
                return (
                  <div key={att.fileId} className="conf-att-item">
                    <div className="conf-att-preview" onClick={() => setPreviewAttachment(att)} title="Clique para visualizar em tela cheia">
                      {att.dataUrl ? (
                        <img src={att.dataUrl} alt={att.fileName} className="conf-att-thumb" />
                      ) : isPdf ? (
                        <div className="conf-att-icon-box pdf"><FileText size={26} /><span>PDF</span></div>
                      ) : (
                        <div className="conf-att-icon-box img"><ImageIcon size={26} /><span>FOTO</span></div>
                      )}
                      <div className="conf-att-overlay">
                        <Eye size={16} /> <span>Visualizar</span>
                      </div>
                    </div>
                    <div className="conf-att-meta">
                      <span className="conf-att-name" title={att.fileName}>{att.fileName}</span>
                      <small className="conf-att-size">{formatFileSize(att.size)}</small>
                    </div>
                    <div className="conf-att-actions">
                      <button
                        type="button"
                        className="conf-att-action-btn view"
                        onClick={() => setPreviewAttachment(att)}
                        title="Visualizar no navegador"
                      >
                        <Eye size={12} /> Visualizar
                      </button>
                      <button
                        type="button"
                        className="conf-att-action-btn download"
                        disabled={downloading === att.fileId}
                        onClick={() => downloadAttachment(att)}
                        title="Baixar arquivo"
                      >
                        <Download size={12} />
                      </button>
                      <button
                        type="button"
                        className="conf-att-action-btn delete"
                        onClick={() => handleDeleteAttachment(att.fileId)}
                        title="Remover comprovante"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4 Pillars Reconciliation Table with inline editable inputs */}
        <section className="conference-reconciliation">
          <header className="conference-header-flex">
            <div>
              <h3>Conciliação dos Valores Principais</h3>
              <p>Valores de Sistema (PDV) e Contados (Físico / Máquinas) conferidos em tempo real.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`conf-pdv-toggle ${allowEditSystem ? "active" : ""}`}
                onClick={() => setAllowEditSystem(!allowEditSystem)}
                title="Habilita edição dos valores registrados pelo PDV caso o operador tenha digitado errado"
              >
                <Edit3 size={12} />
                <span>{allowEditSystem ? "Bloquear PDV" : "Ajustar PDV"}</span>
              </button>
              <button
                type="button"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                onClick={() => setShowDrawerDetails(!showDrawerDetails)}
              >
                {showDrawerDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>{showDrawerDetails ? "Ocultar gaveta" : "Detalhes gaveta"}</span>
              </button>
            </div>
          </header>

          {/* Drawer Details Editable Panel */}
          {showDrawerDetails && (
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-3 text-xs">
              <label>
                <span className="text-zinc-500 font-semibold block">Troco Inicial</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={openingAmount / 100}
                  disabled={review}
                  onChange={e => setOpeningAmount(Math.round(Number(e.target.value) * 100))}
                  className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 font-semibold"
                />
              </label>

              <label>
                <span className="text-zinc-500 font-semibold block">Dinheiro PDV</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={systemCash / 100}
                  disabled={review}
                  onChange={e => setSystemCash(Math.round(Number(e.target.value) * 100))}
                  className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 font-semibold"
                />
              </label>

              <label>
                <span className="text-zinc-500 font-semibold block">Suprimentos</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashIn / 100}
                  disabled={review}
                  onChange={e => setCashIn(Math.round(Number(e.target.value) * 100))}
                  className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 font-semibold"
                />
              </label>

              <label>
                <span className="text-zinc-500 font-semibold block">Saídas Gaveta</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashOutflows / 100}
                  disabled={review}
                  onChange={e => setCashOutflows(Math.round(Number(e.target.value) * 100))}
                  className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 font-semibold"
                />
              </label>

              <label>
                <span className="text-zinc-500 font-semibold block">Sangria Retirada</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sangriaAmount / 100}
                  disabled={review}
                  onChange={e => setSangriaAmount(Math.round(Number(e.target.value) * 100))}
                  className="w-full p-1.5 rounded border border-purple-300 dark:border-purple-700 font-semibold text-purple-700"
                />
              </label>

              <label>
                <span className="text-zinc-500 font-semibold block">Troco Final</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={closingFloat / 100}
                  disabled={review}
                  onChange={e => setClosingFloat(Math.round(Number(e.target.value) * 100))}
                  className="w-full p-1.5 rounded border border-zinc-300 dark:border-zinc-700 font-semibold"
                />
              </label>
            </div>
          )}

          {/* Machine Selector if multiple machines */}
          {displayBanks.length > 1 && (
            <div className="conf-machine-selector-bar">
              <div className="conf-machine-tabs">
                <span className="conf-machine-label">Máquina em conferência:</span>
                <div className="conf-machine-pills">
                  {displayBanks.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      className={`conf-machine-pill ${activeBankId === b.id ? "active" : ""}`}
                      onClick={() => setActiveBankId(b.id)}
                    >
                      <Landmark size={13} />
                      <span>{str(b, "name") || "Máquina"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <span className="text-[11px] text-zinc-500 font-medium">Editando valores da máquina selecionada</span>
            </div>
          )}

          <div className="conference-table">
            <div className="head">
              <span>Forma</span>
              <span>Sistema (PDV)</span>
              <span>Encontrado (Físico / Máquinas)</span>
              <span>Diferença</span>
              <span>Conferido</span>
            </div>

            {/* Dinheiro */}
            <div className="line">
              <strong>Dinheiro</strong>
              {allowEditSystem ? (
                <div className="conf-editable-cell">
                  <div className="conf-input-box">
                    <span className="conf-input-prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={systemCash / 100}
                      disabled={review}
                      onChange={e => setSystemCash(Math.round(Number(e.target.value) * 100))}
                      title="Ajustar Dinheiro registrado no PDV"
                    />
                  </div>
                </div>
              ) : (
                <span className="conf-val-static">{brl(cashExpected)}</span>
              )}
              <div className="conf-editable-cell">
                <div className="conf-input-box">
                  <span className="conf-input-prefix">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashFound / 100}
                    disabled={review}
                    onChange={e => {
                      const val = Math.round(Number(e.target.value) * 100);
                      setClosingFloat(val - sangriaAmount);
                    }}
                    title="Dinheiro contado físico (Sangria + Troco Final)"
                  />
                </div>
              </div>
              <Difference value={cashDiff} />
              <label className="conf-check-label">
                <input type="checkbox" checked={checks.cash} disabled={review} onChange={e => setChecks(c => ({ ...c, cash: e.target.checked }))} /> OK
              </label>
            </div>

            {/* Crédito */}
            <div className="line">
              <strong>Crédito</strong>
              {allowEditSystem ? (
                <div className="conf-editable-cell">
                  <div className="conf-input-box">
                    <span className="conf-input-prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={systemCredit / 100}
                      disabled={review}
                      onChange={e => setSystemCredit(Math.round(Number(e.target.value) * 100))}
                      title="Ajustar Crédito registrado no PDV"
                    />
                  </div>
                </div>
              ) : (
                <span className="conf-val-static">{brl(systemCredit)}</span>
              )}
              <div className="conf-editable-cell">
                <div className="conf-input-box">
                  <span className="conf-input-prefix">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={activeCredit / 100}
                    disabled={review}
                    onChange={e => updateActiveBank("credit", Math.round(Number(e.target.value) * 100))}
                    title={`Crédito conferido na máquina (${str(activeBank, "name") || "Máquina"})`}
                  />
                </div>
                {displayBanks.length > 1 && (
                  <span className="conf-sub-total">Total máquinas: {brl(totalCreditFound)}</span>
                )}
              </div>
              <Difference value={creditDiff} />
              <label className="conf-check-label">
                <input type="checkbox" checked={checks.credit} disabled={review} onChange={e => setChecks(c => ({ ...c, credit: e.target.checked }))} /> OK
              </label>
            </div>

            {/* Débito */}
            <div className="line">
              <strong>Débito</strong>
              {allowEditSystem ? (
                <div className="conf-editable-cell">
                  <div className="conf-input-box">
                    <span className="conf-input-prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={systemDebit / 100}
                      disabled={review}
                      onChange={e => setSystemDebit(Math.round(Number(e.target.value) * 100))}
                      title="Ajustar Débito registrado no PDV"
                    />
                  </div>
                </div>
              ) : (
                <span className="conf-val-static">{brl(systemDebit)}</span>
              )}
              <div className="conf-editable-cell">
                <div className="conf-input-box">
                  <span className="conf-input-prefix">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={activeDebit / 100}
                    disabled={review}
                    onChange={e => updateActiveBank("debit", Math.round(Number(e.target.value) * 100))}
                    title={`Débito conferido na máquina (${str(activeBank, "name") || "Máquina"})`}
                  />
                </div>
                {displayBanks.length > 1 && (
                  <span className="conf-sub-total">Total máquinas: {brl(totalDebitFound)}</span>
                )}
              </div>
              <Difference value={debitDiff} />
              <label className="conf-check-label">
                <input type="checkbox" checked={checks.debit} disabled={review} onChange={e => setChecks(c => ({ ...c, debit: e.target.checked }))} /> OK
              </label>
            </div>

            {/* PIX */}
            <div className="line">
              <strong>PIX</strong>
              {allowEditSystem ? (
                <div className="conf-editable-cell">
                  <div className="conf-input-box">
                    <span className="conf-input-prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={systemPix / 100}
                      disabled={review}
                      onChange={e => setSystemPix(Math.round(Number(e.target.value) * 100))}
                      title="Ajustar PIX registrado no PDV"
                    />
                  </div>
                </div>
              ) : (
                <span className="conf-val-static">{brl(systemPix)}</span>
              )}
              <div className="conf-editable-cell">
                <div className="conf-input-box">
                  <span className="conf-input-prefix">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={activePix / 100}
                    disabled={review}
                    onChange={e => updateActiveBank("pix", Math.round(Number(e.target.value) * 100))}
                    title={`PIX conferido na máquina (${str(activeBank, "name") || "Máquina"})`}
                  />
                </div>
                {displayBanks.length > 1 && (
                  <span className="conf-sub-total">Total máquinas: {brl(totalPixFound)}</span>
                )}
              </div>
              <Difference value={pixDiff} />
              <label className="conf-check-label">
                <input type="checkbox" checked={checks.pix} disabled={review} onChange={e => setChecks(c => ({ ...c, pix: e.target.checked }))} /> OK
              </label>
            </div>

            {/* Taxa de Serviço */}
            <div className="line">
              <strong>Taxa de Serviço</strong>
              {allowEditSystem ? (
                <div className="conf-editable-cell">
                  <div className="conf-input-box">
                    <span className="conf-input-prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={systemServiceFee / 100}
                      disabled={review}
                      onChange={e => setSystemServiceFee(Math.round(Number(e.target.value) * 100))}
                      title="Ajustar Taxa de Serviço registrada no PDV"
                    />
                  </div>
                </div>
              ) : (
                <span className="conf-val-static">{brl(systemServiceFee)}</span>
              )}
              <div className="conf-editable-cell">
                <span className="conf-val-static">{brl(systemServiceFee)}</span>
              </div>
              <Difference value={0} />
              <label className="conf-check-label">
                <input type="checkbox" checked={checks.serviceFee} disabled={review} onChange={e => setChecks(c => ({ ...c, serviceFee: e.target.checked }))} /> OK
              </label>
            </div>
          </div>

          <div className={`total-divergence ${totalDiff === 0 ? "ok" : "bad"}`}>
            <span>DIVERGÊNCIA TOTAL RECALCULADA</span>
            <strong>{currency(totalDiff)}</strong>
            <small>{totalDiff === 0 ? "Sem divergência" : totalDiff > 0 ? "Sobra encontrada" : "Falta encontrada"}</small>
          </div>

          {hasDifference && (
            <label className="conference-notes">
              Parecer obrigatório da divergência
              <textarea
                rows={2}
                value={notes}
                disabled={review}
                onChange={e => setNotes(e.target.value)}
                placeholder="Explique detalhadamente a causa da divergência ou se foi erro operacional."
              />
            </label>
          )}
        </section>

        {/* Machines / Banks Section */}
        <section className="conference-machines-section">
          <h3>Detalhamento por Máquina / Banco e Desconto de Taxas</h3>
          <p className="cash-hint-left">Ajuste os valores por máquina se o comprovante físico diferir do digitado. As taxas configuradas são deduzidas automaticamente do saldo a creditar.</p>

          <div className="conference-bank-cards">
            {bankCalculations.map(c => (
              <article key={c.bank.id} className="conf-machine-card">
                <header className="conf-machine-head">
                  <strong><Landmark size={15} /> {str(c.bank, "name")}</strong>
                  <span>Saldo atual: {typeof c.bank.balance === "number" ? currency(Number(c.bank.balance)) : "R$ 0,00"}</span>
                </header>

                <div className="conf-machine-inputs">
                  <label>
                    <span>Crédito (Taxa: {c.creditPct}%)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={review}
                      value={c.vals.credit / 100}
                      onChange={e => {
                        const val = Math.round(Number(e.target.value) * 100);
                        setBankVals(b => {
                          const prev = b[c.bank.id] || { credit: 0, debit: 0, pix: 0 };
                          return { ...b, [c.bank.id]: { ...prev, credit: val } };
                        });
                      }}
                    />
                    {c.creditFee > 0 && <small className="fee-cut">- {brl(c.creditFee)} taxa</small>}
                  </label>

                  <label>
                    <span>Débito (Taxa: {c.debitPct}%)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={review}
                      value={c.vals.debit / 100}
                      onChange={e => {
                        const val = Math.round(Number(e.target.value) * 100);
                        setBankVals(b => {
                          const prev = b[c.bank.id] || { credit: 0, debit: 0, pix: 0 };
                          return { ...b, [c.bank.id]: { ...prev, debit: val } };
                        });
                      }}
                    />
                    {c.debitFee > 0 && <small className="fee-cut">- {brl(c.debitFee)} taxa</small>}
                  </label>

                  <label>
                    <span>PIX (Taxa: {c.pixPct}%)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={review}
                      value={c.vals.pix / 100}
                      onChange={e => {
                        const val = Math.round(Number(e.target.value) * 100);
                        setBankVals(b => {
                          const prev = b[c.bank.id] || { credit: 0, debit: 0, pix: 0 };
                          return { ...b, [c.bank.id]: { ...prev, pix: val } };
                        });
                      }}
                    />
                    {c.pixFee > 0 && <small className="fee-cut">- {brl(c.pixFee)} taxa</small>}
                  </label>
                </div>

                <footer className="conf-machine-foot">
                  <div>
                    <small>Bruto: <b>{brl(c.grossAmount)}</b></small>
                    {c.totalFees > 0 && <small className="fee-total">Taxas: -{brl(c.totalFees)}</small>}
                  </div>
                  <div className="conf-net-highlight">
                    <span>Líquido a creditar:</span>
                    <strong>{brl(c.netAmount)}</strong>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        </section>

        {/* Attachments Section if any */}
        {review && (
          <div className="confirmation-box">
            <CheckCircle2 size={22} />
            <div>
              <strong>Confirme a aprovação e a liquidação dos saldos</strong>
              <p>Os valores líquidos (com desconto das taxas) serão adicionados às respectivas contas bancárias. {sangriaAmount > 0 && `A sangria de ${brl(sangriaAmount)} será registrada na conta Caixa Sangria da unidade.`}</p>
            </div>
          </div>
        )}

        {error && <p className="mg-error">{error}</p>}

        <footer>
          <button type="button" className="mg-button secondary" onClick={review ? () => setReview(false) : onClose}>
            {review ? "Voltar e ajustar" : "Cancelar"}
          </button>
          <button
            type="button"
            className="mg-button"
            disabled={busy || !displayBanks.length}
            onClick={review ? save : () => {
              if (!allChecked) { setError("Confirme Dinheiro, Crédito, Débito e PIX marcando as caixas OK."); return; }
              if (hasDifference && !notes.trim()) { setError("Explique a divergência antes de continuar."); return; }
              setError("");
              setReview(true);
            }}
          >
            {busy ? "Atualizando bancos…" : review ? (isAlreadyConferred ? "Atualizar e salvar conferência" : "Confirmar e atualizar bancos") : (isAlreadyConferred ? "Rever alterações" : "Revisar e aprovar")}
          </button>
        </footer>
      </div>

      {previewAttachment && (
        <AttachmentLightbox
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </Modal>
  );
}

// History tab for motoboy audits and fiscal invoices
function AuditHistoryTab({closings}:{closings:RecordData[]}){
  const {data}=useManagement();
  const [search,setSearch]=useState("");
  const [filterUnit,setFilterUnit]=useState("");
  const [downloading,setDownloading]=useState<string|null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<CashAttachment | null>(null);

  const filtered=closings.filter(c=>{
    if(filterUnit&&c.unitId!==filterUnit)return false;
    if(search){
      const text=`${str(c,"operatorName")} ${str(c,"notes")} ${str(c,"date")}`.toLowerCase();
      if(!text.includes(search.toLowerCase()))return false;
    }
    return true;
  });

  const downloadAttachment=async(fileId:string,fileName:string)=>{
    try{
      setDownloading(fileId);
      await downloadFileFromDrive(fileId,fileName);
    }catch(e){
      alert(e instanceof Error?e.message:"Erro ao baixar arquivo do Drive.");
    }finally{
      setDownloading(null);
    }
  };

  const totalMotoboyPaid = filtered.reduce((s, r) => s + closingValue(r, "motoboyPaid"), 0);
  const totalMotoboyDiff = filtered.reduce((s, r) => s + closingValue(r, "motoboyDifference"), 0);
  const totalInvoiceIssued = filtered.reduce((s, r) => s + closingValue(r, "invoiceIssued"), 0);
  const totalInvoiceDiff = filtered.reduce((s, r) => s + closingValue(r, "invoiceDifference"), 0);

  return (
    <section className="cash-audit-history-section">
      <header className="cash-audit-header">
        <div>
          <h2>Histórico de Conferências de Motoboys & Notas Fiscais</h2>
          <p>Auditorias detalhadas registradas em cada fechamento de caixa por unidade.</p>
        </div>
        <div className="cash-audit-filters">
          <select value={filterUnit} onChange={e=>setFilterUnit(e.target.value)}>
            <option value="">Todas as unidades</option>
            {data.units.filter(u=>!u.archived).map(u=><option key={u.id} value={u.id}>{str(u,"name")}</option>)}
          </select>
          <div className="cash-audit-search">
            <Search size={14}/>
            <input placeholder="Buscar por operador ou data..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>
      </header>

      <div className="cash-audit-kpis">
        <div className="cash-audit-kpi-pill">
          <span>Motoboy Total Pago</span>
          <strong>{brl(totalMotoboyPaid)}</strong>
        </div>
        <div className={`cash-audit-kpi-pill ${totalMotoboyDiff === 0 ? "ok" : "bad"}`}>
          <span>Diferença Motoboys</span>
          <strong>{brl(totalMotoboyDiff)}</strong>
        </div>
        <div className="cash-audit-kpi-pill">
          <span>Notas Emitidas</span>
          <strong>{brl(totalInvoiceIssued)}</strong>
        </div>
        <div className={`cash-audit-kpi-pill ${totalInvoiceDiff === 0 ? "ok" : "bad"}`}>
          <span>Diferença Notas</span>
          <strong>{brl(totalInvoiceDiff)}</strong>
        </div>
      </div>

      <div className="cash-audit-table-wrap">
        <table className="cash-audit-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Unidade / Operador</th>
              <th>Motoboy Sistema</th>
              <th>Motoboy Pago</th>
              <th>Dif. Motoboy</th>
              <th>iFood Vendas</th>
              <th>Máq. Fiscais</th>
              <th>Nota Emitida</th>
              <th>Dif. Notas</th>
              <th>Comprovantes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row=>{
              const unit=data.units.find(u=>u.id===row.unitId);
              const motoboyDiff=closingValue(row,"motoboyDifference");
              const invoiceDiff=closingValue(row,"invoiceDifference");
              const attachments=parseAttachments(row);

              return (
                <tr key={row.id}>
                  <td>
                    <strong>{str(row,"date").split("-").reverse().join("/")}</strong>
                    <small>{str(row,"shift")}</small>
                  </td>
                  <td>
                    <strong>{unit?.name||"Unidade"}</strong>
                    <small>{str(row,"operatorName")}</small>
                  </td>
                  <td>{brl(closingValue(row,"motoboySystem"))}</td>
                  <td>{brl(closingValue(row,"motoboyPaid"))}</td>
                  <td>
                    <Difference value={motoboyDiff}/>
                  </td>
                  <td>{brl(closingValue(row,"ifoodAudit"))}</td>
                  <td>{brl(closingValue(row,"fiscalMachines"))}</td>
                  <td>{brl(closingValue(row,"invoiceIssued"))}</td>
                  <td>
                    <Difference value={invoiceDiff}/>
                  </td>
                  <td>
                    {attachments.length>0?(
                      <div className="audit-attachments-list">
                        {attachments.map(att=>(
                          <button
                            key={att.fileId}
                            type="button"
                            className="audit-att-btn"
                            onClick={()=>setPreviewAttachment(att)}
                            title={`Visualizar ${att.fileName}`}
                          >
                            <Eye size={12}/> {(att.fileName || "Comprovante").slice(0,18)}...
                          </button>
                        ))}
                      </div>
                    ):(
                      <span className="no-attachments">Nenhum</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!filtered.length&&(
              <tr>
                <td colSpan={10} className="empty-table-msg">
                  Nenhum fechamento com auditoria encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {previewAttachment && (
        <AttachmentLightbox
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </section>
  );
}

// Tab to configure fee percentages per bank / card machine
function BankRatesTab(){
  const {data}=useManagement();
  const {user}=useAuth();
  const [unitFilter,setUnitFilter]=useState("");
  const [rates,setRates]=useState<Record<string,{credit:string;debit:string;pix:string}>>(()=>{
    return Object.fromEntries(data.bankAccounts.filter(b=>!b.archived).map(b=>[
      b.id,
      {
        credit:String(b.creditFeePct??0),
        debit:String(b.debitFeePct??0),
        pix:String(b.pixFeePct??0)
      }
    ]));
  });
  const [savingId,setSavingId]=useState<string|null>(null);
  const [successMsg,setSuccessMsg]=useState("");

  const accounts=data.bankAccounts.filter(b=>!b.archived&&(unitFilter===""||b.unitId===unitFilter));

  const saveRatesForBank=async(bank:RecordData)=>{
    if(!user)return;
    setSavingId(bank.id);
    setSuccessMsg("");
    try{
      const current=rates[bank.id]||{credit:"0",debit:"0",pix:"0"};
      const updated:RecordData={
        ...bank,
        creditFeePct:Number(current.credit)||0,
        debitFeePct:Number(current.debit)||0,
        pixFeePct:Number(current.pix)||0,
        updatedAt:new Date().toISOString(),
        updatedBy:user.uid
      };
      await saveManagement(updated,data);
      setSuccessMsg(`Taxas salvas com sucesso para "${str(bank,"name")}"!`);
      setTimeout(()=>setSuccessMsg(""),4000);
    }catch(e){
      alert(e instanceof Error?e.message:"Erro ao salvar taxas do banco.");
    }finally{
      setSavingId(null);
    }
  };

  return (
    <section className="cash-rates-section">
      <header className="cash-rates-header">
        <div>
          <h2>Cadastro de Taxas por Banco / Máquina</h2>
          <p>Defina as alíquotas percentuais de Crédito, Débito e PIX para cada máquina. Ao conferir o caixa, os valores serão deduzidos automaticamente antes de atualizar o saldo do banco.</p>
        </div>
        <select value={unitFilter} onChange={e=>setUnitFilter(e.target.value)}>
          <option value="">Todas as unidades</option>
          {data.units.filter(u=>!u.archived).map(u=><option key={u.id} value={u.id}>{str(u,"name")}</option>)}
        </select>
      </header>

      {successMsg&&<div className="cash-rates-success">{successMsg}</div>}

      <div className="bank-rates-grid">
        {accounts.map(bank=>{
          const unit=data.units.find(u=>u.id===bank.unitId);
          const current=rates[bank.id]||{credit:"0",debit:"0",pix:"0"};
          const isBusy=savingId===bank.id;

          return (
            <article key={bank.id} className="bank-rate-card">
              <header>
                <Landmark size={18}/>
                <div>
                  <strong>{str(bank,"name")}</strong>
                  <small>{unit?.name||"Geral"} · {str(bank,"bank")||"Conta"}</small>
                </div>
              </header>

              <div className="bank-rate-inputs">
                <label>
                  <span>Taxa Crédito (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={current.credit}
                    onChange={e=>setRates(r=>{
                      const prev=r[bank.id]||{credit:"0",debit:"0",pix:"0"};
                      return {...r,[bank.id]:{...prev,credit:e.target.value}};
                    })}
                    placeholder="Ex.: 2.89"
                  />
                </label>

                <label>
                  <span>Taxa Débito (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={current.debit}
                    onChange={e=>setRates(r=>{
                      const prev=r[bank.id]||{credit:"0",debit:"0",pix:"0"};
                      return {...r,[bank.id]:{...prev,debit:e.target.value}};
                    })}
                    placeholder="Ex.: 1.15"
                  />
                </label>

                <label>
                  <span>Taxa PIX (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={current.pix}
                    onChange={e=>setRates(r=>{
                      const prev=r[bank.id]||{credit:"0",debit:"0",pix:"0"};
                      return {...r,[bank.id]:{...prev,pix:e.target.value}};
                    })}
                    placeholder="Ex.: 0.00"
                  />
                </label>
              </div>

              <footer>
                <button
                  type="button"
                  className="workspace-primary rate-save-btn"
                  disabled={isBusy}
                  onClick={()=>saveRatesForBank(bank)}
                >
                  {isBusy?"Salvando...":"Salvar taxas"}
                </button>
              </footer>
            </article>
          );
        })}
        {!accounts.length&&(
          <div className="people-empty">
            <Landmark size={28}/>
            <strong>Nenhum banco ou máquina encontrado.</strong>
          </div>
        )}
      </div>
    </section>
  );
}

function Money({name,label,disabled=false}:{name:string;label:string;disabled?:boolean}){return <label>{label}<input name={name} type="number" step="0.01" min="0" defaultValue="0" disabled={disabled}/></label>}
function Difference({value}:{value:number}){
  const rounded = Math.round(value);
  return (
    <span className={`difference-pill ${rounded===0?"ok":rounded>0?"surplus":"shortage"}`}>
      {rounded===0?"Confere":`${rounded>0?"Sobra":"Falta"} ${brl(Math.abs(rounded))}`}
    </span>
  );
}
function Result({label,systemValue,found,difference}:{label:string;systemValue:number;found:number;difference:number}){return <article><strong>{label}</strong><span>Esperado <b>{brl(systemValue)}</b></span><span>Encontrado <b>{brl(found)}</b></span><Difference value={difference}/></article>}
function Metric({icon:Icon,tone,label,value}:{icon:typeof ClipboardCheck;tone:string;label:string;value:string}){return <div className={`workspace-metric ${tone}`}><span><Icon size={18}/></span><div><small>{label}</small><strong className={value.length>8?"compact":""}>{value}</strong></div></div>}

