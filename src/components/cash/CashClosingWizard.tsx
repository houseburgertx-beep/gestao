"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useManagement } from "@/contexts/ManagementContext";
import { useUnit } from "@/contexts/UnitContext";
import { useAuth } from "@/contexts/AuthContext";
import { dateToday, RecordData, str } from "@/domain/management/model";
import { commitRecords } from "@/services/managementService";
import { db } from "@/lib/firebase";
import {
  compressImageFile,
  createThumbnailDataUrl,
  formatFileSize,
  getFileBlobFromDrive,
  isImageFile,
  MAX_DRIVE_FILE_SIZE,
  nameFileForDrive,
  runWithConcurrency,
  uploadFileToDrive,
} from "@/services/driveService";
import { validate } from "@/domain/management/operations";
import {
  fetchTakeatCashierSummary,
  fetchTakeatIssuedInvoicesSummary,
  fetchTakeatMotoboySummary,
  TakeatCashierSummary,
  TakeatFiscalIssuedSummary,
  TakeatMotoboySummary,
} from "@/services/takeatService";
import { MotoboyBreakdownModal } from "./MotoboyBreakdownModal";
import {
  brl,
  CashAttachment,
  DRAFT_KEY,
  formatShortDate,
  isValidDataUrl,
  isValidPixKey,
  loadDraftData,
  MachineEntry,
  MAX_CLOSING_ATTACHMENTS,
  OutflowItem,
  parseAttachments,
  parseBankAmounts,
  parseOutflows,
  parsePixRequests,
  PixRequestItem,
  safeUUID,
  serializeSafeAttachments,
  toMoneyCents,
  toMoneyInput,
} from "./cashHelpers";

const wizardThumbCache = new Map<string, string>();

type StepId = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS: Array<{ id: StepId; label: string; shortLabel: string; subtitle: string }> = [
  { id: 1, label: "Turno e PDV", shortLabel: "PDV", subtitle: "Identifique o turno e confira os valores do sistema" },
  { id: 2, label: "Dinheiro na gaveta", shortLabel: "Gaveta", subtitle: "Confira o dinheiro físico, saídas, sangria e troco final" },
  { id: 3, label: "Maquininhas", shortLabel: "Máquinas", subtitle: "Informe os totais de crédito, débito e PIX de cada máquina" },
  { id: 4, label: "Auditoria", shortLabel: "Auditoria", subtitle: "Confronte os pagamentos de motoboys e notas fiscais emitidas" },
  { id: 5, label: "Extras e fotos", shortLabel: "Extras", subtitle: "Solicitações de PIX, comprovantes e observações do turno" },
  { id: 6, label: "Revisão final", shortLabel: "Revisão", subtitle: "Revise o resumo completo antes de enviar ao financeiro" },
];

function StatusPill({
  diff,
  zeroLabel = "Batido",
  size = "sm",
}: {
  diff: number;
  zeroLabel?: string;
  size?: "xs" | "sm";
}) {
  const pad = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  if (diff === 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-[7px] border font-medium tabular-nums ${pad} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-400`}
      >
        <Check size={12} strokeWidth={2.25} />
        {zeroLabel}
      </span>
    );
  }
  if (diff > 0) {
    return (
      <span
        className={`inline-flex items-center rounded-[7px] border font-medium tabular-nums ${pad} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300`}
      >
        +{brl(diff)}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-[7px] border font-medium tabular-nums ${pad} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-400`}
    >
      {brl(diff)}
    </span>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  placeholder = "0,00",
  hint,
  action,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  hint?: string;
  action?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
        {action}
      </div>
      <div className="relative flex items-center rounded-[10px] border border-zinc-200 bg-white transition focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-zinc-400 dark:focus-within:ring-zinc-400/15">
        <span className="pointer-events-none select-none pl-3 text-xs font-medium text-zinc-400">
          R$
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full bg-transparent pl-1.5 pr-3 text-[16px] font-medium tabular-nums text-zinc-900 outline-none placeholder:text-zinc-300 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:h-10 sm:text-sm dark:text-zinc-100 dark:placeholder:text-zinc-600"
        />
      </div>
      {hint && <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</p>}
    </div>
  );
}

