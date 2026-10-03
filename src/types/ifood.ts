export type IfoodUnitId = "teixeira" | "eunapolis" | "foodpark";

export interface IfoodCredentials {
  unitId: IfoodUnitId;
  unitName: string;
  clientId: string;
  clientSecret: string;
  merchantId?: string;
  authorizationCode?: string;
  authorizationCodeVerifier?: string;
  isConfigured: boolean;
}

export interface IfoodTokenResponse {
  accessToken: string;
  type: string;
  expiresIn: number;
  refreshToken?: string;
}

export interface IfoodTokenState {
  accessToken: string | null;
  refreshToken?: string | null;
  expiresAt: number | null; // timestamp em ms
  type?: string;
  lastConnectedAt?: string | null;
  status: "disconnected" | "connected" | "expired" | "refreshing";
}

// ==========================================
// 1. MERCHANT TYPES
// ==========================================
export type MerchantState = "AVAILABLE" | "UNAVAILABLE" | "PAUSED";

export interface IfoodMerchant {
  id: string;
  name: string;
  corporateName?: string;
  description?: string;
  averageTicket?: number;
  status: MerchantState;
  preparationTimeMinutes: number;
  minimumOrderValue?: number;
  address?: {
    formattedAddress?: string;
    street?: string;
    number?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  operations?: Array<{
    operation: "DELIVERY" | "TAKEOUT" | "INDOOR";
    salesChannel: "IFOOD";
    available: boolean;
    state: MerchantState;
  }>;
}

export interface IfoodInterruption {
  id: string;
  description: string;
  start: string;
  end: string;
}

// ==========================================
// 2. EVENTS & ORDERS TYPES
// ==========================================
export type IfoodOrderEventType =
  | "PLACED"
  | "CONFIRMED"
  | "PREPARATION_STARTED"
  | "READY_TO_PICKUP"
  | "DISPATCHED"
  | "DELIVERED"
  | "CONCLUDED"
  | "CANCELLED"
  | "CANCELLATION_REQUESTED";

export interface IfoodOrderEvent {
  id: string;
  code: IfoodOrderEventType;
  orderId: string;
  createdAt: string;
  fullCode: string;
  metadata?: Record<string, any>;
}

export interface IfoodOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  totalPrice: number;
  observations?: string;
  options?: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
}

export interface IfoodOrderCustomer {
  id: string;
  name: string;
  phone?: {
    number: string;
    extension?: string;
  };
}

export interface IfoodOrder {
  id: string;
  displayId: string;
  createdAt: string;
  orderType: "DELIVERY" | "TAKEOUT" | "INDOOR";
  status: IfoodOrderEventType;
  customer: IfoodOrderCustomer;
  items: IfoodOrderItem[];
  subTotal: number;
  deliveryFee: number;
  benefits: number; // descontos
  total: number;
  deliveryAddress?: {
    formattedAddress: string;
    neighborhood?: string;
    complement?: string;
    reference?: string;
  };
  payments: Array<{
    name: string;
    code: string;
    value: number;
    prepaid: boolean;
  }>;
  preparationTime: number; // em minutos
}

// ==========================================
// 3. FINANCIAL TYPES (v3.0)
// ==========================================
export interface IfoodSale {
  orderId: string;
  orderDisplayId: string;
  orderDate: string;
  grossValue: number;
  channelFee: number; // comissão do iFood
  deliveryFee: number;
  discountsSubsidized: number; // desconto bancado pelo iFood
  discountsMerchant: number; // desconto bancado pelo restaurante
  paymentFee: number; // taxa de transação
  netValue: number; // líquido a receber
  status: "COMPLETED" | "CANCELLED" | "PENDING";
}

export interface IfoodFinancialEvent {
  id: string;
  date: string;
  type: "COMMISSION" | "PAYMENT_PROCESSING" | "DELIVERY_FEE" | "PROMOTION" | "SUBSCRIPTION" | "ADJUSTMENT";
  description: string;
  amount: number; // negativo para taxas
  orderId?: string;
}

export interface IfoodSettlement {
  id: string;
  transferDate: string;
  bankName: string;
  accountNumber: string;
  grossAmount: number;
  discountsAndFees: number;
  netAmount: number;
  status: "PAID" | "SCHEDULED" | "PROCESSING";
}

export interface IfoodAnticipation {
  id: string;
  date: string;
  requestedAmount: number;
  feeAmount: number;
  netAmount: number;
  status: "APPROVED" | "PAID";
}

// ==========================================
// 4. CATALOG TYPES (v2.0)
// ==========================================
export interface IfoodCatalogProduct {
  id: string;
  name: string;
  description: string;
  categoryName: string;
  price: number;
  status: "AVAILABLE" | "UNAVAILABLE";
  externalCode?: string;
  imagePath?: string;
}

// ==========================================
// 5. SHIPPING & LOGISTICS TYPES
// ==========================================
export interface IfoodDeliveryAvailability {
  available: boolean;
  estimatedFee: number;
  estimatedTimeMinutes: number;
  reason?: string;
}

export interface IfoodShippingOrderRequest {
  merchantId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  orderValue: number;
  itemsDescription: string;
}

// ==========================================
// 6. REVIEWS TYPES (v2.0)
// ==========================================
export interface IfoodReview {
  id: string;
  orderId: string;
  customerName: string;
  score: number; // 1 a 5
  comment?: string;
  createdAt: string;
  reply?: {
    text: string;
    answeredAt: string;
  };
}

export interface IfoodReviewSummary {
  averageScore: number;
  totalReviews: number;
  fiveStarPercent: number;
  fourStarPercent: number;
  threeStarPercent: number;
  twoStarPercent: number;
  oneStarPercent: number;
}
