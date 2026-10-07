export interface CostCenterData {
  label: string;
  total: number;
  percent: number;
  items: Array<{
    id: number;
    description: string;
    value: number;
    dueDate: string;
    category: string;
    provider: string;
    paid: boolean;
    storeName: string;
    costCenterKey: "bebida" | "embalagem" | "mPrima" | "cProducao";
  }>;
}

export interface StoreResult {
  storeId: string;
  storeName: string;
  faturamento: number;
  totalInsumos: number;
  cmvPercent: number;
  costCenters: {
    bebida: CostCenterData;
    embalagem: CostCenterData;
    mPrima: CostCenterData;
    cProducao: CostCenterData;
  };
  items: any[];
}

export interface CmvApiResponse {
  success: boolean;
  period: { startDate: string; endDate: string };
  unitId: string;
  isConsolidated: boolean;
  summary: {
    faturamento: number;
    totalInsumos: number;
    cmvPercent: number;
    costCenters: {
      bebida: CostCenterData;
      embalagem: CostCenterData;
      mPrima: CostCenterData;
      cProducao: CostCenterData;
    };
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

  // Tenta do localStorage se estiver no navegador
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

export async function fetchCmvData(
  startDate: string,
  endDate: string,
  unitParam: string = "all"
): Promise<CmvApiResponse> {
  const token = await getTakeatAccessToken();

  let targetStores: Array<{ id: string; name: string }> = [];

  const normUnit = unitParam.toLowerCase();
  if (normUnit === "all") {
    targetStores = Object.values(TAKEAT_STORES);
  } else if (TAKEAT_STORES[normUnit]) {
    targetStores = [TAKEAT_STORES[normUnit]];
  } else {
    const storeById = Object.values(TAKEAT_STORES).find((s) => s.id === unitParam);
    if (storeById) {
      targetStores = [storeById];
    } else {
      targetStores = [{ id: unitParam, name: `Loja ${unitParam}` }];
    }
  }

  let globalFaturamento = 0;
  const storeResults: StoreResult[] = [];

  const globalCostCenters = {
    bebida: { label: "Bebida", total: 0, percent: 0, items: [] as any[] },
    embalagem: { label: "Embalagem", total: 0, percent: 0, items: [] as any[] },
    mPrima: { label: "M Prima", total: 0, percent: 0, items: [] as any[] },
    cProducao: { label: "C Produção", total: 0, percent: 0, items: [] as any[] },
  };

  for (const store of targetStores) {
    // 1. Obter Faturamento
    const revenueParams = new URLSearchParams({
      restaurant_id: store.id,
      start_date: startDate,
      end_date: endDate,
      is_earning: "true",
    });

    const revRes = await fetch(
      `https://public-api.takeat.app/v1/financial/cash-flows?${revenueParams.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let storeRevenue = 0;
    if (revRes.ok) {
      const revData = await revRes.json();
      storeRevenue = parseFloat(revData.totals?.total_earnings || "0");
    }

    globalFaturamento += storeRevenue;

    // 2. Obter Despesas dos Centros de Custo de CMV
    let offset = 0;
    const limit = 100;
    const storeItems: any[] = [];

    const storeCostCenters = {
      bebida: { label: "Bebida", total: 0, percent: 0, items: [] as any[] },
      embalagem: { label: "Embalagem", total: 0, percent: 0, items: [] as any[] },
      mPrima: { label: "M Prima", total: 0, percent: 0, items: [] as any[] },
      cProducao: { label: "C Produção", total: 0, percent: 0, items: [] as any[] },
    };

    while (true) {
      const expParams = new URLSearchParams({
        restaurant_id: store.id,
        start_date: startDate,
        end_date: endDate,
        is_earning: "false",
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
        const cat = (item.category || "").toLowerCase();
        const val = parseFloat(item.value || "0");
        if (isNaN(val) || val <= 0) continue;

        // Suco explicitamente excluído
        if (cat.includes("suco")) continue;

        let matchedKey: "bebida" | "embalagem" | "mPrima" | "cProducao" | null = null;

        if (cat.includes("bebida")) {
          matchedKey = "bebida";
        } else if (cat.includes("embalagem")) {
          matchedKey = "embalagem";
        } else if (cat.includes("matéria prima") || cat.includes("materia prima")) {
          matchedKey = "mPrima";
        } else if (cat.includes("central de produção") || cat.includes("central de producao")) {
          matchedKey = "cProducao";
        }

        if (matchedKey) {
          const formattedItem = {
            id: item.id,
            storeId: store.id,
            storeName: store.name,
            description: item.description,
            value: val,
            dueDate: item.due_date,
            category: item.category,
            provider: item.provider_name || (item.provider?.name ?? ""),
            paid: item.paid,
            costCenterKey: matchedKey,
          };

          storeCostCenters[matchedKey].total += val;
          storeCostCenters[matchedKey].items.push(formattedItem);

          globalCostCenters[matchedKey].total += val;
          globalCostCenters[matchedKey].items.push(formattedItem);

          storeItems.push(formattedItem);
        }
      }

      const remaining = expData.remaining || 0;
      if (remaining <= 0 || flows.length === 0) break;
      offset += limit;
    }

    const storeTotalInsumos =
      storeCostCenters.bebida.total +
      storeCostCenters.embalagem.total +
      storeCostCenters.mPrima.total +
      storeCostCenters.cProducao.total;

    const storeCmvPercent =
      storeRevenue > 0 ? (storeTotalInsumos / storeRevenue) * 100 : 0;

    storeResults.push({
      storeId: store.id,
      storeName: store.name,
      faturamento: storeRevenue,
      totalInsumos: storeTotalInsumos,
      cmvPercent: Math.round(storeCmvPercent * 100) / 100,
      costCenters: {
        bebida: {
          ...storeCostCenters.bebida,
          percent: storeRevenue > 0 ? (storeCostCenters.bebida.total / storeRevenue) * 100 : 0,
        },
        embalagem: {
          ...storeCostCenters.embalagem,
          percent: storeRevenue > 0 ? (storeCostCenters.embalagem.total / storeRevenue) * 100 : 0,
        },
        mPrima: {
          ...storeCostCenters.mPrima,
          percent: storeRevenue > 0 ? (storeCostCenters.mPrima.total / storeRevenue) * 100 : 0,
        },
        cProducao: {
          ...storeCostCenters.cProducao,
          percent: storeRevenue > 0 ? (storeCostCenters.cProducao.total / storeRevenue) * 100 : 0,
        },
      },
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

  return {
    success: true,
    period: { startDate, endDate },
    unitId: unitParam,
    isConsolidated: targetStores.length > 1,
    summary: {
      faturamento: globalFaturamento,
      totalInsumos: globalTotalInsumos,
      cmvPercent: Math.round(globalCmvPercent * 100) / 100,
      costCenters: {
        bebida: {
          ...globalCostCenters.bebida,
          percent: globalFaturamento > 0 ? (globalCostCenters.bebida.total / globalFaturamento) * 100 : 0,
        },
        embalagem: {
          ...globalCostCenters.embalagem,
          percent: globalFaturamento > 0 ? (globalCostCenters.embalagem.total / globalFaturamento) * 100 : 0,
        },
        mPrima: {
          ...globalCostCenters.mPrima,
          percent: globalFaturamento > 0 ? (globalCostCenters.mPrima.total / globalFaturamento) * 100 : 0,
        },
        cProducao: {
          ...globalCostCenters.cProducao,
          percent: globalFaturamento > 0 ? (globalCostCenters.cProducao.total / globalFaturamento) * 100 : 0,
        },
      },
    },
    stores: storeResults,
  };
}
