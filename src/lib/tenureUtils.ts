/**
 * Utilitários para Gestão de Pessoas (RH) - HOUSE 190
 * Cálculo dinâmico de tempo de casa e controle de período de experiência (90 dias CLT).
 */

export interface TenureResult {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  formatted: string;
  text: string;
  isRecent: boolean; // Menos de 90 dias
}

export interface ExperienceInfo {
  isUnderExperience: boolean;
  inExperience: boolean;
  totalDays: number;
  daysRemaining: number;
  daysPassed: number;
  experienceEndDate: string; // YYYY-MM-DD
  endDateStr: string;
  urgency: "critical" | "warning" | "normal" | "completed";
  badgeText: string;
  badgeTone: "danger" | "warning" | "info" | "success";
}

/**
 * Retorna a data de hoje no formato YYYY-MM-DD no fuso horário do Brasil (Bahia).
 */
export function getTodayDateStr(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bahia",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Faz o parsing seguro e universal de datas em formatos comuns (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, ISO).
 * Evita o bug de RangeError e inversão de dia/mês no V8.
 */
export function parseDateToUTC(dateInput?: string | Date | null): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  if (typeof dateInput !== "string") return null;

  const trimmed = dateInput.trim();
  if (trimmed.length < 8) return null;

  // Formato brasileiro: DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }

  // Formato ISO / padrão: YYYY-MM-DD ou YYYY/MM/DD
  const isoMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback para ISO com horário
  const clean = trimmed.split("T")[0];
  const cleanIsoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (cleanIsoMatch) {
    const year = parseInt(cleanIsoMatch[1], 10);
    const month = parseInt(cleanIsoMatch[2], 10) - 1;
    const day = parseInt(cleanIsoMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }

  const raw = new Date(trimmed);
  return isNaN(raw.getTime()) ? null : raw;
}

/**
 * Calcula o tempo de casa com precisão diária a partir da data de admissão.
 */
export function calculateTenure(
  admissionDateStr?: string | null,
  endDateStr?: string | null
): TenureResult {
  if (!admissionDateStr || admissionDateStr.trim().length < 8) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      formatted: "Data pendente",
      text: "Data não informada",
      isRecent: false,
    };
  }

  const start = parseDateToUTC(admissionDateStr);
  const end = endDateStr ? parseDateToUTC(endDateStr) : parseDateToUTC(getTodayDateStr());

  if (!start || !end) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      formatted: "Data inválida",
      text: "Data inválida",
      isRecent: false,
    };
  }

  const diffTime = end.getTime() - start.getTime();
  const totalDays = Math.max(0, Math.round(diffTime / (1000 * 60 * 60 * 24)));

  // Cálculo de anos, meses e dias corridos
  let startYear = start.getUTCFullYear();
  let startMonth = start.getUTCMonth();
  let startDay = start.getUTCDate();

  let endYear = end.getUTCFullYear();
  let endMonth = end.getUTCMonth();
  let endDay = end.getUTCDate();

  let years = endYear - startYear;
  let months = endMonth - startMonth;
  let days = endDay - startDay;

  if (days < 0) {
    months -= 1;
    // Dias do mês anterior
    const prevMonthDays = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
    days += prevMonthDays;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  years = Math.max(0, years);
  months = Math.max(0, months);
  days = Math.max(0, days);

  let formatted = "";
  if (totalDays === 0) {
    formatted = "Admitido hoje";
  } else if (totalDays === 1) {
    formatted = "1 dia";
  } else if (totalDays < 30) {
    formatted = `${totalDays} dias`;
  } else if (years === 0) {
    if (days === 0) {
      formatted = `${months} ${months === 1 ? "mês" : "meses"}`;
    } else {
      formatted = `${months} ${months === 1 ? "mês" : "meses"} e ${days} ${days === 1 ? "dia" : "dias"}`;
    }
  } else {
    if (months === 0) {
      formatted = `${years} ${years === 1 ? "ano" : "anos"}`;
    } else {
      formatted = `${years} ${years === 1 ? "ano" : "anos"} e ${months} ${months === 1 ? "mês" : "meses"}`;
    }
  }

  const text = totalDays === 0 ? formatted : `${formatted} de casa`;

  return {
    years,
    months,
    days,
    totalDays,
    formatted,
    text,
    isRecent: totalDays < 90,
  };
}

