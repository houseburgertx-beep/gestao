import {
  TakeatGeneralCardsResponse,
  TakeatPaymentWithoutTax,
  TakeatRevenueRecord,
  TakeatCredentials,
  TakeatSyncResult,
} from "@/types/takeat";
import { UnitId } from "@/types";

const TAKEAT_CONFIG = {
  REPORTS_URL: "https://backend-pdv-2.takeat.app/restaurants/v2/reports/general-cards",
  REPORTS_FALLBACK_URL: "https://backend-pdv.takeat.app/restaurants/v2/reports/general-cards",
  SHOW_RESTAURANT_URL: "https://backend-pdv-2.takeat.app/restaurants/show",
  MULTISTORES_MINIMAL_URL: "https://backend-pdv-2.takeat.app/restaurants/multistores/minimal",
};

/**
 * Sanitiza e limpa tokens Bearer de espaços, quebras de linha, aspas, JSON e prefixo \x27Bearer \x27.
 */
export function sanitizeToken(raw: any): string {
  if (!raw) return "";
  let clean = String(raw).trim();

  // Trata caso o usuário tenha colado um objeto JSON (ex: {"token":"..."} ou do localStorage)
  if (clean.startsWith("{") && clean.endsWith("}")) {
    try {
      const parsed = JSON.parse(clean);
      clean =
        parsed.token ||
        parsed.access_token ||
        parsed.jwt ||
        parsed.tokenClub ||
        clean;
    } catch {}
  }

  // Remove aspas simples, duplas ou crases externas repetidamente
  while (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'")) ||
    (clean.startsWith("`") && clean.endsWith("`"))
  ) {
    clean = clean.slice(1, -1).trim();
  }

  // Remove prefixo "Bearer " (case-insensitive)
  clean = clean.replace(/^bearer\s+/i, "").trim();

  // Remove aspas novamente se estavam dentro do Bearer
  while (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'")) ||
    (clean.startsWith("`") && clean.endsWith("`"))
  ) {
    clean = clean.slice(1, -1).trim();
  }

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

/**
 * Gera o intervalo ISO 8601 correspondente ao mês completo no fuso de Brasília/Bahia (UTC-03:00).
 * Exemplo para 2026-09:
 * start_date = 2026-09-01T03:00:00.000Z
 * end_date   = 2026-10-01T02:59:59.999Z
 */
export function getBahiaIsoMonthRange(yearMonthStr: string): { startDate: string; endDate: string } {
  const match = yearMonthStr.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error("Formato de mês inválido. Use AAAA-MM.");
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;

  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const startUtc = new Date(Date.UTC(year, month, 1, 3, 0, 0, 0));
  const endUtc = new Date(Date.UTC(year, month, lastDay + 1, 2, 59, 59, 999));

  return {
    startDate: startUtc.toISOString(),
    endDate: endUtc.toISOString(),
  };
}

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
 * Mapeia o nome retornado pela Takeat para o identificador de unidade do House 190.
 */
export function matchStoreNameToUnit(name: string): Exclude<UnitId, "all"> | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes("eunapolis") || n.includes("euna")) {
    return "eunapolis";
  }
  if (n.includes("teixeira") || n.includes("tx")) {
    return "teixeira";
  }
  if (n.includes("food") || n.includes("park")) {
    return "foodpark";
  }
  if (n.includes("central") || n.includes("producao")) {
    return "central";
  }
  return undefined;
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

export interface DiscoveredStore {
  id: number | string;
  name: string;
  matchedUnitId?: Exclude<UnitId, "all">;
}

export interface AuthenticateTakeatResult {
  token: string;
  restaurantId?: number | string;
  restaurantName?: string;
  discoveredStores?: DiscoveredStore[];
  authType: "multistores" | "restaurants" | "api";
}

/**
 * Realiza a autenticação na Takeat testando em cascata os serviços:
 * 1. Multilojas (Takeat Multistores - multilojas.takeat.app)
 * 2. Painel Restaurante (Takeat Dashboard - dashboard.takeat.app)
 * 3. Fallbacks nos clusters alternativos e API de sessões
 */
