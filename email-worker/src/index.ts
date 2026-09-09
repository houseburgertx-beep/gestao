import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_PROJECT_ID = "house-crm-pos-venda";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const SITE_ORIGIN = "https://houseburgertx-beep.github.io";
const SITE_URL = `${SITE_ORIGIN}/gestao/`;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

type EmailEnv = Env & {
  GOOGLE_SCRIPT_URL: string;
  GOOGLE_SCRIPT_SECRET: string;
};

type NotificationPayload = {
  eventId: string;
  title: string;
  message: string;
  link?: string;
  severity?: "info" | "warning" | "danger" | "success";
};

type FirestoreDocument = {
  fields?: {
    email?: { stringValue?: string };
    active?: { booleanValue?: boolean };
  };
};

type UploadPayload = {
  fileName: string;
  mimeType: string;
  base64: string;
  category: "documents" | "employee_photos" | "payment_proofs" | "task_attachments";
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

function isValidNotification(value: unknown): value is NotificationPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.eventId === "string" && payload.eventId.length >= 3 && payload.eventId.length <= 160 &&
    typeof payload.title === "string" && payload.title.length >= 2 && payload.title.length <= 120 &&
    typeof payload.message === "string" && payload.message.length >= 2 && payload.message.length <= 1000 &&
    (payload.link === undefined ||
      (typeof payload.link === "string" && payload.link.startsWith("/") && payload.link.length <= 300))
  );
}

function isValidUpload(value: unknown): value is UploadPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.fileName === "string" && payload.fileName.length >= 1 && payload.fileName.length <= 180 &&
    typeof payload.mimeType === "string" && payload.mimeType.length >= 3 && payload.mimeType.length <= 120 &&
    typeof payload.base64 === "string" && payload.base64.length >= 1 && payload.base64.length <= 11200000 &&
    ["documents", "employee_photos", "payment_proofs", "task_attachments"].includes(String(payload.category))
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    };
    return replacements[character];
  });
}

async function verifyFirebaseToken(authorization: string | null): Promise<{ token: string; userId: string }> {
  if (!authorization?.startsWith("Bearer ")) throw new Error("missing_token");
  const token = authorization.slice(7);
  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    audience: FIREBASE_PROJECT_ID,
    issuer: FIREBASE_ISSUER,
    algorithms: ["RS256"],
  });
  if (!payload.sub) throw new Error("invalid_subject");
  return { token, userId: payload.sub };
}

function emailFromDocument(document: FirestoreDocument): string | null {
  const email = document.fields?.email?.stringValue?.trim().toLowerCase();
  if (!email || document.fields?.active?.booleanValue === false) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function fetchRecipients(token: string, userId: string): Promise<string[]> {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users`;
  const headers = { Authorization: `Bearer ${token}` };
  const listResponse = await fetch(`${baseUrl}?pageSize=100`, { headers });
  if (listResponse.ok) {
    const result = (await listResponse.json()) as { documents?: FirestoreDocument[] };
    const emails = (result.documents || []).map(emailFromDocument).filter((email): email is string => Boolean(email));
    if (emails.length) return Array.from(new Set(emails)).slice(0, 50);
  }
  const ownResponse = await fetch(`${baseUrl}/${encodeURIComponent(userId)}`, { headers });
  if (!ownResponse.ok) throw new Error("recipients_unavailable");
  const ownEmail = emailFromDocument((await ownResponse.json()) as FirestoreDocument);
  if (!ownEmail) throw new Error("recipient_unavailable");
  return [ownEmail];
}

async function callGoogleScript(env: EmailEnv, body: object): Promise<Record<string, unknown>> {
  if (!env.GOOGLE_SCRIPT_URL || !env.GOOGLE_SCRIPT_SECRET) throw new Error("google_script_not_configured");
  const response = await fetch(env.GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.GOOGLE_SCRIPT_SECRET, ...body }),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`google_script_http_${response.status}`);
  const result = (await response.json()) as Record<string, unknown>;
  if (!result.ok) throw new Error(String(result.error || "google_script_failed"));
  return result;
}

async function sendEmail(env: EmailEnv, payload: NotificationPayload, recipients: string[]): Promise<void> {
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
  await callGoogleScript(env, {
    action: "email",
    to: recipients,
    subject: `[HOUSE 190] ${payload.title}`,
    html,
    text: `${payload.title}\n\n${payload.message}\n\n${destination}`,
  });
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer as ArrayBuffer;
}

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (origin !== SITE_ORIGIN) return jsonResponse({ error: "origin_not_allowed" }, 403, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    if (request.method !== "POST" || !["/notifications/email", "/files/upload", "/files/download"].includes(url.pathname)) {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    const maxRequestSize = url.pathname === "/files/upload" ? 11250000 : 8192;
    if (contentLength > maxRequestSize) return jsonResponse({ error: "payload_too_large" }, 413, origin);

    let verifiedUser: { token: string; userId: string };
    try {
      verifiedUser = await verifyFirebaseToken(request.headers.get("Authorization"));
    } catch {
      return jsonResponse({ error: "unauthorized" }, 401, origin);
    }

    let payload: unknown;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400, origin); }

    try {
      if (url.pathname === "/notifications/email") {
        if (!isValidNotification(payload)) return jsonResponse({ error: "invalid_payload" }, 400, origin);
        const recipients = await fetchRecipients(verifiedUser.token, verifiedUser.userId);
        await sendEmail(env, payload, recipients);
        console.log(JSON.stringify({ event: "email_sent", eventId: payload.eventId, userId: verifiedUser.userId, recipients: recipients.length }));
        return jsonResponse({ ok: true }, 200, origin);
      }

      if (url.pathname === "/files/upload") {
        if (!isValidUpload(payload)) return jsonResponse({ error: "invalid_payload" }, 400, origin);
        if (Math.floor(payload.base64.length * 0.75) > MAX_FILE_BYTES) return jsonResponse({ error: "file_too_large" }, 413, origin);
        const result = await callGoogleScript(env, { action: "upload", ...payload, userId: verifiedUser.userId });
        return jsonResponse({ ok: true, fileId: result.fileId, fileName: result.fileName, mimeType: result.mimeType, size: result.size }, 200, origin);
      }

      const download = payload as { fileId?: unknown };
      if (typeof download?.fileId !== "string" || !/^[a-zA-Z0-9_-]{10,200}$/.test(download.fileId)) {
        return jsonResponse({ error: "invalid_file_id" }, 400, origin);
      }
      const result = await callGoogleScript(env, { action: "download", fileId: download.fileId, userId: verifiedUser.userId });
      if (typeof result.base64 !== "string") throw new Error("download_missing_content");
      const bytes = decodeBase64(result.base64);
      const fileName = String(result.fileName || "arquivo").replace(/[\r\n"]/g, "_");
      return new Response(bytes, {
        status: 200,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": String(result.mimeType || "application/octet-stream"),
          "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        },
      });
    } catch (error) {
      console.error(JSON.stringify({ event: "service_error", reason: error instanceof Error ? error.message : "unknown", userId: verifiedUser.userId }));
      return jsonResponse({ error: "service_unavailable" }, 503, origin);
    }
  },
} satisfies ExportedHandler<EmailEnv>;
