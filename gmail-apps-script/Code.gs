const ROOT_FOLDER_NAME = "HOUSE 190 - Gestão";
const FOLDER_NAMES = {
  documents: "Documentos",
  employee_photos: "Fotos de Colaboradores",
  payment_proofs: "Comprovantes de Pagamento",
  task_attachments: "Anexos de Tarefas",
};
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function setup() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty("WEBHOOK_SECRET");
  if (!secret) {
    secret = `${Utilities.getUuid()}${Utilities.getUuid()}`.replace(/-/g, "");
    properties.setProperty("WEBHOOK_SECRET", secret);
  }
  const root = getRootFolder();
  Object.keys(FOLDER_NAMES).forEach((category) => getCategoryFolder(root, category));
  console.log(`SETUP_RESULT=${JSON.stringify({ secret, rootFolderId: root.getId() })}`);
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: "unauthorized" });
    }
    if (payload.action === "email") return sendNotificationEmail(payload);
    if (payload.action === "upload") return uploadFile(payload);
    if (payload.action === "download") return downloadFile(payload);
    return jsonResponse({ ok: false, error: "invalid_action" });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: "request_failed" });
  }
}

function sendNotificationEmail(payload) {
  const recipients = Array.isArray(payload.to)
    ? payload.to.map(String).map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).slice(0, 50)
    : [];
  const subject = String(payload.subject || "").slice(0, 160);
  const text = String(payload.text || "").slice(0, 5000);
  const html = String(payload.html || "").slice(0, 20000);
  if (!recipients.length || !subject || !text) return jsonResponse({ ok: false, error: "invalid_payload" });
  if (MailApp.getRemainingDailyQuota() < recipients.length) {
    return jsonResponse({ ok: false, error: "daily_quota_exceeded" });
  }
  recipients.forEach((recipient) => {
    MailApp.sendEmail({ to: recipient, subject, body: text, htmlBody: html || undefined, name: "HOUSE 190" });
  });
  return jsonResponse({ ok: true, recipients: recipients.length });
}

function uploadFile(payload) {
  const fileName = sanitizeFileName(String(payload.fileName || "arquivo"));
  const mimeType = String(payload.mimeType || "application/octet-stream").slice(0, 120);
  const base64 = String(payload.base64 || "");
  const category = Object.prototype.hasOwnProperty.call(FOLDER_NAMES, payload.category)
    ? payload.category : "documents";
  if (!base64 || base64.length > 11200000) return jsonResponse({ ok: false, error: "invalid_file" });
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_FILE_BYTES) return jsonResponse({ ok: false, error: "file_too_large" });
  const folder = getCategoryFolder(getRootFolder(), category);
  const file = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
  file.setDescription(`Enviado pelo painel HOUSE 190 em ${new Date().toISOString()}`);
  return jsonResponse({ ok: true, fileId: file.getId(), fileName: file.getName(), mimeType, size: file.getSize() });
}

function downloadFile(payload) {
  const fileId = String(payload.fileId || "");
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) return jsonResponse({ ok: false, error: "invalid_file_id" });
  const file = DriveApp.getFileById(fileId);
  if (!isManagedFile(file)) return jsonResponse({ ok: false, error: "file_not_managed" });
  const blob = file.getBlob();
  return jsonResponse({ ok: true, fileName: file.getName(), mimeType: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) });
}

function getRootFolder() {
  const properties = PropertiesService.getScriptProperties();
  const storedId = properties.getProperty("ROOT_FOLDER_ID");
  if (storedId) {
    try { return DriveApp.getFolderById(storedId); } catch (error) { console.warn(error); }
  }
  const matches = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  const root = matches.hasNext() ? matches.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  properties.setProperty("ROOT_FOLDER_ID", root.getId());
  return root;
}

function getCategoryFolder(root, category) {
  const name = FOLDER_NAMES[category] || FOLDER_NAMES.documents;
  const matches = root.getFoldersByName(name);
  return matches.hasNext() ? matches.next() : root.createFolder(name);
}

function isManagedFile(file) {
  const rootId = getRootFolder().getId();
  const parents = file.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    if (parent.getId() === rootId) return true;
    const grandparents = parent.getParents();
    while (grandparents.hasNext()) {
      if (grandparents.next().getId() === rootId) return true;
    }
  }
  return false;
}

function sanitizeFileName(value) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_").trim().slice(0, 180) || "arquivo";
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
