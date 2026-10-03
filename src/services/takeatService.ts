import {
  TakeatGeneralCardsResponse,
  TakeatPaymentWithoutTax,
  TakeatRevenueRecord,
  TakeatCredentials,
  TakeatSyncResult,
  BrandId,
  ReceivedNfe,
  ReceivedNfeItem,
  TakeatFiscalIssuedSummary,
  TakeatFiscalIssuedItem,
  TakeatCashierSummary,
  TakeatCashierAuditItem,
  TakeatCashierPayment,
  TakeatCashierOpening,
  TakeatCashierTotals,
} from "@/types/takeat";
export type {
  BrandId,
  TakeatFiscalIssuedSummary,
  TakeatFiscalIssuedItem,
  TakeatCashierSummary,
  TakeatCashierAuditItem,
};
import { UnitId } from "@/types";
import { getDefaultTakeatCredentials } from "@/config/takeatCredentials";

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
 * Retorna a data de hoje no fuso oficial da Bahia/Brasília (America/Bahia, UTC-03:00) no formato YYYY-MM-DD.
 * Nunca sofre adiantamento de dia após as 21h.
 */
export function getTodayBahiaDate(refDate: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(refDate);
}

/**
 * Retorna a data de ontem no fuso oficial da Bahia/Brasília (America/Bahia, UTC-03:00) no formato YYYY-MM-DD.
 * Exemplo: Em 09/09/2026 (quarta-feira), retorna rigorosamente 2026-09-08 (terça-feira).
 */
export function getYesterdayBahiaDate(refDate: Date = new Date()): string {
  const bahiaStr = getTodayBahiaDate(refDate);
  const [y, m, d] = bahiaStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(prev);
}

/**
 * Retorna o mês atual no fuso da Bahia (YYYY-MM).
 */
export function getCurrentBahiaMonth(refDate: Date = new Date()): string {
  return getTodayBahiaDate(refDate).substring(0, 7);
}

/**
 * Retorna o mês anterior no fuso da Bahia (YYYY-MM).
 */
export function getPreviousBahiaMonth(refDate: Date = new Date()): string {
  const [yearStr, monthStr] = getCurrentBahiaMonth(refDate).split("-");
  let y = parseInt(yearStr, 10);
  let m = parseInt(monthStr, 10) - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
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
 * Identifica a marca da operação (House vs Bruttus).
 */
export function matchStoreNameToBrand(name: string): BrandId {
  if (!name) return "house";
  const n = name.toLowerCase();
  if (n.includes("bruttus") || n.includes("brutus")) {
    return "bruttus";
  }
  return "house";
}

export interface TakeatOperation {
  key: string;
  name: string;
  unitId: Exclude<UnitId, "all">;
  brand: BrandId;
  shortName: string;
}

export const TAKEAT_OPERATIONS: TakeatOperation[] = [
  // Cada entrada = 1 login real no Takeat
  // Teixeira: login Gleucehouse@gmail.com → House 190 Teixeira + Bruttus Burger TX (2ª marca)
  { key: "teixeira", name: "Teixeira de Freitas (House + Bruttus)", unitId: "teixeira", brand: "house", shortName: "Teixeira" },
  // Eunápolis: login Gleucehouse1@gmail.com → House 190 Eunápolis + Bruttus Eunápolis (2ª marca)
  { key: "eunapolis", name: "Eunápolis (House + Bruttus)", unitId: "eunapolis", brand: "house", shortName: "Eunápolis" },
  // Foodpark: login Gleucedias1@gmail.com → apenas House Foodpark
  { key: "foodpark", name: "House Foodpark", unitId: "foodpark", brand: "house", shortName: "Foodpark" },
];

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
          const errData = (await response.json()) as Record<string, any>;
          lastErrorDetail = errData.message || errData.error || "";
        } catch {
          lastErrorDetail = await response.text().catch(() => "");
        }
        continue;
      }

      const data = (await response.json()) as Record<string, any>;
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
          const showData = (await showRes.json()) as Record<string, any>;
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

  // Monta as variações de URL aceitas pela Takeat (tanto com encode quanto puro):
  const startEnc = encodeURIComponent(startDateIso);
  const endEnc = encodeURIComponent(endDateIso);
  const urlsToTry: string[] = [];

  // Se houver restaurantId definido para a unidade, tenta com ids (padrão Multilojas) e com restaurant_id
  if (credentials.restaurantId) {
    urlsToTry.push(
      `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startEnc}&end_date=${endEnc}&ids=${credentials.restaurantId}`
    );
    urlsToTry.push(
      `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startDateIso}&end_date=${endDateIso}&ids=${credentials.restaurantId}`
    );
    urlsToTry.push(
      `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startEnc}&end_date=${endEnc}&restaurant_id=${credentials.restaurantId}`
    );
  }

  // Formato padrão direto (para tokens específicos de uma loja)
  urlsToTry.push(
    `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startEnc}&end_date=${endEnc}`
  );
  urlsToTry.push(
    `${TAKEAT_CONFIG.REPORTS_URL}?start_date=${startDateIso}&end_date=${endDateIso}`
  );

  // Clusters secundários como fallback
  if (credentials.restaurantId) {
    urlsToTry.push(
      `${TAKEAT_CONFIG.REPORTS_FALLBACK_URL}?start_date=${startEnc}&end_date=${endEnc}&ids=${credentials.restaurantId}`
    );
    urlsToTry.push(
      `${TAKEAT_CONFIG.REPORTS_FALLBACK_URL}?start_date=${startDateIso}&end_date=${endDateIso}&ids=${credentials.restaurantId}`
    );
  }
  urlsToTry.push(
    `${TAKEAT_CONFIG.REPORTS_FALLBACK_URL}?start_date=${startEnc}&end_date=${endEnc}`
  );
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
        const json = (await response.json()) as Record<string, any>;
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
        const errJson = (await response.json()) as Record<string, any>;
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
 * Extrai os canais de venda (Salão, Delivery Próprio e iFood) analisando
 * exaustivamente qualquer resposta da Takeat (payment_without_tax, sales_by_channel,
 * channels, etc.) de forma case-insensitive e tolerante a múltiplos sinônimos
 * em português e inglês (balcão, mesas, salão, pdv, totem, ifood, delivery próprio, etc.).
 */