export async function authenticateTakeat(
  email: string,
  password?: string
): Promise<AuthenticateTakeatResult> {
  if (!email || !password) {
    throw new Error("Credenciais incompletas: informe o e-mail e a senha cadastrados na Takeat.");
  }

  const cleanEmail = email.trim().toLowerCase();

  const authAttempts: Array<{ url: string; type: "multistores" | "restaurants" | "api" }> = [
    // 1. Multilojas oficial (cluster 2)
    { url: "https://backend-pdv-2.takeat.app/public/sessions/multistores", type: "multistores" },
    // 2. Dashboard restaurante individual (cluster 2)
    { url: "https://backend-pdv-2.takeat.app/public/sessions/restaurants", type: "restaurants" },
    // 3. Multilojas cluster 1
    { url: "https://backend-pdv.takeat.app/public/sessions/multistores", type: "multistores" },
    // 4. Dashboard cluster 1
    { url: "https://backend-pdv.takeat.app/public/sessions/restaurants", type: "restaurants" },
    // 5. External sessions
    { url: "https://backend-pdv-2.takeat.app/public/api/sessions", type: "api" },
    { url: "https://backend-pdv.takeat.app/public/api/sessions", type: "api" },
  ];

  let lastErrorDetail = "";
  let lastStatus = 0;

  for (const attempt of authAttempts) {
    try {
      const response = await fetch(attempt.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      if (!response.ok) {
        lastStatus = response.status;
        try {
          const errData = await response.json();
          lastErrorDetail = errData.message || errData.error || "";
        } catch {
          lastErrorDetail = await response.text().catch(() => "");
        }
        continue;
      }

      const data = await response.json();
      const rawToken =
        data.token ||
        data.access_token ||
        data.jwt ||
        data.data?.token ||
        data.data?.access_token ||
        data.user?.token;

      const token = sanitizeToken(rawToken);

      if (token) {
        // Tenta descobrir as lojas conectadas usando este token autêntico
        const inspection = await inspectTakeatToken(token);
        return {
          token,
          restaurantId: inspection.restaurantId || data.restaurant?.id || data.data?.restaurant?.id,
          restaurantName: inspection.restaurantName || data.restaurant?.name || data.data?.restaurant?.name,
          discoveredStores: inspection.discoveredStores,
          authType: attempt.type,
        };
      }
    } catch (netErr: any) {
      lastErrorDetail = netErr.message || "Erro de conexão";
    }
  }

  if (lastStatus === 401 || lastStatus === 400) {
    throw new Error(
      `E-mail ou senha incorretos na Takeat. ${lastErrorDetail ? `(${lastErrorDetail})` : "Verifique seu usuário e senha."}`
    );
  }

  throw new Error(`Falha na autenticação da Takeat: ${lastErrorDetail || "Verifique suas credenciais"}.`);
}

/**
 * Inspeciona um Bearer token já existente na Takeat, descobrindo as lojas cadastradas
 * através de /restaurants/multistores/minimal ou /restaurants/show.
 */
export async function inspectTakeatToken(token: string): Promise<AuthenticateTakeatResult> {
  const cleanToken = sanitizeToken(token);
  if (!cleanToken) {
    throw new Error("Token não fornecido.");
  }

  const discoveredStores: DiscoveredStore[] = [];
  let singleRestaurantId: number | string | undefined = undefined;
  let singleRestaurantName: string | undefined = undefined;

  // 1. Tenta buscar a lista de multilojas (/restaurants/multistores/minimal)
  const multiUrls = [
    TAKEAT_CONFIG.MULTISTORES_MINIMAL_URL,
    "https://backend-pdv.takeat.app/restaurants/multistores/minimal",
  ];

  for (const mUrl of multiUrls) {
    try {
      const multiRes = await fetch(mUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          Accept: "application/json",
        },
      });

      if (multiRes.ok) {
        const storesList = await multiRes.json();
        if (Array.isArray(storesList) && storesList.length > 0) {
          for (const s of storesList) {
            if (s && s.id) {
              const matched = matchStoreNameToUnit(s.name || s.fantasy_name || "");
              discoveredStores.push({
                id: s.id,
                name: s.name || s.fantasy_name || `Loja #${s.id}`,
                matchedUnitId: matched,
              });
            }
          }
          break;
        }
      }
    } catch {}
  }

  // 2. Se não encontrou lista de multilojas, tenta /restaurants/show para loja individual
  if (discoveredStores.length === 0) {
    const showUrls = [
      TAKEAT_CONFIG.SHOW_RESTAURANT_URL,
      "https://backend-pdv.takeat.app/restaurants/show",
    ];

    for (const sUrl of showUrls) {
      try {
        const showRes = await fetch(sUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            Accept: "application/json",
          },
        });

        if (showRes.ok) {
          const showData = await showRes.json();
          const target = showData.data || showData;
          singleRestaurantId = target.id || target.restaurant?.id;
          singleRestaurantName = target.name || target.fantasy_name || target.restaurant?.name;
          if (singleRestaurantId) {
            const matched = matchStoreNameToUnit(singleRestaurantName || "");
            discoveredStores.push({
              id: singleRestaurantId,
              name: singleRestaurantName || `Restaurante #${singleRestaurantId}`,
              matchedUnitId: matched,
            });
            break;
          }
        }
      } catch {}
    }
  }

  return {
    token: cleanToken,
    restaurantId: singleRestaurantId,
    restaurantName: singleRestaurantName,
    discoveredStores,
    authType: discoveredStores.length > 1 ? "multistores" : "restaurants",
  };
}

