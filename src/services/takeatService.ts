import {
  TakeatGeneralCardsResponse,
  TakeatPaymentWithoutTax,
  TakeatRevenueRecord,
  TakeatCredentials,
  TakeatSyncResult,
} from "@/types/takeat";
import { UnitId } from "@/types";

const TAKEAT_CONFIG = {
  AUTH_URL: "https://backend-pdv-2.takeat.app/public/api/sessions",
  AUTH_FALLBACK_URL: "https://backend-pdv.takeat.app/public/api/sessions",
  REPORTS_URL: "https://backend-pdv-2.takeat.app/restaurants/v2/reports/general-cards",
  REPORTS_FALLBACK_URL: "https://backend-pdv.takeat.app/restaurants/v2/reports/general-cards",
};

/**
 * Sanitiza e limpa tokens Bearer de espaços, quebras de linha, aspas e prefixo 'Bearer '.
 */
export function sanitizeToken(raw: any): string {
  if (!raw || typeof raw !== "string") return "";
  let clean = raw.trim();
  // Remove aspas externas
  clean = clean.replace(/^["'`]+|["'`]+$/g, "").trim();
  // Remove prefixo "Bearer " (case-insensitive)
  if (/^bearer\s+/i.test(clean)) {
    clean = clean.replace(/^bearer\s+/i, "").trim();
  }
  // Remove aspas novamente se estavam dentro do Bearer
  clean = clean.replace(/^["'`]+|["'`]+$/g, "").trim();
  return clean;
}

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
 * Validação de permissões por perfil e unidade.
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

export interface AuthenticateTakeatResult {
  token: string;
  restaurantId?: number | string;
  restaurantName?: string;
}

/**
 * Realiza a autenticação na Takeat e obtém um novo Bearer token.
 */
export async function authenticateTakeat(
  email: string,
  password?: string
): Promise<AuthenticateTakeatResult> {
  if (!email || !password) {
    throw new Error("Credenciais incompletas: informe o e-mail e a senha cadastrados na Takeat.");
  }

  const cleanEmail = email.trim();
  const urlsToTry = [
    TAKEAT_CONFIG.AUTH_URL,
    TAKEAT_CONFIG.AUTH_FALLBACK_URL,
    "https://webhook.takeat.app/public/api/sessions",
  ];
  let lastError = "";

  for (const authUrl of urlsToTry) {
    try {
      const response = await fetch(authUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errData = await response.json();
          detail = errData.message || errData.error || (typeof errData === "string" ? errData : "");
        } catch {
          detail = await response.text().catch(() => "");
        }

        if (response.status === 401 || response.status === 400) {
          throw new Error(`E-mail ou senha incorretos na Takeat.${detail ? ` (${detail})` : ""}`);
        }
        lastError = `HTTP ${response.status}: ${detail}`;
        continue;
      }

      const data = await response.json();
      const rawToken =
        data.token ||
        data.access_token ||
        data.jwt ||
        (data.data && (data.data.token || data.data.access_token));

      const token = sanitizeToken(rawToken);

      if (token) {
        const rest = data.restaurant || (data.data && data.data.restaurant);
        return {
          token,
          restaurantId: rest?.id,
          restaurantName: rest?.name || rest?.fantasy_name,
        };
      }
    } catch (err: any) {
      if (err.message && err.message.includes("E-mail ou senha incorretos")) {
        throw err;
      }
      lastError = err.message || "Erro de conexão";
    }
  }

  throw new Error(`Falha na autenticação da Takeat: ${lastError || "Verifique e-mail e senha"}.`);
}

/**
 * Consulta a Takeat API pelo endpoint oficial com fallback entre clusters e suporte a parâmetros ISO:
 */
export async function fetchTakeatGeneralCards(
  credentials: TakeatCredentials,
  startDateIso: string,
  endDateIso: string,
  onTokenRefreshed?: (newToken: string) => void
): Promise<TakeatGeneralCardsResponse> {
  let token = sanitizeToken(credentials.token);

  if (!token && credentials.email && credentials.password) {
    const authRes = await authenticateTakeat(credentials.email, credentials.password);
    token = authRes.token;
    if (onTokenRefreshed) onTokenRefreshed(token);
  }

  if (!token) {
    throw new Error("Esta unidade ainda não possui uma sessão válida no Takeat. Clique em 'Conectar Takeat' e informe seu e-mail e senha do PDV.");
  }

  // Tenta URLs nos clusters disponíveis
  const urlsToTry: string[] = [
    // 1. backend-pdv-2 oficial com formato ISO direto
    `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startDateIso}&end_date=${endDateIso}`,
    // 2. backend-pdv-2 com restaurant_id se conhecido
    ...(credentials.restaurantId
      ? [`${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startDateIso}&end_date=${endDateIso}&restaurant_id=${credentials.restaurantId}`]
      : []),
    // 3. backend-pdv-2 com percent-encoding
    `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${encodeURIComponent(startDateIso)}&end_date=${encodeURIComponent(endDateIso)}`,
    // 4. backend-pdv primário
    `${TAKEAT_CONFIG.REPORTS_FALLBACK_URL}?start_date=${startDateIso}&end_date=${endDateIso}`,
    // 5. webhook cluster
    `https://webhook.takeat.app/restaurants/v2/reports/general-cards?start_date=${startDateIso}&end_date=${endDateIso}`,
  ];

  let lastStatus = 0;
  let lastErrorDetail = "";

  for (const url of urlsToTry) {
    try {
      let response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      // Se retornar 401 e tivermos usuário e senha, tenta renovar token
      if (response.status === 401 && credentials.email && credentials.password) {
        try {
          const authRes = await authenticateTakeat(credentials.email, credentials.password);
          token = authRes.token;
          if (onTokenRefreshed) onTokenRefreshed(token);

          response = await fetch(url, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          });
        } catch {}
      }

      if (response.ok) {
        const json = await response.json();
        // Valida se a resposta contém o objeto esperado
        if (json && (json.payment_without_tax || json.data?.payment_without_tax)) {
          return json;
        }
      }

      lastStatus = response.status;
      try {
        const errJson = await response.json();
        lastErrorDetail = errJson.message || errJson.error || errJson.errorType || "";
      } catch {
        lastErrorDetail = await response.text().catch(() => "");
      }
    } catch (netErr: any) {
      lastErrorDetail = netErr.message || "Erro de rede";
    }
  }

  if (lastStatus === 401) {
    throw new Error(
      `Takeat (HTTP 401 - Não autorizado): ${lastErrorDetail || "Token inválido, expirado ou usuário sem permissão para esta unidade no Takeat"}.`
    );
  }
  if (lastStatus === 400 || lastStatus === 422) {
    throw new Error(`Takeat (HTTP ${lastStatus} - Parâmetros inválidos): ${lastErrorDetail}`);
  }
  throw new Error(`Falha na consulta à Takeat (HTTP ${lastStatus}): ${lastErrorDetail || "Resposta inesperada"}`);
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
  // Suporta payment_without_tax tanto na raiz quanto dentro de data
  const pwt: TakeatPaymentWithoutTax | undefined =
    response?.payment_without_tax ||
    (response as any)?.data?.payment_without_tax ||
    (response as any)?.report?.payment_without_tax;

  if (!pwt || typeof pwt !== "object") {
    throw new Error(
      "Objeto 'payment_without_tax' não encontrado na resposta oficial da Takeat."
    );
  }

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