export function extractChannelsFromTakeatResponse(
  response: TakeatGeneralCardsResponse
): {
  salao: number;
  delivery: number;
  ifood: number;
  rawBalcony: number;
  rawTable: number;
  rawDelivery: number;
  rawIfood: number;
  totalRevenue: number;
} {
  const pwt: Record<string, any> =
    response?.payment_without_tax ||
    (response as any)?.data?.payment_without_tax ||
    (response as any)?.report?.payment_without_tax ||
    {};

  let rawBalcony = parseBRLNumber(pwt.balcony);
  let rawTable = parseBRLNumber(pwt.table);
  let rawDelivery = parseBRLNumber(pwt.delivery);
  let rawIfood = parseBRLNumber(pwt.ifood || pwt.iFood || pwt.IFOOD);

  // Varre exaustivamente todas as chaves do objeto de pagamentos sem taxas
  for (const [key, val] of Object.entries(pwt)) {
    if (val === null || val === undefined) continue;
    const cleanKey = key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    const num = parseBRLNumber(val);
    if (num <= 0) continue;

    // Salão (balcão, mesas, salão, pdv, totem, consumo local, comanda)
    if (
      cleanKey.includes("balcao") ||
      cleanKey.includes("balcony") ||
      cleanKey.includes("retirada") ||
      cleanKey.includes("counter") ||
      cleanKey.includes("takeaway")
    ) {
      if (rawBalcony === 0) rawBalcony = num;
    } else if (
      cleanKey.includes("mesa") ||
      cleanKey.includes("table") ||
      cleanKey.includes("salao") ||
      cleanKey.includes("salon") ||
      cleanKey.includes("dinein") ||
      cleanKey.includes("hall") ||
      cleanKey.includes("totem") ||
      cleanKey.includes("pdv") ||
      cleanKey.includes("pos") ||
      cleanKey.includes("comanda") ||
      cleanKey.includes("presencial") ||
      cleanKey.includes("consumolocal")
    ) {
      if (rawTable === 0) rawTable = num;
    }
    // iFood (iFood, integracao_ifood, marketplace, apps)
    else if (
      cleanKey.includes("ifood") ||
      cleanKey.includes("integracaoifood") ||
      cleanKey.includes("marketplace") ||
      cleanKey.includes("deliveryapp")
    ) {
      if (rawIfood === 0) rawIfood = num;
    }
    // Delivery Próprio
    else if (
      cleanKey.includes("deliveryproprio") ||
      cleanKey.includes("proprio") ||
      cleanKey.includes("whatsapp") ||
      cleanKey.includes("cardapio") ||
      cleanKey.includes("site") ||
      cleanKey.includes("app")
    ) {
      if (rawDelivery === 0) rawDelivery = num;
    }
  }

  // Verifica outras seções da resposta oficial da Takeat (channels, sales_by_channel, cards)
  const channelSources = [
    (response as any)?.sales_by_channel,
    (response as any)?.channels,
    (response as any)?.data?.sales_by_channel,
    (response as any)?.data?.channels,
    (response as any)?.report?.sales_by_channel,
    (response as any)?.report?.channels,
    (response as any)?.cards?.channels,
  ];

  for (const src of channelSources) {
    if (src && typeof src === "object") {
      for (const [k, v] of Object.entries(src)) {
        const cleanK = k
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "");
        const num = parseBRLNumber(
          (v as any)?.total || (v as any)?.value || (v as any)?.amount || v
        );
        if (num <= 0) continue;

        if (
          rawBalcony === 0 &&
          rawTable === 0 &&
          (cleanK.includes("salao") ||
            cleanK.includes("mesa") ||
            cleanK.includes("balcao") ||
            cleanK.includes("pdv"))
        ) {
          rawTable = num;
        } else if (rawIfood === 0 && cleanK.includes("ifood")) {
          rawIfood = num;
        } else if (
          rawDelivery === 0 &&
          (cleanK.includes("delivery") ||
            cleanK.includes("proprio") ||
            cleanK.includes("site"))
        ) {
          rawDelivery = num;
        }
      }
    }
  }

  const salao = Math.round((rawBalcony + rawTable) * 100) / 100;
  const delivery = rawDelivery;
  const ifood = rawIfood;
  const totalRevenue = Math.round((salao + delivery + ifood) * 100) / 100;

  return {
    salao,
    delivery,
    ifood,
    rawBalcony,
    rawTable,
    rawDelivery,
    rawIfood,
    totalRevenue,
  };
}

