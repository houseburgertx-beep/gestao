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
    if (payload.action === "sync_sheets") return syncSheetRecords(payload);
    return jsonResponse({ ok: false, error: "invalid_action" });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: "request_failed", details: String(error) });
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

// ==========================================================================
// BANCO DE DADOS ESPELHO & BACKUP EM PLANILHA ÚNICA (GOOGLE SHEETS)
// ==========================================================================
const SPREADSHEET_NAME = "HOUSE 190 - BANCO DE DADOS & BACKUP GERAL";

const SHEET_SCHEMAS = {
  Contas_Pagar: [
    "ID", "VENCIMENTO", "UNIDADE", "FORNECEDOR", "DESCRICAO", "TIPO",
    "FORMA_PAGAMENTO", "PARCELA", "VALOR_ORIGINAL", "VALOR_PAGAR",
    "SALDO_ABERTO", "STATUS", "IMPOSTO", "DOCUMENTO_CODIGO",
    "LINK_BOLETO_DRIVE", "OBSERVACOES", "ATUALIZADO_EM"
  ],
  Pagamentos_Baixas: [
    "ID", "DATA_BAIXA", "HORARIO", "UNIDADE", "CONTA_BANCARIA",
    "DESCRICAO", "VALOR_PAGO", "QUEM_PAGOU", "FORMA_PAGAMENTO",
    "LINK_COMPROVANTE_DRIVE", "ID_OBRIGACAO", "REGISTRADO_EM"
  ],
  Fechamentos_Caixa: [
    "ID", "DATA", "TURNO", "UNIDADE", "OPERADOR", "FATURAMENTO_TOTAL",
    "DINHEIRO_ESPERADO", "DINHEIRO_INFORMADO", "DIFERENCA_DINHEIRO",
    "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "SANGRIAS",
    "DIVERGENCIA_GERAL", "STATUS", "REGISTRADO_EM"
  ],
  Conferencias_Caixa: [
    "ID", "ID_FECHAMENTO", "DATA_CAIXA", "UNIDADE", "OPERADOR_CAIXA",
    "QUEM_CONFERIU", "DATA_CONFERENCIA", "STATUS", "DIVERGENCIA_TOTAL",
    "NOTAS", "CONCILIACAO_BANCOS_JSON", "REGISTRADO_EM"
  ],
  Contas_Bancarias: [
    "ID", "NOME_CONTA", "BANCO", "UNIDADE", "SALDO_ATUAL",
    "DATA_SALDO", "CONCILIADO", "ATUALIZADO_POR", "ATUALIZADO_EM"
  ],
  Transferencias_Internas: [
    "ID", "DATA", "CONTA_ORIGEM", "CONTA_DESTINO", "VALOR",
    "RESPONSAVEL", "OBSERVACOES", "REGISTRADO_EM"
  ],
  Fornecedores: [
    "ID", "NOME", "DOCUMENTO_CNPJ_CPF", "TELEFONE", "CHAVE_PIX",
    "CATEGORIA", "ATUALIZADO_EM"
  ],
  Log_Sincronizacao: [
    "DATA_HORA", "OPERACAO", "TABELAS_ATUALIZADAS", "QTD_REGISTROS",
    "STATUS", "USUARIO", "DETALHES"
  ]
};

function getOrCreateBackupSpreadsheet() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty("BACKUP_SPREADSHEET_ID");
  if (spreadsheetId) {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (e) {
      console.warn("Spreadsheet ID inválido ou não encontrado, buscando por nome:", e);
    }
  }

  const rootFolder = getRootFolder();
  const files = rootFolder.getFilesByName(SPREADSHEET_NAME);
  let spreadsheet;
  if (files.hasNext()) {
    spreadsheet = SpreadsheetApp.open(files.next());
  } else {
    spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
    const file = DriveApp.getFileById(spreadsheet.getId());
    rootFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
  }

  properties.setProperty("BACKUP_SPREADSHEET_ID", spreadsheet.getId());
  initSpreadsheetSheets(spreadsheet);
  return spreadsheet;
}

function initSpreadsheetSheets(spreadsheet) {
  Object.keys(SHEET_SCHEMAS).forEach((sheetName) => {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }
    const headers = SHEET_SCHEMAS[sheetName];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#1e293b");
      headerRange.setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }
  });

  const defaultSheet = spreadsheet.getSheetByName("Página1") || spreadsheet.getSheetByName("Sheet1");
  if (defaultSheet && spreadsheet.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    try { spreadsheet.deleteSheet(defaultSheet); } catch (e) {}
  }
}

function syncSheetRecords(payload) {
  const spreadsheet = getOrCreateBackupSpreadsheet();
  initSpreadsheetSheets(spreadsheet);
  const tables = payload.tables || {};
  let totalProcessed = 0;
  const updatedTables = [];

  Object.keys(tables).forEach((sheetName) => {
    if (!SHEET_SCHEMAS[sheetName]) return;
    const records = tables[sheetName];
    if (!Array.isArray(records) || records.length === 0) return;

    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

    const headers = SHEET_SCHEMAS[sheetName];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#1e293b");
      headerRange.setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    }

    const lastRow = sheet.getLastRow();
    const idRowMap = {};
    if (lastRow > 1) {
      const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (let i = 0; i < idValues.length; i++) {
        const id = String(idValues[i][0] || "").trim();
        if (id) idRowMap[id] = i + 2;
      }
    }

    const rowsToAppend = [];
    records.forEach((record) => {
      const id = String(record.id || record.ID || "").trim();
      if (!id) return;

      const rowValues = headers.map((header) => {
        let val = record[header] !== undefined ? record[header] : record[header.toLowerCase()];
        if (val === undefined || val === null) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      });

      if (idRowMap[id]) {
        const targetRow = idRowMap[id];
        sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowValues]);
      } else {
        rowsToAppend.push(rowValues);
      }
      totalProcessed++;
    });

    if (rowsToAppend.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }
    updatedTables.push(`${sheetName} (${records.length})`);
  });

  try {
    const logSheet = spreadsheet.getSheetByName("Log_Sincronizacao");
    if (logSheet) {
      const nowStr = new Date().toISOString();
      logSheet.appendRow([
        nowStr,
        payload.operation || "upsert_batch",
        updatedTables.join(", "),
        totalProcessed,
        "SUCESSO",
        payload.userId || payload.userEmail || "sistema",
        payload.details || "Sincronização em tempo real concluída."
      ]);
    }
  } catch (err) {
    console.warn("Erro ao registrar log de sync:", err);
  }

  return jsonResponse({
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    processedRecords: totalProcessed,
    updatedTables,
  });
}