/**
 * Avalia o período de experiência de 90 dias da CLT.
 */
export function getExperienceInfo(
  admissionDateStr?: string | null,
  explicitEndDateStr?: string | null,
  isTerminated = false
): ExperienceInfo {
  if (isTerminated || !admissionDateStr || admissionDateStr.trim().length < 8) {
    return {
      isUnderExperience: false,
      inExperience: false,
      totalDays: 0,
      daysRemaining: 0,
      daysPassed: 0,
      experienceEndDate: "",
      endDateStr: "",
      urgency: "completed",
      badgeText: isTerminated ? "Desligado" : "Efetivado",
      badgeTone: "info",
    };
  }

  const start = parseDateToUTC(admissionDateStr);
  if (!start) {
    return {
      isUnderExperience: false,
      inExperience: false,
      totalDays: 0,
      daysRemaining: 0,
      daysPassed: 0,
      experienceEndDate: "",
      endDateStr: "",
      urgency: "completed",
      badgeText: "Sem data",
      badgeTone: "info",
    };
  }

  // Data final da experiência: explícita ou padrão de 90 dias da CLT
  let expEnd: Date;
  if (explicitEndDateStr && explicitEndDateStr.trim().length >= 8) {
    const parsedExp = parseDateToUTC(explicitEndDateStr);
    expEnd = parsedExp || new Date(start.getTime() + 90 * 86400000);
  } else {
    expEnd = new Date(start.getTime() + 90 * 86400000);
  }

  const expEndDateStr = expEnd.toISOString().slice(0, 10);
  const today = parseDateToUTC(getTodayDateStr()) || new Date();

  const totalDaysExp = Math.max(1, Math.round((expEnd.getTime() - start.getTime()) / 86400000));
  const daysPassed = Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000));
  const daysRemaining = Math.round((expEnd.getTime() - today.getTime()) / 86400000);

  // Se já ultrapassou os 90 dias (dias cumpridos > 90 e dias restantes < 0)
  if (daysPassed > totalDaysExp || daysRemaining < 0) {
    return {
      isUnderExperience: false,
      inExperience: false,
      totalDays: totalDaysExp,
      daysRemaining: 0,
      daysPassed,
      experienceEndDate: expEndDateStr,
      endDateStr: expEndDateStr,
      urgency: "completed",
      badgeText: "Efetivado / Experiência concluída",
      badgeTone: "success",
    };
  }

  let urgency: ExperienceInfo["urgency"] = "normal";
  let badgeTone: ExperienceInfo["badgeTone"] = "info";
  let badgeText = "";

  if (daysRemaining === 0) {
    urgency = "critical";
    badgeTone = "danger";
    badgeText = "Último dia da experiência hoje!";
  } else if (daysRemaining <= 10) {
    urgency = "critical";
    badgeTone = "danger";
    badgeText = `Experiência acaba em ${daysRemaining} ${daysRemaining === 1 ? "dia" : "dias"}`;
  } else if (daysRemaining <= 30) {
    urgency = "warning";
    badgeTone = "warning";
    badgeText = `Experiência: faltam ${daysRemaining} dias`;
  } else {
    urgency = "normal";
    badgeTone = "info";
    badgeText = `Em experiência (${daysRemaining} dias restantes)`;
  }

  return {
    isUnderExperience: true,
    inExperience: true,
    totalDays: totalDaysExp,
    daysRemaining,
    daysPassed,
    experienceEndDate: expEndDateStr,
    endDateStr: expEndDateStr,
    urgency,
    badgeText,
    badgeTone,
  };
}