/**
 * Processa a resposta oficial da Takeat extraindo canais detalhados:
 * - Salão = Balcão + Mesas / Salão
 * - Delivery Próprio = WhatsApp / Cardápio Digital / Delivery Próprio
 * - iFood = Integração iFood / Marketplaces
 * - Faturamento Total Oficial = Salão + Delivery + iFood
 */
export function processOfficialRevenue(
  unitId: Exclude<UnitId, "all">,
  dateStr: string,
  response: TakeatGeneralCardsResponse,
  brand?: BrandId,
  operationKey?: string,
  operationName?: string
): TakeatRevenueRecord {
  const pwt =
    response?.payment_without_tax ||
    (response as any)?.data?.payment_without_tax ||
    (response as any)?.report?.payment_without_tax;

  if (!pwt || typeof pwt !== "object") {
    throw new Error(
      "Objeto 'payment_without_tax' não encontrado na resposta oficial da Takeat."
    );
  }

  const channels = extractChannelsFromTakeatResponse(response);

  const isMonthly = /^\d{4}-\d{2}$/.test(dateStr);
  const { startDate, endDate } = isMonthly
    ? getBahiaIsoMonthRange(dateStr)
    : getBahiaIsoDayRange(dateStr);

  const opKey = operationKey || (brand ? `${unitId}_${brand}` : `${unitId}_house`);
  const recordId = `takeat-${opKey}-${dateStr}`;

  return {
    id: recordId,
    unitId,
    brand: brand || "house",
    operationKey: opKey,
    operationName: operationName || (brand === "bruttus" ? `Bruttus ${unitId === "teixeira" ? "TX" : "Eunápolis"}` : `House 190 ${unitId === "teixeira" ? "Teixeira" : unitId === "eunapolis" ? "Eunápolis" : "Foodpark"}`),
    date: dateStr,
    startDateUtc: startDate,
    endDateUtc: endDate,
    salao: channels.salao,
    delivery: channels.delivery,
    ifood: channels.ifood,
    totalRevenue: channels.totalRevenue,
    rawBalcony: channels.rawBalcony,
    rawTable: channels.rawTable,
    rawDelivery: channels.rawDelivery,
    rawIfood: channels.rawIfood,
    source: "takeat",
    syncedAt: new Date().toISOString(),
  };
}

export interface BrandOrdersSummary {
  houseTotal: number;
  bruttusTotal: number;
  houseShare: number;
  bruttusShare: number;
  houseCount: number;
  bruttusCount: number;
}

/**
 * Consulta os pedidos da Takeat para calcular o faturamento real separado de cada marca (House vs Bruttus).
 */
