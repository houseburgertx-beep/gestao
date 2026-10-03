import {
  IfoodCredentials,
  IfoodTokenResponse,
  IfoodTokenState,
  IfoodMerchant,
  IfoodOrder,
  IfoodOrderEvent,
  IfoodSale,
  IfoodFinancialEvent,
  IfoodSettlement,
  IfoodAnticipation,
  IfoodCatalogProduct,
  IfoodDeliveryAvailability,
  IfoodReview,
  IfoodReviewSummary,
  IfoodUnitId,
} from "@/types/ifood";

const IFOOD_BASE_URL = "https://merchant-api.ifood.com.br";
const TOKEN_STORAGE_PREFIX = "house190_ifood_token_";

export class IfoodService {
  private static tokenStates: Record<string, IfoodTokenState> = {};

  public static getTokenState(unitId: IfoodUnitId): IfoodTokenState {
    if (typeof window === "undefined") {
      return { accessToken: null, expiresAt: null, status: "disconnected" };
    }

    if (this.tokenStates[unitId]) {
      const state = this.tokenStates[unitId];
      if (state.expiresAt && Date.now() > state.expiresAt) {
        state.status = "expired";
      }
      return state;
    }

    try {
      const raw = localStorage.getItem(`${TOKEN_STORAGE_PREFIX}${unitId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const isExpired = parsed.expiresAt ? Date.now() > parsed.expiresAt : false;
        const state: IfoodTokenState = {
          ...parsed,
          status: isExpired ? "expired" : "connected",
        };
        this.tokenStates[unitId] = state;
        return state;
      }
    } catch {}

    return { accessToken: null, expiresAt: null, status: "disconnected" };
  }

  public static setTokenState(unitId: IfoodUnitId, tokenData: IfoodTokenResponse): IfoodTokenState {
    const expiresAt = Date.now() + (tokenData.expiresIn ? (tokenData.expiresIn - 60) * 1000 : 21600000);
    const state: IfoodTokenState = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt,
      type: tokenData.type || "Bearer",
      lastConnectedAt: new Date().toISOString(),
      status: "connected",
    };

    this.tokenStates[unitId] = state;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`${TOKEN_STORAGE_PREFIX}${unitId}`, JSON.stringify(state));
      } catch {}
    }
    return state;
  }

  public static setManualToken(unitId: IfoodUnitId, token: string): IfoodTokenState {
    const cleanToken = token.replace(/^bearer\s+/i, "").trim();
    return this.setTokenState(unitId, {
      accessToken: cleanToken,
      type: "Bearer",
      expiresIn: 21600, // 6h padrão
    });
  }

  public static disconnect(unitId: IfoodUnitId): void {
    delete this.tokenStates[unitId];
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(`${TOKEN_STORAGE_PREFIX}${unitId}`);
      } catch {}
    }
  }

  // ==========================================
  // OAUTH AUTHENTICATION
  // ==========================================
  public static async authenticate(creds: IfoodCredentials): Promise<IfoodTokenResponse> {
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error("Client ID e Client Secret são obrigatórios.");
    }

    const body = new URLSearchParams({
      grantType: "client_credentials",
      clientId: creds.clientId.trim(),
      clientSecret: creds.clientSecret.trim(),
    });

    const response = await fetch(`${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorDetail = errText;
      try {
        const errJson = JSON.parse(errText);
        errorDetail = errJson.message || errJson.error || errText;
      } catch {}
      throw new Error(`Erro do iFood (${response.status}): ${errorDetail}`);
    }

    const data: IfoodTokenResponse = await response.json();
    this.setTokenState(creds.unitId, data);
    return data;
  }

  public static async requestUserCode(clientId: string): Promise<{
    userCode: string;
    authorizationCodeVerifier: string;
    verificationUrl: string;
    expiresIn: number;
  }> {
    const body = new URLSearchParams({
      clientId: clientId.trim(),
    });

    const res = await fetch(`${IFOOD_BASE_URL}/authentication/v1.0/oauth/userCode`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Erro ao gerar User Code (${res.status}): ${err}`);
    }

    return await res.json();
  }

  // Helper para headers autenticados
  private static getHeaders(unitId: IfoodUnitId, customerId?: string): Record<string, string> {
    const token = this.getTokenState(unitId).accessToken;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    if (customerId) {
      headers["X-iFood-Customer-ID"] = customerId;
    }
    return headers;
  }

  // ==========================================
  // 1. MERCHANT & LOJAS
  // ==========================================
  public static async getMerchants(unitId: IfoodUnitId): Promise<any[]> {
    const res = await fetch(`${IFOOD_BASE_URL}/merchant/v1.0/merchants`, {
      headers: this.getHeaders(unitId),
    });
    if (!res.ok) {
      throw new Error(`Não foi possível listar lojas (${res.status})`);
    }
    return await res.json();
  }

  public static async getMerchantDetails(unitId: IfoodUnitId, merchantId?: string): Promise<IfoodMerchant | null> {
    if (!merchantId) return null;
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return null;

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/merchant/v1.0/merchants/${merchantId}`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("Falha ao consultar detalhes do merchant:", err);
    }
    return null;
  }

  public static async updatePreparationTime(unitId: IfoodUnitId, merchantId: string, minutes: number): Promise<boolean> {
    const res = await fetch(`${IFOOD_BASE_URL}/merchant/v1.0/merchants/${merchantId}/myPreparationTime`, {
      method: "PUT",
      headers: this.getHeaders(unitId, merchantId),
      body: JSON.stringify({ preparationTime: minutes }),
    });
    if (!res.ok) {
      throw new Error(`Erro ao atualizar tempo de preparo: ${res.statusText}`);
    }
    return true;
  }

  public static async setInterruption(unitId: IfoodUnitId, merchantId: string, pauseMinutes: number, reason: string): Promise<boolean> {
    const start = new Date();
    const end = new Date(start.getTime() + pauseMinutes * 60 * 1000);
    const res = await fetch(`${IFOOD_BASE_URL}/merchant/v1.0/merchants/${merchantId}/interruptions`, {
      method: "POST",
      headers: this.getHeaders(unitId),
      body: JSON.stringify({
        description: reason,
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    });
    if (!res.ok) {
      throw new Error(`Erro ao pausar loja: ${res.statusText}`);
    }
    return true;
  }

  // ==========================================
  // 2. EVENTS & ORDERS (Polling + Ações)
  // ==========================================
  public static async pollEvents(unitId: IfoodUnitId): Promise<IfoodOrderEvent[]> {
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return [];

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/events/v1.0/events:polling`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("Polling events error:", err);
    }
    return [];
  }

  public static async acknowledgeEvents(unitId: IfoodUnitId, eventIds: string[]): Promise<boolean> {
    if (eventIds.length === 0) return true;
    try {
      const res = await fetch(`${IFOOD_BASE_URL}/events/v1.0/events/acknowledgment`, {
        method: "POST",
        headers: this.getHeaders(unitId),
        body: JSON.stringify(eventIds.map((id) => ({ id }))),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public static async getOrders(unitId: IfoodUnitId): Promise<IfoodOrder[]> {
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return [];

    // Busca eventos recentes para consultar os pedidos reais
    try {
      const events = await this.pollEvents(unitId);
      const orders: IfoodOrder[] = [];
      for (const ev of events) {
        if (ev.orderId) {
          const detailRes = await fetch(`${IFOOD_BASE_URL}/order/v1.0/orders/${ev.orderId}`, {
            headers: this.getHeaders(unitId),
          });
          if (detailRes.ok) {
            orders.push(await detailRes.json());
          }
        }
      }
      return orders;
    } catch {
      return [];
    }
  }

  public static async executeOrderAction(
    unitId: IfoodUnitId,
    orderId: string,
    action: "confirm" | "startPreparation" | "readyToPickup" | "dispatch" | "requestCancellation",
    payload?: any
  ): Promise<boolean> {
    const res = await fetch(`${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}/${action}`, {
      method: "POST",
      headers: this.getHeaders(unitId),
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Falha ao executar ação no pedido: ${res.statusText}`);
    }
    return true;
  }

  // ==========================================
  // 3. FINANCIAL v3.0 (Conciliação, Repasses)
  // ==========================================
  public static async getFinancialSales(unitId: IfoodUnitId, merchantId?: string): Promise<IfoodSale[]> {
    if (!merchantId) return [];
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return [];

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/financial/v3.0/merchants/${merchantId}/sales`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  public static async getFinancialEvents(unitId: IfoodUnitId, merchantId?: string): Promise<IfoodFinancialEvent[]> {
    if (!merchantId) return [];
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return [];

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/financial/v3.0/merchants/${merchantId}/financial-events`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  public static async getSettlements(unitId: IfoodUnitId, merchantId?: string): Promise<IfoodSettlement[]> {
    if (!merchantId) return [];
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return [];

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/financial/v3.0/merchants/${merchantId}/settlements`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  public static async getAnticipations(unitId: IfoodUnitId, merchantId?: string): Promise<IfoodAnticipation[]> {
    if (!merchantId) return [];
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return [];

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/financial/v3.0/merchants/${merchantId}/anticipations`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  // ==========================================
  // 4. CATALOG v2.0 (Cardápio e Estoque)
  // ==========================================
  public static async getCatalogProducts(unitId: IfoodUnitId, merchantId?: string): Promise<IfoodCatalogProduct[]> {
    if (!merchantId) return [];
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return [];

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/catalog/v2.0/merchants/${merchantId}/products`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  public static async updateProductStatus(
    unitId: IfoodUnitId,
    merchantId: string,
    productId: string,
    newStatus: "AVAILABLE" | "UNAVAILABLE"
  ): Promise<boolean> {
    const res = await fetch(`${IFOOD_BASE_URL}/catalog/v2.0/merchants/${merchantId}/products/status`, {
      method: "PATCH",
      headers: this.getHeaders(unitId),
      body: JSON.stringify([{ id: productId, status: newStatus }]),
    });
    return res.ok;
  }

  // ==========================================
  // 5. SHIPPING & LOGISTICS (iFood Entrega)
  // ==========================================
  public static async getDeliveryAvailabilities(
    unitId: IfoodUnitId,
    merchantId?: string
  ): Promise<IfoodDeliveryAvailability | null> {
    if (!merchantId) return null;
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return null;

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/shipping/v1.0/merchants/${merchantId}/deliveryAvailabilities`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  public static async requestDriverForExternalOrder(
    unitId: IfoodUnitId,
    merchantId: string,
    orderData: any
  ): Promise<{ success: boolean; trackingCode: string; message: string }> {
    const res = await fetch(`${IFOOD_BASE_URL}/shipping/v1.0/merchants/${merchantId}/orders`, {
      method: "POST",
      headers: this.getHeaders(unitId),
      body: JSON.stringify(orderData),
    });
    if (!res.ok) {
      throw new Error(`Erro ao solicitar entregador: ${res.statusText}`);
    }
    const data = await res.json();
    return { success: true, trackingCode: data.id || "OK", message: "Entregador solicitado com sucesso!" };
  }

  // ==========================================
  // 6. REVIEWS & AVALIAÇÕES (v2.0)
  // ==========================================
  public static async getReviewSummary(unitId: IfoodUnitId, merchantId?: string): Promise<IfoodReviewSummary | null> {
    if (!merchantId) return null;
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return null;

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/review/v2.0/merchants/${merchantId}/summary`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  public static async getReviews(unitId: IfoodUnitId, merchantId?: string): Promise<IfoodReview[]> {
    if (!merchantId) return [];
    const token = this.getTokenState(unitId).accessToken;
    if (!token) return [];

    try {
      const res = await fetch(`${IFOOD_BASE_URL}/review/v2.0/merchants/${merchantId}/reviews`, {
        headers: this.getHeaders(unitId),
      });
      if (res.ok) return await res.json();
    } catch {}
    return [];
  }

  public static async replyReview(
    unitId: IfoodUnitId,
    merchantId: string,
    reviewId: string,
    replyText: string
  ): Promise<boolean> {
    const res = await fetch(`${IFOOD_BASE_URL}/review/v2.0/merchants/${merchantId}/reviews/${reviewId}/answers`, {
      method: "POST",
      headers: this.getHeaders(unitId),
      body: JSON.stringify({ text: replyText }),
    });
    return res.ok;
  }

  // ==========================================
  // 7. GENERIC RAW API EXPLORER
  // ==========================================
  public static async executeRawRequest(
    unitId: IfoodUnitId,
    method: string,
    endpoint: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<{ status: number; ok: boolean; data: any; durationMs: number }> {
    const start = performance.now();
    const token = this.getTokenState(unitId).accessToken;
    const finalHeaders = {
      ...this.getHeaders(unitId),
      ...headers,
    };
    if (token) {
      finalHeaders["Authorization"] = `Bearer ${token}`;
    }

    const fullUrl = endpoint.startsWith("http") ? endpoint : `${IFOOD_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    try {
      const res = await fetch(fullUrl, {
        method,
        headers: finalHeaders,
        body: body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase()) ? body : undefined,
      });

      const durationMs = Math.round(performance.now() - start);
      let data: any;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      return {
        status: res.status,
        ok: res.ok,
        data,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      return {
        status: 0,
        ok: false,
        data: {
          error: "Erro de Conexão com o iFood.",
          detail: err.message,
        },
        durationMs,
      };
    }
  }
}
