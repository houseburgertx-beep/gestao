import { createRemoteJWKSet, jwtVerify } from "jose";
import { recipientsFor, type Recipient } from "./recipients";

const FIREBASE_PROJECT_ID = "house-crm-pos-venda";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const SITE_ORIGIN = "https://houseburgertx-beep.github.io";
const SITE_URL = `${SITE_ORIGIN}/gestao/`;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const ALLOWED_ORIGINS = new Set([
  "https://houseburgertx-beep.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.has(origin);
}

type EmailEnv = Env & {
  GOOGLE_SCRIPT_URL: string;
  GOOGLE_SCRIPT_SECRET: string;
};

type NotificationPayload = {
  eventId: string;
  title: string;
  message: string;
  details?: { label: string; value: string }[];
  kind?: string;
  unitId?: string;
  link?: string;
  severity?: "info" | "warning" | "danger" | "success";
};

type UploadPayload = {
  fileName: string;
  mimeType: string;
  base64: string;
  category: "documents" | "employee_photos" | "payment_proofs" | "task_attachments";
};

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = isAllowedOrigin(origin) ? (origin as string) : SITE_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
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
    (payload.kind === undefined || (typeof payload.kind === "string" && payload.kind.length <= 60)) &&
    (payload.unitId === undefined || (typeof payload.unitId === "string" && payload.unitId.length <= 100)) &&
    (payload.details === undefined || (Array.isArray(payload.details) && payload.details.length <= 12 && payload.details.every((item) => item && typeof item.label === "string" && item.label.length <= 60 && typeof item.value === "string" && item.value.length <= 300))) &&
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

async function refreshDirectory(env: EmailEnv, authorization: string): Promise<Recipient[]> {
  const users: Recipient[] = [];
  let pageToken = "";
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/users`);
    url.searchParams.set("pageSize","100");
    if (pageToken) url.searchParams.set("pageToken",pageToken);
    const response = await fetch(url,{headers:{Authorization:authorization}});
    if (!response.ok) throw new Error("recipient_directory_unavailable");
    const result = await response.json() as {documents?:{name:string;fields?:Record<string,{stringValue?:string;booleanValue?:boolean}>}[];nextPageToken?:string};
    for (const document of result.documents || []) {
      const fields = document.fields || {};
      const email = fields.email?.stringValue || "";
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) users.push({id:document.name.split("/").pop()!,email,role:fields.role?.stringValue || "",unitId:fields.unitId?.stringValue || "",active:fields.active?.booleanValue !== false});
    }
    pageToken = result.nextPageToken || "";
  } while(pageToken);
  await env.NOTIFICATION_DIRECTORY.put("users",JSON.stringify(users));
  return users;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    };
    return replacements[character];
  });
}

async function verifyFirebaseToken(authorization: string | null): Promise<{ userId: string; email: string }> {
  if (!authorization?.startsWith("Bearer ")) throw new Error("missing_token");
  const token = authorization.slice(7);
  const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
    audience: FIREBASE_PROJECT_ID,
    issuer: FIREBASE_ISSUER,
    algorithms: ["RS256"],
  });
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!payload.sub || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid_identity");
  return { userId: payload.sub, email };
}

async function callGoogleScript(env: EmailEnv, body: object): Promise<Record<string, unknown>> {
  if (!env.GOOGLE_SCRIPT_URL || !env.GOOGLE_SCRIPT_SECRET) throw new Error("google_script_not_configured");
  let response = await fetch(env.GOOGLE_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.GOOGLE_SCRIPT_SECRET, ...body }),
    redirect: "manual",
  });
  for (let count = 0; count < 3 && [301, 302, 303, 307, 308].includes(response.status); count++) {
    const location = response.headers.get("Location");
    if (!location) throw new Error("google_script_invalid_response");
    const destination = new URL(location, env.GOOGLE_SCRIPT_URL);
    if (destination.protocol !== "https:" || destination.hostname !== "script.googleusercontent.com") {
      throw new Error("google_script_invalid_response");
    }
    // ContentService can briefly return 404 while its response becomes available.
    // Retry only the read: repeating the POST could create files or send emails twice.
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(destination.toString(), { method: "GET", redirect: "manual", headers: { "Cache-Control": "no-cache" } });
      if (![404, 429, 500, 502, 503, 504].includes(response.status) || attempt === 3) break;
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  if (!response.ok) throw new Error(`google_script_http_${response.status}`);
  const text = await response.text();
  let result: Record<string, unknown>;
  try { result = JSON.parse(text); }
  catch { throw new Error("google_script_invalid_response"); }
  if (!result.ok) throw new Error(String(result.error || "google_script_failed"));
  return result;
}

async function sendEmail(env: EmailEnv, payload: NotificationPayload, recipients: string[]): Promise<void> {
  const destination = payload.link ? new URL(payload.link.slice(1), SITE_URL).toString() : SITE_URL;
  const accent = payload.severity === "danger" ? "#e11d48" : payload.severity === "warning" ? "#f59e0b" : payload.severity === "success" ? "#16a34a" : "#2563eb";
  const label = payload.severity === "danger" ? "URGENTE" : payload.severity === "warning" ? "ATENÇÃO" : payload.severity === "success" ? "CONCLUÍDO" : "INFORMAÇÃO";
  const sentAt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Bahia",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const html = `
    <div style="display:none;max-height:0;overflow:hidden;color:transparent">${escapeHtml(payload.message)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#18181b">
      <tr><td align="center" style="padding:28px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #e4e4e7;overflow:hidden">
          <tr><td style="background-color:#ffffff;padding:26px 28px;border-bottom:1px solid #e4e4e7">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
              <td width="64"><div style="width:48px;height:48px;line-height:48px;text-align:center;border-radius:12px;background-color:#172554;color:#ffffff;font-size:16px;font-weight:800">190</div></td>
              <td><div style="color:#172554;font-size:20px;font-weight:800;letter-spacing:.2px">HOUSE 190</div><div style="color:#71717a;font-size:12px;margin-top:3px">Financeiro e operações</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:30px 28px 28px">
            <div style="display:inline-block;background-color:${accent}18;color:${accent};border:1px solid ${accent}45;border-radius:999px;padding:6px 10px;font-size:10px;font-weight:800;letter-spacing:1px">${label}</div>
            <h1 style="color:#123c77;font-size:26px;line-height:1.25;margin:18px 0 20px;font-weight:600">${escapeHtml(payload.title)}</h1>
            <p style="color:#52525b;font-size:15px;line-height:1.65;margin:0 0 16px">Olá,</p>
            <p style="color:#52525b;font-size:15px;line-height:1.65;margin:0 0 24px">${escapeHtml(payload.message)}</p>
            <table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e4e4e7;border-collapse:collapse;margin-bottom:24px;font-size:14px">
              <thead><tr style="background-color:#f0f1f3"><th align="left" style="padding:12px 14px;color:#52525b;width:34%">Informação</th><th align="left" style="padding:12px 14px;color:#52525b">Detalhe</th></tr></thead>
              <tbody>${(payload.details?.length ? payload.details : [{label:"Registro",value:payload.title}]).map((item, index) => `<tr><td style="padding:12px 14px;border-top:1px solid #e4e4e7;color:#71717a">${escapeHtml(item.label)}</td><td style="padding:12px 14px;border-top:1px solid #e4e4e7;color:#27272a;word-break:break-word">${index === 0 ? `<a href="${escapeHtml(destination)}" style="color:#0878c9;text-decoration:none;font-weight:600">${escapeHtml(item.value)}</a>` : escapeHtml(item.value)}</td></tr>`).join("")}</tbody>
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#123c77" style="border-radius:6px">
              <a href="${escapeHtml(destination)}" style="display:inline-block;color:#ffffff;text-decoration:none;padding:13px 20px;font-size:14px;font-weight:600">Visualizar no sistema →</a>
            </td></tr></table>
            <p style="color:#71717a;font-size:14px;line-height:1.6;margin:28px 0 0">Atenciosamente,<br><strong style="color:#3f3f46">Equipe House 190</strong></p>
          </td></tr>
          <tr><td style="background-color:#fafafa;border-top:1px solid #eeeeee;padding:16px 28px;color:#71717a;font-size:11px;line-height:1.5">
            Enviado em ${escapeHtml(sentAt)} · HOUSE 190<br>Este é um aviso automático do sistema de gestão.
          </td></tr>
        </table>
      </td></tr>
    </table>`;
  await callGoogleScript(env, {
    action: "email",
    to: recipients,
    subject: `[HOUSE 190] ${payload.title}`,
    html,
    text: `${payload.title}\n\n${payload.message}\n\n${(payload.details || []).map((item) => `${item.label}: ${item.value}`).join("\n")}\n\n${destination}`,
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
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: isAllowedOrigin(origin) ? 204 : 403,
        headers: corsHeaders(origin),
      });
    }
    if (!isAllowedOrigin(origin)) return jsonResponse({ error: "origin_not_allowed" }, 403, origin);
    const url = new URL(request.url);
    if (request.method !== "POST" || !["/notifications/email", "/notifications/directory", "/files/upload", "/files/download", "/sheets/sync"].includes(url.pathname)) {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    const maxRequestSize = ["/files/upload", "/sheets/sync"].includes(url.pathname) ? 11250000 : 8192;
    if (contentLength > maxRequestSize) return jsonResponse({ error: "payload_too_large" }, 413, origin);

    let verifiedUser: { userId: string; email: string };
    try {
      verifiedUser = await verifyFirebaseToken(request.headers.get("Authorization"));
    } catch {
      return jsonResponse({ error: "unauthorized" }, 401, origin);
    }

    let payload: unknown;
    try { payload = await request.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400, origin); }

    try {
      if (url.pathname === "/notifications/directory") {
        const users = await refreshDirectory(env,request.headers.get("Authorization")!);
        return jsonResponse({ok:true,count:users.length},200,origin);
      }
      if (url.pathname === "/notifications/email") {
        if (!isValidNotification(payload)) return jsonResponse({ error: "invalid_payload" }, 400, origin);
        const directory = await env.NOTIFICATION_DIRECTORY.get<Recipient[]>("users","json") || await refreshDirectory(env,request.headers.get("Authorization")!);
        const actor = directory.find((user) => user.id === verifiedUser.userId);
        if (!actor?.active) return jsonResponse({error:"inactive_user"},403,origin);
        if (actor.role === "manager" && payload.unitId !== actor.unitId) return jsonResponse({error:"unit_not_allowed"},403,origin);
        if (actor.role === "manager" && !["task_created","task_completed"].includes(payload.kind || "")) return jsonResponse({error:"event_not_allowed"},403,origin);
        if (actor.role === "operator" && (payload.unitId !== actor.unitId || !["cash_closing","pix_request"].includes(payload.kind || ""))) return jsonResponse({error:"event_not_allowed"},403,origin);
        const recipients = recipientsFor(directory,payload);
        if (!recipients.length) throw new Error("recipient_directory_unavailable");
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

      if (url.pathname === "/sheets/sync") {
        const syncPayload = payload as { tables?: Record<string, unknown[]>; operation?: string; details?: string };
        if (!syncPayload || typeof syncPayload !== "object" || !syncPayload.tables) {
          return jsonResponse({ error: "invalid_payload" }, 400, origin);
        }
        const result = await callGoogleScript(env, {
          action: "sync_sheets",
          tables: syncPayload.tables,
          operation: syncPayload.operation || "upsert_batch",
          details: syncPayload.details,
          userId: verifiedUser.userId,
          userEmail: verifiedUser.email,
        });
        return jsonResponse(result, 200, origin);
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
      const reason = error instanceof Error ? error.message : "unknown";
      const messages: Record<string, string> = {
        recipient_directory_unavailable: "Não foi possível atualizar os destinatários. Abra o sistema com uma conta da diretoria para sincronizar os usuários.",
        google_script_not_configured: "A conexão com o Google Apps Script não está configurada.",
        google_script_invalid_response: "O Google Apps Script não retornou uma resposta válida. Verifique a publicação do aplicativo e suas permissões.",
        unauthorized: "A chave de conexão entre o serviço e o Google Apps Script não confere.",
        daily_quota_exceeded: "O limite diário de envio de e-mails do Google foi atingido.",
        request_failed: "O Google Apps Script falhou. Verifique suas execuções e autorizações do Gmail e Google Drive.",
      };
      return jsonResponse({ error: "service_unavailable", message: messages[reason] || "O Google Apps Script está indisponível. O envio não foi concluído." }, 503, origin);
    }
  },
} satisfies ExportedHandler<EmailEnv>;
