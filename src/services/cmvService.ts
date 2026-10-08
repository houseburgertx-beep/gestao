import { store as managementStore } from "@/services/store";

export type CostCenterKey =
  | "bebida"
  | "embalagem"
  | "mPrima"
  | "cProducao"
  | "suco"
  | "outros";

export interface CostCenterItem {
  id: number;
  storeId: string;
  storeName: string;
  description: string;
  value: number;
  dueDate: string;
  competenceDate: string;
  category: string;
  provider: string;
  paid: boolean;
  costCenterKey: CostCenterKey;
}

export interface CostCenterData {
  key: CostCenterKey;
  label: string;
  total: number;
  percent: number;
  isCmvDefault: boolean;
  items: CostCenterItem[];
}

export interface StoreResult {
  storeId: string;
  storeName: string;
  faturamento: number;
  totalInsumos: number;
  cmvPercent: number;
  costCenters: Record<CostCenterKey, CostCenterData>;
  items: CostCenterItem[];
}

export interface CmvApiResponse {
  success: boolean;
  period: { startDate: string; endDate: string };
  dateType: "due_date" | "competence_date";
  unitId: string;
  isConsolidated: boolean;
  summary: {
    faturamento: number;
    totalInsumos: number;
    allExpensesTotal: number;
    cmvPercent: number;
    costCenters: Record<CostCenterKey, CostCenterData>;
  };
  stores: StoreResult[];
}

export const TAKEAT_STORES: Record<string, { id: string; name: string }> = {
  eunapolis: { id: "97686", name: "House 190 Eunápolis" },
  teixeira: { id: "94485", name: "House 190 Hamburgueria" },
  foodpark: { id: "92142", name: "House Food Park" },
  central: { id: "121908", name: "Central Alimentos" },
  tios: { id: "166711", name: "Tios Rockets Pizzaria" },
};

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getTakeatAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token;
  }

  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("takeat_access_token");
      const exp = localStorage.getItem("takeat_token_exp");
      if (saved && exp && Number(exp) > now + 60000) {
        cachedToken = { token: saved, expiresAt: Number(exp) };
        return saved;
      }
    } catch {}
  }

  const apiKey =
    process.env.NEXT_PUBLIC_TAKEAT_API_KEY ||
    process.env.TAKEAT_API_KEY ||
    "tk_live_83cf34_0d5e44ebf3c422b2eefe9a6da7cd54975c43f18067e71a2ec8c1983fc42fe4ce";

  const body = new URLSearchParams({
    grant_type: "api_key",
    api_key: apiKey.trim(),
  });

  const response = await fetch("https://public-api.takeat.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao obter token Takeat: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const expiresInMs = (data.expires_in || 900) * 1000;
  cachedToken = {
    token: data.access_token,
    expiresAt: now + expiresInMs,
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("takeat_access_token", data.access_token);
      localStorage.setItem("takeat_token_exp", String(now + expiresInMs));
    } catch {}
  }

  return data.access_token;
}

/**
 * Classifica qualquer despesa em um dos centros:
 * - bebida
 * - embalagem
 * - mPrima (Matéria Prima)
 * - cProducao (Central de Produção)
 * - suco
 * - outros (Motoboys, Administrativo, Predial, Limpeza, etc.)
 */
