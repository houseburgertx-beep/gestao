import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_PROJECT_ID = "house-crm-pos-venda";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const SITE_ORIGIN = "https://houseburgertx-beep.github.io";
const SITE_URL = `${SITE_ORIGIN}/gestao/`;

type EmailEnv = Env & {
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  EMAIL_TO: string;
};

type NotificationPayload = {
  eventId: string;
  title: string;
  message: string;
  link?: string;
  severity?: "info" | "warning" | "danger" | "success";
};

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin === SITE_ORIGIN ? SITE_ORIGIN : "null",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(body: object, status: number, origin: string | null): Response {
  return Response.json(body, { status, headers: corsHeaders(origin) });
}

function isValidPayload(value: unknown): value is NotificationPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.eventId === "string" &&
    payload.eventId.length >= 3 &&
    payload.eventId.length <= 160 &&
    typeof payload.title === "string" &&
    payload.title.length >= 2 &&
    payload.title.length <= 120 &&
    typeof payload.message === "string" &&
    payload.message.length >= 2 &&
    payload.message.length <= 1000 &&
    (payload.link === undefined ||
      (typeof payload.link === "string" && payload.link.startsWith("/") && payload.link.length <= 300))
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return replacements[character];
  });
}

async function verifyFirebaseToken(authorization: string | null): Promise<string> {
  if (!authorization?.startsWith("Bearer ")) throw new Error("missing_token");
  const token = authorization.slice(7);
  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    audience: FIREBASE_PROJECT_ID,
    issuer: FIREBASE_ISSUER,
    algorithms: ["RS256"],
  });
  if (!payload.sub) throw new Error("invalid_subject");
  return payload.sub;
}

async function sendEmail(env: EmailEnv, payload: NotificationPayload): Promise<Response> {
  const recipients = env.EMAIL_TO.split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || recipients.length === 0) {
    throw new Error("email_not_configured");
  }

  const destination = payload.link ? new URL(payload.link.slice(1), SITE_URL).toString() : SITE_URL;
  const accent = payload.severity === "danger" ? "#e11d48" : payload.severity === "warning" ? "#f59e0b" : "#18181b";
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f4f4f5;padding:28px;color:#18181b">
      <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden">
        <div style="padding:18px 24px;background:#18181b;color:#fff;font-weight:700">HOUSE 190 · Gestão</div>
        <div style="padding:24px;border-left:4px solid ${accent}">
          <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(payload.title)}</h1>
          <p style="font-size:14px;line-height:1.6;color:#52525b;margin:0 0 20px">${escapeHtml(payload.message)}</p>
          <a href="${escapeHtml(destination)}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:7px;font-size:13px;font-weight:600">Abrir painel</a>
        </div>
      </div>
    </div>`;

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `house190-${payload.eventId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 220)}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: recipients,
      subject: `[HOUSE 190] ${payload.title}`,
      html,
      text: `${payload.title}\n\n${payload.message}\n\n${destination}`,
      tags: [{ name: "source", value: "house190-gestao" }],
    }),
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (origin !== SITE_ORIGIN) return jsonResponse({ error: "origin_not_allowed" }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });

    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/notifications/email") {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }

    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > 8192) return jsonResponse({ error: "payload_too_large" }, 413, origin);

    let userId: string;
    try {
      userId = await verifyFirebaseToken(request.headers.get("Authorization"));
    } catch {
      return jsonResponse({ error: "unauthorized" }, 401, origin);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400, origin);
    }
    if (!isValidPayload(payload)) return jsonResponse({ error: "invalid_payload" }, 400, origin);

    try {
      const resendResponse = await sendEmail(env, payload);
      if (!resendResponse.ok) {
        console.error(JSON.stringify({ event: "email_failed", status: resendResponse.status, userId }));
        return jsonResponse({ error: "email_provider_failed" }, 502, origin);
      }
      console.log(JSON.stringify({ event: "email_sent", eventId: payload.eventId, userId }));
      return jsonResponse({ ok: true }, 200, origin);
    } catch (error) {
      console.error(JSON.stringify({ event: "email_error", reason: error instanceof Error ? error.message : "unknown", userId }));
      return jsonResponse({ error: "email_unavailable" }, 503, origin);
    }
  },
} satisfies ExportedHandler<EmailEnv>;