/**
 * Consulta a Takeat API pelo endpoint oficial com suporte aos formatos da API da Takeat
 * e seleção por ids (multilojas) ou restaurant_id:
 * GET /restaurants/v2/reports/general-cards
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
    throw new Error(
      "Esta unidade ainda não possui uma sessão válida no Takeat. Clique em \x27Conectar Takeat\x27 e informe seu e-mail e senha."
    );
  }

  // Monta as variações de URL aceitas pela Takeat:
  const urlsToTry: string[] = [];

  // Se houver restaurantId definido para a unidade, tenta com ids (padrão Multilojas) e com restaurant_id
  if (credentials.restaurantId) {
    urlsToTry.push(
      `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startDateIso}&end_date=${endDateIso}&ids=${credentials.restaurantId}`
    );
    urlsToTry.push(
      `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startDateIso}&end_date=${endDateIso}&restaurant_id=${credentials.restaurantId}`
    );
  }

  // Formato padrão direto (para tokens específicos de uma loja)
  urlsToTry.push(
    `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startDateIso}&end_date=${endDateIso}`
  );

  // Clusters secundários como fallback
  if (credentials.restaurantId) {
    urlsToTry.push(
      `${TAKEAT_CONFIG.REPORTS_FALLBACK_URL}?start_date=${startDateIso}&end_date=${endDateIso}&ids=${credentials.restaurantId}`
    );
  }
  urlsToTry.push(
    `${TAKEAT_CONFIG.REPORTS_FALLBACK_URL}?start_date=${startDateIso}&end_date=${endDateIso}`
  );

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
        if (
          json &&
          (json.payment_without_tax ||
            json.data?.payment_without_tax ||
            json.report?.payment_without_tax)
        ) {
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
      lastErrorDetail = netErr.message || "Erro de conexão";
    }
  }

  if (lastStatus === 401) {
    throw new Error(
      `Takeat (HTTP 401 - Não autorizado): ${lastErrorDetail || "Token inválido ou expirado"}. Conecte novamente a conta da Takeat.`
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
  const pwt: TakeatPaymentWithoutTax | undefined =
    response?.payment_without_tax ||
    (response as any)?.data?.payment_without_tax ||
    (response as any)?.report?.payment_without_tax;

  if (!pwt || typeof pwt !== "object") {
    throw new Error(
      "Objeto \x27payment_without_tax\x27 não encontrado na resposta oficial da Takeat."
    );
  }

  const rawBalcony = parseBRLNumber(pwt.balcony);
  const rawTable = parseBRLNumber(pwt.table);
  const rawDelivery = parseBRLNumber(pwt.delivery);
  const rawIfood = parseBRLNumber(pwt.ifood);

  const salao = Math.round((rawBalcony + rawTable) * 100) / 100;
  const delivery = rawDelivery;
  const ifood = rawIfood;
  const totalRevenue = Math.round((salao + delivery + ifood) * 100) / 100;

  const isMonthly = /^\d{4}-\d{2}$/.test(dateStr);
  const { startDate, endDate } = isMonthly
    ? getBahiaIsoMonthRange(dateStr)
    : getBahiaIsoDayRange(dateStr);

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
