"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Banknote, Bike,
  Bookmark, Calculator, Camera, Check, CheckCircle2, ChevronDown, ChevronUp,
  ClipboardCheck, Coins, CreditCard, Download, Edit3, Eye, FileCheck2,
  FileText, Image as ImageIcon, Landmark, Loader2, Paperclip, Percent, Plus,
  Receipt, RotateCcw, RotateCw, Search, Share2, ShieldCheck, Sliders, Smartphone, Sparkles, Store, Trash2,
  Upload, User, Users, Wallet, X, Zap, ZoomIn, ZoomOut, Copy, KeyRound, MapPin
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

export function isValidDataUrl(url?: string): url is string {
  if (!url || typeof url !== "string") return false;
  // Exact 60000 length was caused by the slice(0, 60000) bug which corrupted base64 images
  if (url.length === 60000) return false;
  if (!url.startsWith("data:image/")) return false;
  return url.length > 200;
}

const parseAttachments = (row: RecordData): CashAttachment[] => {
  try {
    const raw = row.attachmentsJson;
    if (!raw) return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((att: CashAttachment) => {
      // Clean up corrupt/truncated dataUrls (e.g. exactly 60000 chars from slice bug)
      if (att.dataUrl && !isValidDataUrl(att.dataUrl)) {
        return { ...att, dataUrl: undefined };
      }
      return att;
    });
  } catch {
    return [];
  }
};