export function classifyCostCenter(
  rawCategory: string = "",
  description: string = "",
  provider: string = ""
): CostCenterKey {
  const cat = (rawCategory || "").toLowerCase().trim();
  const desc = (description || "").toLowerCase().trim();
  const prov = (provider || "").toLowerCase().trim();

  // 1. SUCO (Permite inclusão/exclusão dinâmica pelo usuário)
  if (cat.includes("suco") || (cat.includes("insumos") && desc.includes("suco"))) {
    return "suco";
  }

  // 2. CENTRAL DE PRODUÇÃO (Garante identificação precisa em categoria, descrição ou fornecedor)
  if (
    cat.includes("central de produção") ||
    cat.includes("central de producao") ||
    cat.includes("c produção") ||
    cat.includes("c producao") ||
    cat.includes("c. produção") ||
    cat.includes("c. producao") ||
    cat.includes("central alimentos") ||
    cat === "central de produção" ||
    cat === "central de producao" ||
    cat === "c produção" ||
    cat === "c producao" ||
    cat === "central" ||
    cat === "produção" ||
    cat === "producao" ||
    (cat.includes("insumos") && (desc.includes("central de produção") || desc.includes("central de producao") || desc.includes("c produção") || desc.includes("c producao"))) ||
    prov.includes("central de produção") ||
    prov.includes("central de producao") ||
    prov.includes("central alimentos")
  ) {
    return "cProducao";
  }

  // 3. BEBIDA
  if (
    cat.includes("insumos: bebida") ||
    cat.includes("refrigerante: bebida") ||
    cat.includes("produtos para revendas: refrigerantes") ||
    cat === "bebida" ||
    cat === "bebidas" ||
    cat.includes("refrigerante") ||
    cat.includes("cerveja") ||
    cat.includes("destilados") ||
    (cat.includes("insumos") && (desc.includes("refrigerante") || desc.includes("cachaça") || desc.includes("cerveja") || desc.includes("água mineral") || desc.includes("agua mineral")))
  ) {
    return "bebida";
  }

  // 4. EMBALAGEM
  if (
    cat.includes("insumos: embalagem") ||
    cat.includes("insumos: embalagens") ||
    cat.includes("embalagem") ||
    cat.includes("embalagens") ||
    cat.includes("fornecedores: embalagens") ||
    (cat.includes("insumos") && (desc.includes("embalagem") || desc.includes("copo") || desc.includes("sacola") || desc.includes("caixa scooby") || desc.includes("pote") || desc.includes("pazinha")))
  ) {
    return "embalagem";
  }

  // 5. MATÉRIA PRIMA (insumos de cozinha e matérias primas alimentícias diretas)
  if (
    cat.includes("matéria prima") ||
    cat.includes("materia prima") ||
    cat.includes("fornecedores: materia prima") ||
    cat.includes("fornecedores: carne") ||
    cat.includes("fornecedores: bacon") ||
    cat.includes("fornecedores: batata") ||
    cat.includes("fornecedores: frango") ||
    cat.includes("fornecedores: queijo") ||
    cat.includes("insumos: carnes") ||
    cat.includes("insumos: congelados") ||
    cat.includes("frango: congelados") ||
    cat.includes("keijo: congelados") ||
    cat.includes("insumos: queijo") ||
    (cat.includes("insumos") && !cat.includes("limpeza") && !cat.includes("escritório"))
  ) {
    return "mPrima";
  }

  // 6. OUTRAS DESPESAS (Geral, Motoboy, Aluguel, Limpeza, Salários, etc.)
  return "outros";
}

/**
 * Divide intervalos longos em fatias de até 80 dias para não estourar
 * a limitação de 92 dias imposta pela Takeat API (max_interval_limit).
 */
function splitDateInterval(startStr: string, endStr: string, maxDays = 80): Array<{ start: string; end: string }> {
  const dStart = new Date(startStr + "T00:00:00");
  const dEnd = new Date(endStr + "T00:00:00");
  if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime()) || dStart > dEnd) {
    return [{ start: startStr, end: endStr }];
  }

  const diffDays = Math.ceil((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= maxDays) {
    return [{ start: startStr, end: endStr }];
  }

  const slices: Array<{ start: string; end: string }> = [];
  let curStart = new Date(dStart);

  while (curStart <= dEnd) {
    let curEnd = new Date(curStart);
    curEnd.setDate(curEnd.getDate() + maxDays - 1);
    if (curEnd > dEnd) {
      curEnd = new Date(dEnd);
    }

    slices.push({
      start: curStart.toISOString().split("T")[0],
      end: curEnd.toISOString().split("T")[0],
    });

    curStart = new Date(curEnd);
    curStart.setDate(curStart.getDate() + 1);
  }

  return slices;
}

