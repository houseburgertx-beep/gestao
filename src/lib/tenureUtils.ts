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
 * Calcula o tempo de casa com precisão diária a partir da data de admissão.
 */
export function calculateTenure(
  admissionDateStr?: string | null,
  endDateStr?: string | null
): TenureResult {
  if (!admissionDateStr || admissionDateStr.length < 10) {
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

  const start = new Date(admissionDateStr.slice(0, 10) + "T12:00:00Z");
  const end = endDateStr
    ? new Date(endDateStr.slice(0, 10) + "T12:00:00Z")
    : new Date(getTodayDateStr() + "T12:00:00Z");

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
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
  if (isTerminated || !admissionDateStr || admissionDateStr.length < 10) {
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

  const start = new Date(admissionDateStr.slice(0, 10) + "T12:00:00Z");
  if (isNaN(start.getTime())) {
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

  // Data final da experiência: explícita ou padrão de 90 dias
  let expEnd: Date;
  if (explicitEndDateStr && explicitEndDateStr.length >= 10) {
    expEnd = new Date(explicitEndDateStr.slice(0, 10) + "T12:00:00Z");
  } else {
    expEnd = new Date(start.getTime() + 90 * 86400000);
  }

  const expEndDateStr = expEnd.toISOString().slice(0, 10);
  const today = new Date(getTodayDateStr() + "T12:00:00Z");

  const totalDaysExp = Math.max(1, Math.round((expEnd.getTime() - start.getTime()) / 86400000));
  const daysPassed = Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000));
  const daysRemaining = Math.round((expEnd.getTime() - today.getTime()) / 86400000);

  if (daysRemaining <= 0 || daysPassed >= 90) {
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

  if (daysRemaining <= 10) {
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