export function AttachmentThumbnail({
  att,
  onClick,
}: {
  att: CashAttachment;
  onClick: () => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const isPdf = att.mimeType === "application/pdf" || att.fileName.toLowerCase().endsWith(".pdf");
  const validDataUrl = isValidDataUrl(att.dataUrl) ? att.dataUrl : undefined;

  return (
    <div className="conf-att-preview" onClick={onClick} title="Clique para visualizar">
      {!isPdf && validDataUrl && !loadFailed ? (
        <img
          src={validDataUrl}
          alt={att.fileName}
          className="conf-att-thumb"
          onError={() => setLoadFailed(true)}
        />
      ) : isPdf ? (
        <div className="conf-att-icon-box pdf"><FileText size={24} /><span>PDF</span></div>
      ) : (
        <div className="conf-att-icon-box img"><ImageIcon size={24} /><span>FOTO</span></div>
      )}
      <div className="conf-att-overlay"><Eye size={14} /> <span>Ver</span></div>
    </div>
  );
}
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

  const isPdf =
    attachment?.mimeType === "application/pdf" ||
    attachment?.fileName.toLowerCase().endsWith(".pdf") ||
    false;

  useEffect(() => {
    if (!attachment) return;
    setZoom(1);
    setRotation(0);
    setError("");

    const hasDriveFile = Boolean(attachment.fileId && !attachment.fileId.startsWith("local-"));
    const validDataUrl = isValidDataUrl(attachment.dataUrl) ? attachment.dataUrl : undefined;

    let isMounted = true;
    let objectUrlToRevoke: string | null = null;

    if (hasDriveFile) {
      setLoading(true);
      // Fast preview if valid dataUrl exists
      if (validDataUrl) {
        setBlobUrl(validDataUrl);
      } else {
        setBlobUrl("");
      }

      getFileBlobFromDrive(attachment.fileId)
        .then((res) => {
          if (isMounted) {
            objectUrlToRevoke = res.url;
            setBlobUrl(res.url);
            setLoading(false);
          } else {
            URL.revokeObjectURL(res.url);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setLoading(false);
            if (!validDataUrl) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Não foi possível carregar o arquivo do Drive."
              );
            }
          }
        });

      return () => {
        isMounted = false;
        if (objectUrlToRevoke) {
          URL.revokeObjectURL(objectUrlToRevoke);
        }
      };
    } else if (validDataUrl) {
      setBlobUrl(validDataUrl);
      setLoading(false);
    } else {
      setLoading(false);
      setError("Este comprovante não possui arquivo sincronizado no Google Drive.");
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

  const handleDownload = async () => {
    try {
      if (attachment.fileId && !attachment.fileId.startsWith("local-")) {
        await downloadFileFromDrive(attachment.fileId, attachment.fileName);
      } else if (blobUrl) {
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = attachment.fileName || "comprovante";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        alert("Arquivo indisponível para download.");
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

          {!error && blobUrl && (
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
                  onError={() => {
                    if (attachment.fileId && !attachment.fileId.startsWith("local-") && blobUrl !== "") {
                      setBlobUrl("");
                      setLoading(true);
                      getFileBlobFromDrive(attachment.fileId)
                        .then((res) => {
                          setBlobUrl(res.url);
                          setLoading(false);
                        })
                        .catch((err) => {
                          setLoading(false);
                          setError(err instanceof Error ? err.message : "Erro ao carregar do Drive.");
                        });
                    } else {
                      setError("Não foi possível decodificar o arquivo de imagem.");
                    }
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

function generateWhatsAppClosingText(row: RecordData, unitName: string) {
  const dateFormatted = str(row, "date").split("-").reverse().join("/");
  const shift = str(row, "shift") || "Único";
  const op = str(row, "operatorName") || "Operador";
  const sysTotal = brl(Number(row.systemTotal || 0));
  const sangria = Number(row.sangriaAmount || 0);
  const diff = Number(row.difference || 0);
  const diffText = diff === 0 ? "🟢 100% Batido (R$ 0,00)" : diff > 0 ? `🟡 Sobra de ${brl(diff)}` : `🔴 Falta de ${brl(Math.abs(diff))}`;

  let text = `*📊 FECHAMENTO DE CAIXA — HOUSE BURGER*\n`;
  text += `📍 *Unidade:* ${unitName}\n`;
  text += `📅 *Data:* ${dateFormatted} (Turno: ${shift})\n`;
  text += `👤 *Operador:* ${op}\n\n`;
  text += `*💰 TOTAL FATURADO:* ${sysTotal}\n`;
  text += `• Dinheiro PDV: ${brl(Number(row.systemCash || 0))}\n`;
  text += `• Cartão Crédito: ${brl(Number(row.systemCredit || 0))}\n`;
  text += `• Cartão Débito: ${brl(Number(row.systemDebit || 0))}\n`;
  text += `• PIX PDV: ${brl(Number(row.systemPix || 0))}\n`;
  if (Number(row.systemServiceFee || 0) > 0) {
    text += `• Taxa de Serviço: ${brl(Number(row.systemServiceFee || 0))}\n`;
  }
  text += `\n*💵 GAVETA & SANGRIA:*\n`;
  text += `• Sangria Retirada: ${brl(sangria)}${str(row, "sangriaRecipient") ? ` (${str(row, "sangriaRecipient")})` : ""}\n`;
  text += `• Troco Final Gaveta: ${brl(Number(row.closingFloat || 0))}\n`;
  if (Number(row.cashOutflows || 0) > 0) {
    text += `• Saídas da Gaveta: ${brl(Number(row.cashOutflows || 0))}\n`;
  }
  text += `\n*⚖️ RESULTADO / CONFERÊNCIA:*\n`;
  text += `• Veredito: ${diffText}\n`;
  if (str(row, "notes")) {
    text += `\n📝 *Obs:* ${str(row, "notes")}\n`;
  }
  return text;
}

export function CashWorkspace({ mode }: { mode: "closing" | "conference" | "audit" }) {
  const { data } = useManagement(); const { user, userProfile } = useAuth();
  const [closingOpen, setClosingOpen] = useState(false); const [editingClosing, setEditingClosing] = useState<RecordData|null>(null); const [reviewing, setReviewing] = useState<RecordData|null>(null); const [message, setMessage] = useState("");
  const [viewingClosing, setViewingClosing] = useState<RecordData|null>(null);
  const [confTab, setConfTab] = useState<"queue"|"audit"|"rates"|"sangrias">("queue");
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
  const visible = mode === "closing" || mode === "audit"
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

  const hasAuditData = (row: RecordData) => {
    return (
      closingValue(row, "motoboySystem") > 0 ||
      closingValue(row, "motoboyPaid") > 0 ||
      closingValue(row, "ifoodAudit") > 0 ||
      closingValue(row, "fiscalMachines") > 0 ||
      closingValue(row, "invoiceIssued") > 0 ||
      closingValue(row, "motoboyDifference") !== 0 ||
      closingValue(row, "invoiceDifference") !== 0
    );
  };
  const auditClosings = closings.filter(hasAuditData);
  const sangriaClosings = closings.filter(r => Number(r.sangriaAmount || 0) > 0);

  return <div className="workspace-shell cash-workspace">
    {mode === "audit" ? (
      <header className="workspace-header">
        <div>
          <span className="workspace-eyebrow">AUDITORIA OPERACIONAL HOUSE 190</span>
          <h1>Auditoria de motoboys & notas</h1>
          <p>Confronto diário de entregadores e notas fiscais com histórico preservado para conferência rápida.</p>
        </div>
      </header>
    ) : (
      <header className="workspace-header">
        <div>
          <span className="workspace-eyebrow">{mode === "closing" ? "FECHAMENTO DE CAIXA HOUSE 190" : "CONFERÊNCIA FINANCEIRA HOUSE 190"}</span>
          <h1>{mode === "closing" ? "Fechamento de caixa" : "Conferência financeira"}</h1>
          <p>{mode === "closing" ? "Entrada total e conciliação objetiva de Dinheiro, Crédito, Débito e PIX." : "Compare os valores apurados, revise divergências, audite motoboys e aprove os saldos líquidos dos bancos."}</p>
        </div>
        {mode === "closing" && (
          <button className="workspace-primary" onClick={() => { setEditingClosing(null); setClosingOpen(true); }}>
            <Plus size={16} /> Novo fechamento
          </button>
        )}
      </header>
    )}

    {mode !== "audit" && (
      <section className="workspace-metrics">
        <Metric icon={Wallet} tone="purple" label="Registros de hoje" value={String(todayRows.length)}/>
        <Metric icon={Calculator} tone={difference === 0 ? "green" : "red"} label="Diferença do dia" value={brl(difference)}/>
        <Metric icon={AlertTriangle} tone={pending.length > 0 ? "red" : "green"} label="Aguardando financeiro" value={String(pending.length)}/>
        <Metric icon={CheckCircle2} tone="green" label="Conferidos" value={String(reviewed.length)}/>
      </section>
    )}

    {message && <p className="workspace-message">{message}</p>}

    {mode === "conference" && (
      <div className="cash-subtabs">
        <button className={`cash-subtab ${confTab === "queue" ? "active" : ""}`} onClick={() => setConfTab("queue")}>
          <ClipboardCheck size={16} /> Caixas para conferência <b>{pending.length}</b>
        </button>
        <button className={`cash-subtab ${confTab === "audit" ? "active" : ""}`} onClick={() => setConfTab("audit")}>
          <FileText size={16} /> Auditoria de Motoboys & Notas <b>{auditClosings.length || closings.length}</b>
        </button>
        <button className={`cash-subtab ${confTab === "rates" ? "active" : ""}`} onClick={() => setConfTab("rates")}>
          <Percent size={16} /> Taxas das Máquinas & Bancos
        </button>
        <button className={`cash-subtab ${confTab === "sangrias" ? "active" : ""}`} onClick={() => setConfTab("sangrias")}>
          <Coins size={16} /> Sangrias <b>{sangriaClosings.length}</b>
        </button>
      </div>
    )}

    {mode === "audit" ? (
      <AuditHistoryTab closings={visible} isOperatorMode={isOperator} onViewClosing={setViewingClosing} />
    ) : mode === "conference" && confTab === "audit" ? (
      <AuditHistoryTab closings={closings} onViewClosing={setViewingClosing} />
    ) : mode === "conference" && confTab === "rates" ? (
      <BankRatesTab />
    ) : mode === "conference" && confTab === "sangrias" ? (
      <SangriasTab closings={closings} onViewClosing={setViewingClosing} />
    ) : (
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
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                className={`cash-eye-detail-btn ${rowConferred ? "conferred" : ""}`}
                title={rowConferred ? "Visualizar todas as informações do fechamento conferido" : "Visualizar detalhes completos do fechamento"}
                onClick={() => setViewingClosing(row)}
              >
                <Eye size={12} />
                <span>{rowConferred ? "Ver Fechamento" : "Ver Detalhes"}</span>
              </button>
              <button
                type="button"
                className="cash-whatsapp-btn"
                title="Compartilhar demonstrativo do fechamento no WhatsApp"
                onClick={() => {
                  const uObj = data.units.find(u => u.id === row.unitId);
                  const unitName = (uObj ? str(uObj, "name") : "") || String(row.unitId || "Unidade");
                  const text = generateWhatsAppClosingText(row, unitName);
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                }}
              >
                <Share2 size={12} /> WhatsApp
              </button>
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
                <>
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
                        console.warn("Falha no soft-delete do fechamento, tentando exclusão direta:", err);
                        try {
                          const { deleteDoc, doc } = await import("firebase/firestore");
                          await deleteDoc(doc(db, "gestao_cashClosings", row.id));
                          setMessage(`Fechamento de ${formattedDate} excluído com sucesso.`);
                        } catch (delErr) {
                          console.error("Erro ao excluir fechamento:", delErr);
                          alert("Não foi possível excluir o fechamento: " + (delErr instanceof Error ? delErr.message : String(delErr)));
                        }
                      }
                    }}
                  >
                    <Trash2 size={12}/> Excluir
                  </button>
                </>
              )}
            </div>
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
    {viewingClosing && (
      <ClosingDetailsModal
        closing={viewingClosing}
        onClose={() => setViewingClosing(null)}
      />
    )}
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
  const [showOutflowsAccordion, setShowOutflowsAccordion] = useState(true);

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
  const c = (val: string | number | undefined | null) => Math.max(0, Math.round(Number(String(val ?? "0").replace(",", ".").trim()) * 100) || 0);

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
  const cCashDiff = cCashFound - cCashExpected;

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
  const cPixRequestsTotal = pixRequests.reduce((sum, item) => sum + c(item.amount), 0);

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

      const uploadedAttachments: CashAttachment[] = [...existingAttachments.map(att => ({
        ...att,
        // File is in Drive: do NOT store large base64 strings in Firestore
        dataUrl: att.fileId && !att.fileId.startsWith("local-") ? undefined : (isValidDataUrl(att.dataUrl) ? att.dataUrl : undefined),
      }))];
      for (const item of newFiles) {
        try {
          const named = nameFileForDrive(item.file, `Fechamento ${date} - ${unit}`);
          const saved = await uploadFileToDrive(named, "payment_proofs");
          // File is safe in Drive — do NOT store dataUrl in Firestore
          uploadedAttachments.push({
            fileId: saved.fileId,
            fileName: saved.fileName,
            mimeType: saved.mimeType,
            size: saved.size,
            dataUrl: undefined,
            uploadedAt: new Date().toISOString()
          });
        } catch (uploadErr) {
          console.warn("[Fechamento] Falha ao enviar comprovante para o Drive, mantendo fallback:", uploadErr);
          uploadedAttachments.push({
            fileId: `local-${Date.now()}-${item.file.name}`,
            fileName: item.file.name,
            mimeType: item.file.type || "image/jpeg",
            size: item.size,
            dataUrl: isValidDataUrl(item.dataUrl) ? item.dataUrl : undefined,
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

      // Archive orphaned PIX payables (existed in Firestore but removed by operator when editing)
      const existingPayables = (data.payables || []).filter(
        (p: RecordData) => !p.archived && p.sourceId === closingId
      );

      const payables = requestedPix.map(request => {
        const id = `pix-${closingId}-${request.id}`;
        const existingP = existingPayables.find((p: RecordData) => p.id === id);
        return {
          id,
          kind: "payables" as const,
          tenantId,
          unitId: unit,
          version: existingP ? Number(existingP.version || 0) : 0,
          createdAt: existingP?.createdAt || now,
          updatedAt: now,
          createdBy: existingP?.createdBy || user.uid,
          updatedBy: user.uid,
          obligationType: "Outros",
          ...(defaultCategory ? { categoryId: defaultCategory } : {}),
          description: `PIX — ${request.description} (${request.name})`,
          competence: date.slice(0, 7),
          dueDate: date,
          amount: Math.round(Number(request.amount) * 100),
          paymentMethod: "PIX",
          status: existingP?.status || "Pendente",
          nature: "Operacional",
          sourceId: closingId,
          pixKey: request.key,
          notes: `Solicitação criada no fechamento de caixa. Chave PIX: ${request.key}`
        };
      }) as RecordData[];

      const currentPayableIds = new Set(payables.map((p: RecordData) => p.id));
      const orphanPayables: RecordData[] = existingPayables
        .filter((p: RecordData) => !currentPayableIds.has(p.id))
        .map((p: RecordData) => ({
          ...p,
          archived: true,
          updatedAt: now,
          updatedBy: user.uid,
          version: Number(p.version || 0)
        }));

      const allRecords = [row, ...payables, ...orphanPayables];
      allRecords.forEach(record => validate(record, data));

      // Retry up to 3 times for transient Firebase errors (quota, network)
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await commitRecords(allRecords, data, row);
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
    { id: 1 as const, title: "1. Fechamento Lado a Lado", icon: Sliders },
    { id: 2 as const, title: "2. Motoboys & Notas Fiscais", icon: Bike },
    { id: 3 as const, title: "3. Solicitações de PIX", icon: Zap },
    { id: 4 as const, title: "4. Comprovantes & Observações", icon: Sparkles },
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
            {date !== dateToday() && (
              <button
                type="button"
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 py-0.5 px-2 rounded-md bg-indigo-50 dark:bg-indigo-950/60 transition"
                onClick={() => setDate(dateToday())}
                title="Definir data para hoje"
              >
                Hoje
              </button>
            )}
          </div>

          <div className="closing-meta-item">
            <Users size={14} className="text-zinc-400" />
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
            <div className="shift-pills-wrap">
              {[
                { id: "Único", label: "⭐ Único" },
                { id: "Almoço", label: "☀️ Almoço" },
                { id: "Jantar", label: "🌙 Jantar" }
              ].map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`shift-pill-btn ${shift === s.id ? "active" : ""}`}
                  onClick={() => setShift(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Top Progress Bar */}
        <div className="closing-step-progress-bar">
          <div
            className="closing-step-progress-fill"
            style={{ width: `${(activeStep / 4) * 100}%` }}
          />
        </div>

        {/* Step Navigation Tabs with Dynamic Status Badges */}
        <div className="closing-steps-nav">
          {stepsList.map(s => {
            const Icon = s.icon;
            const isActive = activeStep === s.id;
            const isPast = activeStep > s.id;

            let tabBadge = null;
            if (s.id === 1 && (cSysTotal > 0 || cTotalConfirmed > 0)) {
              tabBadge = (
                <span className={`closing-tab-badge ${cTotalDiff === 0 ? "!bg-emerald-100 !text-emerald-800" : "!bg-rose-100 !text-rose-800"}`}>
                  {cTotalDiff === 0 ? "✓ Batido" : "Dif"}
                </span>
              );
            } else if (s.id === 2 && (c(motoboyPaid) > 0 || c(motoboySystem) > 0 || c(invoiceIssued) > 0)) {
              tabBadge = <span className="closing-tab-badge">Auditoria</span>;
            } else if (s.id === 3 && pixRequests.length > 0) {
              tabBadge = <span className="closing-tab-badge !bg-purple-100 !text-purple-800">{pixRequests.length}</span>;
            } else if (s.id === 4) {
              const countAtt = existingAttachments.length + newFiles.length;
              if (countAtt > 0) {
                tabBadge = <span className="closing-tab-badge !bg-purple-100 !text-purple-800">{countAtt}/5</span>;
              }
            }

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
                {tabBadge}
              </button>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="closing-modal-body">
          {/* STEP 1: FECHAMENTO LADO A LADO (SPLIT-SCREEN + CARDS COLORIDOS) */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div className="closing-split-grid">
                {/* Coluna 1: O QUE O SISTEMA DIZ (PDV) */}
                <div className="closing-col-panel">
                  <div className="closing-col-header">
                    <div className="closing-col-title">
                      <Receipt size={16} className="text-indigo-600" />
                      <span>O QUE O SISTEMA DIZ (PDV)</span>
                    </div>
                    <div className="closing-col-total">
                      Total: <b>{brl(cSysTotal)}</b>
                    </div>
                  </div>

                  {/* Card Verde: Dinheiro */}
                  <div className="thematic-card thematic-card-green">
                    <div className="thematic-card-head text-emerald-800 dark:text-emerald-300">
                      <span><Coins size={14} className="text-emerald-600" /> Dinheiro no Sistema</span>
                      <span className="font-bold">{brl(cSysCash)}</span>
                    </div>
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

                  {/* Card Azul: Cartões */}
                  <div className="thematic-card thematic-card-blue">
                    <div className="thematic-card-head text-blue-800 dark:text-blue-300">
                      <span><CreditCard size={14} className="text-blue-600" /> Cartões no PDV</span>
                      <span className="font-bold">{brl(cSysCredit + cSysDebit)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Crédito</label>
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
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Débito</label>
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
                    </div>
                  </div>

                  {/* Card Roxo: PIX */}
                  <div className="thematic-card thematic-card-purple">
                    <div className="thematic-card-head text-purple-800 dark:text-purple-300">
                      <span><Smartphone size={14} className="text-purple-600" /> PIX no Sistema</span>
                      <span className="font-bold">{brl(cSysPix)}</span>
                    </div>
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

                  {/* Card Âmbar: Taxa de Serviço */}
                  <div className="thematic-card thematic-card-amber">
                    <div className="thematic-card-head text-amber-800 dark:text-amber-300">
                      <span><Sparkles size={14} className="text-amber-600" /> Taxa de Serviço</span>
                      <span className="font-bold">{brl(cSysServiceFee)}</span>
                    </div>
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

                  {/* Collapsible: Outros canais */}
                  <div className="modern-collapsible">
                    <button
                      type="button"
                      className="modern-collapsible-trigger"
                      onClick={() => setShowOtherChannels(!showOtherChannels)}
                    >
                      <span>Outros canais (iFood, Voucher, Faturado...)</span>
                      {showOtherChannels ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    {showOtherChannels && (
                      <div className="modern-collapsible-body">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">iFood Online</label>
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
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">iFood Voucher</label>
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
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Faturado / Prazo</label>
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
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Resgate Clube</label>
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
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Acréscimos / Gorjetas</label>
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

                {/* Coluna 2: O QUE VOCÊ TEM NO BALCÃO (Apuração Real) */}
                <div className="closing-col-panel">
                  <div className="closing-col-header">
                    <div className="closing-col-title">
                      <Store size={16} className="text-purple-600" />
                      <span>O QUE VOCÊ TEM NO BALCÃO</span>
                    </div>
                    <div className="closing-col-total">
                      Total: <b>{brl(cTotalConfirmed)}</b>
                    </div>
                  </div>

                  {/* Dinheiro & Gaveta */}
                  <div className="p-3 bg-white dark:bg-zinc-800/80 rounded-xl border border-zinc-200 dark:border-zinc-700/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                        <Coins size={14} className="text-emerald-600" /> Dinheiro Físico & Gaveta
                      </span>
                      <Difference value={cCashDiff} />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Troco Inicial</label>
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
                      <div>
                        <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Suprimentos</label>
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
                    </div>

                    {/* Sangria Hero Box */}
                    <div className="sangria-hero-box">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-purple-900 dark:text-purple-200">
                          💰 Sangria (Retirada da Gaveta)
                        </label>
                        <span className="text-xs font-extrabold text-purple-800 dark:text-purple-300">
                          {brl(cSangria)}
                        </span>
                      </div>
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
                      {cSangria > 0 && (
                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              value={sangriaStatus}
                              onChange={e => setSangriaStatus(e.target.value)}
                              className="p-1.5 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-zinc-900 font-semibold text-xs text-purple-950 dark:text-purple-200"
                            >
                              <option value="Na loja">Guardado no cofre da loja</option>
                              <option value="Entregue a responsável">Entregue a responsável</option>
                            </select>
                            <input
                              type="text"
                              value={sangriaRecipient}
                              onChange={e => setSangriaRecipient(e.target.value)}
                              placeholder="Para quem / Onde guardado *"
                              className="p-1.5 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-zinc-900 font-medium text-xs"
                              required
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Troco Final que Ficou na Gaveta</label>
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

                    {/* Saídas em Dinheiro (Gaveta) Retrátil */}
                    <div className="modern-collapsible">
                      <button
                        type="button"
                        className="modern-collapsible-trigger"
                        onClick={() => setShowOutflowsAccordion(!showOutflowsAccordion)}
                      >
                        <div className="flex items-center gap-2">
                          <span>🧾 Saídas da Gaveta ({outflows.length})</span>
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">{brl(cOutflows)}</span>
                        </div>
                        {showOutflowsAccordion ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                      {showOutflowsAccordion && (
                        <div className="modern-collapsible-body">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-zinc-400">Despesas pagas em espécie</span>
                            <button
                              type="button"
                              className="cash-add text-xs py-1 px-2.5"
                              onClick={() => setOutflows(rows => [...rows, { id: safeUUID(), name: "", amount: "" }])}
                            >
                              + Adicionar saída
                            </button>
                          </div>
                          {outflows.length > 0 ? (
                            outflows.map((row, idx) => (
                              <div key={row.id} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Descrição (ex.: Compra emergencial)"
                                  value={row.name}
                                  onChange={e => setOutflows(rows => rows.map(r => r.id === row.id ? { ...r, name: e.target.value } : r))}
                                  className="flex-1 p-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                                />
                                <div className="w-28 relative">
                                  <span className="absolute left-2 top-1.5 text-xs text-zinc-400">R$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0,00"
                                    value={row.amount}
                                    onChange={e => setOutflows(rows => rows.map(r => r.id === row.id ? { ...r, amount: e.target.value } : r))}
                                    className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold"
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                                  onClick={() => setOutflows(rows => rows.filter(r => r.id !== row.id))}
                                  aria-label={`Remover saída ${idx + 1}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))
                          ) : (
                            <p className="text-[11px] text-zinc-400 italic">Nenhuma saída de dinheiro registrada nesta gaveta.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Maquininhas de Cartão & PIX */}
                  <div className="p-3 bg-white dark:bg-zinc-800/80 rounded-xl border border-zinc-200 dark:border-zinc-700/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                        <CreditCard size={14} className="text-blue-600" /> Maquininhas de Cartão & PIX
                      </span>
                      <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                        Total: {brl(cCreditFound + cDebitFound + cPixFound)}
                      </span>
                    </div>

                    {banks.length ? (
                      <div className="space-y-2.5">
                        {banks.map(bank => {
                          const m = machines[bank.id] || { used: false, credit: "", debit: "", pix: "" };
                          const machineTotal = c(m.credit) + c(m.debit) + c(m.pix);
                          return (
                            <div key={bank.id} className={`closing-machine-card ${m.used ? "active" : ""}`}>
                              <div className="closing-machine-header">
                                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-zinc-800 dark:text-zinc-100">
                                  <input
                                    type="checkbox"
                                    checked={m.used}
                                    onChange={e => setMachines(prev => ({
                                      ...prev,
                                      [bank.id]: { ...m, used: e.target.checked }
                                    }))}
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <Landmark size={15} className="text-indigo-600" />
                                  <span>{str(bank, "name")}</span>
                                </label>
                                {m.used && (
                                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                    {brl(machineTotal)}
                                  </span>
                                )}
                              </div>
                              {m.used && (
                                <div className="grid grid-cols-3 gap-2 pt-1">
                                  <div>
                                    <label className="text-[9px] font-semibold text-zinc-500 uppercase block mb-1">Crédito</label>
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
                                  <div>
                                    <label className="text-[9px] font-semibold text-zinc-500 uppercase block mb-1">Débito</label>
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
                                  <div>
                                    <label className="text-[9px] font-semibold text-zinc-500 uppercase block mb-1">PIX</label>
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
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 italic">Nenhuma máquina cadastrada para esta unidade.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Confronto Instantâneo dos 4 Pilares (PDV vs Balcão) */}
              <div className="closing-pillars-grid">
                {/* 1. Dinheiro */}
                <div className="closing-pillar-box">
                  <div className="closing-pillar-head">
                    <span className="flex items-center gap-1.5"><Coins size={14} className="text-emerald-600" /> Dinheiro Gaveta</span>
                    <Difference value={cCashDiff} />
                  </div>
                  <div className="closing-pillar-row">
                    <span>Esperado:</span>
                    <strong>{brl(cCashExpected)}</strong>
                  </div>
                  <div className="closing-pillar-row">
                    <span>Contado:</span>
                    <strong>{brl(cCashFound)}</strong>
                  </div>
                </div>

                {/* 2. Crédito */}
                <div className="closing-pillar-box">
                  <div className="closing-pillar-head">
                    <span className="flex items-center gap-1.5"><CreditCard size={14} className="text-blue-600" /> Cartão Crédito</span>
                    <Difference value={cCreditDiff} />
                  </div>
                  <div className="closing-pillar-row">
                    <span>PDV Sistema:</span>
                    <strong>{brl(cSysCredit)}</strong>
                  </div>
                  <div className="closing-pillar-row">
                    <span>Maquininhas:</span>
                    <strong>{brl(cCreditFound)}</strong>
                  </div>
                </div>

                {/* 3. Débito */}
                <div className="closing-pillar-box">
                  <div className="closing-pillar-head">
                    <span className="flex items-center gap-1.5"><CreditCard size={14} className="text-indigo-600" /> Cartão Débito</span>
                    <Difference value={cDebitDiff} />
                  </div>
                  <div className="closing-pillar-row">
                    <span>PDV Sistema:</span>
                    <strong>{brl(cSysDebit)}</strong>
                  </div>
                  <div className="closing-pillar-row">
                    <span>Maquininhas:</span>
                    <strong>{brl(cDebitFound)}</strong>
                  </div>
                </div>

                {/* 4. PIX */}
                <div className="closing-pillar-box">
                  <div className="closing-pillar-head">
                    <span className="flex items-center gap-1.5"><Smartphone size={14} className="text-purple-600" /> PIX Turno</span>
                    <Difference value={cPixDiff} />
                  </div>
                  <div className="closing-pillar-row">
                    <span>PDV Sistema:</span>
                    <strong>{brl(cSysPix)}</strong>
                  </div>
                  <div className="closing-pillar-row">
                    <span>Maquininhas:</span>
                    <strong>{brl(cPixFound)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: MOTOBOYS & NOTAS FISCAIS */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div className="closing-section-lead">
                <div>
                  <h3>Auditoria de Motoboys e Notas Fiscais</h3>
                  <p>Confronte o custo de motoboy do turno e as notas fiscais emitidas.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Auditoria de Motoboys */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <Bike size={16} className="text-indigo-600" /> Auditoria de Motoboys
                    </strong>
                    <Difference value={cMotoboyDiff} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-500 block mb-1">Sistema (Registrado)</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={motoboySystem}
                          onChange={e => setMotoboySystem(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-zinc-500 block mb-1">Total Efetivamente Pago</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={motoboyPaid}
                          onChange={e => setMotoboyPaid(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                    Diferença de entregas: <b>{brl(cMotoboyDiff)}</b>
                  </div>
                </div>

                {/* Auditoria Fiscal */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <Receipt size={16} className="text-purple-600" /> Auditoria Fiscal (Notas)
                    </strong>
                    <Difference value={cInvoiceDiff} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 block mb-1">iFood</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={ifoodAudit}
                          onChange={e => setIfoodAudit(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 block mb-1">Máquinas</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={fiscalMachines}
                          onChange={e => setFiscalMachines(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-zinc-500 block mb-1">Emitidas</label>
                      <div className="closing-input-wrapper">
                        <span className="prefix">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={invoiceIssued}
                          onChange={e => setInvoiceIssued(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                    Diferença Fiscal (Base − Emitidas): <b>{brl(cInvoiceDiff)}</b>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SOLICITAÇÕES DE PIX (CONTAS A PAGAR) */}
          {activeStep === 3 && (
            <div className="space-y-4">
              <div className="closing-section-lead">
                <div>
                  <h3>Solicitações de PIX (Contas a Pagar do Fechamento)</h3>
                  <p>Valores que precisam ser pagos urgentemente via PIX pela gerência ou financeiro.</p>
                </div>
                <button
                  type="button"
                  className="cash-add text-xs py-1.5 px-3"
                  onClick={() => setPixRequests(rows => [...rows, { id: safeUUID(), name: "", key: "", description: "", amount: "" }])}
                >
                  + Adicionar solicitação de PIX
                </button>
              </div>

              {pixRequests.length > 0 ? (
                <div className="space-y-2.5">
                  {pixRequests.map((item, idx) => {
                    const keyValid = !item.key.trim() || isValidPixKey(item.key);
                    return (
                      <div key={item.id} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-center p-3 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm">
                        <div>
                          <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Favorecido (Nome)</label>
                          <input
                            type="text"
                            placeholder="Ex.: Fornecedor Verduras"
                            value={item.name}
                            onChange={e => setPixRequests(rows => rows.map(r => r.id === item.id ? { ...r, name: e.target.value } : r))}
                            className="w-full p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Chave PIX</label>
                          <input
                            type="text"
                            placeholder="CPF, CNPJ, e-mail, telefone..."
                            value={item.key}
                            onChange={e => setPixRequests(rows => rows.map(r => r.id === item.id ? { ...r, key: e.target.value } : r))}
                            className={`w-full p-2 rounded-lg border text-xs ${!keyValid ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30" : "border-zinc-300 dark:border-zinc-700"}`}
                          />
                          {!keyValid && <span className="text-[10px] text-rose-500 block mt-0.5">Formato inválido</span>}
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Motivo / Descrição</label>
                          <input
                            type="text"
                            placeholder="Ex.: Gás de cozinha emergencial"
                            value={item.description}
                            onChange={e => setPixRequests(rows => rows.map(r => r.id === item.id ? { ...r, description: e.target.value } : r))}
                            className="w-full p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-zinc-500 uppercase block mb-1">Valor (R$)</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0,00"
                              value={item.amount}
                              onChange={e => setPixRequests(rows => rows.map(r => r.id === item.id ? { ...r, amount: e.target.value } : r))}
                              className="flex-1 p-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                            />
                            <button
                              type="button"
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                              onClick={() => setPixRequests(rows => rows.filter(r => r.id !== item.id))}
                              aria-label={`Remover solicitação PIX ${idx + 1}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="people-empty py-8 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                  <Zap size={28} className="text-zinc-400" />
                  <strong>Nenhuma solicitação de PIX lançada neste turno</strong>
                  <span>Se precisou realizar pagamentos emergenciais via PIX, clique no botão acima para lançar a conta a pagar.</span>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: COMPROVANTES & OBSERVAÇÕES */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="closing-section-lead">
                <div>
                  <h3>Comprovantes, Fotos & Observações</h3>
                  <p>Anexe fotos dos fechamentos das maquininhas e deixe observações importantes sobre o turno.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Comprovantes */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Camera size={15} className="text-purple-600" /> Comprovantes / Fotos ({existingAttachments.length + newFiles.length}/5)
                    </label>
                    {compressingFiles && (
                      <span className="text-[11px] text-purple-600 flex items-center gap-1 font-semibold">
                        <Loader2 size={12} className="animate-spin" /> Otimizando...
                      </span>
                    )}
                  </div>

                  {(existingAttachments.length > 0 || newFiles.length > 0) && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {existingAttachments.map(att => (
                        <div key={att.fileId} className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs">
                          <div className="flex items-center gap-2.5 truncate min-w-0">
                            {att.dataUrl && isValidDataUrl(att.dataUrl) ? (
                              <img
                                src={att.dataUrl}
                                alt=""
                                className="w-8 h-8 object-cover rounded-lg shrink-0 border border-zinc-200"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <FileText size={18} className="text-purple-600 shrink-0" />
                            )}
                            <div className="truncate min-w-0">
                              <p className="truncate font-semibold">{att.fileName}</p>
                              <span className="text-[10px] text-zinc-400 block">{formatFileSize(att.size)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="text-zinc-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 shrink-0 transition"
                            title="Remover anexo"
                            onClick={() => setExistingAttachments(prev => prev.filter(a => a.fileId !== att.fileId))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      {newFiles.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-purple-50/70 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800 text-xs">
                          <div className="flex items-center gap-2.5 truncate min-w-0">
                            {item.previewUrl ? (
                              <img src={item.previewUrl} alt="" className="w-8 h-8 object-cover rounded-lg shrink-0 border border-purple-200" />
                            ) : (
                              <FileText size={18} className="text-purple-600 shrink-0" />
                            )}
                            <div className="truncate min-w-0">
                              <p className="truncate font-semibold">{item.file.name}</p>
                              <span className="text-[10px] text-zinc-400 block">{formatFileSize(item.size)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="text-zinc-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 shrink-0 transition"
                            title="Remover anexo"
                            onClick={() => setNewFiles(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {existingAttachments.length + newFiles.length < 5 && (
                    <div className="flex items-center gap-2 pt-1">
                      <label className="flex-1 employee-file-upload cursor-pointer justify-center text-xs py-2.5">
                        <Camera size={15} />
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
                      <label className="flex-1 employee-file-upload cursor-pointer justify-center text-xs py-2.5">
                        <Upload size={15} />
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
                    Fotos são automaticamente compactadas para rápido upload e economia de armazenamento.
                  </span>
                </div>

                {/* Observações */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2 flex flex-col">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
                    Observações do Turno
                  </label>
                  <textarea
                    rows={6}
                    placeholder="Explique qualquer divergência ocorrida, sobra, falta, trocas de notas, cancelamentos ou observações para o financeiro..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full flex-1 p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs outline-none focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>

              {/* Painel Executivo Pré-Envio (Auditoria Geral) */}
              <div className="closing-executive-summary">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-indigo-600 dark:text-indigo-400" />
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      Conferência Executiva Pré-Envio (Auditoria Geral)
                    </h4>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cTotalDiff === 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : cTotalDiff > 0 ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"}`}>
                    {cTotalDiff === 0 ? "✓ Caixa 100% Batido" : cTotalDiff > 0 ? `Sobra: +${brl(cTotalDiff)}` : `Diferença: ${brl(cTotalDiff)}`}
                  </span>
                </div>

                <div className="closing-executive-grid">
                  {/* Item 1: 4 Pilares */}
                  <div className="closing-executive-item">
                    <div className={`icon-circle ${cTotalDiff === 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}`}>
                      <Coins size={15} />
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-500 font-medium">
                        <span>4 Pilares (PDV x Real)</span>
                        <Difference value={cTotalDiff} />
                      </div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs mt-0.5">
                        {brl(cTotalConfirmed)} <span className="text-[10px] text-zinc-400 font-normal">/ PDV {brl(cSysTotal)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Item 2: Gaveta & Sangrias */}
                  <div className="closing-executive-item">
                    <div className="icon-circle bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      <Banknote size={15} />
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-500 font-medium">
                        <span>Dinheiro Físico</span>
                        <span className="text-zinc-600 dark:text-zinc-400 font-semibold">{cSangria > 0 ? `-${brl(cSangria)} sangria` : "Sem sangria"}</span>
                      </div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs mt-0.5">
                        Gaveta Final: {brl(cClosingFloat)}
                      </p>
                    </div>
                  </div>

                  {/* Item 3: Motoboys */}
                  <div className="closing-executive-item">
                    <div className={`icon-circle ${cMotoboyDiff === 0 ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                      <Bike size={15} />
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-500 font-medium">
                        <span>Auditoria Motoboy</span>
                        <Difference value={cMotoboyDiff} />
                      </div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs mt-0.5">
                        Pago: {brl(c(motoboyPaid))} <span className="text-[10px] text-zinc-400 font-normal">/ Sis {brl(c(motoboySystem))}</span>
                      </p>
                    </div>
                  </div>

                  {/* Item 4: Fiscal & NFC-e */}
                  <div className="closing-executive-item">
                    <div className={`icon-circle ${cInvoiceDiff === 0 && (c(ifoodAudit) > 0 || c(fiscalMachines) > 0) ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"}`}>
                      <FileCheck2 size={15} />
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-500 font-medium">
                        <span>Auditoria Fiscal</span>
                        <Difference value={cInvoiceDiff} />
                      </div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs mt-0.5">
                        NFC-e: {brl(c(invoiceIssued))} <span className="text-[10px] text-zinc-400 font-normal">/ Base {brl(c(ifoodAudit) + c(fiscalMachines))}</span>
                      </p>
                    </div>
                  </div>

                  {/* Item 5: Solicitações de PIX */}
                  <div className="closing-executive-item">
                    <div className={`icon-circle ${pixRequests.length > 0 ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                      <Zap size={15} />
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-500 font-medium">
                        <span>Solicitações PIX</span>
                        <span className="text-purple-700 dark:text-purple-400 font-bold">{pixRequests.length} reg.</span>
                      </div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200 text-xs mt-0.5">
                        {cPixRequestsTotal > 0 ? brl(cPixRequestsTotal) : "Nenhuma pendência"}
                      </p>
                    </div>
                  </div>

                  {/* Item 6: Anexos de Comprovantes */}
                  <div className="closing-executive-item">
                    <div className={`icon-circle ${existingAttachments.length + newFiles.length > 0 ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                      <Camera size={15} />
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      <div className="flex items-center justify-between text-zinc-500 font-medium">
                        <span>Comprovantes</span>
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">{existingAttachments.length + newFiles.length} foto(s)</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {existingAttachments.length + newFiles.length > 0 ? "Pronto para arquivo" : "Nenhuma foto anexada"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-white/70 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <span>Revise todos os itens acima antes de enviar. Ao finalizar, o relatório será salvo e submetido para a conferência financeira.</span>
                </div>
              </div>
            </div>
          )}

          {error && <p className="mg-error">{error}</p>}
        </div>

        {/* Persistent Sticky Footer with Verdict Semaphore & 4 Pillars */}
        <footer className="closing-footer-sticky">
          <div className="verdict-semaphore-wrap">
            {/* Semaphore Banner */}
            <div className={`verdict-banner ${cTotalDiff === 0 ? "ok" : cTotalDiff > 0 ? "warn" : "diff"}`}>
              {cTotalDiff === 0 ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>Caixa 100% Batido (R$ 0,00)</span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} />
                  <span>{cTotalDiff > 0 ? `Sobra no Caixa: +${brl(cTotalDiff)}` : `Diferença no Caixa: ${brl(cTotalDiff)}`}</span>
                </>
              )}
            </div>

            {/* 4 Pillars Mini Stats */}
            <div className="verdict-mini-stats">
              <div className="verdict-mini-stat" title={`Dinheiro: Esperado ${brl(cCashExpected)} | Contado ${brl(cCashFound)}`}>
                <span>Dinheiro</span>
                <strong className={cCashDiff === 0 ? "text-emerald-600" : cCashDiff > 0 ? "text-amber-600" : "text-rose-600"}>
                  {cCashDiff === 0 ? "OK" : brl(cCashDiff)}
                </strong>
              </div>
              <div className="verdict-mini-stat" title={`Crédito: PDV ${brl(cSysCredit)} | Máquinas ${brl(cCreditFound)}`}>
                <span>Crédito</span>
                <strong className={cCreditDiff === 0 ? "text-emerald-600" : cCreditDiff > 0 ? "text-amber-600" : "text-rose-600"}>
                  {cCreditDiff === 0 ? "OK" : brl(cCreditDiff)}
                </strong>
              </div>
              <div className="verdict-mini-stat" title={`Débito: PDV ${brl(cSysDebit)} | Máquinas ${brl(cDebitFound)}`}>
                <span>Débito</span>
                <strong className={cDebitDiff === 0 ? "text-emerald-600" : cDebitDiff > 0 ? "text-amber-600" : "text-rose-600"}>
                  {cDebitDiff === 0 ? "OK" : brl(cDebitDiff)}
                </strong>
              </div>
              <div className="verdict-mini-stat" title={`PIX: PDV ${brl(cSysPix)} | Máquinas ${brl(cPixFound)}`}>
                <span>PIX</span>
                <strong className={cPixDiff === 0 ? "text-emerald-600" : cPixDiff > 0 ? "text-amber-600" : "text-rose-600"}>
                  {cPixDiff === 0 ? "OK" : brl(cPixDiff)}
                </strong>
              </div>
            </div>
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
              <button
                type="button"
                className="mg-button"
                onClick={() => setActiveStep((activeStep + 1) as any)}
              >
                <span>Avançar: {stepsList.find(s => s.id === activeStep + 1)?.title.replace(/^\d+\.\s*/, "")}</span>
                <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                className="mg-button"
                disabled={busy || !unit}
                onClick={handleSubmit}
              >
                {busy ? (
                  "Enviando ao financeiro..."
                ) : initialClosing ? (
                  "Salvar e Reenviar Fechamento"
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Finalizar e Enviar ao Financeiro</span>
                  </>
                )}
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

  const parsedInitialChecks = useMemo(() => {
    try {
      const conf = data.cashConferences.find(c => !c.archived && c.closingId === closing.id);
      if (conf?.checksJson) {
        return JSON.parse(str(conf, "checksJson"));
      }
    } catch {}
    return null;
  }, [data.cashConferences, closing.id]);

  const [checks, setChecks] = useState<{ cash: boolean; serviceFee: boolean }>(() => ({
    cash: Boolean(parsedInitialChecks?.cash),
    serviceFee: Boolean(parsedInitialChecks?.serviceFee),
  }));

  const [machineChecks, setMachineChecks] = useState<Record<string, { credit: boolean; debit: boolean; pix: boolean }>>(() => {
    const res: Record<string, { credit: boolean; debit: boolean; pix: boolean }> = {};
    const byMachine = parsedInitialChecks?.machines || parsedInitialChecks?.byMachine || {};
    availableBanks.forEach(b => {
      res[b.id] = {
        credit: Boolean(byMachine[b.id]?.credit ?? (parsedInitialChecks ? parsedInitialChecks.credit : false)),
        debit: Boolean(byMachine[b.id]?.debit ?? (parsedInitialChecks ? parsedInitialChecks.debit : false)),
        pix: Boolean(byMachine[b.id]?.pix ?? (parsedInitialChecks ? parsedInitialChecks.pix : false)),
      };
    });
    return res;
  });

  const toggleMachineCheck = (type: "credit" | "debit" | "pix", checked: boolean) => {
    const targetId = activeBankId || displayBanks[0]?.id || "machine_default";
    setMachineChecks(prev => ({
      ...prev,
      [targetId]: {
        ...(prev[targetId] || { credit: false, debit: false, pix: false }),
        [type]: checked
      }
    }));
  };
  const [notes, setNotes] = useState(() => str(closing, "conferenceNotes") || str(closing, "notes") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);

  const outflowsList = useMemo(() => parseOutflows(closing.cashOutflowsJson), [closing.cashOutflowsJson]);
  const pixRequestsList = useMemo(() => parsePixRequests(closing.pixRequestsJson), [closing.pixRequestsJson]);
  const pixRequestsTotal = useMemo(
    () => pixRequestsList.reduce((sum, item) => sum + Math.round(Number(item.amount || 0) * 100), 0),
    [pixRequestsList]
  );

  const motoboySystem = closingValue(closing, "motoboySystem");
  const motoboyPaid = closingValue(closing, "motoboyPaid");
  const motoboyDiff = closingValue(closing, "motoboyDifference");
  const ifoodAudit = closingValue(closing, "ifoodAudit");
  const fiscalMachines = closingValue(closing, "fiscalMachines");
  const invoiceIssued = closingValue(closing, "invoiceIssued");
  const invoiceDiff = closingValue(closing, "invoiceDifference");

  // Recalculations
  const cashExpected = openingAmount + systemCash + cashIn - cashOutflows;
  const cashFound = sangriaAmount + closingFloat;
  const cashDiff = cashFound - cashExpected;

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

  const isMachineChecked = (bankId: string) => {
    const m = machineChecks[bankId];
    const vals = bankVals[bankId] || { credit: 0, debit: 0, pix: 0 };
    const creditOk = vals.credit === 0 || Boolean(m?.credit);
    const debitOk = vals.debit === 0 || Boolean(m?.debit);
    const pixOk = vals.pix === 0 || Boolean(m?.pix);
    return creditOk && debitOk && pixOk;
  };

  const allMachinesChecked = displayBanks.length === 0 || displayBanks.every(b => isMachineChecked(b.id));
  const allChecked = Boolean(checks.cash) && allMachinesChecked;
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
      if (att.fileId && !att.fileId.startsWith("local-")) {
        await downloadFileFromDrive(att.fileId, att.fileName);
        return;
      }
      if (isValidDataUrl(att.dataUrl)) {
        const link = document.createElement("a");
        link.href = att.dataUrl;
        link.download = att.fileName || "comprovante.jpg";
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      alert("Comprovante sem arquivo disponível para download.");
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
        checksJson: JSON.stringify({
          cash: checks.cash,
          serviceFee: checks.serviceFee,
          credit: displayBanks.length > 0 && displayBanks.every(b => machineChecks[b.id]?.credit),
          debit: displayBanks.length > 0 && displayBanks.every(b => machineChecks[b.id]?.debit),
          pix: displayBanks.length > 0 && displayBanks.every(b => machineChecks[b.id]?.pix),
          machines: machineChecks,
        }),
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

        {/* Painel Executivo do Cenário Completo */}
        <div className="conf-scenario-grid">
          <div className="conf-scenario-card">
            <span className="label">Vendas Sistema (PDV)</span>
            <strong className="val">{currency(systemTotal)}</strong>
            <div className="conf-scenario-badge-box">
              <span className="conf-pill-neutral">Faturamento Bruto</span>
            </div>
            <small className="conf-scenario-sub">Registrado no PDV</small>
          </div>

          <div className="conf-scenario-card">
            <span className="label">Dinheiro Gaveta</span>
            <strong className="val">{brl(cashFound)}</strong>
            <div className="conf-scenario-badge-box">
              <Difference value={cashDiff} />
            </div>
            <small className="conf-scenario-sub">
              {sangriaAmount > 0 ? `Sangria: ${brl(sangriaAmount)}` : `Troco: ${brl(closingFloat)}`}
            </small>
          </div>

          <div className="conf-scenario-card">
            <span className="label">Cartões & PIX</span>
            <strong className="val">{brl(totalCreditFound + totalDebitFound + totalPixFound)}</strong>
            <div className="conf-scenario-badge-box">
              <Difference value={creditDiff + debitDiff + pixDiff} />
            </div>
            <small className="conf-scenario-sub">PDV: {brl(systemCredit + systemDebit + systemPix)}</small>
          </div>

          <div className="conf-scenario-card">
            <span className="label">Saídas da Gaveta</span>
            <strong className="val text-rose-600">{brl(cashOutflows)}</strong>
            <div className="conf-scenario-badge-box">
              <span className="conf-pill-rose">{outflowsList.length} saída(s)</span>
            </div>
            <small className="conf-scenario-sub">Abatido da gaveta</small>
          </div>

          <div className="conf-scenario-card">
            <span className="label">Solicitações de PIX</span>
            <strong className="val text-purple-600">{brl(pixRequestsTotal)}</strong>
            <div className="conf-scenario-badge-box">
              <span className="conf-pill-purple">{pixRequestsList.length} pedido(s)</span>
            </div>
            <small className="conf-scenario-sub">Contas a Pagar</small>
          </div>

          <div className={`conf-scenario-card highlight ${totalDiff === 0 ? "ok" : "bad"}`}>
            <span className="label">Divergência Total</span>
            <strong className="val">{currency(totalDiff)}</strong>
            <div className="conf-scenario-badge-box">
              <span className={`conf-pill-diff ${totalDiff === 0 ? "ok" : totalDiff > 0 ? "surplus" : "shortage"}`}>
                {totalDiff === 0 ? "✓ Caixa Batido" : totalDiff > 0 ? "Sobra de Caixa" : "Falta de Caixa"}
              </span>
            </div>
            <small className="conf-scenario-sub">{totalDiff === 0 ? "Sem divergência" : `Diferença de ${brl(Math.abs(totalDiff))}`}</small>
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
                return (
                  <div key={att.fileId} className="conf-att-item">
                    <AttachmentThumbnail att={att} onClick={() => setPreviewAttachment(att)} />
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
                  {displayBanks.map(b => {
                    const isAllOk = isMachineChecked(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`conf-machine-pill ${activeBankId === b.id ? "active" : ""}`}
                        onClick={() => setActiveBankId(b.id)}
                      >
                        <Landmark size={13} />
                        <span>{str(b, "name") || "Máquina"}</span>
                        {isAllOk && <Check size={12} className="text-emerald-500 font-bold ml-1" />}
                      </button>
                    );
                  })}
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
                <input
                  type="checkbox"
                  checked={machineChecks[activeBank.id]?.credit || false}
                  disabled={review}
                  onChange={e => toggleMachineCheck("credit", e.target.checked)}
                /> OK
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
                <input
                  type="checkbox"
                  checked={machineChecks[activeBank.id]?.debit || false}
                  disabled={review}
                  onChange={e => toggleMachineCheck("debit", e.target.checked)}
                /> OK
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
                <input
                  type="checkbox"
                  checked={machineChecks[activeBank.id]?.pix || false}
                  disabled={review}
                  onChange={e => toggleMachineCheck("pix", e.target.checked)}
                /> OK
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
          <h3>Revisão Consolidada de Máquinas / Cartões e Desconto de Taxas</h3>
          <p className="cash-hint-left">Todas as máquinas e contas bancárias com conferência de Crédito, Débito, PIX e taxas deduzidas automaticamente do saldo a creditar.</p>

          <div className="conf-consolidated-table-wrap mb-4 overflow-x-auto">
            <table className="mg-table conf-table-compact">
              <thead>
                <tr>
                  <th>Máquina / Banco</th>
                  <th style={{ textAlign: "right" }}>Crédito</th>
                  <th style={{ textAlign: "right" }}>Débito</th>
                  <th style={{ textAlign: "right" }}>PIX</th>
                  <th style={{ textAlign: "right" }}>Total Bruto</th>
                  <th style={{ textAlign: "right" }}>Taxas Est.</th>
                  <th style={{ textAlign: "right" }}>Líquido Creditar</th>
                </tr>
              </thead>
              <tbody>
                {bankCalculations.map(c => (
                  <tr key={c.bank.id} className={activeBankId === c.bank.id ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""}>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Landmark size={13} className="text-zinc-500 shrink-0" />
                        <strong>{str(c.bank, "name")}</strong>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span>{brl(c.vals.credit)}</span>
                      {c.creditPct > 0 && <small className="text-zinc-400 block text-[10px]">({c.creditPct}%)</small>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span>{brl(c.vals.debit)}</span>
                      {c.debitPct > 0 && <small className="text-zinc-400 block text-[10px]">({c.debitPct}%)</small>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span>{brl(c.vals.pix)}</span>
                      {c.pixPct > 0 && <small className="text-zinc-400 block text-[10px]">({c.pixPct}%)</small>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <strong>{brl(c.grossAmount)}</strong>
                    </td>
                    <td style={{ textAlign: "right" }} className="text-rose-600">
                      {c.totalFees > 0 ? `-${brl(c.totalFees)}` : "—"}
                    </td>
                    <td style={{ textAlign: "right" }} className="font-bold text-emerald-600">
                      {brl(c.netAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {(() => {
                  const totalFees = bankCalculations.reduce((s, c) => s + c.totalFees, 0);
                  const totalNet = bankCalculations.reduce((s, c) => s + c.netAmount, 0);
                  return (
                    <>
                      <tr className="conf-tfoot-row font-bold bg-zinc-50 dark:bg-zinc-800/60 border-t-2 border-zinc-300 dark:border-zinc-700">
                        <td>TOTAL MÁQUINAS</td>
                        <td style={{ textAlign: "right" }}>{brl(totalCreditFound)}</td>
                        <td style={{ textAlign: "right" }}>{brl(totalDebitFound)}</td>
                        <td style={{ textAlign: "right" }}>{brl(totalPixFound)}</td>
                        <td style={{ textAlign: "right" }}>{brl(totalCreditFound + totalDebitFound + totalPixFound)}</td>
                        <td style={{ textAlign: "right" }} className={totalFees > 0 ? "text-rose-600" : "text-zinc-400 font-normal"}>
                          {totalFees > 0 ? `-${brl(totalFees)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right" }} className="text-emerald-700 dark:text-emerald-400">
                          {brl(totalNet)}
                        </td>
                      </tr>
                      <tr className="conf-tfoot-row text-xs font-semibold bg-zinc-100/70 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300">
                        <td>SISTEMA (PDV)</td>
                        <td style={{ textAlign: "right" }}>{brl(systemCredit)}</td>
                        <td style={{ textAlign: "right" }}>{brl(systemDebit)}</td>
                        <td style={{ textAlign: "right" }}>{brl(systemPix)}</td>
                        <td style={{ textAlign: "right" }}>{brl(systemCredit + systemDebit + systemPix)}</td>
                        <td style={{ textAlign: "right" }} className="text-zinc-400 font-normal">—</td>
                        <td style={{ textAlign: "right" }} className="text-zinc-400 font-normal">—</td>
                      </tr>
                      <tr className="conf-tfoot-diff-row text-xs font-semibold bg-zinc-50 dark:bg-zinc-800/70 border-t border-zinc-200 dark:border-zinc-700">
                        <td>DIFERENÇA (MÁQ - PDV)</td>
                        <td style={{ textAlign: "right" }}><Difference value={creditDiff} /></td>
                        <td style={{ textAlign: "right" }}><Difference value={debitDiff} /></td>
                        <td style={{ textAlign: "right" }}><Difference value={pixDiff} /></td>
                        <td style={{ textAlign: "right" }}><Difference value={creditDiff + debitDiff + pixDiff} /></td>
                        <td style={{ textAlign: "right" }} className="text-zinc-400 font-normal">—</td>
                        <td style={{ textAlign: "right" }} className="text-zinc-400 font-normal">—</td>
                      </tr>
                    </>
                  );
                })()}
              </tfoot>
            </table>
          </div>

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

        {/* Painel de Saídas da Gaveta */}
        <section className="conf-card-section">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div>
              <h3 className="conf-section-title flex items-center gap-2">
                <Coins size={16} className="text-rose-600" />
                Saídas em Dinheiro da Gaveta ({outflowsList.length})
              </h3>
              <p className="text-xs text-zinc-500">Valores retirados em espécie pelo operador durante o turno que abateram do dinheiro da gaveta.</p>
            </div>
            {cashOutflows > 0 && (
              <span className="text-xs font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900">
                Total saídas: -{brl(cashOutflows)}
              </span>
            )}
          </div>
          {outflowsList.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
              Nenhuma saída em dinheiro da gaveta registrada pelo operador neste fechamento.
            </p>
          ) : (
            <div className="space-y-1.5">
              {outflowsList.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-[10px] font-bold flex items-center justify-center text-zinc-600 dark:text-zinc-300">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{item.name || "Saída sem descrição"}</span>
                  </div>
                  <strong className="text-rose-600 text-sm font-bold">-{brl(Number(item.amount || 0) * 100)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Painel de Solicitações de PIX */}
        <section className="conf-card-section">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div>
              <h3 className="conf-section-title flex items-center gap-2">
                <Zap size={16} className="text-purple-600" />
                Solicitações de PIX do Turno ({pixRequestsList.length})
              </h3>
              <p className="text-xs text-zinc-500">Pagamentos solicitados pela loja criados como débito no Contas a Pagar com a respectiva chave PIX.</p>
            </div>
            {pixRequestsTotal > 0 && (
              <span className="text-xs font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-900">
                Total PIX solicitado: {brl(pixRequestsTotal)}
              </span>
            )}
          </div>
          {pixRequestsList.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
              Nenhuma solicitação de PIX registrada para este turno.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {pixRequestsList.map((item, idx) => (
                <div key={item.id || idx} className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-sm text-purple-900 dark:text-purple-200 block">{item.name || "Favorecido"}</strong>
                      <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/60 px-1.5 py-0.5 rounded">
                        ⚡ Contas a Pagar
                      </span>
                    </div>
                    <strong className="text-base font-black text-purple-700 dark:text-purple-300">{brl(Number(item.amount || 0) * 100)}</strong>
                  </div>
                  {item.description && (
                    <p className="text-zinc-600 dark:text-zinc-400 text-xs italic bg-white/70 dark:bg-zinc-900/70 p-1.5 rounded-lg border border-purple-100 dark:border-purple-900">
                      Motivo: {item.description}
                    </p>
                  )}
                  {item.key && (
                    <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-2 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-1.5 truncate mr-2">
                        <KeyRound size={12} className="text-purple-600 shrink-0" />
                        <code className="text-purple-900 dark:text-purple-200 font-mono text-xs select-all truncate">{item.key}</code>
                      </div>
                      <button
                        type="button"
                        className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1 transition shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(item.key);
                          setCopiedPixId(item.id || String(idx));
                          setTimeout(() => setCopiedPixId(null), 2000);
                        }}
                      >
                        <Copy size={11} />
                        <span>{copiedPixId === (item.id || String(idx)) ? "Copiado!" : "Copiar"}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Painel de Auditoria Operacional */}
        {(motoboySystem > 0 || motoboyPaid > 0 || ifoodAudit > 0 || fiscalMachines > 0 || invoiceIssued > 0) && (
          <section className="conf-card-section">
            <h3 className="conf-section-title flex items-center gap-2 mb-2">
              <Bike size={16} className="text-amber-600" />
              Auditoria de Motoboys e Emissão Fiscal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5">
                <span className="font-bold text-zinc-800 dark:text-zinc-200 block text-xs">🏍️ Conferência de Motoboys</span>
                <div className="flex justify-between"><span>Taxas Geradas no PDV:</span> <b>{brl(motoboySystem)}</b></div>
                <div className="flex justify-between"><span>Pago aos Motoboys na Loja:</span> <b>{brl(motoboyPaid)}</b></div>
                <div className="flex justify-between pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                  <span>Diferença Motoboy:</span> <Difference value={motoboyDiff} />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5">
                <span className="font-bold text-zinc-800 dark:text-zinc-200 block text-xs">🧾 Conferência Fiscal / NFC-e</span>
                <div className="flex justify-between"><span>Vendas iFood (Relatório):</span> <b>{brl(ifoodAudit)}</b></div>
                <div className="flex justify-between"><span>Máquinas Fiscais (Cartão/PIX):</span> <b>{brl(fiscalMachines)}</b></div>
                <div className="flex justify-between"><span>NFC-e / Cupom Emitido:</span> <b>{brl(invoiceIssued)}</b></div>
                <div className="flex justify-between pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                  <span>Diferença Fiscal:</span> <Difference value={invoiceDiff} />
                </div>
              </div>
            </div>
          </section>
        )}

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

function ClosingDetailsModal({
  closing,
  onClose,
}: {
  closing: RecordData;
  onClose: () => void;
}) {
  const { data } = useManagement();
  const [previewAttachment, setPreviewAttachment] = useState<CashAttachment | null>(null);
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const unit = data.units.find(u => u.id === closing.unitId);
  const conference = data.cashConferences.find(
    c => c.closingId === closing.id || c.id === closing.conferenceId
  );
  const isConferred = Boolean(conference || closing.status === "Conferido");

  const outflows = useMemo(() => parseOutflows(closing.cashOutflowsJson), [closing.cashOutflowsJson]);
  const pixRequests = useMemo(() => parsePixRequests(closing.pixRequestsJson), [closing.pixRequestsJson]);
  const attachments = useMemo(() => parseAttachments(closing), [closing]);

  // Pillar calculations
  const systemCash = closingValue(closing, "systemCash");
  const systemCredit = closingValue(closing, "systemCredit");
  const systemDebit = closingValue(closing, "systemDebit");
  const systemPix = closingValue(closing, "systemPix");
  const systemServiceFee = closingValue(closing, "systemServiceFee");
  const otherSales = closingValue(closing, "systemIfoodOnline") + closingValue(closing, "systemIfoodVoucher") + closingValue(closing, "systemTerm") + closingValue(closing, "systemClub") + closingValue(closing, "systemAccrual");
  const systemTotal = systemCash + systemCredit + systemDebit + systemPix + systemServiceFee + otherSales;

  const openingAmount = closingValue(closing, "openingAmount");
  const cashIn = closingValue(closing, "cashIn");
  const cashOutflows = closingValue(closing, "cashOutflows");
  const sangriaAmount = closingValue(closing, "sangriaAmount");
  const closingFloat = closingValue(closing, "closingFloat");
  const cashExpected = closingValue(closing, "cashExpected") || (openingAmount + systemCash + cashIn - cashOutflows);
  const cashFound = closingValue(closing, "cashFound") || (sangriaAmount + closingFloat);
  const cashDiff = closingValue(closing, "cashDifference") || (cashFound - cashExpected);

  const creditFound = closingValue(closing, "creditFound");
  const creditDiff = closingValue(closing, "creditDifference");
  const debitFound = closingValue(closing, "debitFound");
  const debitDiff = closingValue(closing, "debitDifference");
  const pixFound = closingValue(closing, "pixFound");
  const pixDiff = closingValue(closing, "pixDifference");
  const totalDiff = closingValue(closing, "difference");

  const motoboySystem = closingValue(closing, "motoboySystem");
  const motoboyPaid = closingValue(closing, "motoboyPaid");
  const motoboyDiff = closingValue(closing, "motoboyDifference");
  const ifoodAudit = closingValue(closing, "ifoodAudit");
  const fiscalMachines = closingValue(closing, "fiscalMachines");
  const invoiceIssued = closingValue(closing, "invoiceIssued");
  const invoiceDiff = closingValue(closing, "invoiceDifference");

  const pixRequestsTotal = useMemo(
    () => pixRequests.reduce((sum, item) => sum + Math.round(Number(item.amount || 0) * 100), 0),
    [pixRequests]
  );

  // Bank machine calculations for ClosingDetailsModal
  const savedBankAmounts = useMemo(() => {
    if (conference?.reviewedBankAmountsJson) {
      try {
        const parsed = JSON.parse(String(conference.reviewedBankAmountsJson));
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) return parsed;
      } catch {}
    }
    return parseBankAmounts(closing);
  }, [conference, closing]);

  const bankCalculations = useMemo(() => {
    const bankEntries = Object.entries(savedBankAmounts);
    if (!bankEntries.length) return [];
    return bankEntries.map(([bankId, vals]: [string, any]) => {
      const bank = data.bankAccounts.find(b => b.id === bankId) || ({ id: bankId, name: "Máquina / Cartão" } as any);
      const credit = Number(vals?.credit || 0);
      const debit = Number(vals?.debit || 0);
      const pix = Number(vals?.pix || 0);
      const creditPct = Number(bank.creditFeePct || 0);
      const debitPct = Number(bank.debitFeePct || 0);
      const pixPct = Number(bank.pixFeePct || 0);
      const grossAmount = credit + debit + pix;
      const creditFee = Math.round(credit * (creditPct / 100));
      const debitFee = Math.round(debit * (debitPct / 100));
      const pixFee = Math.round(pix * (pixPct / 100));
      const totalFees = creditFee + debitFee + pixFee;
      const netAmount = grossAmount - totalFees;
      return {
        bank,
        vals: { credit, debit, pix },
        creditPct,
        debitPct,
        pixPct,
        grossAmount,
        creditFee,
        debitFee,
        pixFee,
        totalFees,
        netAmount,
      };
    });
  }, [savedBankAmounts, data.bankAccounts]);

  const downloadAttachment = async (att: CashAttachment) => {
    try {
      setDownloading(att.fileId);
      if (att.fileId && !att.fileId.startsWith("local-")) {
        await downloadFileFromDrive(att.fileId, att.fileName);
        return;
      }
      if (isValidDataUrl(att.dataUrl)) {
        const link = document.createElement("a");
        link.href = att.dataUrl;
        link.download = att.fileName || "comprovante.jpg";
        document.body.appendChild(link);
        link.click();
        link.remove();
        return;
      }
      alert("Comprovante sem arquivo disponível para download.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao baixar arquivo do Drive.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Modal title="Detalhamento do Fechamento de Caixa" onClose={onClose} wide>
      <div className="closing-details-view space-y-4">
        {/* Header Summary */}
        <div className="conf-summary-header">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="conf-tag">FECHAMENTO CONFERIDO</span>
                {isConferred && (
                  <span className="conf-conferred-badge">
                    <CheckCircle2 size={12} /> Conferência Concluída
                  </span>
                )}
                <span className="text-xs font-semibold text-zinc-500">
                  {unit?.name || "Unidade"}
                </span>
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {str(closing, "date").split("-").reverse().join("/")} · Turno {str(closing, "shift")}
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Operador: <strong>{str(closing, "operatorName") || "—"}</strong>
                {closing.conferredBy && (
                  <> · Conferido por: <strong>{String(closing.conferredBy)}</strong></>
                )}
                {closing.conferredAt && (
                  <> em <strong>{new Date(String(closing.conferredAt)).toLocaleDateString("pt-BR")} às {new Date(String(closing.conferredAt)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</strong></>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="cash-whatsapp-btn"
                title="Compartilhar no WhatsApp"
                onClick={() => {
                  const text = generateWhatsAppClosingText(closing, String(unit?.name || "Unidade"));
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                }}
              >
                <Share2 size={13} /> Compartilhar WhatsApp
              </button>
            </div>
          </div>
        </div>

        {/* 6 Executive Scenario Cards */}
        <div className="conf-scenario-grid">
          <div className="conf-scenario-card">
            <span className="label">Vendas Sistema (PDV)</span>
            <strong className="val">{currency(systemTotal)}</strong>
            <div className="conf-scenario-badge-box">
              <span className="conf-pill-neutral">Faturamento Bruto</span>
            </div>
            <small className="conf-scenario-sub">Registrado no PDV</small>
          </div>

          <div className="conf-scenario-card">
            <span className="label">Dinheiro Gaveta</span>
            <strong className="val">{brl(cashFound)}</strong>
            <div className="conf-scenario-badge-box">
              <Difference value={cashDiff} />
            </div>
            <small className="conf-scenario-sub">
              {sangriaAmount > 0 ? `Sangria: ${brl(sangriaAmount)}` : `Troco: ${brl(closingFloat)}`}
            </small>
          </div>

          <div className="conf-scenario-card">
            <span className="label">Cartões & PIX</span>
            <strong className="val">{brl(creditFound + debitFound + pixFound)}</strong>
            <div className="conf-scenario-badge-box">
              <Difference value={creditDiff + debitDiff + pixDiff} />
            </div>
            <small className="conf-scenario-sub">PDV: {brl(systemCredit + systemDebit + systemPix)}</small>
          </div>

          <div className="conf-scenario-card">
            <span className="label">Saídas da Gaveta</span>
            <strong className="val text-rose-600">{brl(cashOutflows)}</strong>
            <div className="conf-scenario-badge-box">
              <span className="conf-pill-rose">{outflows.length} saída(s)</span>
            </div>
            <small className="conf-scenario-sub">Abatido da gaveta</small>
          </div>

          <div className="conf-scenario-card">
            <span className="label">Solicitações de PIX</span>
            <strong className="val text-purple-600">{brl(pixRequestsTotal)}</strong>
            <div className="conf-scenario-badge-box">
              <span className="conf-pill-purple">{pixRequests.length} pedido(s)</span>
            </div>
            <small className="conf-scenario-sub">Contas a Pagar</small>
          </div>

          <div className={`conf-scenario-card highlight ${totalDiff === 0 ? "ok" : "bad"}`}>
            <span className="label">Divergência Total</span>
            <strong className="val">{currency(totalDiff)}</strong>
            <div className="conf-scenario-badge-box">
              <span className={`conf-pill-diff ${totalDiff === 0 ? "ok" : totalDiff > 0 ? "surplus" : "shortage"}`}>
                {totalDiff === 0 ? "✓ Caixa Batido" : totalDiff > 0 ? "Sobra de Caixa" : "Falta de Caixa"}
              </span>
            </div>
            <small className="conf-scenario-sub">{totalDiff === 0 ? "Sem divergência" : `Diferença de ${brl(Math.abs(totalDiff))}`}</small>
          </div>
        </div>

        {/* 4 Pillars Grid */}
        <div className="conf-pillars-container">
          <h3 className="conf-section-title mb-2">Confronto dos 4 Pilares (Sistema vs Contado)</h3>
          <div className="closing-pillars-grid">
            {/* Dinheiro */}
            <div className="closing-pillar-box">
              <div className="closing-pillar-head">
                <div className="flex items-center gap-2">
                  <Banknote size={15} className="text-emerald-600" />
                  <strong>1. Dinheiro Físico</strong>
                </div>
                <Difference value={cashDiff} />
              </div>
              <div className="closing-pillar-row">
                <span>Esperado (Gaveta)</span>
                <b>{brl(cashExpected)}</b>
              </div>
              <div className="closing-pillar-row">
                <span>Contado (Físico)</span>
                <b>{brl(cashFound)}</b>
              </div>
              <div className="conf-drawer-breakdown mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 space-y-1">
                <div className="flex justify-between"><span>Troco Inicial:</span> <span>{brl(openingAmount)}</span></div>
                <div className="flex justify-between"><span>Dinheiro PDV:</span> <span>{brl(systemCash)}</span></div>
                {cashIn > 0 && <div className="flex justify-between text-emerald-600"><span>Suprimentos:</span> <span>+{brl(cashIn)}</span></div>}
                {cashOutflows > 0 && <div className="flex justify-between text-rose-600"><span>Saídas Gaveta:</span> <span>-{brl(cashOutflows)}</span></div>}
                <div className="flex justify-between font-semibold text-purple-700"><span>Sangria:</span> <span>{brl(sangriaAmount)}</span></div>
                <div className="flex justify-between"><span>Troco Final:</span> <span>{brl(closingFloat)}</span></div>
              </div>
            </div>

            {/* Crédito */}
            <div className="closing-pillar-box">
              <div className="closing-pillar-head">
                <div className="flex items-center gap-2">
                  <CreditCard size={15} className="text-blue-600" />
                  <strong>2. Cartão Crédito</strong>
                </div>
                <Difference value={creditDiff} />
              </div>
              <div className="closing-pillar-row">
                <span>Sistema (PDV)</span>
                <b>{brl(systemCredit)}</b>
              </div>
              <div className="closing-pillar-row">
                <span>Máquinas</span>
                <b>{brl(creditFound)}</b>
              </div>
            </div>

            {/* Débito */}
            <div className="closing-pillar-box">
              <div className="closing-pillar-head">
                <div className="flex items-center gap-2">
                  <CreditCard size={15} className="text-amber-600" />
                  <strong>3. Cartão Débito</strong>
                </div>
                <Difference value={debitDiff} />
              </div>
              <div className="closing-pillar-row">
                <span>Sistema (PDV)</span>
                <b>{brl(systemDebit)}</b>
              </div>
              <div className="closing-pillar-row">
                <span>Máquinas</span>
                <b>{brl(debitFound)}</b>
              </div>
            </div>

            {/* PIX */}
            <div className="closing-pillar-box">
              <div className="closing-pillar-head">
                <div className="flex items-center gap-2">
                  <Zap size={15} className="text-purple-600" />
                  <strong>4. PIX Turno</strong>
                </div>
                <Difference value={pixDiff} />
              </div>
              <div className="closing-pillar-row">
                <span>Sistema (PDV)</span>
                <b>{brl(systemPix)}</b>
              </div>
              <div className="closing-pillar-row">
                <span>Máquinas / Conta</span>
                <b>{brl(pixFound)}</b>
              </div>
            </div>
          </div>
        </div>

        {/* Máquinas / Cartões Consolidado */}
        {bankCalculations.length > 0 && (
          <div className="conf-card-section">
            <h3 className="conf-section-title flex items-center gap-2 mb-2">
              <Landmark size={16} className="text-indigo-600" />
              Revisão Consolidada de Máquinas / Cartões e Taxas
            </h3>
            <div className="conf-consolidated-table-wrap overflow-x-auto">
              <table className="mg-table conf-table-compact">
                <thead>
                  <tr>
                    <th>Máquina / Banco</th>
                    <th style={{ textAlign: "right" }}>Crédito</th>
                    <th style={{ textAlign: "right" }}>Débito</th>
                    <th style={{ textAlign: "right" }}>PIX</th>
                    <th style={{ textAlign: "right" }}>Total Bruto</th>
                    <th style={{ textAlign: "right" }}>Taxas Est.</th>
                    <th style={{ textAlign: "right" }}>Líquido Creditar</th>
                  </tr>
                </thead>
                <tbody>
                  {bankCalculations.map(c => (
                    <tr key={c.bank.id}>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Landmark size={13} className="text-zinc-500 shrink-0" />
                          <strong>{str(c.bank, "name")}</strong>
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span>{brl(c.vals.credit)}</span>
                        {c.creditPct > 0 && <small className="text-zinc-400 block text-[10px]">({c.creditPct}%)</small>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span>{brl(c.vals.debit)}</span>
                        {c.debitPct > 0 && <small className="text-zinc-400 block text-[10px]">({c.debitPct}%)</small>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span>{brl(c.vals.pix)}</span>
                        {c.pixPct > 0 && <small className="text-zinc-400 block text-[10px]">({c.pixPct}%)</small>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{brl(c.grossAmount)}</strong>
                      </td>
                      <td style={{ textAlign: "right" }} className={c.totalFees > 0 ? "text-rose-600" : "text-zinc-400"}>
                        {c.totalFees > 0 ? `-${brl(c.totalFees)}` : "—"}
                      </td>
                      <td style={{ textAlign: "right" }} className="font-bold text-emerald-600">
                        {brl(c.netAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {(() => {
                    const totalCredit = bankCalculations.reduce((s, c) => s + c.vals.credit, 0);
                    const totalDebit = bankCalculations.reduce((s, c) => s + c.vals.debit, 0);
                    const totalPix = bankCalculations.reduce((s, c) => s + c.vals.pix, 0);
                    const totalFees = bankCalculations.reduce((s, c) => s + c.totalFees, 0);
                    const totalNet = bankCalculations.reduce((s, c) => s + c.netAmount, 0);
                    return (
                      <>
                        <tr className="conf-tfoot-row font-bold bg-zinc-50 dark:bg-zinc-800/60 border-t-2 border-zinc-300 dark:border-zinc-700">
                          <td>TOTAL MÁQUINAS</td>
                          <td style={{ textAlign: "right" }}>{brl(totalCredit)}</td>
                          <td style={{ textAlign: "right" }}>{brl(totalDebit)}</td>
                          <td style={{ textAlign: "right" }}>{brl(totalPix)}</td>
                          <td style={{ textAlign: "right" }}>{brl(totalCredit + totalDebit + totalPix)}</td>
                          <td style={{ textAlign: "right" }} className={totalFees > 0 ? "text-rose-600" : "text-zinc-400 font-normal"}>
                            {totalFees > 0 ? `-${brl(totalFees)}` : "—"}
                          </td>
                          <td style={{ textAlign: "right" }} className="text-emerald-700 dark:text-emerald-400">
                            {brl(totalNet)}
                          </td>
                        </tr>
                        <tr className="conf-tfoot-row text-xs font-semibold bg-zinc-100/70 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300">
                          <td>SISTEMA (PDV)</td>
                          <td style={{ textAlign: "right" }}>{brl(systemCredit)}</td>
                          <td style={{ textAlign: "right" }}>{brl(systemDebit)}</td>
                          <td style={{ textAlign: "right" }}>{brl(systemPix)}</td>
                          <td style={{ textAlign: "right" }}>{brl(systemCredit + systemDebit + systemPix)}</td>
                          <td style={{ textAlign: "right" }} className="text-zinc-400 font-normal">—</td>
                          <td style={{ textAlign: "right" }} className="text-zinc-400 font-normal">—</td>
                        </tr>
                        <tr className="conf-tfoot-diff-row text-xs font-semibold bg-zinc-50 dark:bg-zinc-800/70 border-t border-zinc-200 dark:border-zinc-700">
                          <td>DIFERENÇA (MÁQ - PDV)</td>
                          <td style={{ textAlign: "right" }}><Difference value={creditDiff} /></td>
                          <td style={{ textAlign: "right" }}><Difference value={debitDiff} /></td>
                          <td style={{ textAlign: "right" }}><Difference value={pixDiff} /></td>
                          <td style={{ textAlign: "right" }}><Difference value={creditDiff + debitDiff + pixDiff} /></td>
                          <td style={{ textAlign: "right" }} className="text-zinc-400 font-normal">—</td>
                          <td style={{ textAlign: "right" }} className="text-zinc-400 font-normal">—</td>
                        </tr>
                      </>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Saídas da Gaveta */}
        <div className="conf-card-section">
          <div className="flex items-center justify-between mb-2">
            <h3 className="conf-section-title flex items-center gap-2">
              <Coins size={16} className="text-rose-600" />
              Saídas em Dinheiro da Gaveta ({outflows.length})
            </h3>
            {cashOutflows > 0 && (
              <span className="text-xs font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900">
                Total: -{brl(cashOutflows)}
              </span>
            )}
          </div>
          {outflows.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg">
              Nenhuma saída em dinheiro da gaveta registrada pelo operador.
            </p>
          ) : (
            <div className="space-y-1.5">
              {outflows.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{item.name || "Saída sem descrição"}</span>
                  <strong className="text-rose-600">-{brl(Number(item.amount || 0) * 100)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Solicitações de PIX */}
        <div className="conf-card-section">
          <div className="flex items-center justify-between mb-2">
            <h3 className="conf-section-title flex items-center gap-2">
              <Zap size={16} className="text-purple-600" />
              Solicitações de PIX do Turno ({pixRequests.length})
            </h3>
            {pixRequestsTotal > 0 && (
              <span className="text-xs font-bold text-purple-700 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-900">
                Total: {brl(pixRequestsTotal)}
              </span>
            )}
          </div>
          {pixRequests.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg">
              Nenhuma solicitação de PIX registrada neste fechamento.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pixRequests.map((item, idx) => (
                <div key={item.id || idx} className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm text-purple-900 dark:text-purple-200">{item.name || "Favorecido"}</strong>
                    <strong className="text-sm font-bold text-purple-700 dark:text-purple-400">{brl(Number(item.amount || 0) * 100)}</strong>
                  </div>
                  {item.description && (
                    <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">{item.description}</p>
                  )}
                  {item.key && (
                    <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-1.5 rounded-lg border border-purple-100 dark:border-purple-800">
                      <code className="text-purple-800 dark:text-purple-300 font-mono text-[11px] select-all truncate max-w-[180px]">{item.key}</code>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-1 transition"
                        onClick={() => {
                          navigator.clipboard.writeText(item.key);
                          setCopiedPixId(item.id || String(idx));
                          setTimeout(() => setCopiedPixId(null), 2000);
                        }}
                      >
                        <Copy size={10} />
                        <span>{copiedPixId === (item.id || String(idx)) ? "Copiado!" : "Copiar"}</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auditoria Operacional (Motoboys e Fiscal) */}
        {(motoboySystem > 0 || motoboyPaid > 0 || ifoodAudit > 0 || fiscalMachines > 0 || invoiceIssued > 0) && (
          <div className="conf-card-section">
            <h3 className="conf-section-title flex items-center gap-2 mb-2">
              <Bike size={16} className="text-amber-600" />
              Auditoria de Motoboys e Emissão Fiscal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
                <span className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">🏍️ Motoboys</span>
                <div className="flex justify-between"><span>Sistema (Taxa Gerada):</span> <b>{brl(motoboySystem)}</b></div>
                <div className="flex justify-between"><span>Pago na Loja:</span> <b>{brl(motoboyPaid)}</b></div>
                <div className="flex justify-between pt-1 border-t border-zinc-200 dark:border-zinc-800">
                  <span>Diferença:</span> <Difference value={motoboyDiff} />
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
                <span className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">🧾 Notas Fiscais / NFC-e</span>
                <div className="flex justify-between"><span>iFood (Auditoria):</span> <b>{brl(ifoodAudit)}</b></div>
                <div className="flex justify-between"><span>Máquinas Fiscais:</span> <b>{brl(fiscalMachines)}</b></div>
                <div className="flex justify-between"><span>NFC-e Emitida:</span> <b>{brl(invoiceIssued)}</b></div>
                <div className="flex justify-between pt-1 border-t border-zinc-200 dark:border-zinc-800">
                  <span>Diferença:</span> <Difference value={invoiceDiff} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comprovantes */}
        <div className="conf-card-section">
          <h3 className="conf-section-title flex items-center gap-2 mb-2">
            <Paperclip size={16} className="text-purple-600" />
            Comprovantes Anexados ({attachments.length})
          </h3>
          {attachments.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-2 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg">
              Nenhum comprovante anexado a este fechamento.
            </p>
          ) : (
            <div className="conf-att-grid">
              {attachments.map(att => {
                return (
                  <div key={att.fileId} className="conf-att-item">
                    <AttachmentThumbnail att={att} onClick={() => setPreviewAttachment(att)} />
                    <div className="conf-att-meta">
                      <span className="conf-att-name" title={att.fileName}>{att.fileName}</span>
                      <small className="conf-att-size">{formatFileSize(att.size)}</small>
                    </div>
                    <div className="conf-att-actions">
                      <button type="button" className="conf-att-action-btn view" onClick={() => setPreviewAttachment(att)}>
                        <Eye size={11} /> Ver
                      </button>
                      <button type="button" className="conf-att-action-btn download" disabled={downloading === att.fileId} onClick={() => downloadAttachment(att)}>
                        <Download size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Parecer da Conferência e Observações */}
        {(closing.notes || closing.conferenceNotes || conference?.notes) && (
          <div className="conf-card-section p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2">
            {closing.notes && (
              <div>
                <span className="font-bold text-zinc-600 dark:text-zinc-400 block">Observação do Operador:</span>
                <p className="text-zinc-800 dark:text-zinc-200 mt-0.5 whitespace-pre-wrap">{str(closing, "notes")}</p>
              </div>
            )}
            {(closing.conferenceNotes || conference?.notes) && (
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 block">Parecer da Conferência Financeira:</span>
                <p className="text-zinc-800 dark:text-zinc-200 mt-0.5 whitespace-pre-wrap">
                  {str(closing, "conferenceNotes") || (conference ? str(conference, "notes") : "")}
                </p>
              </div>
            )}
          </div>
        )}

        <footer className="pt-2 flex justify-end">
          <button type="button" className="mg-button" onClick={onClose}>
            Fechar Detalhes
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

// History tab for motoboy audits and fiscal invoices (Fotos 1 e 2)
function AuditHistoryTab({
  closings,
  onViewClosing,
  isOperatorMode = false,
}: {
  closings: RecordData[];
  onViewClosing?: (closing: RecordData) => void;
  isOperatorMode?: boolean;
}) {
  const { data } = useManagement();
  const [subFilter, setSubFilter] = useState<"motoboy" | "fiscal" | "all" | "divergent">("motoboy");
  const [search, setSearch] = useState("");
  const [filterUnit, setFilterUnit] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<CashAttachment | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  useEffect(() => {
    const onRefresh = () => handleRefresh();
    window.addEventListener("refresh-cash-audit", onRefresh);
    return () => window.removeEventListener("refresh-cash-audit", onRefresh);
  }, []);

  // Filter closings by unit and search query
  const filtered = useMemo(() => {
    return closings.filter(c => {
      if (filterUnit && c.unitId !== filterUnit) return false;
      if (search) {
        const text = `${str(c, "operatorName")} ${str(c, "notes")} ${str(c, "date")}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [closings, filterUnit, search]);

  // Motoboy closings
  const motoboyItems = useMemo(() => {
    return filtered.filter(r => {
      const sys = closingValue(r, "motoboySystem");
      const paid = closingValue(r, "motoboyPaid");
      const diff = closingValue(r, "motoboyDifference");
      return sys > 0 || paid > 0 || diff !== 0;
    });
  }, [filtered]);

  // Fiscal closings
  const fiscalItems = useMemo(() => {
    return filtered.filter(r => {
      const ifood = closingValue(r, "ifoodAudit");
      const machines = closingValue(r, "fiscalMachines");
      const issued = closingValue(r, "invoiceIssued");
      const diff = closingValue(r, "invoiceDifference");
      return ifood > 0 || machines > 0 || issued > 0 || diff !== 0;
    });
  }, [filtered]);

  // Divergent closings
  const divergentItems = useMemo(() => {
    return filtered.filter(r => {
      const mDiff = closingValue(r, "motoboyDifference");
      const iDiff = closingValue(r, "invoiceDifference");
      return mDiff !== 0 || iDiff !== 0;
    });
  }, [filtered]);

  // All audit items
  const allAuditItems = useMemo(() => {
    return filtered.filter(r => {
      const sys = closingValue(r, "motoboySystem");
      const paid = closingValue(r, "motoboyPaid");
      const mDiff = closingValue(r, "motoboyDifference");
      const ifood = closingValue(r, "ifoodAudit");
      const machines = closingValue(r, "fiscalMachines");
      const issued = closingValue(r, "invoiceIssued");
      const iDiff = closingValue(r, "invoiceDifference");
      return sys > 0 || paid > 0 || mDiff !== 0 || ifood > 0 || machines > 0 || issued > 0 || iDiff !== 0;
    });
  }, [filtered]);

  // KPIs
  const totalMotoboyPaid = filtered.reduce((s, r) => s + closingValue(r, "motoboyPaid"), 0);
  const totalMotoboyDiff = filtered.reduce((s, r) => s + closingValue(r, "motoboyDifference"), 0);
  const totalInvoiceIssued = filtered.reduce((s, r) => s + closingValue(r, "invoiceIssued"), 0);
  const totalInvoiceDiff = filtered.reduce((s, r) => s + closingValue(r, "invoiceDifference"), 0);

  // Author & timestamp formatter (matching Foto 1 and Foto 2)
  const formatAuthorLaunch = (row: RecordData, unitFallback: string = "Unidade") => {
    const author = str(row, "operatorName") || unitFallback || "Operador";
    const ts = row.createdAt || row.updatedAt;
    let timeStr = "";
    if (ts) {
      try {
        const d = new Date(String(ts));
        if (!isNaN(d.getTime())) {
          const dayMonth = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
          const hoursMinutes = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
          timeStr = `${dayMonth}, ${hoursMinutes}`;
        }
      } catch {}
    }
    if (!timeStr && row.date) {
      const parts = String(row.date).split("-");
      if (parts.length === 3) timeStr = `${parts[2]}/${parts[1]}`;
    }
    return `LANÇADO POR ${author.toUpperCase()}${timeStr ? ` · ${timeStr}` : ""}`;
  };

  // Subtitle matching Foto 1 & Foto 2
  const getSubtitle = () => {
    if (subFilter === "motoboy") return "Histórico preservado para conferência.";
    if (subFilter === "fiscal") return "iFood, máquinas fiscais e nota emitida por dia.";
    if (subFilter === "divergent") return "Divergências identificadas para conferência e acerto operacional.";
    return "Histórico completo de motoboys e notas fiscais preservado para conferência.";
  };

  const renderMotoboyCard = (row: RecordData) => {
    const unit = data.units.find(u => u.id === row.unitId);
    const unitName = String(unit?.name || str(row, "operatorName") || "Unidade");
    const dateFormatted = str(row, "date").split("-").reverse().join("/");
    const motoboySystem = closingValue(row, "motoboySystem");
    const motoboyPaid = closingValue(row, "motoboyPaid");
    const motoboyDiff = closingValue(row, "motoboyDifference") || (motoboyPaid - motoboySystem);
    const attachments = parseAttachments(row);

    return (
      <article key={`motoboy-${row.id}`} className="cash-audit-card">
        <div className="cash-audit-card-main">
          <div className="cash-audit-card-info">
            <div className="cash-audit-card-title-row">
              <Bike size={20} className="text-zinc-600 dark:text-zinc-400 shrink-0" />
              <strong>Motoboys do dia</strong>
            </div>
            <span className="cash-audit-card-sub">
              {unitName} · {dateFormatted}{str(row, "shift") ? ` (${str(row, "shift")})` : ""}
            </span>
          </div>

          <div className="cash-audit-card-metrics">
            <div className="cash-audit-metric-col">
              <span className="label">Sistema</span>
              <strong className="val">{brl(motoboySystem)}</strong>
            </div>
            <div className="cash-audit-metric-col">
              <span className="label">Pago</span>
              <strong className="val">{brl(motoboyPaid)}</strong>
            </div>
            <div className="cash-audit-metric-col">
              <span className="label">Divergência</span>
              <strong className={`val ${motoboyDiff === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {brl(Math.abs(motoboyDiff))}
              </strong>
              <span className={`sub ${motoboyDiff === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {motoboyDiff === 0 ? "Conferido" : motoboyDiff > 0 ? "Pago a mais" : "Pago a menos"}
              </span>
            </div>
          </div>
        </div>

        <footer className="cash-audit-card-footer">
          <div className="cash-audit-author">
            <User size={13} className="text-zinc-500 shrink-0" />
            <span>{formatAuthorLaunch(row, unitName)}</span>
          </div>
          <div className="cash-audit-card-actions">
            {attachments.length > 0 && (
              <button
                type="button"
                className="cash-audit-att-btn"
                onClick={() => setPreviewAttachment(attachments[0])}
                title="Visualizar comprovante"
              >
                <Paperclip size={12} /> {attachments.length} anexo(s)
              </button>
            )}
            {onViewClosing && (
              <button
                type="button"
                className="cash-audit-view-btn"
                onClick={() => onViewClosing(row)}
                title="Ver detalhes do fechamento"
              >
                <Eye size={13} /> Ver Fechamento
              </button>
            )}
          </div>
        </footer>
      </article>
    );
  };

  const renderFiscalCard = (row: RecordData) => {
    const unit = data.units.find(u => u.id === row.unitId);
    const unitName = String(unit?.name || "House 190");
    const dateFormatted = str(row, "date").split("-").reverse().join("/");
    const ifoodAudit = closingValue(row, "ifoodAudit");
    const fiscalMachines = closingValue(row, "fiscalMachines");
    const invoiceIssued = closingValue(row, "invoiceIssued");
    const invoiceDiff = closingValue(row, "invoiceDifference") || (invoiceIssued - (ifoodAudit + fiscalMachines));
    const attachments = parseAttachments(row);

    return (
      <article key={`fiscal-${row.id}`} className="cash-audit-card">
        <div className="cash-audit-card-main">
          <div className="cash-audit-card-info">
            <div className="cash-audit-card-title-row">
              <FileText size={20} className="text-zinc-600 dark:text-zinc-400 shrink-0" />
              <strong>{unitName}</strong>
            </div>
            <span className="cash-audit-card-sub">
              {dateFormatted}{str(row, "shift") ? ` · Turno ${str(row, "shift")}` : ""}
            </span>
          </div>

          <div className="cash-audit-card-metrics">
            <div className="cash-audit-metric-col">
              <span className="label">iFood + Máquinas</span>
              <strong className="val">{brl(ifoodAudit + fiscalMachines)}</strong>
              <span className="sub">{brl(ifoodAudit)} + {brl(fiscalMachines)}</span>
            </div>
            <div className="cash-audit-metric-col">
              <span className="label">NF emitida</span>
              <strong className="val">{brl(invoiceIssued)}</strong>
            </div>
            <div className="cash-audit-metric-col">
              <span className="label">Divergência</span>
              <strong className={`val ${invoiceDiff === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {brl(Math.abs(invoiceDiff))}
              </strong>
              <span className={`sub ${invoiceDiff === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {invoiceDiff === 0 ? "Nota confere" : invoiceDiff > 0 ? "Sobra fiscal" : "Divergência fiscal"}
              </span>
            </div>
          </div>
        </div>

        <footer className="cash-audit-card-footer">
          <div className="cash-audit-author">
            <User size={13} className="text-zinc-500 shrink-0" />
            <span>{formatAuthorLaunch(row, unitName)}</span>
          </div>
          <div className="cash-audit-card-actions">
            {attachments.length > 0 && (
              <button
                type="button"
                className="cash-audit-att-btn"
                onClick={() => setPreviewAttachment(attachments[0])}
                title="Visualizar comprovante"
              >
                <Paperclip size={12} /> {attachments.length} anexo(s)
              </button>
            )}
            {onViewClosing && (
              <button
                type="button"
                className="cash-audit-view-btn"
                onClick={() => onViewClosing(row)}
                title="Ver detalhes do fechamento"
              >
                <Eye size={13} /> Ver Fechamento
              </button>
            )}
          </div>
        </footer>
      </article>
    );
  };

  const isEmpty =
    (subFilter === "motoboy" && motoboyItems.length === 0) ||
    (subFilter === "fiscal" && fiscalItems.length === 0) ||
    (subFilter === "divergent" && divergentItems.length === 0) ||
    (subFilter === "all" && allAuditItems.length === 0);

  return (
    <section className="cash-audit-history-section">
      {/* Header matching Fotos 1 e 2 */}
      <header className="cash-audit-header">
        <div>
          <h2>Últimas auditorias</h2>
          <p>{getSubtitle()}</p>
        </div>
        <button
          type="button"
          className="cash-audit-refresh-btn"
          onClick={handleRefresh}
          title="Atualizar dados de auditoria"
        >
          <RotateCw size={13} className={refreshing ? "animate-spin" : ""} />
          Atualizar
        </button>
      </header>

      {/* Subfilters bar */}
      <div className="cash-audit-subfilters">
        <button
          type="button"
          className={`cash-audit-filter-pill ${subFilter === "motoboy" ? "active" : ""}`}
          onClick={() => setSubFilter("motoboy")}
        >
          <Bike size={14} /> Motoboys do dia <b>{motoboyItems.length}</b>
        </button>
        <button
          type="button"
          className={`cash-audit-filter-pill ${subFilter === "fiscal" ? "active" : ""}`}
          onClick={() => setSubFilter("fiscal")}
        >
          <FileText size={14} /> Notas Fiscais <b>{fiscalItems.length}</b>
        </button>
        <button
          type="button"
          className={`cash-audit-filter-pill ${subFilter === "divergent" ? "active" : ""}`}
          onClick={() => setSubFilter("divergent")}
        >
          <AlertTriangle size={14} className="text-amber-500" /> Com Divergência <b>{divergentItems.length}</b>
        </button>
        <button
          type="button"
          className={`cash-audit-filter-pill ${subFilter === "all" ? "active" : ""}`}
          onClick={() => setSubFilter("all")}
        >
          Todos <b>{allAuditItems.length}</b>
        </button>

        <div className="cash-audit-filters">
          {!isOperatorMode && data.units.length > 1 && (
            <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)}>
              <option value="">Todas as unidades</option>
              {data.units.filter(u => !u.archived).map(u => (
                <option key={u.id} value={u.id}>{str(u, "name")}</option>
              ))}
            </select>
          )}
          <div className="cash-audit-search">
            <Search size={14} className="text-zinc-400" />
            <input
              placeholder="Buscar por operador ou data..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Contextual Minimalist Stats Strip */}
      <div className="cash-audit-stats-strip">
        {subFilter === "motoboy" && (
          <>
            <div className="cash-audit-stat-chip">
              <span className="label">Total Pago:</span>
              <strong>{brl(totalMotoboyPaid)}</strong>
            </div>
            <div className={`cash-audit-stat-chip ${totalMotoboyDiff === 0 ? "ok" : "bad"}`}>
              <span className="label">Divergência:</span>
              <strong>{brl(Math.abs(totalMotoboyDiff))}</strong>
              <span className="sub">
                ({totalMotoboyDiff === 0 ? "Conferido" : totalMotoboyDiff > 0 ? "Pago a mais" : "Pago a menos"})
              </span>
            </div>
          </>
        )}
        {subFilter === "fiscal" && (
          <>
            <div className="cash-audit-stat-chip">
              <span className="label">Total Emitido:</span>
              <strong>{brl(totalInvoiceIssued)}</strong>
            </div>
            <div className={`cash-audit-stat-chip ${totalInvoiceDiff === 0 ? "ok" : "bad"}`}>
              <span className="label">Divergência Fiscal:</span>
              <strong>{brl(Math.abs(totalInvoiceDiff))}</strong>
              <span className="sub">
                ({totalInvoiceDiff === 0 ? "Nota confere" : totalInvoiceDiff > 0 ? "Sobra fiscal" : "Divergência"})
              </span>
            </div>
          </>
        )}
        {subFilter === "divergent" && (
          <>
            <div className="cash-audit-stat-chip bad">
              <AlertTriangle size={13} className="text-amber-500" />
              <span className="label">Divergências Identificadas:</span>
              <strong>{divergentItems.length} registro(s)</strong>
            </div>
            {totalMotoboyDiff !== 0 && (
              <div className="cash-audit-stat-chip bad">
                <span className="label">Dif. Motoboys:</span>
                <strong>{brl(totalMotoboyDiff)}</strong>
              </div>
            )}
            {totalInvoiceDiff !== 0 && (
              <div className="cash-audit-stat-chip bad">
                <span className="label">Dif. Fiscal:</span>
                <strong>{brl(totalInvoiceDiff)}</strong>
              </div>
            )}
          </>
        )}
        {subFilter === "all" && (
          <>
            <div className="cash-audit-stat-chip">
              <span className="label">Motoboys Pago:</span>
              <strong>{brl(totalMotoboyPaid)}</strong>
            </div>
            <div className="cash-audit-stat-chip">
              <span className="label">Notas Emitidas:</span>
              <strong>{brl(totalInvoiceIssued)}</strong>
            </div>
            {(totalMotoboyDiff !== 0 || totalInvoiceDiff !== 0) && (
              <div className="cash-audit-stat-chip bad">
                <span className="label">Divergências:</span>
                <strong>{brl(totalMotoboyDiff + totalInvoiceDiff)}</strong>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cards List */}
      <div className="cash-audit-cards-list">
        {subFilter === "motoboy" && motoboyItems.map(renderMotoboyCard)}
        {subFilter === "fiscal" && fiscalItems.map(renderFiscalCard)}
        {subFilter === "divergent" && (
          <>
            {divergentItems.map(row => {
              const mDiff = closingValue(row, "motoboyDifference");
              const iDiff = closingValue(row, "invoiceDifference");
              return (
                <div key={`div-${row.id}`} className="space-y-3">
                  {mDiff !== 0 && renderMotoboyCard(row)}
                  {iDiff !== 0 && renderFiscalCard(row)}
                </div>
              );
            })}
          </>
        )}
        {subFilter === "all" && (
          <>
            {allAuditItems.map(row => {
              const hasM = closingValue(row, "motoboySystem") > 0 || closingValue(row, "motoboyPaid") > 0 || closingValue(row, "motoboyDifference") !== 0;
              const hasF = closingValue(row, "ifoodAudit") > 0 || closingValue(row, "fiscalMachines") > 0 || closingValue(row, "invoiceIssued") > 0 || closingValue(row, "invoiceDifference") !== 0;
              return (
                <div key={`all-${row.id}`} className="space-y-3">
                  {hasM && renderMotoboyCard(row)}
                  {hasF && renderFiscalCard(row)}
                </div>
              );
            })}
          </>
        )}

        {isEmpty && (
          <div className="cash-audit-empty">
            <FileText size={36} className="text-zinc-400 mb-2" />
            <strong className="text-zinc-700 dark:text-zinc-300">Nenhuma auditoria encontrada</strong>
            <p className="text-xs text-zinc-500 mt-1">Nenhum lançamento registrado para os filtros selecionados.</p>
          </div>
        )}
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

// Tab for recording and managing Sangrias (cash withdrawals from register)
function SangriasTab({
  closings,
  onViewClosing,
}: {
  closings: RecordData[];
  onViewClosing?: (closing: RecordData) => void;
}) {
  const { data } = useManagement();
  const { user } = useAuth();
  const [filterUnit, setFilterUnit] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRecipient, setEditRecipient] = useState<string>("");
  const [editStatus, setEditStatus] = useState<string>("Na loja");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // All closings with a positive sangria amount
  const allSangrias = useMemo(() => {
    return closings
      .filter(c => Number(c.sangriaAmount || 0) > 0)
      .sort((a, b) => str(b, "date").localeCompare(str(a, "date")));
  }, [closings]);

  const filteredSangrias = useMemo(() => {
    return allSangrias.filter(c => {
      if (filterUnit && c.unitId !== filterUnit) return false;
      const status = str(c, "sangriaStatus") || "Na loja";
      if (filterStatus !== "all") {
        if (filterStatus === "responsible" && status !== "Entregue a responsável") return false;
        if (filterStatus === "store" && status !== "Na loja") return false;
        if (filterStatus === "deposited" && status !== "Depositado") return false;
      }
      if (search) {
        const text = `${str(c, "sangriaRecipient")} ${str(c, "sangriaStatus")} ${str(c, "operatorName")} ${str(c, "date")} ${str(c, "notes")}`.toLowerCase();
        if (!text.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [allSangrias, filterUnit, filterStatus, search]);

  // Accumulated metrics
  const totalAccumulated = useMemo(() => {
    return filteredSangrias.reduce((sum, c) => sum + Number(c.sangriaAmount || 0), 0);
  }, [filteredSangrias]);

  const totalResponsible = useMemo(() => {
    return filteredSangrias
      .filter(c => (str(c, "sangriaStatus") || "") === "Entregue a responsável")
      .reduce((sum, c) => sum + Number(c.sangriaAmount || 0), 0);
  }, [filteredSangrias]);

  const totalInStore = useMemo(() => {
    return filteredSangrias
      .filter(c => (str(c, "sangriaStatus") || "Na loja") === "Na loja")
      .reduce((sum, c) => sum + Number(c.sangriaAmount || 0), 0);
  }, [filteredSangrias]);

  const totalDeposited = useMemo(() => {
    return filteredSangrias
      .filter(c => (str(c, "sangriaStatus") || "") === "Depositado")
      .reduce((sum, c) => sum + Number(c.sangriaAmount || 0), 0);
  }, [filteredSangrias]);

  const responsibleCount = useMemo(() => {
    return filteredSangrias.filter(c => (str(c, "sangriaStatus") || "") === "Entregue a responsável").length;
  }, [filteredSangrias]);

  const storeCount = useMemo(() => {
    return filteredSangrias.filter(c => (str(c, "sangriaStatus") || "Na loja") === "Na loja").length;
  }, [filteredSangrias]);

  const depositedCount = useMemo(() => {
    return filteredSangrias.filter(c => (str(c, "sangriaStatus") || "") === "Depositado").length;
  }, [filteredSangrias]);

  const startEditing = (row: RecordData) => {
    setEditingId(row.id);
    setEditRecipient(str(row, "sangriaRecipient") || "");
    setEditStatus(str(row, "sangriaStatus") || "Na loja");
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleSaveSangria = async (closing: RecordData) => {
    if (!user) return;
    setSavingId(closing.id);
    try {
      const now = new Date().toISOString();
      const updated: RecordData = {
        ...closing,
        sangriaRecipient: editRecipient.trim(),
        sangriaStatus: editStatus || str(closing, "sangriaStatus") || "Na loja",
        updatedAt: now,
        updatedBy: user.uid,
      };
      await commitRecords([updated], data, updated);
      setSuccessId(closing.id);
      setEditingId(null);
      setTimeout(() => setSuccessId(null), 3500);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao atualizar localização da sangria.");
    } finally {
      setSavingId(null);
    }
  };

  const quickSet = (recipient: string, status: string) => {
    setEditRecipient(recipient);
    setEditStatus(status);
  };

  return (
    <section className="cash-sangrias-section">
      <header className="cash-sangrias-header">
        <div>
          <span className="workspace-eyebrow">CONTROLE DE RETIRADAS E CAIXA FÍSICO</span>
          <h2>Registro e Controle de Sangrias</h2>
          <p>
            Histórico consolidado de todas as sangrias realizadas nas lojas. Acompanhe o valor acumulado e
            atualize em tempo real a localização de cada quantia (com responsável, no cofre ou depositado).
          </p>
        </div>
      </header>

      {/* KPI Cards: Valor Acumulado & Detalhamento */}
      <div className="cash-sangrias-metrics">
        <article className="cash-sangria-kpi hero">
          <div className="cash-sangria-kpi-icon gold">
            <Coins size={22} />
          </div>
          <div className="cash-sangria-kpi-content">
            <span className="cash-sangria-kpi-label">VALOR TOTAL ACUMULADO</span>
            <strong className="cash-sangria-kpi-value hero-val">{brl(totalAccumulated)}</strong>
            <span className="cash-sangria-kpi-sub">{filteredSangrias.length} sangria(s) registrada(s)</span>
          </div>
        </article>

        <article className="cash-sangria-kpi purple">
          <div className="cash-sangria-kpi-icon purple">
            <User size={20} />
          </div>
          <div className="cash-sangria-kpi-content">
            <span className="cash-sangria-kpi-label">COM RESPONSÁVEL</span>
            <strong className="cash-sangria-kpi-value">{brl(totalResponsible)}</strong>
            <span className="cash-sangria-kpi-sub">{responsibleCount} retirada(s) em posse</span>
          </div>
        </article>

        <article className="cash-sangria-kpi amber">
          <div className="cash-sangria-kpi-icon amber">
            <Store size={20} />
          </div>
          <div className="cash-sangria-kpi-content">
            <span className="cash-sangria-kpi-label">NO COFRE / LOJA</span>
            <strong className="cash-sangria-kpi-value">{brl(totalInStore)}</strong>
            <span className="cash-sangria-kpi-sub">{storeCount} guardada(s) na unidade</span>
          </div>
        </article>

        <article className="cash-sangria-kpi green">
          <div className="cash-sangria-kpi-icon green">
            <Landmark size={20} />
          </div>
          <div className="cash-sangria-kpi-content">
            <span className="cash-sangria-kpi-label">DEPOSITADO EM CONTA</span>
            <strong className="cash-sangria-kpi-value">{brl(totalDeposited)}</strong>
            <span className="cash-sangria-kpi-sub">{depositedCount} já liquidada(s) em banco</span>
          </div>
        </article>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="cash-sangrias-filter-bar">
        <div className="cash-sangrias-filter-pills">
          <button
            type="button"
            className={`cash-sangria-filter-pill ${filterStatus === "all" ? "active" : ""}`}
            onClick={() => setFilterStatus("all")}
          >
            Todas ({allSangrias.length})
          </button>
          <button
            type="button"
            className={`cash-sangria-filter-pill ${filterStatus === "responsible" ? "active" : ""}`}
            onClick={() => setFilterStatus("responsible")}
          >
            Com Responsável ({allSangrias.filter(c => (str(c, "sangriaStatus") || "") === "Entregue a responsável").length})
          </button>
          <button
            type="button"
            className={`cash-sangria-filter-pill ${filterStatus === "store" ? "active" : ""}`}
            onClick={() => setFilterStatus("store")}
          >
            No Cofre / Loja ({allSangrias.filter(c => (str(c, "sangriaStatus") || "Na loja") === "Na loja").length})
          </button>
          <button
            type="button"
            className={`cash-sangria-filter-pill ${filterStatus === "deposited" ? "active" : ""}`}
            onClick={() => setFilterStatus("deposited")}
          >
            Depositado ({allSangrias.filter(c => (str(c, "sangriaStatus") || "") === "Depositado").length})
          </button>
        </div>

        <div className="cash-sangrias-controls">
          <select
            value={filterUnit}
            onChange={e => setFilterUnit(e.target.value)}
            className="cash-sangrias-unit-select"
          >
            <option value="">Todas as Unidades</option>
            {data.units.filter(u => !u.archived).map(u => (
              <option key={u.id} value={u.id}>{str(u, "name")}</option>
            ))}
          </select>

          <div className="cash-sangrias-search">
            <Search size={14} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por responsável, operador, data..."
            />
          </div>
        </div>
      </div>

      {/* Lista de Cards de Sangria */}
      <div className="cash-sangrias-list">
        {filteredSangrias.map(row => {
          const unit = data.units.find(u => u.id === row.unitId);
          const unitName = String(unit?.name || row.unitId || "House 190");
          const dateFormatted = str(row, "date").split("-").reverse().join("/");
          const sangriaVal = Number(row.sangriaAmount || 0);
          const currentRecipient = str(row, "sangriaRecipient") || "";
          const currentStatus = str(row, "sangriaStatus") || "Na loja";
          const isRowConferred = isClosingConferred(row, data.cashConferences);
          const isEditing = editingId === row.id;
          const isSaving = savingId === row.id;
          const isSuccess = successId === row.id;

          return (
            <article key={row.id} className={`cash-sangria-card ${isEditing ? "editing" : ""}`}>
              <header className="cash-sangria-card-header">
                <div className="cash-sangria-card-meta">
                  <div className="cash-sangria-card-date-badge">
                    <Coins size={14} />
                    <span>{dateFormatted}</span>
                    <span className="cash-sangria-shift-tag">{str(row, "shift") || "Turno Único"}</span>
                  </div>
                  <strong className="cash-sangria-unit-title">{unitName}</strong>
                </div>

                <div className="cash-sangria-card-status-tags">
                  {isRowConferred ? (
                    <span className="difference-pill ok">
                      <CheckCircle2 size={12} /> Caixa conferido
                    </span>
                  ) : (
                    <span className="difference-pill shortage">
                      Aguardando conferência
                    </span>
                  )}
                </div>
              </header>

              <div className="cash-sangria-card-body">
                {/* Destaque do Valor */}
                <div className="cash-sangria-amount-panel">
                  <span className="cash-sangria-amount-title">VALOR DA SANGRIA</span>
                  <strong className="cash-sangria-amount-number">{brl(sangriaVal)}</strong>
                  <span className="cash-sangria-operator">
                    <User size={12} /> Operador: <b>{str(row, "operatorName") || "Não informado"}</b>
                  </span>
                </div>

                {/* Localização e Destino */}
                <div className="cash-sangria-location-panel">
                  {isEditing ? (
                    <div className="cash-sangria-edit-box">
                      <div className="cash-sangria-edit-header">
                        <MapPin size={15} className="text-purple-600" />
                        <strong>Atualizar Onde Está a Sangria</strong>
                      </div>

                      <div className="cash-sangria-edit-fields">
                        <div className="cash-sangria-edit-row">
                          <label className="cash-sangria-field-label">
                            <span>Situação / Destino</span>
                            <select
                              value={editStatus}
                              onChange={e => setEditStatus(e.target.value)}
                              className="cash-sangria-status-select"
                            >
                              <option value="Entregue a responsável">Entregue a responsável</option>
                              <option value="Na loja">Na loja (Cofre)</option>
                              <option value="Depositado">Depositado em conta</option>
                              <option value="Outro">Outro destino</option>
                            </select>
                          </label>

                          <label className="cash-sangria-field-label flex-1">
                            <span>Onde está / Com quem está</span>
                            <input
                              type="text"
                              value={editRecipient}
                              onChange={e => setEditRecipient(e.target.value)}
                              placeholder="Ex.: GLEUCE, No cofre da loja, Banco Santander..."
                              className="cash-sangria-recipient-input"
                              autoFocus
                            />
                          </label>
                        </div>

                        {/* Atalhos rápidos de 1 clique */}
                        <div className="cash-sangria-quick-bar">
                          <span className="cash-sangria-quick-label">Atalhos rápidos:</span>
                          <div className="cash-sangria-quick-chips">
                            <button
                              type="button"
                              className="cash-sangria-chip"
                              onClick={() => quickSet("GLEUCE", "Entregue a responsável")}
                            >
                              👤 GLEUCE
                            </button>
                            <button
                              type="button"
                              className="cash-sangria-chip"
                              onClick={() => quickSet("No cofre da loja", "Na loja")}
                            >
                              🏦 Cofre Loja
                            </button>
                            <button
                              type="button"
                              className="cash-sangria-chip"
                              onClick={() => quickSet("No cofre do escritório", "Entregue a responsável")}
                            >
                              🏢 Cofre Escritório
                            </button>
                            <button
                              type="button"
                              className="cash-sangria-chip"
                              onClick={() => quickSet("Depositado em conta bancária", "Depositado")}
                            >
                              💳 Depositado
                            </button>
                            <button
                              type="button"
                              className="cash-sangria-chip"
                              onClick={() => quickSet("Entregue ao gerente de turno", "Entregue a responsável")}
                            >
                              👔 Gerente
                            </button>
                          </div>
                        </div>

                        <div className="cash-sangria-edit-actions">
                          <button
                            type="button"
                            className="workspace-primary cash-sangria-save-btn"
                            disabled={isSaving}
                            onClick={() => handleSaveSangria(row)}
                          >
                            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            {isSaving ? "Salvando..." : "Salvar onde está"}
                          </button>
                          <button
                            type="button"
                            className="mg-button secondary cash-sangria-cancel-btn"
                            onClick={cancelEditing}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="cash-sangria-view-box">
                      <div className="cash-sangria-view-main">
                        <div className="cash-sangria-status-pill-badge">
                          {currentStatus === "Entregue a responsável" ? (
                            <span className="cash-sangria-badge-pill responsible">
                              <User size={13} /> Entregue a responsável
                            </span>
                          ) : currentStatus === "Depositado" ? (
                            <span className="cash-sangria-badge-pill deposited">
                              <Landmark size={13} /> Depositado em conta
                            </span>
                          ) : (
                            <span className="cash-sangria-badge-pill store">
                              <Store size={13} /> Na loja (Cofre)
                            </span>
                          )}
                        </div>

                        <div className="cash-sangria-recipient-showcase">
                          <div className="cash-sangria-loc-tag">
                            <MapPin size={15} className="text-purple-600 shrink-0" />
                            <span className="loc-label">Aonde está agora:</span>
                            <strong className="loc-val">{currentRecipient || "Local não informado"}</strong>
                          </div>
                          {isSuccess && (
                            <span className="cash-sangria-success-badge">
                              <Check size={13} /> Localização atualizada!
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="cash-sangria-edit-trigger-btn"
                        onClick={() => startEditing(row)}
                        title="Editar onde está esta sangria"
                      >
                        <Edit3 size={13} /> Editar localização
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <footer className="cash-sangria-card-footer">
                <div className="cash-sangria-footer-note">
                  {str(row, "notes") ? (
                    <span className="text-zinc-500 text-xs italic">
                      Obs.: {str(row, "notes")}
                    </span>
                  ) : (
                    <span className="text-zinc-400 text-xs">Sem observações adicionais</span>
                  )}
                </div>

                <div className="cash-sangria-footer-actions">
                  {onViewClosing && (
                    <button
                      type="button"
                      className="cash-audit-view-btn"
                      onClick={() => onViewClosing(row)}
                      title="Ver detalhes do fechamento de caixa completo"
                    >
                      <Eye size={13} /> Ver Fechamento
                    </button>
                  )}
                </div>
              </footer>
            </article>
          );
        })}

        {filteredSangrias.length === 0 && (
          <div className="people-empty">
            <Coins size={32} className="text-zinc-400" />
            <strong>Nenhuma sangria encontrada.</strong>
            <p className="text-xs text-zinc-500 mt-1">
              Ajuste os filtros de unidade, situação ou termo de busca acima.
            </p>
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