export function createEmptyCostCenters(): Record<CostCenterKey, CostCenterData> {
  return {
    bebida: {
      key: "bebida",
      label: "Bebida",
      total: 0,
      percent: 0,
      isCmvDefault: true,
      items: [],
    },
    embalagem: {
      key: "embalagem",
      label: "Embalagem",
      total: 0,
      percent: 0,
      isCmvDefault: true,
      items: [],
    },
    mPrima: {
      key: "mPrima",
      label: "M Prima",
      total: 0,
      percent: 0,
      isCmvDefault: true,
      items: [],
    },
    cProducao: {
      key: "cProducao",
      label: "C Produção",
      total: 0,
      percent: 0,
      isCmvDefault: true,
      items: [],
    },
    suco: {
      key: "suco",
      label: "Suco",
      total: 0,
      percent: 0,
      isCmvDefault: false,
      items: [],
    },
    outros: {
      key: "outros",
      label: "Outras Despesas",
      total: 0,
      percent: 0,
      isCmvDefault: false,
      items: [],
    },
  };
}

export async function fetchCmvData(
  startDate: string,
  endDate: string,
  unitParam: string = "all",
  dateType: "due_date" | "competence_date" = "due_date"
): Promise<CmvApiResponse> {
  const token = await getTakeatAccessToken();

  let targetStores: Array<{ id: string; name: string; slugKey?: string }> = [];

  const normUnit = unitParam.toLowerCase();
  if (normUnit === "all") {
    targetStores = Object.entries(TAKEAT_STORES).map(([slug, s]) => ({ ...s, slugKey: slug }));
  } else if (TAKEAT_STORES[normUnit]) {
    targetStores = [{ ...TAKEAT_STORES[normUnit], slugKey: normUnit }];
  } else {
    const storeById = Object.entries(TAKEAT_STORES).find(([, s]) => s.id === unitParam);
    if (storeById) {
      targetStores = [{ ...storeById[1], slugKey: storeById[0] }];
    } else {
      targetStores = [{ id: unitParam, name: `Loja ${unitParam}` }];
    }
  }

  let globalFaturamento = 0;
  const storeResults: StoreResult[] = [];
  const globalCostCenters = createEmptyCostCenters();
  let globalAllExpensesTotal = 0;

  const slices = splitDateInterval(startDate, endDate, 80);

  for (const store of targetStores) {
    let storeRevenue = 0;
    const storeItems: CostCenterItem[] = [];
    const storeCostCenters = createEmptyCostCenters();

    // Percorre cada fatia de data (suporta períodos arbitrários sem o limite de 92 dias)
    for (const slice of slices) {
      // 1. Faturamento oficial registrado na Takeat
      const revenueParams = new URLSearchParams({
        restaurant_id: store.id,
        start_date: slice.start,
        end_date: slice.end,
        is_earning: "true",
        date_type: dateType,
      });

      try {
        const revRes = await fetch(
          `https://public-api.takeat.app/v1/financial/cash-flows?${revenueParams.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (revRes.ok) {
          const revData = await revRes.json();
          storeRevenue += parseFloat(revData.totals?.total_earnings || "0");
        }
      } catch (e) {
        console.warn(`Aviso ao consultar receita loja ${store.name} fatia ${slice.start}:`, e);
      }

      // 2. Despesas com paginação completa (coleta 100% de todos os lançamentos)
      let offset = 0;
      const limit = 100;

      while (true) {
        const expParams = new URLSearchParams({
          restaurant_id: store.id,
          start_date: slice.start,
          end_date: slice.end,
          is_earning: "false",
          date_type: dateType,
          offset: offset.toString(),
        });

        const expRes = await fetch(
          `https://public-api.takeat.app/v1/financial/cash-flows?${expParams.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!expRes.ok) break;

        const expData = await expRes.json();
        const flows: any[] = expData.cash_flows || [];

        for (const item of flows) {
          const hasChildren = Array.isArray(item.items) && item.items.length > 0;
          const targetList = hasChildren ? item.items : [item];

          for (const target of targetList) {
            const val = parseFloat(target.value || "0");
            if (isNaN(val) || val <= 0) continue;

            const rawCategory = target.category || item.category || "";
            const desc = target.description || item.description || "";
            const prov =
              target.provider_name ||
              item.provider_name ||
              (target.provider?.name ?? item.provider?.name ?? "");

            const matchedKey = classifyCostCenter(rawCategory, desc, prov);

            const formattedItem: CostCenterItem = {
              id: target.id || item.id,
              storeId: store.id,
              storeName: store.name,
              description: desc || "Sem descrição",
              value: val,
              dueDate: target.due_date || item.due_date || "",
              competenceDate: target.competence_date || item.competence_date || "",
              category: rawCategory || "Sem categoria",
              provider: prov,
              paid: Boolean(target.paid !== undefined ? target.paid : item.paid),
              costCenterKey: matchedKey,
            };

            storeCostCenters[matchedKey].total += val;
            storeCostCenters[matchedKey].items.push(formattedItem);

            globalCostCenters[matchedKey].total += val;
            globalCostCenters[matchedKey].items.push(formattedItem);

            storeItems.push(formattedItem);
            globalAllExpensesTotal += val;
          }
        }

        const remaining = expData.remaining || 0;
        if (remaining <= 0 || flows.length === 0) break;
        offset += limit;
      }
    }

    // Fallback: se storeRevenue for 0 e houver faturamento local registrado no store.ts, utiliza
    if (storeRevenue === 0 && typeof window !== "undefined") {
      try {
        const localRevenues = managementStore.getRevenues();
        const matched = localRevenues.filter((r) => {
          const matchUnit = r.unitId === store.id || (store.slugKey && r.unitId === store.slugKey);
          return matchUnit && r.date >= startDate && r.date <= endDate;
        });
        const localSum = matched.reduce((acc, cur) => acc + (cur.netRevenue || cur.grossRevenue || 0), 0);
        if (localSum > 0) {
          storeRevenue = localSum;
        }
      } catch {}
    }

    globalFaturamento += storeRevenue;

    // Total padrão do CMV (Bebida + Embalagem + M. Prima + C. Produção)
    const storeTotalInsumos =
      storeCostCenters.bebida.total +
      storeCostCenters.embalagem.total +
      storeCostCenters.mPrima.total +
      storeCostCenters.cProducao.total;

    const storeCmvPercent =
      storeRevenue > 0 ? (storeTotalInsumos / storeRevenue) * 100 : 0;

    // Atualiza percentuais por centro de custo para a loja
    (Object.keys(storeCostCenters) as CostCenterKey[]).forEach((key) => {
      storeCostCenters[key].percent =
        storeRevenue > 0 ? (storeCostCenters[key].total / storeRevenue) * 100 : 0;
    });

    storeResults.push({
      storeId: store.id,
      storeName: store.name,
      faturamento: storeRevenue,
      totalInsumos: storeTotalInsumos,
      cmvPercent: Math.round(storeCmvPercent * 100) / 100,
      costCenters: storeCostCenters,
      items: storeItems,
    });
  }

  const globalTotalInsumos =
    globalCostCenters.bebida.total +
    globalCostCenters.embalagem.total +
    globalCostCenters.mPrima.total +
    globalCostCenters.cProducao.total;

  const globalCmvPercent =
    globalFaturamento > 0 ? (globalTotalInsumos / globalFaturamento) * 100 : 0;

  // Atualiza percentuais por centro de custo global
  (Object.keys(globalCostCenters) as CostCenterKey[]).forEach((key) => {
    globalCostCenters[key].percent =
      globalFaturamento > 0 ? (globalCostCenters[key].total / globalFaturamento) * 100 : 0;
  });

  return {
    success: true,
    period: { startDate, endDate },
    dateType,
    unitId: unitParam,
    isConsolidated: targetStores.length > 1,
    summary: {
      faturamento: globalFaturamento,
      totalInsumos: globalTotalInsumos,
      allExpensesTotal: globalAllExpensesTotal,
      cmvPercent: Math.round(globalCmvPercent * 100) / 100,
      costCenters: globalCostCenters,
    },
    stores: storeResults,
  };
}
