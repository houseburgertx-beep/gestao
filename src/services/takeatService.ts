import {
  TakeatGeneralCardsResponse,
  TakeatPaymentWithoutTax,
  TakeatRevenueRecord,
  TakeatCredentials,
  TakeatSyncResult,
} from "@/types/takeat";
import { UnitId } from "@/types";

const TAKEAT_CONFIG = {
  AUTH_URL: "https://backend-pdv.takeat.app/public/api/sessions",
  REPORTS_URL: "https://backend-pdv-2.takeat.app/restaurants/v2/reports/general-cards",
};

/**
 * Converte valores numéricos no padrão numérico ou string brasileira ("1.234,56")
 * para número float com 2 casas decimais.
 */
export function parseBRLNumber(val: any): number {
  if (val === null || val === undefined) return 0.0;
  if (typeof val === "number") {
    return isNaN(val) ? 0.0 : Math.round(val * 100) / 100;
  }
  if (typeof val === "string") {
    let clean = val.trim();
    if (!clean) return 0.0;

    // Trata formato brasileiro com pontos de milhar e vírgula decimal (ex: "1.234,56")
    if (clean.includes(",") && clean.includes(".")) {
      clean = clean.replace(/\./g, "").replace(",", ".");
    } else if (clean.includes(",")) {
      clean = clean.replace(",", ".");
    }

    const num = parseFloat(clean);
    return isNaN(num) ? 0.0 : Math.round(num * 100) / 100;
  }
  return 0.0;
}

/**
 * Gera o intervalo ISO 8601 correspondente ao dia completo no fuso horário de
 * Brasília/Bahia (America/Bahia, UTC-03:00), das 00:00:00 até 23:59:59.999.
 *
 * Exemplo para 07/09/2026:
 * start_date = 2026-09-07T03:00:00.000Z
 * end_date   = 2026-09-08T02:59:59.999Z
 */
export function getBahiaIsoDayRange(dateStr: string): { startDate: string; endDate: string } {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Formato de data inválido. Use AAAA-MM-DD.");
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);

  const startUtc = new Date(Date.UTC(year, month, day, 3, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month, day + 1, 2, 59, 59, 999));

  return {
    startDate: startUtc.toISOString(),
    endDate: endUtc.toISOString(),
  };
}

/**
 * Validação de permissões por perfil e unidade:
 * - Admin e Diretoria podem consultar qualquer unidade.
 * - Gerentes de unidade só podem consultar a sua própria unidade.
 */
export function validateUnitPermission(
  userRole: string = "admin",
  userUnitId: string = "all",
  targetUnitId: Exclude<UnitId, "all">
): boolean {
  if (userRole === "admin" || userRole === "diretoria") {
    return true;
  }
  if (userRole === "gestor" || userRole === "gerente_unidade") {
    return userUnitId === targetUnitId || userUnitId === "all";
  }
  return false;
}

/**
 * Realiza a autenticação na Takeat e obtém um novo Bearer token.
 */
export async function authenticateTakeat(
  email: string,
  password?: string
): Promise<string> {
  if (!email || !password) {
    throw new Error("Credenciais incompletas (e-mail ou senha da Takeat não informados).");
  }

  const response = await fetch(TAKEAT_CONFIG.AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Autenticação inválida: E-mail ou senha da Takeat incorretos.");
    }
    throw new Error(`Falha na autenticação da Takeat (HTTP ${response.status}).`);
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error("Resposta da Takeat não continha token de acesso.");
  }

  return data.token;
}

/**
 * Consulta a Takeat API pelo endpoint oficial:
 * GET https://backend-pdv-2.takeat.app/restaurants/v2/reports/general-cards
 *
 * Se retornar 401, renova o token automaticamente e repete a consulta.
 */
export async function fetchTakeatGeneralCards(
  credentials: TakeatCredentials,
  startDateIso: string,
  endDateIso: string,
  onTokenRefreshed?: (newToken: string) => void
): Promise<TakeatGeneralCardsResponse> {
  let token = credentials.token;

  if (!token && credentials.email && credentials.password) {
    token = await authenticateTakeat(credentials.email, credentials.password);
    if (onTokenRefreshed) onTokenRefreshed(token);
  }

  if (!token) {
    throw new Error("Nenhum token ou credencial disponível para autenticar com a Takeat.");
  }

  const url = `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${encodeURIComponent(
    startDateIso
  )}&end_date=${encodeURIComponent(endDateIso)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (err: any) {
    throw new Error(`Indisponibilidade da API Takeat: ${err.message || "Erro de conexão"}`);
  }

  // Se retornar 401 (token expirado), tenta renovar caso tenha email/senha
  if (response.status === 401 && credentials.email && credentials.password) {
    token = await authenticateTakeat(credentials.email, credentials.password);
    if (onTokenRefreshed) onTokenRefreshed(token);

    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Autenticação inválida: token expirado e não foi possível renovar.");
    }
    if (response.status === 400 || response.status === 422) {
      throw new Error("Período incorreto ou parâmetros inválidos enviados à Takeat.");
    }
    throw new Error(`A API da Takeat retornou erro HTTP ${response.status}.`);
  }

  return await response.json();
}

/**
 * Processa a resposta oficial da Takeat extraindo estritamente payment_without_tax:
 * - Salão = balcony + table
 * - Delivery = delivery
 * - iFood = ifood
 * - Faturamento Total Oficial = Salão + Delivery + iFood
 */
export function processOfficialRevenue(
  unitId: Exclude<UnitId, "all">,
  dateStr: string,
  response: TakeatGeneralCardsResponse
): TakeatRevenueRecord {
  // Validação estrita: payment_without_tax deve existir
  if (!response || typeof response !== "object" || !response.payment_without_tax) {
    throw new Error(
      "Objeto 'payment_without_tax' não encontrado na resposta oficial da Takeat."
    );
  }

  const pwt: TakeatPaymentWithoutTax = response.payment_without_tax;

  const rawBalcony = parseBRLNumber(pwt.balcony);
  const rawTable = parseBRLNumber(pwt.table);
  const rawDelivery = parseBRLNumber(pwt.delivery);
  const rawIfood = parseBRLNumber(pwt.ifood);

  // Canais
  const salao = Math.round((rawBalcony + rawTable) * 100) / 100;
  const delivery = rawDelivery;
  const ifood = rawIfood;
  const totalRevenue = Math.round((salao + delivery + ifood) * 100) / 100;

  const { startDate, endDate } = getBahiaIsoDayRange(dateStr);

  return {
    id: `takeat-${unitId}-${dateStr}`,
    unitId,
    date: dateStr,
    startDateUtc: startDate,
    endDateUtc: endDate,
    salao,
    delivery,
    ifood,
    totalRevenue,
    rawBalcony,
    rawTable,
    rawDelivery,
    rawIfood,
    source: "takeat",
    syncedAt: new Date().toISOString(),
  };
}