export async function fetchTakeatOrdersSummary(
  credentials: TakeatCredentials,
  startDateUtc: string,
  endDateUtc: string
): Promise<BrandOrdersSummary | null> {
  const token = sanitizeToken(credentials.token);
  if (!token) return null;

  try {
    const url = `https://backend-pdv-2.takeat.app/restaurants/orders?start_date=${encodeURIComponent(
      startDateUtc
    )}&end_date=${encodeURIComponent(endDateUtc)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;
    const orders = await res.json();
    if (!Array.isArray(orders) || orders.length === 0) return null;

    let houseTotal = 0;
    let bruttusTotal = 0;
    let houseCount = 0;
    let bruttusCount = 0;

    for (const o of orders) {
      const val = parseFloat(o.bill?.total_price || o.basket?.total_price || 0) || 0;
      let brandId: number | null = null;
      if (o.payments && Array.isArray(o.payments) && o.payments.length > 0) {
        brandId = o.payments[0].brand_id || null;
      }
      const str = JSON.stringify(o).toLowerCase();
      const isBruttus =
        brandId === 34303 ||
        brandId === 35070 ||
        str.includes("bruttus") ||
        str.includes("brutus");

      if (isBruttus) {
        bruttusTotal += val;
        bruttusCount++;
      } else {
        houseTotal += val;
        houseCount++;
      }
    }

    const total = houseTotal + bruttusTotal;
    const houseShare = total > 0 ? houseTotal / total : 1;
    const bruttusShare = total > 0 ? bruttusTotal / total : 0;

    return {
      houseTotal,
      bruttusTotal,
      houseShare,
      bruttusShare,
      houseCount,
      bruttusCount,
    };
  } catch {
    return null;
  }
}

/**
 * Cria os registros separados de House 190, Bruttus Burger e Consolidado Oficial
 * garantindo que a soma House + Bruttus seja 100% igual ao Consolidado da Takeat.
 */
export function createBrandSeparatedRecords(
  unitId: Exclude<UnitId, "all">,
  dateStr: string,
  response: TakeatGeneralCardsResponse,
  ordersSummary?: BrandOrdersSummary | null
): {
  consolidated: TakeatRevenueRecord;
  house: TakeatRevenueRecord;
  bruttus?: TakeatRevenueRecord;
} {
  const consolidated = processOfficialRevenue(
    unitId,
    dateStr,
    response,
    "all",
    `${unitId}_consolidated`,
    unitId === "teixeira"
      ? "Teixeira (Consolidado)"
      : unitId === "eunapolis"
      ? "Eunápolis (Consolidado)"
      : "House Foodpark"
  );

  // Foodpark ou Central não possuem 2ª marca
  if (unitId !== "teixeira" && unitId !== "eunapolis") {
    const houseOnly = {
      ...consolidated,
      id: `takeat-${unitId}_house-${dateStr}`,
      operationKey: `${unitId}_house`,
      brand: "house" as BrandId,
      operationName: "House Foodpark",
    };
    return { consolidated, house: houseOnly };
  }

  // Divisão para Teixeira e Eunápolis
  const hasBruttusSales = ordersSummary && ordersSummary.bruttusTotal > 0;
  const bShare = hasBruttusSales ? ordersSummary.bruttusShare : 0;

  // Bruttus opera via Delivery e iFood (dark kitchen)
  const bruttusDelivery = Math.round(consolidated.delivery * bShare * 100) / 100;
  const bruttusIfood = Math.round(consolidated.ifood * bShare * 100) / 100;
  const bruttusSalao = 0; // Salão físico é 100% House 190
  const bruttusTotal = Math.round((bruttusDelivery + bruttusIfood) * 100) / 100;

  // House 190 fica com todo o salão + a diferença exata de delivery e ifood
  const houseSalao = consolidated.salao;
  const houseDelivery = Math.round((consolidated.delivery - bruttusDelivery) * 100) / 100;
  const houseIfood = Math.round((consolidated.ifood - bruttusIfood) * 100) / 100;
  const houseTotal = Math.round((houseSalao + houseDelivery + houseIfood) * 100) / 100;

  const unitCity = unitId === "teixeira" ? "TX" : "Eunápolis";

  const houseRecord: TakeatRevenueRecord = {
    ...consolidated,
    id: `takeat-${unitId}_house-${dateStr}`,
    operationKey: `${unitId}_house`,
    brand: "house",
    operationName: `House 190 ${unitCity}`,
    salao: houseSalao,
    delivery: houseDelivery,
    ifood: houseIfood,
    totalRevenue: houseTotal,
  };

  const bruttusRecord: TakeatRevenueRecord = {
    ...consolidated,
    id: `takeat-${unitId}_bruttus-${dateStr}`,
    operationKey: `${unitId}_bruttus`,
    brand: "bruttus",
    operationName: `Bruttus Burger ${unitCity}`,
    salao: bruttusSalao,
    delivery: bruttusDelivery,
    ifood: bruttusIfood,
    totalRevenue: bruttusTotal,
  };

  return {
    consolidated,
    house: houseRecord,
    bruttus: bruttusRecord,
  };
}

/**
 * Consulta as Notas Fiscais Recebidas (NF-e de compras/entrada e Manifesto de Notas) na Takeat.
 * 
 * Endpoint oficial utilizado pelo dashboard da Takeat (dashboard.takeat.app/fiscal/manifest):
 * GET https://backend-pdv-2.takeat.app/restaurants/nfe-received
 * Parâmetros:
 * - start_date=YYYY-MM-DD e end_date=YYYY-MM-DD
 * - pendente=true: busca as notas do MANIFESTO DO DESTINATÁRIO (emitidas contra o CNPJ na SEFAZ com ciência/pendência)
 * - pendente=false: busca as notas com entrada confirmada
 */
export async function fetchTakeatReceivedNfes(
  credentials: TakeatCredentials,
  onTokenRefreshed?: (newToken: string) => void,
  customStartDate?: string,
  customEndDate?: string
): Promise<ReceivedNfe[]> {
  let token = sanitizeToken(credentials.token);

  // Auto-login se não tiver token
  if (!token && credentials.email && credentials.password) {
    const authRes = await authenticateTakeat(credentials.email, credentials.password);
    token = authRes.token;
    if (onTokenRefreshed) onTokenRefreshed(token);
  }

  if (!token) {
    throw new Error(`Esta loja (${credentials.unitId}) ainda não possui uma conexão ativa com a Takeat.`);
  }

  // Período de busca: período customizado ou últimos 90 dias
  const now = new Date();
  const end = new Date(now.getTime());
  const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startDate = customStartDate || start.toISOString().substring(0, 10);
  const endDate = customEndDate || end.toISOString().substring(0, 10);

  const restaurantParam = credentials.restaurantId ? `&restaurant_id=${credentials.restaurantId}` : "";

  // Consultamos tanto pendente=true (Manifesto de Notas - 14+ notas por loja) quanto pendente=false (Entrada)
  const queryConfigs = [
    { pendente: true, tipoPadrao: "manifesto" },
    { pendente: false, tipoPadrao: "entrada" },
  ];

  const baseEndpoints = [
    "https://backend-pdv-2.takeat.app/restaurants/nfe-received",
    "https://backend-pdv.takeat.app/restaurants/nfe-received",
  ];

  const gatheredMap = new Map<string, ReceivedNfe>();
  let lastError = "";

  for (const cfg of queryConfigs) {
    for (const base of baseEndpoints) {
      const url = `${base}?start_date=${startDate}&end_date=${endDate}&pendente=${cfg.pendente}${restaurantParam}`;
      try {
        let res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });

        // Se 401 e temos credenciais, tenta renovar token
        if (res.status === 401 && credentials.email && credentials.password) {
          try {
            const authRes = await authenticateTakeat(credentials.email, credentials.password);
            token = authRes.token;
            if (onTokenRefreshed) onTokenRefreshed(token);

            res = await fetch(url, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
              },
            });
          } catch {}
        }

        if (res.ok) {
          const list = await res.json();
          
          if (Array.isArray(list)) {
            for (const item of list) {
              const chave = String(item.chave_nfe || item.identification?.access_key || item.chave || item.access_key || "");
              const id = String(item.id || chave || Math.random());

              const rawManifestType = item.manifestacao_destinatario || item.manifestation?.type || item.manifesto_tipo;
              let manifestType: "ciencia" | "confirmacao" | "desconhecimento" | "nao_realizada" | string = "nao_realizada";
              if (rawManifestType) {
                const cleanType = String(rawManifestType).toLowerCase();
                if (cleanType.includes("ciencia") || cleanType.includes("ciência")) {
                  manifestType = "ciencia";
                } else if (cleanType.includes("confirma")) {
                  manifestType = "confirmacao";
                } else if (cleanType.includes("desconhec")) {
                  manifestType = "desconhecimento";
                } else {
                  manifestType = cleanType;
                }
              } else if (!cfg.pendente) {
                manifestType = "confirmacao";
              }

              const brandObj = item.brand || {};
              const destCnpj = brandObj.cnpj || item.destinatario_cnpj || item.recipient?.cnpj || "";
              const destNome = brandObj.fantasy_name || brandObj.name || "";

              const nfeRecord: ReceivedNfe = {
                id,
                nfeReceivedId: item.id,
                unitId: credentials.unitId,
                brand: credentials.brand,
                numero: String(item.numero || item.identification?.number || item.number || item.numero_nfe || "S/N"),
                serie: String(item.serie || item.identification?.series || "1"),
                chave,
                fornecedorNome: item.nome_emitente || item.issuer?.name || item.fornecedor_nome || item.supplier_name || "Fornecedor",
                fornecedorCnpj: item.documento_emitente || item.issuer?.document || item.fornecedor_cnpj || "",
                destinatarioCnpj: destCnpj,
                destinatarioNome: destNome,
                dataEmissao: (item.data_emissao || item.timestamps?.issued_at || item.issue_date || new Date().toISOString()).substring(0, 10),
                valorTotal: parseBRLNumber(item.valor_total || item.amounts?.total || item.total_amount || 0),
                status: (item.situacao === "cancelada" || item.canceled_at || item.status?.situation === "cancelada")
                  ? "cancelada"
                  : (item.situacao === "processando" || item.status?.situation === "processando")
                    ? "processando"
                    : "autorizada",
                manifestationType: manifestType,
                manifestedAt: item.manifestacao_at || item.manifestation?.manifested_at || null,
                tipoDocumento: manifestType === "confirmacao" ? "entrada" : "manifesto",
                source: "takeat",
                syncedAt: new Date().toISOString(),
              };

              const deduplicationKey = chave || id;
              gatheredMap.set(deduplicationKey, nfeRecord);
            }
            break;
          }
        } else {
          lastError = `HTTP ${res.status}`;
        }
      } catch (e: any) {
        lastError = e.message || "Erro de conexão";
      }
    }
  }

  const result = Array.from(gatheredMap.values());
  if (result.length > 0) {
    return result;
  }

  console.warn(`[Takeat NF-e] Nenhuma nota encontrada para ${credentials.unitId}: ${lastError}`);
  return [];
}

/**
 * Consulta a emissão oficial de cupons fiscais (NFC-e) na Takeat para uma unidade e data (America/Bahia).
 * Retorna a quantidade de cupons, o valor total emitido (igual ao relatório do PDV), e a lista de cupons.
 */
export async function fetchTakeatIssuedInvoicesSummary(
  unitId: Exclude<UnitId, "all">,
  dateStr: string, // YYYY-MM-DD
  customToken?: string
): Promise<TakeatFiscalIssuedSummary> {
  const creds = getDefaultTakeatCredentials(unitId);
  if (!creds) {
    throw new Error(`Credenciais padrão não configuradas para a unidade ${unitId}.`);
  }

  let token = sanitizeToken(customToken || creds.token);
  if (!token && creds.email && creds.password) {
    const authRes = await authenticateTakeat(creds.email, creds.password);
    token = authRes.token;
  }

  if (!token) {
    throw new Error(`Não foi possível autenticar a unidade ${unitId} na Takeat.`);
  }

  // Parse YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  // Janela de busca para cobrir comandas abertas na véspera e finalizadas com NFC-e no dia alvo
  const prevDate = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1, 6, 0, 0));
  const fetchStart = prevDate.toISOString();
  const fetchEnd = nextDate.toISOString();

  const url = `https://public-api.takeat.app/v1/table-sessions?start_date=${encodeURIComponent(fetchStart)}&end_date=${encodeURIComponent(fetchEnd)}`;

  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  // Se token expirou (401), renova e tenta de novo
  if (res.status === 401 && creds.email && creds.password) {
    const authRes = await authenticateTakeat(creds.email, creds.password);
    token = authRes.token;
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  }

  if (!res.ok) {
    throw new Error(`Erro ao consultar sessões da Takeat: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Resposta inesperada da Takeat ao listar sessões.");
  }

  let count = 0;
  let nfceTotalPrice = 0;
  let totalPayments = 0;
  const methods: Record<string, number> = {};
  const invoices: TakeatFiscalIssuedItem[] = [];

  for (const s of data) {
    if (s.nfce && s.nfce.status === "autorizado") {
      const nfceDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bahia",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(s.nfce.created_at));

      if (nfceDate === dateStr) {
        count++;
        const pTotal = parseFloat(s.nfce.total_price || 0) || 0;
        nfceTotalPrice += pTotal;

        let sessionPaymentsTotal = 0;
        if (Array.isArray(s.payments) && s.payments.length > 0) {
          for (const p of s.payments) {
            const mName = p.payment_method?.name || p.channel || "Outro";
            const val = parseFloat(p.payment_value || 0) || 0;
            methods[mName] = Math.round(((methods[mName] || 0) + val) * 100) / 100;
            sessionPaymentsTotal += val;
          }
        } else {
          sessionPaymentsTotal = pTotal;
        }

        totalPayments += sessionPaymentsTotal;

        invoices.push({
          numero: String(s.nfce.numero || "S/N"),
          total: pTotal,
          issuedAt: s.nfce.created_at,
          htmlUrl: s.nfce.nfce_html,
          xmlUrl: s.nfce.nfce_xml,
        });
      }
    }
  }

  const totalIssued = Math.round(totalPayments * 100) / 100;
  nfceTotalPrice = Math.round(nfceTotalPrice * 100) / 100;

  return {
    unitId,
    date: dateStr,
    count,
    totalIssued,
    nfceTotalPrice,
    methods,
    invoices,
    syncedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DE CAIXA — fetchTakeatCashierSummary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapa de normalização de nomes de método de pagamento do Takeat.
 * Chaves são substrings case-insensitive do campo `description` que a API retorna.
 */
const TAKEAT_PAYMENT_MAP: Array<{
  match: string | string[];
  field: keyof TakeatCashierSummary["mapped"];
}> = [
  { match: "dinheiro",                               field: "systemCash" },
  { match: ["credito", "crédito", "credit"],         field: "systemCredit" },
  { match: ["debito", "débito", "debit"],             field: "systemDebit" },
  { match: "pix",                                    field: "systemPix" },
  { match: ["pagamento online ifood", "online ifood"], field: "systemIfoodOnline" },
  { match: ["cupom ifood", "ifood voucher"],          field: "systemIfoodVoucher" },
  { match: ["prazo", "faturado", "conven"],           field: "systemTerm" },
  { match: ["resgate clube", "cashback takeat", "clube"], field: "systemClub" },
  { match: ["taxa de servico", "taxa de serviço", "service fee", "gorjeta"], field: "systemServiceFee" },
];

/**
 * Identifica a qual campo mapeado pertence um payment_method description.
 * Retorna null se não for reconhecido (ex: Alelo, PicPay, etc.).
 */
function mapPaymentDescription(desc: string): keyof TakeatCashierSummary["mapped"] | null {
  const lower = desc.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const rule of TAKEAT_PAYMENT_MAP) {
    const matchers = Array.isArray(rule.match) ? rule.match : [rule.match];
    if (matchers.some(m => lower.includes(m.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
      return rule.field;
    }
  }
  return null;
}

/**
 * Busca os dados do caixa do PDV Takeat para uma unidade e data específica.
 *
 * Estratégia:
 * 1. Obtém token via credenciais da unidade.
 * 2. Verifica se há caixa aberto (/cashier-opening-verify).
 * 3. Se caixa aberto E a data for hoje → usa /summary/null (dados em tempo real).
 * 4. Para datas passadas ou caixa já fechado → consulta /cashier-audit para encontrar
 *    o cashier_opening_id correto, depois busca /summary/:id.
 * 5. Agrupa automatic_deposits por método e popula os campos `mapped`.
 *
 * @param unitId  ID da unidade ("teixeira", "eunapolis", "foodpark")
 * @param dateStr Data no formato YYYY-MM-DD (Bahia / UTC-3)
 */
export async function fetchTakeatCashierSummary(
  unitId: Exclude<UnitId, "all" | "central">,
  dateStr: string
): Promise<TakeatCashierSummary> {
  const creds = getDefaultTakeatCredentials(unitId);
  if (!creds) {
    throw new Error(`Nenhuma credencial configurada para a unidade "${unitId}".`);
  }

  // ── 1. Autenticação ──────────────────────────────────────
  let token = sanitizeToken(creds.token);
  // Captura email/password em variáveis locais para que o closure doFetch não
  // precise referenciar `creds` (que é TakeatCredentials | null pré-guard).
  const credsEmail = creds.email;
  const credsPassword = creds.password;

  if (!token && credsEmail && credsPassword) {
    const authResult = await authenticateTakeat(credsEmail, credsPassword);
    token = authResult.token;
  }
  if (!token) {
    throw new Error(`Não foi possível autenticar na Takeat para a unidade "${unitId}".`);
  }

  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const BASE = "https://backend-pdv-2.takeat.app";

  /**
   * Helper: faz fetch com fallback para cluster antigo e retry em 401.
   */
  async function doFetch(path: string): Promise<any> {
    const primaryUrl = `${BASE}${path}`;
    const fallbackUrl = `https://backend-pdv.takeat.app${path}`;

    for (const url of [primaryUrl, fallbackUrl]) {
      let res = await fetch(url, { headers });

      // Retry 401 com novo token
      if (res.status === 401 && credsEmail && credsPassword) {
        try {
          const authResult = await authenticateTakeat(credsEmail, credsPassword);
          token = authResult.token;
          headers.Authorization = `Bearer ${token}`;
          res = await fetch(url, { headers });
        } catch {}
      }

      if (res.ok) {
        return res.json();
      }
    }
    throw new Error(`Falha ao consultar ${path} para unidade "${unitId}".`);
  }

  // ── 2. Verifica se há caixa aberto agora ────────────────
  const todayBahia = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Bahia",
  }); // YYYY-MM-DD no fuso de Bahia

  let openingId: number | null = null;
  let isOpen = false;

  try {
    const verifyData = await doFetch("/restaurants/cashier-opening-verify");
    if (verifyData?.id) {
      openingId = verifyData.id as number;
      isOpen = true;
    }
  } catch {}

  // ── 3. Decide qual summary buscar ───────────────────────
  // Regra Oficial: o turno comercial do restaurante é SEMPRE identificado
  // pela DATA DE ABERTURA do caixa (opened_at em America/Bahia).
  // Exemplo: o turno da noite de 01/10 abre às 17:39 de 01/10 e fecha de madrugada
  // ou no dia seguinte (02/10). Esse fechamento PERTENCE ao dia 01/10.
  let summaryData: any;

  function getBahiaDay(iso: string | null | undefined): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
  }

  // Busca janela ampla de auditorias (7 dias antes a 2 dias depois)
  const targetDate = new Date(`${dateStr}T12:00:00-03:00`);
  const auditStart = new Date(targetDate.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10);
  const auditEnd = new Date(targetDate.getTime() + 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10);

  let auditList: TakeatCashierAuditItem[] = [];
  try {
    const auditRaw = await doFetch(
      `/restaurants/cashier-audit?start_date=${auditStart}&end_date=${auditEnd}`
    );
    if (Array.isArray(auditRaw)) auditList = auditRaw;
  } catch {}

  // 1. Prioridade Máxima: caixas que ABRIRAM na data solicitada (opened_at)
  const openedMatches = auditList.filter(a => getBahiaDay(a.opened_at) === dateStr);

  let chosenAudit: TakeatCashierAuditItem | undefined;

  if (openedMatches.length > 0) {
    // Se houver mais de um caixa aberto na data (ex: teste rápido de 1 minuto),
    // seleciona o turno principal com maior volume de vendas no sistema
    openedMatches.sort(
      (a, b) => parseFloat(b.total_system_value || "0") - parseFloat(a.total_system_value || "0")
    );
    chosenAudit = openedMatches[0];
  } else {
    // Fallback secundário: se nenhum caixa abriu nessa data, verifica por data de fechamento
    chosenAudit = auditList.find(a => getBahiaDay(a.closed_at) === dateStr);
  }

  // Se a data solicitada for hoje (no fuso de Brasília/Bahia) e houver caixa aberto agora
  if (dateStr === todayBahia && isOpen && openingId) {
    // Se não há caixa auditado para hoje, ou se o usuário está conferindo o turno ativo aberto hoje
    if (!chosenAudit) {
      summaryData = await doFetch("/restaurants/cashier-opening-event/summary/null");
      isOpen = true;
    } else {
      // Já existe um turno fechado de hoje (ex: almoço já auditado), usa o fechado
      summaryData = await doFetch(
        `/restaurants/cashier-opening-event/summary/${chosenAudit.cashier_opening_id}`
      );
      isOpen = false;
    }
  } else if (chosenAudit) {
    summaryData = await doFetch(
      `/restaurants/cashier-opening-event/summary/${chosenAudit.cashier_opening_id}`
    );
    isOpen = false;
  } else {
    throw new Error(
      `Nenhum caixa do Takeat encontrado que abriu ou operou na data ${dateStr} para "${unitId}".`
    );
  }

  // ── 4. Extrai e valida a resposta ────────────────────────
  if (!summaryData || !summaryData.opening) {
    throw new Error(`Resposta inválida da Takeat para o caixa de "${unitId}" em ${dateStr}.`);
  }

  const opening: TakeatCashierOpening = summaryData.opening;
  const totals: TakeatCashierTotals = summaryData.totals || {
    automatic_deposit: "0.00",
    manual_deposit: "0.00",
    manual_withdrawal: "0.00",
    to_receive: 0,
  };
  const automaticDeposits: TakeatCashierPayment[] = Array.isArray(summaryData.automatic_deposits)
    ? summaryData.automatic_deposits
    : [];
  const manualDeposits: TakeatCashierPayment[] = Array.isArray(summaryData.manual_deposits)
    ? summaryData.manual_deposits
    : [];
  const manualWithdrawals: TakeatCashierPayment[] = Array.isArray(summaryData.manual_withdrawals)
    ? summaryData.manual_withdrawals
    : [];

  // ── 5. Mapeia pagamentos para campos do sistema ──────────
  const mapped: TakeatCashierSummary["mapped"] = {
    openingAmount: parseBRLNumber(opening.initial_value),
    systemCash: 0,
    systemCredit: 0,
    systemDebit: 0,
    systemPix: 0,
    systemIfoodOnline: 0,
    systemIfoodVoucher: 0,
    systemTerm: 0,
    systemClub: 0,
    systemServiceFee: 0,
    cashIn: 0,
    sangriaAmount: 0,
    totalVendas: parseBRLNumber(totals.automatic_deposit),
  };

  // Agrupa deposits automáticos por método
  for (const deposit of automaticDeposits) {
    const field = mapPaymentDescription(deposit.description);
    if (field && field in mapped) {
      const val = parseBRLNumber(deposit.value);
      (mapped as any)[field] = Math.round(
        (((mapped as any)[field] as number) + val) * 100
      ) / 100;
    }
  }

  // Suprimentos (entradas manuais de dinheiro)
  for (const dep of manualDeposits) {
    const val = parseBRLNumber(dep.value);
    mapped.cashIn = Math.round((mapped.cashIn + val) * 100) / 100;
  }

  // Sangrias (retiradas manuais de dinheiro)
  for (const wit of manualWithdrawals) {
    const val = parseBRLNumber(wit.value);
    mapped.sangriaAmount = Math.round((mapped.sangriaAmount + val) * 100) / 100;
  }

  // Totais consolidados oficiais do Takeat
  const officialWithdrawal = parseBRLNumber(totals.manual_withdrawal);
  if (officialWithdrawal > 0) {
    mapped.sangriaAmount = officialWithdrawal;
  }

  const officialDeposit = parseBRLNumber(totals.manual_deposit);
  if (officialDeposit > 0) {
    mapped.cashIn = officialDeposit;
  }

  const officialSales = parseBRLNumber(totals.automatic_deposit);
  if (officialSales > 0) {
    mapped.totalVendas = officialSales;
  }

  const openedAtFormatted = opening.opened_at
    ? new Date(opening.opened_at).toLocaleString("pt-BR", {
        timeZone: "America/Bahia",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : undefined;

  const closedAtFormatted = opening.closed_at
    ? new Date(opening.closed_at).toLocaleString("pt-BR", {
        timeZone: "America/Bahia",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : undefined;

  return {
    unitId,
    date: dateStr,
    cashierOpeningId: opening.id,
    opening,
    totals,
    payments: automaticDeposits,
    manualDeposits,
    manualWithdrawals,
    mapped,
    operatorOpen: opening.user_open?.name,
    operatorClose: opening.user_close?.name || undefined,
    openedAtFormatted,
    closedAtFormatted,
    isOpen,
    syncedAt: new Date().toISOString(),
  };
}