function WizardAttachmentThumb({ att }: { att: CashAttachment }) {
  const isPdf = att.mimeType === "application/pdf" || att.fileName.toLowerCase().endsWith(".pdf");
  const validDataUrl = isValidDataUrl(att.dataUrl) ? att.dataUrl : undefined;

  const [imageUrl, setImageUrl] = useState<string>(() => {
    if (validDataUrl) return validDataUrl;
    if (att.fileId && wizardThumbCache.has(att.fileId)) return wizardThumbCache.get(att.fileId)!;
    return "";
  });

  useEffect(() => {
    if (isPdf || validDataUrl || imageUrl) return;
    if (!att.fileId || att.fileId.startsWith("local-")) return;
    if (wizardThumbCache.has(att.fileId)) {
      setImageUrl(wizardThumbCache.get(att.fileId)!);
      return;
    }

    let mounted = true;
    getFileBlobFromDrive(att.fileId)
      .then((res) => {
        wizardThumbCache.set(att.fileId, res.url);
        if (mounted) setImageUrl(res.url);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [att.fileId, isPdf, validDataUrl, imageUrl]);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded-[10px] border border-zinc-200 object-cover dark:border-zinc-700"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
      {isPdf ? <FileText size={16} /> : <ImageIcon size={16} />}
    </div>
  );
}

export function CashClosingWizard({
  initialClosing = null,
  onClose,
  onSaved,
}: {
  initialClosing?: RecordData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, tenantId, allowedUnit } = useManagement();
  const { currentUnit } = useUnit();
  const { user, userProfile } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [loadedClosing, setLoadedClosing] = useState<RecordData | null>(null);
  const activeTargetClosing = initialClosing || loadedClosing;

  const draft = useMemo(() => (!activeTargetClosing ? loadDraftData() : null), [activeTargetClosing]);
  const [hasDraft, setHasDraft] = useState(() => Boolean(draft));
  const [draftSavedMsg, setDraftSavedMsg] = useState("");
  const [step, setStep] = useState<StepId>(1);

  // Passo 1: Identificação
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
    const now = new Date();
    const bahiaHour = parseInt(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Bahia",
        hour: "2-digit",
        hour12: false,
      }).format(now),
      10
    );
    if (bahiaHour < 6) {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bahia",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(yesterday);
    }
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
      (c) =>
        !c.archived &&
        c.unitId === unit &&
        str(c, "date") === date &&
        (str(c, "shift") || "Único") === shift
    );
  }, [activeTargetClosing, data.cashClosings, unit, date, shift]);

  // Passo 1: Vendas PDV
  const [systemCash, setSystemCash] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemCash) : draft?.systemCash || ""
  );
  const [systemCredit, setSystemCredit] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemCredit) : draft?.systemCredit || ""
  );
  const [systemDebit, setSystemDebit] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemDebit) : draft?.systemDebit || ""
  );
  const [systemPix, setSystemPix] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemPix) : draft?.systemPix || ""
  );
  const [systemServiceFee, setSystemServiceFee] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemServiceFee) : draft?.systemServiceFee || ""
  );
  const [showOtherChannels, setShowOtherChannels] = useState(() => {
    if (initialClosing) {
      return Boolean(
        initialClosing.systemIfoodOnline ||
          initialClosing.systemIfoodVoucher ||
          initialClosing.systemTerm ||
          initialClosing.systemClub ||
          initialClosing.systemAccrual
      );
    }
    return Boolean(draft?.showOtherChannels);
  });
  const [systemIfoodOnline, setSystemIfoodOnline] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemIfoodOnline) : draft?.systemIfoodOnline || ""
  );
  const [systemIfoodVoucher, setSystemIfoodVoucher] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemIfoodVoucher) : draft?.systemIfoodVoucher || ""
  );
  const [systemTerm, setSystemTerm] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemTerm) : draft?.systemTerm || ""
  );
  const [systemClub, setSystemClub] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemClub) : draft?.systemClub || ""
  );
  const [systemAccrual, setSystemAccrual] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.systemAccrual) : draft?.systemAccrual || ""
  );

  // Passo 2: Dinheiro e Gaveta
  const [openingAmount, setOpeningAmount] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.openingAmount) : draft?.openingAmount || ""
  );
  const [cashIn, setCashIn] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.cashIn) : draft?.cashIn || ""
  );
  const [sangriaAmount, setSangriaAmount] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.sangriaAmount) : draft?.sangriaAmount || ""
  );
  const [sangriaStatus, setSangriaStatus] = useState(() =>
    initialClosing ? str(initialClosing, "sangriaStatus") || "Na loja" : draft?.sangriaStatus || "Na loja"
  );
  const [sangriaRecipient, setSangriaRecipient] = useState(() =>
    initialClosing ? str(initialClosing, "sangriaRecipient") || "" : draft?.sangriaRecipient || ""
  );
  const [closingFloat, setClosingFloat] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.closingFloat) : draft?.closingFloat || ""
  );
  const [outflows, setOutflows] = useState<OutflowItem[]>(() => {
    if (initialClosing) return parseOutflows(initialClosing.cashOutflowsJson);
    if (Array.isArray(draft?.outflows)) return draft.outflows;
    return [];
  });

  // Passo 3: Maquininhas
  const banks = useMemo(
    () => data.bankAccounts.filter((row) => !row.archived && row.unitId === unit),
    [data.bankAccounts, unit]
  );

  const [machines, setMachines] = useState<Record<string, MachineEntry>>(() => {
    if (initialClosing) {
      const saved = parseBankAmounts(initialClosing);
      const res: Record<string, MachineEntry> = {};
      Object.entries(saved).forEach(([bId, v]) => {
        res[bId] = {
          used: true,
          credit: v.credit ? String(v.credit / 100) : "",
          debit: v.debit ? String(v.debit / 100) : "",
          pix: v.pix ? String(v.pix / 100) : "",
        };
      });
      return res;
    }
    if (draft?.machines && typeof draft.machines === "object") return draft.machines;
    return {};
  });

  useEffect(() => {
    setMachines((prev) => {
      const next: Record<string, MachineEntry> = {};
      banks.forEach((b) => {
        next[b.id] = prev[b.id] || { used: false, credit: "", debit: "", pix: "" };
      });
      return next;
    });
  }, [banks]);

  // Passo 4: Auditoria (Motoboys e Fiscal)
  const [motoboySystem, setMotoboySystem] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.motoboySystem) : draft?.motoboySystem || ""
  );
  const [motoboyPaid, setMotoboyPaid] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.motoboyPaid) : draft?.motoboyPaid || ""
  );
  const [ifoodAudit, setIfoodAudit] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.ifoodAudit) : draft?.ifoodAudit || ""
  );
  const [fiscalMachines, setFiscalMachines] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.fiscalMachines) : draft?.fiscalMachines || ""
  );
  const [invoiceIssued, setInvoiceIssued] = useState(() =>
    initialClosing ? toMoneyInput(initialClosing.invoiceIssued) : draft?.invoiceIssued || ""
  );

  // Passo 5: PIX, Comprovantes e Observações
  const [pixRequests, setPixRequests] = useState<PixRequestItem[]>(() => {
    if (initialClosing) return parsePixRequests(initialClosing.pixRequestsJson);
    if (Array.isArray(draft?.pixRequests)) return draft.pixRequests;
    return [];
  });
  const [notes, setNotes] = useState(() =>
    initialClosing ? str(initialClosing, "notes") : draft?.notes || ""
  );
  const [existingAttachments, setExistingAttachments] = useState<CashAttachment[]>(() =>
    initialClosing ? parseAttachments(initialClosing) : []
  );
  const [newFiles, setNewFiles] = useState<
    Array<{ file: File; previewUrl: string; dataUrl: string; size: number }>
  >([]);
  const [compressingFiles, setCompressingFiles] = useState(false);

  // Integração Takeat (Caixa, Fiscal e Motoboys)
  const [takeatCashierLoading, setTakeatCashierLoading] = useState(false);
  const [takeatCashierData, setTakeatCashierData] = useState<TakeatCashierSummary | null>(null);
  const [takeatCashierError, setTakeatCashierError] = useState<string | null>(null);
  const [takeatFiscalLoading, setTakeatFiscalLoading] = useState(false);
  const [takeatFiscalData, setTakeatFiscalData] = useState<TakeatFiscalIssuedSummary | null>(null);
  const [takeatFiscalError, setTakeatFiscalError] = useState<string | null>(null);
  const [takeatMotoboyLoading, setTakeatMotoboyLoading] = useState(false);
  const [takeatMotoboyData, setTakeatMotoboyData] = useState<TakeatMotoboySummary | null>(null);
  const [takeatMotoboyError, setTakeatMotoboyError] = useState<string | null>(null);
  const [motoboyModalOpen, setMotoboyModalOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [error, setError] = useState("");

  const handleSyncTakeatMotoboys = async (
    forceApply: boolean = false,
    shiftInfo?: { openedAt?: string; closedAt?: string | null }
  ) => {
    if (!unit || unit === "all" || unit === "central" || !date) return;
    setTakeatMotoboyLoading(true);
    setTakeatMotoboyError(null);
    try {
      const shiftRange =
        shiftInfo ||
        (takeatCashierData?.opening
          ? {
              openedAt: takeatCashierData.opening.opened_at,
              closedAt: takeatCashierData.opening.closed_at,
            }
          : undefined);
      const summary = await fetchTakeatMotoboySummary(unit, date, shiftRange);
      setTakeatMotoboyData(summary);
      if (forceApply || !motoboySystem || Number(motoboySystem) === 0) {
        setMotoboySystem(toMoneyInput(Math.round(summary.totalTax * 100)));
      }
    } catch (err: any) {
      setTakeatMotoboyError(err?.message || "Não foi possível consultar motoboys na Takeat.");
    } finally {
      setTakeatMotoboyLoading(false);
    }
  };

  const handleSyncTakeatFiscal = async (
    forceApply: boolean = false,
    shiftInfo?: { openedAt?: string; closedAt?: string | null }
  ) => {
    if (!unit || unit === "all" || unit === "central" || !date) return;
    setTakeatFiscalLoading(true);
    setTakeatFiscalError(null);
    try {
      const shiftRange =
        shiftInfo ||
        (takeatCashierData?.opening
          ? {
              openedAt: takeatCashierData.opening.opened_at,
              closedAt: takeatCashierData.opening.closed_at,
            }
          : undefined);
      const summary = await fetchTakeatIssuedInvoicesSummary(unit as any, date, undefined, shiftRange);
      setTakeatFiscalData(summary);
      if (forceApply || !invoiceIssued || Number(invoiceIssued) === 0) {
        setInvoiceIssued(toMoneyInput(Math.round(summary.totalIssued * 100)));
      }
    } catch (err: any) {
      setTakeatFiscalError(err?.message || "Não foi possível consultar notas na Takeat.");
    } finally {
      setTakeatFiscalLoading(false);
    }
  };

  const handleSyncTakeatCashier = async (forceApply: boolean = false) => {
    if (!unit || unit === "all" || unit === "central" || !date) return;
    setTakeatCashierLoading(true);
    setTakeatCashierError(null);
    try {
      const summary = await fetchTakeatCashierSummary(unit as any, date);
      setTakeatCashierData(summary);

      const { mapped } = summary;
      const shouldFill = (current: string) => forceApply || !current || Number(current) === 0;

      if (shouldFill(systemCash)) setSystemCash(toMoneyInput(Math.round(mapped.systemCash * 100)));
      if (shouldFill(systemCredit)) setSystemCredit(toMoneyInput(Math.round(mapped.systemCredit * 100)));
      if (shouldFill(systemDebit)) setSystemDebit(toMoneyInput(Math.round(mapped.systemDebit * 100)));
      if (shouldFill(systemPix)) setSystemPix(toMoneyInput(Math.round(mapped.systemPix * 100)));
      if (shouldFill(systemServiceFee)) setSystemServiceFee(toMoneyInput(Math.round(mapped.systemServiceFee * 100)));
      if (shouldFill(systemIfoodOnline)) setSystemIfoodOnline(toMoneyInput(Math.round(mapped.systemIfoodOnline * 100)));
      if (shouldFill(systemIfoodVoucher)) setSystemIfoodVoucher(toMoneyInput(Math.round(mapped.systemIfoodVoucher * 100)));
      if (shouldFill(systemTerm)) setSystemTerm(toMoneyInput(Math.round(mapped.systemTerm * 100)));
      if (shouldFill(systemClub)) setSystemClub(toMoneyInput(Math.round(mapped.systemClub * 100)));

      if (
        mapped.systemIfoodOnline > 0 ||
        mapped.systemIfoodVoucher > 0 ||
        mapped.systemTerm > 0 ||
        mapped.systemClub > 0
      ) {
        setShowOtherChannels(true);
      }

      if (shouldFill(openingAmount)) setOpeningAmount(toMoneyInput(Math.round(mapped.openingAmount * 100)));
      if (shouldFill(cashIn)) setCashIn(toMoneyInput(Math.round(mapped.cashIn * 100)));
      if (shouldFill(sangriaAmount)) {
        setSangriaAmount(mapped.sangriaAmount > 0 ? toMoneyInput(Math.round(mapped.sangriaAmount * 100)) : "");
      }

      if (mapped.outflows && mapped.outflows.length > 0) {
        const canFillOutflows =
          forceApply ||
          outflows.length === 0 ||
          outflows.every((o) => !o.name.trim() && (!o.amount || Number(o.amount) === 0));
        if (canFillOutflows) {
          setOutflows(
            mapped.outflows.map((o) => ({
              id: safeUUID(),
              name: o.name,
              amount: o.amount.toFixed(2),
            }))
          );
        }
      }

      const shiftRange = {
        openedAt: summary.opening.opened_at,
        closedAt: summary.opening.closed_at,
      };
      handleSyncTakeatFiscal(forceApply, shiftRange);
      handleSyncTakeatMotoboys(forceApply, shiftRange);
    } catch (err: any) {
      setTakeatCashierError(err?.message || "Não foi possível consultar o caixa no PDV Takeat.");
      handleSyncTakeatFiscal(forceApply);
      handleSyncTakeatMotoboys(forceApply);
    } finally {
      setTakeatCashierLoading(false);
    }
  };

  useEffect(() => {
    if (!initialClosing && unit && unit !== "all" && unit !== "central" && date) {
      handleSyncTakeatCashier(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, date, initialClosing]);

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
    const res: Record<string, MachineEntry> = {};
    Object.entries(saved).forEach(([bId, v]) => {
      res[bId] = {
        used: true,
        credit: v.credit ? String(v.credit / 100) : "",
        debit: v.debit ? String(v.debit / 100) : "",
        pix: v.pix ? String(v.pix / 100) : "",
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
    setError("");
  };

  const handleAddFiles = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;
    const remaining = MAX_CLOSING_ATTACHMENTS - (existingAttachments.length + newFiles.length);
    if (remaining <= 0) {
      setError(`Limite máximo de ${MAX_CLOSING_ATTACHMENTS} comprovantes atingido.`);
      return;
    }
    const toProcess = incoming.slice(0, remaining);
    setError("");
    setCompressingFiles(true);
    try {
      const skippedErrors: string[] = [];
      const processed: Array<{ file: File; previewUrl: string; dataUrl: string; size: number }> = [];
      for (const file of toProcess) {
        if (!file || file.size === 0) {
          skippedErrors.push(`"${file?.name || "arquivo"}" está vazio.`);
          continue;
        }
        if (isImageFile(file)) {
          const comp = await compressImageFile(file, 1400, 0.72);
          if (comp.size > MAX_DRIVE_FILE_SIZE) {
            skippedErrors.push(`"${file.name}" excede o limite de 8 MB mesmo após compactação.`);
            continue;
          }
          processed.push({
            file: comp.file,
            previewUrl:
              comp.dataUrl || (typeof window !== "undefined" ? URL.createObjectURL(comp.file) : ""),
            dataUrl: comp.dataUrl,
            size: comp.size,
          });
        } else {
          if (file.size > MAX_DRIVE_FILE_SIZE) {
            skippedErrors.push(`"${file.name}" excede o limite de 8 MB.`);
            continue;
          }
          processed.push({
            file,
            previewUrl: typeof window !== "undefined" ? URL.createObjectURL(file) : "",
            dataUrl: "",
            size: file.size,
          });
        }
      }
      if (processed.length > 0) {
        setNewFiles((prev) => [...prev, ...processed]);
      }
      if (skippedErrors.length > 0) {
        setError(skippedErrors.join(" "));
      } else if (incoming.length > remaining) {
        setError(`Apenas ${remaining} arquivo(s) foram adicionados (limite máximo de ${MAX_CLOSING_ATTACHMENTS}).`);
      }
    } finally {
      setCompressingFiles(false);
    }
  };

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
    setMachines((prev) => {
      const clean: Record<string, MachineEntry> = {};
      Object.keys(prev).forEach((k) => {
        clean[k] = { used: false, credit: "", debit: "", pix: "" };
      });
      return clean;
    });
    setPixRequests([]);
    setMotoboySystem("");
    setMotoboyPaid("");
    setIfoodAudit("");
    setFiscalMachines("");
    setInvoiceIssued("");
    setNotes("");
    setError("");
  };

  const buildDraftObj = () => ({
    unit,
    date,
    shift,
    operatorName,
    systemCash,
    systemCredit,
    systemDebit,
    systemPix,
    systemServiceFee,
    showOtherChannels,
    systemIfoodOnline,
    systemIfoodVoucher,
    systemTerm,
    systemClub,
    systemAccrual,
    openingAmount,
    cashIn,
    sangriaAmount,
    sangriaStatus,
    sangriaRecipient,
    closingFloat,
    outflows,
    machines,
    pixRequests,
    motoboySystem,
    motoboyPaid,
    ifoodAudit,
    fiscalMachines,
    invoiceIssued,
    notes,
    savedAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  });

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraftObj()));
      setDraftSavedMsg("Rascunho salvo");
      setHasDraft(true);
      setTimeout(() => setDraftSavedMsg(""), 2500);
    } catch {
      setDraftSavedMsg("Erro ao salvar");
    }
  };

  useEffect(() => {
    if (initialClosing) return;
    const timer = setTimeout(() => {
      try {
        const hasContent = Boolean(
          systemCash ||
            systemCredit ||
            systemDebit ||
            systemPix ||
            systemServiceFee ||
            openingAmount ||
            closingFloat ||
            outflows.length ||
            Object.values(machines).some((m) => m.used) ||
            pixRequests.length ||
            motoboySystem ||
            motoboyPaid ||
            ifoodAudit ||
            fiscalMachines ||
            invoiceIssued ||
            notes
        );
        if (hasContent) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(buildDraftObj()));
        }
      } catch {}
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialClosing,
    unit,
    date,
    shift,
    operatorName,
    systemCash,
    systemCredit,
    systemDebit,
    systemPix,
    systemServiceFee,
    showOtherChannels,
    systemIfoodOnline,
    systemIfoodVoucher,
    systemTerm,
    systemClub,
    systemAccrual,
    openingAmount,
    cashIn,
    sangriaAmount,
    sangriaStatus,
    sangriaRecipient,
    closingFloat,
    outflows,
    machines,
    pixRequests,
    motoboySystem,
    motoboyPaid,
    ifoodAudit,
    fiscalMachines,
    invoiceIssued,
    notes,
  ]);

  // Cálculos em centavos
  const cSysCash = toMoneyCents(systemCash);
  const cSysCredit = toMoneyCents(systemCredit);
  const cSysDebit = toMoneyCents(systemDebit);
  const cSysPix = toMoneyCents(systemPix);
  const cSysServiceFee = toMoneyCents(systemServiceFee);
  const cOther =
    toMoneyCents(systemIfoodOnline) +
    toMoneyCents(systemIfoodVoucher) +
    toMoneyCents(systemTerm) +
    toMoneyCents(systemClub) +
    toMoneyCents(systemAccrual);
  const cSysTotal = cSysCash + cSysCredit + cSysDebit + cSysPix + cSysServiceFee + cOther;

  const cOpening = toMoneyCents(openingAmount);
  const cCashIn = toMoneyCents(cashIn);
  const cSangria = toMoneyCents(sangriaAmount);
  const cClosingFloat = toMoneyCents(closingFloat);
  const cOutflows = outflows.reduce((sum, r) => sum + toMoneyCents(r.amount), 0);
  const cCashExpected = cOpening + cSysCash + cCashIn - cOutflows;
  const cCashFound = cSangria + cClosingFloat;
  const cCashDiff = cCashFound - cCashExpected;

  let cCreditFound = 0;
  let cDebitFound = 0;
  let cPixFound = 0;
  let usedMachinesCount = 0;
  Object.values(machines).forEach((m) => {
    if (m.used) {
      usedMachinesCount++;
      cCreditFound += toMoneyCents(m.credit);
      cDebitFound += toMoneyCents(m.debit);
      cPixFound += toMoneyCents(m.pix);
    }
  });

  const cCreditDiff = cCreditFound - cSysCredit;
  const cDebitDiff = cDebitFound - cSysDebit;
  const cPixDiff = cPixFound - cSysPix;
  const cTotalConfirmed = cCashFound + cCreditFound + cDebitFound + cPixFound;
  const cTotalDiff = cCashDiff + cCreditDiff + cDebitDiff + cPixDiff;

  const cMotoboySystem = toMoneyCents(motoboySystem);
  const cMotoboyPaid = toMoneyCents(motoboyPaid);
  const cMotoboyDiff = cMotoboyPaid - cMotoboySystem;

  const cIfoodAudit = toMoneyCents(ifoodAudit);
  const cFiscalMachines = toMoneyCents(fiscalMachines);
  const cInvoiceIssued = toMoneyCents(invoiceIssued);
  const cInvoiceBase = cIfoodAudit + cFiscalMachines;
  const cInvoiceDiff = cInvoiceBase - cInvoiceIssued;

  const activePixRequests = pixRequests.filter(
    (item) =>
      item.name.trim() ||
      item.key.trim() ||
      item.description.trim() ||
      toMoneyCents(item.amount) > 0
  );
  const cPixRequestsTotal = activePixRequests.reduce((sum, item) => sum + toMoneyCents(item.amount), 0);
  const totalAttachmentsCount = existingAttachments.length + newFiles.length;

  const unitName = useMemo(() => {
    const found = data.units.find((u) => u.id === unit);
    return found ? str(found, "name") : unit || "Sem unidade";
  }, [data.units, unit]);

  // Pendências de validação para exibição clara no Passo 6
  const validationIssues = useMemo(() => {
    const issues: Array<{ step: StepId; text: string }> = [];
    if (!unit) issues.push({ step: 1, text: "Selecione a unidade do fechamento." });
    if (!date) issues.push({ step: 1, text: "Informe a data do turno." });
    if (!operatorName.trim()) issues.push({ step: 1, text: "Informe o nome do operador." });
    if (cSangria > 0 && !sangriaRecipient.trim()) {
      issues.push({
        step: 2,
        text: "Informe para quem foi entregue a sangria ou onde está guardada.",
      });
    }
    if (usedMachinesCount === 0 && cSysCredit + cSysDebit + cSysPix > 0) {
      issues.push({
        step: 3,
        text: "Ative e preencha ao menos uma maquininha de cartão/PIX utilizada.",
      });
    }
    if (
      activePixRequests.some(
        (item) =>
          !item.name.trim() ||
          !item.key.trim() ||
          !item.description.trim() ||
          toMoneyCents(item.amount) <= 0
      )
    ) {
      issues.push({
        step: 5,
        text: "Preencha favorecido, chave PIX, motivo e valor em todas as solicitações de PIX.",
      });
    } else if (activePixRequests.some((item) => !isValidPixKey(item.key))) {
      issues.push({
        step: 5,
        text: "Há chave PIX com formato inválido nas solicitações.",
      });
    }
    return issues;
  }, [
    unit,
    date,
    operatorName,
    cSangria,
    sangriaRecipient,
    usedMachinesCount,
    cSysCredit,
    cSysDebit,
    cSysPix,
    activePixRequests,
  ]);

  const goToStep = (next: StepId) => {
    setError("");
    setStep(next);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNextStep = () => {
    setError("");
    if (step === 1) {
      if (!unit) {
        setError("Selecione a unidade antes de continuar.");
        return;
      }
      if (!operatorName.trim()) {
        setError("Informe o nome do operador antes de continuar.");
        return;
      }
    }
    if (step === 2 && cSangria > 0 && !sangriaRecipient.trim()) {
      setError("Informe o responsável ou local onde a sangria foi guardada.");
      return;
    }
    if (step === 5) {
      if (
        activePixRequests.some(
          (item) =>
            !item.name.trim() ||
            !item.key.trim() ||
            !item.description.trim() ||
            toMoneyCents(item.amount) <= 0
        )
      ) {
        setError("Complete todos os campos das solicitações de PIX ou remova a linha em branco.");
        return;
      }
      if (activePixRequests.some((item) => !isValidPixKey(item.key))) {
        setError("Verifique o formato da chave PIX informada.");
        return;
      }
    }
    if (step < 6) {
      goToStep((step + 1) as StepId);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (validationIssues.length > 0) {
      setError(validationIssues[0].text);
      return;
    }

    setBusy(true);
    setError("");

    try {
      const bankAmounts: Record<string, { credit: number; debit: number; pix: number }> = {};
      Object.entries(machines).forEach(([bId, m]) => {
        if (m.used) {
          bankAmounts[bId] = {
            credit: toMoneyCents(m.credit),
            debit: toMoneyCents(m.debit),
            pix: toMoneyCents(m.pix),
          };
        }
      });

      if (totalAttachmentsCount > MAX_CLOSING_ATTACHMENTS) {
        throw new Error(`Envie no máximo ${MAX_CLOSING_ATTACHMENTS} comprovantes.`);
      }

      let completedCount = 0;
      const totalNew = newFiles.length;
      if (totalNew > 0) {
        setBusyMessage(`Enviando fotos para o Drive (0/${totalNew})...`);
      }

      const uploadedAttachments: CashAttachment[] = [
        ...existingAttachments.map((att) => ({
          ...att,
          dataUrl: isValidDataUrl(att.dataUrl) ? att.dataUrl : undefined,
        })),
      ];

      type UploadAttempt =
        | { ok: true; attachment: CashAttachment }
        | { ok: false; item: (typeof newFiles)[number]; reason: string };

      const newUploadResults = await runWithConcurrency<
        (typeof newFiles)[number],
        UploadAttempt
      >(newFiles, 2, async (item) => {
        try {
          const named = nameFileForDrive(item.file, `Fechamento ${date} - ${unit}`);
          const [saved, thumbUrl] = await Promise.all([
            uploadFileToDrive(named, "payment_proofs"),
            createThumbnailDataUrl(item.file, 220, 0.58),
          ]);
          completedCount++;
          setBusyMessage(`Enviando fotos para o Drive (${completedCount}/${totalNew})...`);
          return {
            ok: true,
            attachment: {
              fileId: saved.fileId,
              fileName: saved.fileName,
              mimeType: saved.mimeType,
              size: saved.size,
              dataUrl: thumbUrl || undefined,
              uploadedAt: new Date().toISOString(),
            },
          };
        } catch (uploadErr) {
          completedCount++;
          setBusyMessage(`Enviando fotos para o Drive (${completedCount}/${totalNew})...`);
          const reason =
            uploadErr instanceof Error
              ? uploadErr.message
              : "Falha ao enviar comprovante para o Google Drive.";
          console.error("[Fechamento] Erro ao enviar comprovante para o Google Drive:", item.file.name, uploadErr);
          return { ok: false, item, reason };
        }
      });

      const succeeded = newUploadResults
        .filter((r): r is { ok: true; attachment: CashAttachment } => r.ok)
        .map((r) => r.attachment);
      const failed = newUploadResults.filter(
        (r): r is { ok: false; item: (typeof newFiles)[number]; reason: string } => !r.ok
      );

      if (succeeded.length > 0) {
        uploadedAttachments.push(...succeeded);
      }

      if (failed.length > 0) {
        // Preserva o progresso dos arquivos que já subiram para o Drive e mantém apenas os pendentes
        if (succeeded.length > 0) {
          setExistingAttachments(uploadedAttachments);
        }
        setNewFiles(failed.map((f) => f.item));
        const firstReason = failed[0].reason;
        const partialNote =
          succeeded.length > 0
            ? ` ${succeeded.length} foto(s) já foram salvas no Drive e não precisarão ser reenviadas.`
            : "";
        throw new Error(
          `Não foi possível enviar ${failed.length} comprovante(s) para o Google Drive: ${firstReason}${partialNote} Tente novamente.`
        );
      }

      setBusyMessage("Gravando fechamento...");

      const now = new Date().toISOString();
      const targetClosing = activeTargetClosing;
      const closingId = targetClosing?.id || `closing-${date}-${unit}-${Date.now()}`;
      const defaultCategory =
        data.categories.find(
          (cat) => !cat.archived && str(cat, "nature").toLowerCase() === "operacional"
        )?.id ||
        data.categories.find((cat) => !cat.archived && str(cat, "dreLine") === "Operacionais")?.id ||
        data.categories.find((cat) => !cat.archived)?.id ||
        "";

      if (
        targetClosing &&
        str(targetClosing, "date") &&
        (str(targetClosing, "date") !== date || (str(targetClosing, "shift") || "Único") !== shift)
      ) {
        try {
          const oldShift = str(targetClosing, "shift") || "Único";
          const oldUniqueRaw = JSON.stringify([
            tenantId,
            targetClosing.unitId,
            "cashClosings",
            str(targetClosing, "date"),
            oldShift,
          ]);
          const oldDigest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(oldUniqueRaw)
          );
          const oldUniqueId = Array.from(new Uint8Array(oldDigest))
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("");
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
        systemIfoodOnline: toMoneyCents(systemIfoodOnline),
        systemIfoodVoucher: toMoneyCents(systemIfoodVoucher),
        systemTerm: toMoneyCents(systemTerm),
        systemClub: toMoneyCents(systemClub),
        systemAccrual: toMoneyCents(systemAccrual),
        systemServiceFee: cSysServiceFee,
        openingAmount: cOpening,
        cashIn: cCashIn,
        cashOutflows: cOutflows,
        cashOutflowsJson: JSON.stringify(
          outflows.filter((item) => item.name.trim() || toMoneyCents(item.amount) > 0)
        ),
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
        motoboySystem: cMotoboySystem,
        motoboyPaid: cMotoboyPaid,
        motoboyDifference: cMotoboyDiff,
        ...(takeatMotoboyData
          ? {
              motoboyBreakdownJson: JSON.stringify(
                takeatMotoboyData.motoboys.map((m) => ({
                  id: m.id,
                  name: m.name,
                  deliveriesCount: m.deliveriesCount,
                  totalTax: m.totalTax,
                  totalKm: m.totalKm,
                }))
              ),
            }
          : {}),
        ifoodAudit: cIfoodAudit,
        fiscalMachines: cFiscalMachines,
        invoiceIssued: cInvoiceIssued,
        invoiceDifference: cInvoiceDiff,
        pixRequestsJson: JSON.stringify(activePixRequests),
        attachmentsJson: serializeSafeAttachments(uploadedAttachments),
        status: "Aguardando conferência",
        notes: notes.trim(),
      };

      const existingPayables = (data.payables || []).filter(
        (p: RecordData) => !p.archived && p.sourceId === closingId
      );

      const payables = activePixRequests.map((request) => {
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
          amount: toMoneyCents(request.amount),
          paymentMethod: "PIX",
          status: existingP?.status || "Pendente",
          nature: "Operacional",
          sourceId: closingId,
          pixKey: request.key,
          notes: `Solicitação criada no fechamento de caixa. Chave PIX: ${request.key}`,
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
          version: Number(p.version || 0),
        }));

      const allRecords = [row, ...payables, ...orphanPayables];
      allRecords.forEach((record) => validate(record, data));

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
          const isTransient = /quota exceeded|resource exhausted|unavailable|deadline exceeded/i.test(
            msg
          );
          if (!isTransient || attempt === 2) break;
          await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
        }
      }
      throw lastErr;
    } catch (e) {
      handleSaveDraft();
      const message = e instanceof Error ? e.message : "Não foi possível salvar o fechamento.";
      if (/quota exceeded|resource exhausted/i.test(message)) {
        setError(
          "Limite temporário de requisições atingido. Seus dados foram salvos como rascunho neste navegador. Aguarde um instante e tente novamente."
        );
      } else {
        setError(message);
      }
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
      setBusyMessage("");
    }
  };

  const currentStepMeta = STEPS[step - 1];
  const nextStepMeta = step < 6 ? STEPS[step] : null;
  const availableUnits = useMemo(
    () => data.units.filter((u) => !u.archived && (allowedUnit === "all" || u.id === allowedUnit)),
    [data.units, allowedUnit]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#F7F7F8] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      role="dialog"
      aria-modal="true"
      aria-label="Fechamento de caixa"
    >
      {/* Barra superior fixa */}
      <header className="shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {activeTargetClosing ? "Reabertura de fechamento" : "Fechamento de caixa"}
              </h2>
              <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                {unitName} · {formatShortDate(date)} · {shift}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!activeTargetClosing && (
              <button
                type="button"
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <Bookmark size={13} />
                <span className="hidden sm:inline">{draftSavedMsg || "Salvar rascunho"}</span>
                <span className="sm:hidden">{draftSavedMsg ? "Salvo" : "Rascunho"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra fina de progresso */}
        <div className="h-[2px] w-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full bg-zinc-900 transition-all duration-300 ease-out dark:bg-zinc-100"
            style={{ width: `${(step / 6) * 100}%` }}
          />
        </div>

        {/* Navegação de passos (desktop: 6 itens limpos / mobile: indicador compacto + pontos clicáveis) */}
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <nav className="hidden items-center justify-between gap-1 py-2 sm:flex" aria-label="Etapas">
            {STEPS.map((s) => {
              const isActive = step === s.id;
              const isPast = step > s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToStep(s.id)}
                  className={`flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-xs transition ${
                    isActive
                      ? "bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : isPast
                      ? "font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                      isActive
                        ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                        : isPast
                        ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200"
                        : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                    }`}
                  >
                    {isPast ? <Check size={10} strokeWidth={2.5} /> : s.id}
                  </span>
                  <span>{s.shortLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* Versão mobile do stepper */}
          <div className="flex items-center justify-between gap-3 py-2 sm:hidden">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Passo {step} de 6 · <span className="font-semibold text-zinc-900 dark:text-zinc-100">{currentStepMeta.label}</span>
            </span>
            <div className="flex items-center gap-1.5">
              {STEPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToStep(s.id)}
                  aria-label={`Ir para passo ${s.id}: ${s.label}`}
                  className={`h-2 rounded-full transition-all ${
                    step === s.id
                      ? "w-5 bg-zinc-900 dark:bg-zinc-100"
                      : step > s.id
                      ? "w-2 bg-zinc-500 dark:bg-zinc-400"
                      : "w-2 bg-zinc-200 dark:bg-zinc-700"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Corpo rolável único e centralizado */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-12 sm:px-6 sm:py-8">
          {/* Avisos contextuais (Devolvido, Já existente ou Rascunho) */}
          {activeTargetClosing ? (
            <div className="flex items-start gap-2.5 rounded-[16px] border border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <RotateCcw size={15} className="mt-0.5 shrink-0 text-zinc-500" />
              <div className="min-w-0 flex-1">
                {str(activeTargetClosing, "status") === "Devolvido ao operador" ? (
                  <>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Devolvido pelo financeiro.
                    </span>{" "}
                    {str(activeTargetClosing, "returnReason")
                      ? `Motivo: "${str(activeTargetClosing, "returnReason")}". `
                      : "Confira os valores divergentes. "}
                    Ajuste os campos necessários e reenvie na etapa final.
                  </>
                ) : (
                  <>
                    Editando fechamento de{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatShortDate(str(activeTargetClosing, "date"))} ({str(activeTargetClosing, "operatorName")})
                    </span>
                    .
                  </>
                )}
              </div>
            </div>
          ) : existingForShift ? (
            <div className="flex flex-col gap-2 rounded-[16px] border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Já existe fechamento registrado para <strong>{formatShortDate(date)}</strong> (Turno {shift}).
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleLoadExisting(existingForShift)}
                className="shrink-0 self-start font-semibold underline underline-offset-2 sm:self-center"
              >
                Carregar dados existentes
              </button>
            </div>
          ) : hasDraft ? (
            <div className="flex items-center justify-between gap-3 rounded-[16px] border border-zinc-200 bg-white px-4 py-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <span>Rascunho anterior recuperado automaticamente.</span>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="shrink-0 font-medium text-rose-600 hover:underline dark:text-rose-400"
              >
                Descartar
              </button>
            </div>
          ) : null}

          {/* Cabeçalho da etapa atual */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Passo {step} de 6
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-100">
              {currentStepMeta.label}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{currentStepMeta.subtitle}</p>
          </div>

          {/* Erro inline */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASSO 1: TURNO E PDV                                           */}
          {/* ============================================================== */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Card 1: Dados do turno */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Identificação do turno
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Unidade */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Unidade
                    </label>
                    <select
                      value={unit}
                      disabled={allowedUnit !== "all"}
                      onChange={(e) => {
                        setUnit(e.target.value);
                        setMachines({});
                      }}
                      className="h-11 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] font-medium text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-50 disabled:text-zinc-500 sm:h-10 sm:text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">Selecione a unidade</option>
                      {availableUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {str(u, "name")}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Data */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Data do turno
                      </label>
                      {date !== dateToday() && (
                        <button
                          type="button"
                          onClick={() => setDate(dateToday())}
                          className="text-[11px] font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400"
                        >
                          Usar hoje
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="h-11 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] font-medium tabular-nums text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 sm:h-10 sm:text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>

                  {/* Operador */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Operador responsável
                    </label>
                    <input
                      type="text"
                      placeholder="Nome completo"
                      value={operatorName}
                      onChange={(e) => setOperatorName(e.target.value)}
                      className="h-11 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] font-medium text-zinc-900 outline-none transition placeholder:text-zinc-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 sm:h-10 sm:text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                    />
                  </div>

                  {/* Turno */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Turno
                    </label>
                    <div className="grid h-11 grid-cols-3 gap-1 rounded-[10px] border border-zinc-200 bg-zinc-50 p-1 sm:h-10 dark:border-zinc-800 dark:bg-zinc-950">
                      {["Único", "Almoço", "Jantar"].map((item) => {
                        const active = shift === item;
                        return (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setShift(item)}
                            className={`rounded-[7px] text-xs font-medium transition ${
                              active
                                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                            }`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* Card 2: Vendas do PDV + Sincronização Takeat */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-4 flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Vendas registradas no PDV
                      </h3>
                      {takeatCashierData && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              takeatCashierData.isOpen ? "bg-emerald-500" : "bg-zinc-400"
                            }`}
                          />
                          {takeatCashierData.isOpen ? "Takeat ao vivo" : "Takeat fechado"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {takeatCashierLoading
                        ? "Consultando caixa na Takeat..."
                        : takeatCashierData
                        ? `Caixa #${takeatCashierData.cashierOpeningId} · Aberto ${takeatCashierData.openedAtFormatted || "—"}${
                            takeatCashierData.operatorOpen ? ` (${takeatCashierData.operatorOpen})` : ""
                          }`
                        : takeatCashierError || "Preencha manualmente ou sincronize com o PDV Takeat."}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={takeatCashierLoading || !unit || unit === "all" || unit === "central"}
                    onClick={() => handleSyncTakeatCashier(true)}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-[10px] border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 sm:self-center dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <RotateCw size={13} className={takeatCashierLoading ? "animate-spin" : ""} />
                    {takeatCashierLoading ? "Sincronizando..." : "Atualizar PDV"}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MoneyField label="Dinheiro" value={systemCash} onChange={setSystemCash} />
                  <MoneyField label="Cartão crédito" value={systemCredit} onChange={setSystemCredit} />
                  <MoneyField label="Cartão débito" value={systemDebit} onChange={setSystemDebit} />
                  <MoneyField label="PIX" value={systemPix} onChange={setSystemPix} />
                  <MoneyField
                    label="Taxa de serviço"
                    value={systemServiceFee}
                    onChange={setSystemServiceFee}
                  />
                </div>

                {/* Outros canais retrátil */}
                <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowOtherChannels((v) => !v)}
                    className="flex w-full items-center justify-between py-1 text-left text-xs font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    <span>
                      Outros canais (iFood Online, Voucher, Faturado, Clube)
                      {cOther > 0 && (
                        <span className="ml-2 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                          {brl(cOther)}
                        </span>
                      )}
                    </span>
                    {showOtherChannels ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>

                  {showOtherChannels && (
                    <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <MoneyField
                        label="iFood Online"
                        value={systemIfoodOnline}
                        onChange={setSystemIfoodOnline}
                      />
                      <MoneyField
                        label="iFood Voucher"
                        value={systemIfoodVoucher}
                        onChange={setSystemIfoodVoucher}
                      />
                      <MoneyField
                        label="Faturado / Prazo"
                        value={systemTerm}
                        onChange={setSystemTerm}
                      />
                      <MoneyField
                        label="Resgate Clube"
                        value={systemClub}
                        onChange={setSystemClub}
                      />
                      <MoneyField
                        label="Acréscimos / Gorjetas"
                        value={systemAccrual}
                        onChange={setSystemAccrual}
                      />
                    </div>
                  )}
                </div>

                {/* Total PDV */}
                <div className="mt-5 flex items-center justify-between rounded-[10px] bg-zinc-50 px-4 py-3 dark:bg-zinc-950">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Total registrado no PDV
                  </span>
                  <span className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {brl(cSysTotal)}
                  </span>
                </div>
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASSO 2: DINHEIRO NA GAVETA                                    */}
          {/* ============================================================== */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Card 1: Movimento esperado */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Movimento esperado na gaveta
                </h3>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <MoneyField
                      label="(+) Troco inicial"
                      value={openingAmount}
                      onChange={setOpeningAmount}
                    />
                    <MoneyField
                      label="(+) Suprimentos"
                      value={cashIn}
                      onChange={setCashIn}
                    />
                  </div>

                  {/* Vendas em dinheiro vindas do Passo 1 */}
                  <div className="flex items-center justify-between rounded-[10px] border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <div>
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        (+) Vendas em dinheiro no PDV
                      </p>
                      <button
                        type="button"
                        onClick={() => goToStep(1)}
                        className="text-[11px] text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        Alterar no Passo 1
                      </button>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {brl(cSysCash)}
                    </span>
                  </div>

                  {/* Saídas da gaveta */}
                  <div className="space-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                          (-) Saídas da gaveta ({outflows.length})
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          Despesas pagas em espécie durante o turno
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {takeatCashierData?.mapped?.outflows &&
                          takeatCashierData.mapped.outflows.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setOutflows(
                                  takeatCashierData.mapped.outflows.map((o) => ({
                                    id: safeUUID(),
                                    name: o.name,
                                    amount: o.amount.toFixed(2),
                                  }))
                                )
                              }
                              className="rounded-[10px] border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              Puxar Takeat ({takeatCashierData.mapped.outflows.length})
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() =>
                            setOutflows((rows) => [...rows, { id: safeUUID(), name: "", amount: "" }])
                          }
                          className="inline-flex items-center gap-1 rounded-[10px] border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <Plus size={13} /> Adicionar saída
                        </button>
                      </div>
                    </div>

                    {outflows.length > 0 ? (
                      <div className="space-y-2">
                        {outflows.map((row, idx) => (
                          <div
                            key={row.id}
                            className="flex flex-col gap-2 rounded-[10px] border border-zinc-200/80 bg-zinc-50/50 p-2.5 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-950/40"
                          >
                            <input
                              type="text"
                              placeholder="Descrição (ex.: Compra de gelo, motoboy)"
                              value={row.name}
                              onChange={(e) =>
                                setOutflows((rows) =>
                                  rows.map((r) =>
                                    r.id === row.id ? { ...r, name: e.target.value } : r
                                  )
                                )
                              }
                              className="h-10 flex-1 rounded-[7px] border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-zinc-900 sm:h-9 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                            />
                            <div className="flex items-center gap-2">
                              <div className="relative flex flex-1 items-center rounded-[7px] border border-zinc-200 bg-white sm:w-32 sm:flex-none dark:border-zinc-700 dark:bg-zinc-900">
                                <span className="pl-2.5 text-xs text-zinc-400">R$</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  min="0"
                                  placeholder="0,00"
                                  value={row.amount}
                                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                  onChange={(e) =>
                                    setOutflows((rows) =>
                                      rows.map((r) =>
                                        r.id === row.id ? { ...r, amount: e.target.value } : r
                                      )
                                    )
                                  }
                                  className="h-10 w-full bg-transparent pl-1.5 pr-2.5 text-[16px] font-medium tabular-nums text-zinc-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:h-9 sm:text-sm dark:text-zinc-100"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setOutflows((rows) => rows.filter((r) => r.id !== row.id))
                                }
                                aria-label={`Remover saída ${idx + 1}`}
                                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[7px] text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 sm:h-9 sm:w-9 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-end gap-2 pt-1 text-xs text-zinc-500">
                          <span>Total de saídas:</span>
                          <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">
                            {brl(cOutflows)}
                          </strong>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400">
                        Nenhuma saída em dinheiro registrada neste turno.
                      </p>
                    )}
                  </div>

                  {/* Subtotal esperado */}
                  <div className="flex items-center justify-between rounded-[10px] bg-zinc-50 px-4 py-3 dark:bg-zinc-950">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Total esperado na gaveta
                    </span>
                    <span className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {brl(cCashExpected)}
                    </span>
                  </div>
                </div>
              </section>

              {/* Card 2: Contagem física */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Contagem física real
                </h3>

                <div className="space-y-4">
                  <MoneyField
                    label="Sangria (dinheiro retirado da gaveta)"
                    value={sangriaAmount}
                    onChange={setSangriaAmount}
                  />

                  {cSangria > 0 && (
                    <div className="grid grid-cols-1 gap-3 rounded-[10px] border border-zinc-200 bg-zinc-50/70 p-3.5 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          Destino da sangria
                        </label>
                        <select
                          value={sangriaStatus}
                          onChange={(e) => setSangriaStatus(e.target.value)}
                          className="h-11 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] font-medium text-zinc-900 outline-none focus:border-zinc-900 sm:h-10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          <option value="Na loja">Guardado no cofre da loja</option>
                          <option value="Entregue a responsável">Entregue a responsável</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          Responsável ou local *
                        </label>
                        <input
                          type="text"
                          placeholder="Ex.: Cofre loja / Nome do gerente"
                          value={sangriaRecipient}
                          onChange={(e) => setSangriaRecipient(e.target.value)}
                          className="h-11 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-zinc-900 sm:h-10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                      </div>
                    </div>
                  )}

                  <MoneyField
                    label="Troco final que ficou na gaveta"
                    value={closingFloat}
                    onChange={setClosingFloat}
                  />
                </div>

                {/* Resultado da conferência de dinheiro */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex items-center gap-5 text-xs">
                    <div>
                      <span className="block text-zinc-400">Esperado</span>
                      <strong className="text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                        {brl(cCashExpected)}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-zinc-400">Contado</span>
                      <strong className="text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                        {brl(cCashFound)}
                      </strong>
                    </div>
                  </div>
                  <StatusPill diff={cCashDiff} zeroLabel="Dinheiro batido" />
                </div>
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASSO 3: MAQUININHAS (CARTÃO E PIX)                            */}
          {/* ============================================================== */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Barra de conferência ao vivo (3 colunas) */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: "Crédito", found: cCreditFound, expected: cSysCredit, diff: cCreditDiff },
                  { label: "Débito", found: cDebitFound, expected: cSysDebit, diff: cDebitDiff },
                  { label: "PIX", found: cPixFound, expected: cSysPix, diff: cPixDiff },
                ].map((col) => (
                  <div
                    key={col.label}
                    className="min-w-0 rounded-[16px] border border-zinc-200/90 bg-white p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-3.5 dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                        {col.label}
                      </span>
                      <StatusPill diff={col.diff} size="xs" />
                    </div>
                    <p className="mt-2 truncate text-[13px] font-semibold tabular-nums text-zinc-900 sm:text-base dark:text-zinc-100">
                      {brl(col.found)}
                    </p>
                    <p className="truncate text-[10px] tabular-nums text-zinc-400 sm:text-[11px]">
                      PDV {brl(col.expected)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Lista de maquininhas da unidade */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5 sm:px-5 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Maquininhas e contas da unidade
                  </h3>
                  <span className="text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    Total {brl(cCreditFound + cDebitFound + cPixFound)}
                  </span>
                </div>

                {banks.length > 0 ? (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {banks.map((bank) => {
                      const m = machines[bank.id] || {
                        used: false,
                        credit: "",
                        debit: "",
                        pix: "",
                      };
                      const machineTotal =
                        toMoneyCents(m.credit) + toMoneyCents(m.debit) + toMoneyCents(m.pix);

                      return (
                        <div key={bank.id} className="p-4 sm:px-5">
                          <button
                            type="button"
                            onClick={() =>
                              setMachines((prev) => ({
                                ...prev,
                                [bank.id]: { ...m, used: !m.used },
                              }))
                            }
                            className="flex w-full items-center justify-between gap-3 text-left"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {/* Switch limpo */}
                              <span
                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                                  m.used
                                    ? "bg-zinc-900 dark:bg-zinc-100"
                                    : "bg-zinc-200 dark:bg-zinc-700"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform dark:bg-zinc-900 ${
                                    m.used ? "translate-x-[18px]" : "translate-x-[3px]"
                                  }`}
                                />
                              </span>
                              <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {str(bank, "name")}
                              </span>
                            </div>

                            <span
                              className={`shrink-0 text-xs tabular-nums ${
                                m.used
                                  ? "font-semibold text-zinc-900 dark:text-zinc-100"
                                  : "text-zinc-400"
                              }`}
                            >
                              {m.used ? brl(machineTotal) : "Não usada"}
                            </span>
                          </button>

                          {m.used && (
                            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-zinc-100 pt-4 sm:grid-cols-3 dark:border-zinc-800">
                              <MoneyField
                                label="Crédito"
                                value={m.credit}
                                onChange={(val) =>
                                  setMachines((prev) => ({
                                    ...prev,
                                    [bank.id]: { ...m, credit: val },
                                  }))
                                }
                              />
                              <MoneyField
                                label="Débito"
                                value={m.debit}
                                onChange={(val) =>
                                  setMachines((prev) => ({
                                    ...prev,
                                    [bank.id]: { ...m, debit: val },
                                  }))
                                }
                              />
                              <MoneyField
                                label="PIX na conta"
                                value={m.pix}
                                onChange={(val) =>
                                  setMachines((prev) => ({
                                    ...prev,
                                    [bank.id]: { ...m, pix: val },
                                  }))
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center text-xs text-zinc-500">
                    Nenhuma maquininha ou conta cadastrada para esta unidade.
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASSO 4: AUDITORIA (MOTOBOYS E NOTAS FISCAIS)                  */}
          {/* ============================================================== */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Motoboys */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Auditoria de motoboys
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMotoboyModalOpen(true)}
                      disabled={!unit || unit === "all" || unit === "central" || !date}
                      title="Ver motoboys e valor individual"
                      aria-label="Ver motoboys e valor individual"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSyncTakeatMotoboys(true)}
                      disabled={takeatMotoboyLoading || !unit || unit === "all" || unit === "central"}
                      className="inline-flex h-7 items-center gap-1.5 rounded-[10px] border border-zinc-200 px-2.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <RotateCw size={12} className={takeatMotoboyLoading ? "animate-spin" : ""} />
                      {takeatMotoboyLoading ? "Consultando..." : "Puxar Takeat"}
                    </button>
                    <StatusPill diff={cMotoboyDiff} size="xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <MoneyField
                    label="Valor registrado no sistema"
                    value={motoboySystem}
                    onChange={setMotoboySystem}
                  />
                  <MoneyField
                    label="Total pago aos motoboys"
                    value={motoboyPaid}
                    onChange={setMotoboyPaid}
                  />
                </div>

                {takeatMotoboyData && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-zinc-50 px-3.5 py-2 text-xs text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
                    <span>
                      Takeat oficial:{" "}
                      <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">
                        {brl(Math.round(takeatMotoboyData.totalTax * 100))}
                      </strong>
                      <span className="ml-2 text-zinc-400">
                        ({takeatMotoboyData.totalDeliveries}{" "}
                        {takeatMotoboyData.totalDeliveries === 1 ? "entrega" : "entregas"} ·{" "}
                        {takeatMotoboyData.motoboys.length}{" "}
                        {takeatMotoboyData.motoboys.length === 1 ? "motoboy" : "motoboys"})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setMotoboyModalOpen(true)}
                      className="inline-flex items-center gap-1 font-medium text-zinc-700 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                    >
                      <Eye size={12} />
                      <span>Ver individual</span>
                    </button>
                  </div>
                )}

                {takeatMotoboyError && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {takeatMotoboyError}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
                  <span className="text-zinc-500">Diferença de entregas (Pago − Sistema)</span>
                  <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">
                    {brl(cMotoboyDiff)}
                  </strong>
                </div>
              </section>

              {/* Notas Fiscais */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Auditoria fiscal (NFC-e)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSyncTakeatFiscal(true)}
                      disabled={takeatFiscalLoading || !unit || unit === "all" || unit === "central"}
                      className="inline-flex items-center gap-1.5 rounded-[10px] border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <RotateCw size={12} className={takeatFiscalLoading ? "animate-spin" : ""} />
                      {takeatFiscalLoading ? "Consultando..." : "Puxar Takeat"}
                    </button>
                    <StatusPill diff={cInvoiceDiff} size="xs" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <MoneyField label="Base iFood" value={ifoodAudit} onChange={setIfoodAudit} />
                  <MoneyField
                    label="Base Máquinas"
                    value={fiscalMachines}
                    onChange={setFiscalMachines}
                  />
                  <MoneyField
                    label="Notas emitidas"
                    value={invoiceIssued}
                    onChange={setInvoiceIssued}
                  />
                </div>

                {takeatFiscalData && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-zinc-50 px-3.5 py-2 text-xs text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
                    <span>
                      Takeat oficial:{" "}
                      <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">
                        {brl(Math.round(takeatFiscalData.totalIssued * 100))}
                      </strong>
                    </span>
                    <span className="tabular-nums">
                      {takeatFiscalData.count}{" "}
                      {takeatFiscalData.count === 1 ? "cupom emitido" : "cupons emitidos"}
                    </span>
                  </div>
                )}

                {takeatFiscalError && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {takeatFiscalError}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
                  <span className="text-zinc-500">Diferença fiscal (Base − Emitidas)</span>
                  <strong className="tabular-nums text-zinc-900 dark:text-zinc-100">
                    {brl(cInvoiceDiff)}
                  </strong>
                </div>
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASSO 5: SOLICITAÇÕES DE PIX, COMPROVANTES E OBSERVAÇÕES       */}
          {/* ============================================================== */}
          {step === 5 && (
            <div className="space-y-4">
              {/* Solicitações de PIX */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Solicitações de PIX (opcional)
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Pagamentos que o financeiro precisa realizar via PIX
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPixRequests((rows) => [
                        ...rows,
                        { id: safeUUID(), name: "", key: "", description: "", amount: "" },
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Plus size={13} /> Nova solicitação
                  </button>
                </div>

                {pixRequests.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {pixRequests.map((item, idx) => {
                      const keyValid = !item.key.trim() || isValidPixKey(item.key);
                      return (
                        <div
                          key={item.id}
                          className="space-y-3 rounded-[10px] border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/40"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                              Solicitação #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPixRequests((rows) => rows.filter((r) => r.id !== item.id))
                              }
                              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-600"
                            >
                              <Trash2 size={13} /> Remover
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Favorecido
                              </label>
                              <input
                                type="text"
                                placeholder="Nome ou fornecedor"
                                value={item.name}
                                onChange={(e) =>
                                  setPixRequests((rows) =>
                                    rows.map((r) =>
                                      r.id === item.id ? { ...r, name: e.target.value } : r
                                    )
                                  )
                                }
                                className="h-10 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Chave PIX
                              </label>
                              <input
                                type="text"
                                placeholder="CPF, CNPJ, e-mail ou telefone"
                                value={item.key}
                                onChange={(e) =>
                                  setPixRequests((rows) =>
                                    rows.map((r) =>
                                      r.id === item.id ? { ...r, key: e.target.value } : r
                                    )
                                  )
                                }
                                className={`h-10 w-full rounded-[10px] border bg-white px-3 text-[16px] text-zinc-900 outline-none sm:text-sm dark:bg-zinc-900 dark:text-zinc-100 ${
                                  !keyValid
                                    ? "border-rose-400 focus:border-rose-500"
                                    : "border-zinc-200 focus:border-zinc-900 dark:border-zinc-700"
                                }`}
                              />
                              {!keyValid && (
                                <p className="text-[11px] text-rose-600">Formato de chave inválido</p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                Motivo / Descrição
                              </label>
                              <input
                                type="text"
                                placeholder="Ex.: Gás de cozinha emergencial"
                                value={item.description}
                                onChange={(e) =>
                                  setPixRequests((rows) =>
                                    rows.map((r) =>
                                      r.id === item.id ? { ...r, description: e.target.value } : r
                                    )
                                  )
                                }
                                className="h-10 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                              />
                            </div>
                            <MoneyField
                              label="Valor"
                              value={item.amount}
                              onChange={(val) =>
                                setPixRequests((rows) =>
                                  rows.map((r) => (r.id === item.id ? { ...r, amount: val } : r))
                                )
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800">
                    Nenhuma solicitação de PIX registrada neste turno.
                  </p>
                )}
              </section>

              {/* Comprovantes e fotos */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Comprovantes e fotos
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      Filipetas das maquininhas e recibos ({totalAttachmentsCount}/{MAX_CLOSING_ATTACHMENTS})
                    </p>
                  </div>
                  {compressingFiles && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                      <Loader2 size={13} className="animate-spin" /> Otimizando...
                    </span>
                  )}
                </div>

                {totalAttachmentsCount < MAX_CLOSING_ATTACHMENTS && (
                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800">
                      <Camera size={15} />
                      <span>Tirar foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        disabled={compressingFiles}
                        onChange={(e) => {
                          const picked = e.target.files ? Array.from(e.target.files) : [];
                          e.target.value = "";
                          if (picked.length > 0) void handleAddFiles(picked);
                        }}
                      />
                    </label>
                    <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-zinc-200 bg-zinc-50 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800">
                      <Upload size={15} />
                      <span>Escolher arquivo</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,image/*"
                        className="sr-only"
                        disabled={compressingFiles}
                        onChange={(e) => {
                          const picked = e.target.files ? Array.from(e.target.files) : [];
                          e.target.value = "";
                          if (picked.length > 0) void handleAddFiles(picked);
                        }}
                      />
                    </label>
                  </div>
                )}

                {totalAttachmentsCount > 0 && (
                  <div className="mt-3 divide-y divide-zinc-100 rounded-[10px] border border-zinc-200/80 dark:divide-zinc-800 dark:border-zinc-800">
                    {existingAttachments.map((att) => (
                      <div
                        key={att.fileId}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <WizardAttachmentThumb att={att} />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                              {att.fileName}
                            </p>
                            <span className="text-[11px] text-zinc-400">
                              {formatFileSize(att.size)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExistingAttachments((prev) =>
                              prev.filter((a) => a.fileId !== att.fileId)
                            )
                          }
                          aria-label="Remover anexo"
                          className="rounded-[7px] p-1.5 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {newFiles.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          {item.previewUrl && isImageFile(item.file) ? (
                            <img
                              src={item.previewUrl}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-[10px] border border-zinc-200 object-cover dark:border-zinc-700"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800">
                              <FileText size={16} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                              {item.file.name}
                            </p>
                            <span className="text-[11px] text-zinc-400">
                              {formatFileSize(item.size)} · Novo
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setNewFiles((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Remover anexo"
                          className="rounded-[7px] p-1.5 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Observações */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Observações do turno
                </label>
                {cTotalDiff !== 0 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Há diferença de <strong className="tabular-nums text-zinc-800 dark:text-zinc-200">{brl(cTotalDiff)}</strong> no fechamento. Se souber o motivo, registre abaixo para agilizar a conferência.
                  </p>
                )}
                <textarea
                  rows={4}
                  placeholder="Explique divergências, cancelamentos, trocas de notas ou recados para o financeiro..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-3 w-full resize-none rounded-[10px] border border-zinc-200 bg-white p-3 text-[16px] text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 sm:text-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* PASSO 6: REVISÃO FINAL E ENVIO                                 */}
          {/* ============================================================== */}
          {step === 6 && (
            <div className="space-y-4">
              {/* Pendências antes de enviar */}
              {validationIssues.length > 0 && (
                <div className="space-y-2 rounded-[16px] border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/70 dark:bg-rose-950/40">
                  <p className="text-xs font-semibold text-rose-800 dark:text-rose-300">
                    Corrija os itens abaixo para liberar o envio:
                  </p>
                  <ul className="space-y-1.5">
                    {validationIssues.map((issue, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between gap-2 text-xs text-rose-700 dark:text-rose-300"
                      >
                        <span>{issue.text}</span>
                        <button
                          type="button"
                          onClick={() => goToStep(issue.step)}
                          className="shrink-0 font-semibold underline underline-offset-2"
                        >
                          Ir ao passo {issue.step}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Cartão principal de veredito */}
              <section className="rounded-[16px] border border-zinc-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {unitName}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatShortDate(date)} · Turno {shift} · {operatorName || "Sem operador"}
                    </p>
                  </div>
                  <StatusPill
                    diff={cTotalDiff}
                    zeroLabel="Caixa batido (R$ 0,00)"
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-zinc-500">Total faturado (PDV)</span>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 sm:text-xl dark:text-zinc-100">
                      {brl(cSysTotal)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500">Total apurado no balcão</span>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 sm:text-xl dark:text-zinc-100">
                      {brl(cTotalConfirmed)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Tabela estilo recibo: Conciliação dos 4 meios */}
              <section className="overflow-hidden rounded-[16px] border border-zinc-200/90 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5 dark:border-zinc-800">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Conciliação dos meios de pagamento
                  </h3>
                  <button
                    type="button"
                    onClick={() => goToStep(3)}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Editar
                  </button>
                </div>

                <div className="divide-y divide-zinc-100 text-[11px] sm:text-xs dark:divide-zinc-800">
                  <div className="grid grid-cols-4 gap-1 bg-zinc-50/80 px-3.5 py-2 text-[10px] font-medium text-zinc-400 sm:px-5 sm:text-[11px] dark:bg-zinc-950/60">
                    <span>Meio</span>
                    <span className="text-right">Esperado</span>
                    <span className="text-right">Apurado</span>
                    <span className="text-right">Dif.</span>
                  </div>
                  {[
                    { name: "Dinheiro", exp: cCashExpected, found: cCashFound, diff: cCashDiff },
                    { name: "Crédito", exp: cSysCredit, found: cCreditFound, diff: cCreditDiff },
                    { name: "Débito", exp: cSysDebit, found: cDebitFound, diff: cDebitDiff },
                    { name: "PIX", exp: cSysPix, found: cPixFound, diff: cPixDiff },
                  ].map((r) => (
                    <div
                      key={r.name}
                      className="grid grid-cols-4 items-center gap-1 px-3.5 py-2.5 sm:px-5"
                    >
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {r.name}
                      </span>
                      <span className="text-right tabular-nums text-zinc-500">
                        {brl(r.exp)}
                      </span>
                      <span className="text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                        {brl(r.found)}
                      </span>
                      <span
                        className={`text-right font-semibold tabular-nums ${
                          r.diff === 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : r.diff > 0
                            ? "text-amber-700 dark:text-amber-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {r.diff === 0 ? "0,00" : brl(r.diff)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Resumo de Gaveta, Auditoria e Extras */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Gaveta */}
                <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Gaveta e sangria
                    </h3>
                    <button
                      type="button"
                      onClick={() => goToStep(2)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Editar
                    </button>
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Troco inicial</dt>
                      <dd className="font-medium tabular-nums">{brl(cOpening)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Suprimentos</dt>
                      <dd className="font-medium tabular-nums">{brl(cCashIn)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Saídas ({outflows.length})</dt>
                      <dd className="font-medium tabular-nums">{brl(cOutflows)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                      <dt className="text-zinc-500">Sangria</dt>
                      <dd className="font-semibold tabular-nums">{brl(cSangria)}</dd>
                    </div>
                    {cSangria > 0 && (
                      <div className="text-[11px] text-zinc-400">
                        {sangriaStatus}
                        {sangriaRecipient ? ` · ${sangriaRecipient}` : ""}
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Troco final</dt>
                      <dd className="font-semibold tabular-nums">{brl(cClosingFloat)}</dd>
                    </div>
                  </dl>
                </section>

                {/* Auditoria e Extras */}
                <section className="rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Auditoria e anexos
                    </h3>
                    <button
                      type="button"
                      onClick={() => goToStep(4)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      Editar
                    </button>
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-1.5 text-zinc-500">
                        <span>Motoboys (Pago / Sis.)</span>
                        {unit && unit !== "all" && unit !== "central" && date && (
                          <button
                            type="button"
                            onClick={() => setMotoboyModalOpen(true)}
                            title="Ver motoboys e valor individual"
                            aria-label="Ver motoboys e valor individual"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                          >
                            <Eye size={12} />
                          </button>
                        )}
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {brl(cMotoboyPaid)} / {brl(cMotoboySystem)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">NFC-e (Emit. / Base)</dt>
                      <dd className="font-medium tabular-nums">
                        {brl(cInvoiceIssued)} / {brl(cInvoiceBase)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Extras e fotos
                      </span>
                      <button
                        type="button"
                        onClick={() => goToStep(5)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                      >
                        Editar
                      </button>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Solicitações de PIX</dt>
                      <dd className="font-medium tabular-nums">
                        {activePixRequests.length > 0
                          ? `${activePixRequests.length} (${brl(cPixRequestsTotal)})`
                          : "Nenhuma"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-zinc-500">Comprovantes</dt>
                      <dd className="font-medium tabular-nums">
                        {totalAttachmentsCount}{" "}
                        {totalAttachmentsCount === 1 ? "arquivo" : "arquivos"}
                      </dd>
                    </div>
                    {notes.trim() && (
                      <div className="border-t border-zinc-100 pt-1.5 dark:border-zinc-800">
                        <dt className="text-zinc-500">Observação</dt>
                        <dd className="mt-0.5 line-clamp-2 text-zinc-700 dark:text-zinc-300">
                          {notes.trim()}
                        </dd>
                      </div>
                    )}
                  </dl>
                </section>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Rodapé fixo limpo com safe-area para mobile */}
      <footer className="shrink-0 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom,0px)] dark:border-zinc-800 dark:bg-zinc-900">
        {error && (
          <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 dark:border-rose-900/70 dark:bg-rose-950/50">
            <div className="mx-auto flex max-w-2xl items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-300">
              <AlertCircle size={14} className="shrink-0" />
              <span className="line-clamp-2">{error}</span>
            </div>
          </div>
        )}
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Esquerda: Voltar ou Cancelar */}
          {step === 1 ? (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center rounded-[10px] border border-zinc-200 bg-white px-4 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 sm:h-10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToStep((step - 1) as StepId)}
              disabled={busy}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-4 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 sm:h-10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <ArrowLeft size={14} />
              <span>Voltar</span>
            </button>
          )}

          {/* Centro: Resumo discreto no desktop */}
          <div className="hidden items-center gap-2 text-xs text-zinc-500 sm:flex">
            <span>Diferença geral:</span>
            <StatusPill diff={cTotalDiff} size="xs" />
          </div>

          {/* Direita: Continuar ou Enviar */}
          {step < 6 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-zinc-900 px-5 text-xs font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.99] sm:h-10 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <span>
                Continuar
                {nextStepMeta && (
                  <span className="hidden font-normal opacity-75 sm:inline">
                    {" "}
                    · {nextStepMeta.shortLabel}
                  </span>
                )}
              </span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || validationIssues.length > 0}
              onClick={handleSubmit}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-zinc-900 px-5 text-xs font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {busy ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>{busyMessage || "Enviando..."}</span>
                </>
              ) : (
                <>
                  <Check size={15} strokeWidth={2.25} />
                  <span>
                    {activeTargetClosing ? "Salvar e reenviar" : "Enviar fechamento"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </footer>

      {motoboyModalOpen && (
        <MotoboyBreakdownModal
          unitId={unit}
          unitName={unitName}
          date={date}
          summary={takeatMotoboyData}
          savedBreakdownJson={activeTargetClosing?.motoboyBreakdownJson}
          onSynced={(res) => {
            setTakeatMotoboyData(res);
            if (!motoboySystem || Number(motoboySystem) === 0) {
              setMotoboySystem(toMoneyInput(Math.round(res.totalTax * 100)));
            }
          }}
          onClose={() => setMotoboyModalOpen(false)}
        />
      )}
    </div>
  );
}
