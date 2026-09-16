export function parseDebtDocument(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const isInvoice = /DANFE|NOTA FISCAL ELETR[ÔO]NICA|NF-e/i.test(compact);
  const issuerSection = compact.split(/DESTINAT[ÁA]RIO\/REMETENTE/i)[0];
  const supplierDocument = issuerSection.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0] || "";
  const supplierName = compact.match(/Recebemos de\s+(.+?)\s+(?:os produtos|os servi[çc]os)/i)?.[1] || "";
  const duplicates = compact.match(/DUPLICATAS?\b(.+?)(?:C[ÁA]LCULO DE IMPOSTO|BASE DE C[ÁA]LCULO|$)/i)?.[1] || "";
  const installment = duplicates.match(/(\d{2}[/-]\d{2}[/-]\d{4})\s+([\d.]+,\d{2})/);
  const due = installment?.[1] || compact.match(/(?:vencimento|vence em).{0,45}?(\d{2}[/-]\d{2}[/-]\d{4})/i)?.[1] || "";
  const amountText = installment?.[2] || compact.match(/(?:valor total da nota|valor do documento|valor a pagar)\s*[:R$ ]*([\d.]+,\d{2})/i)?.[1] || (!isInvoice ? compact.match(/R\$\s*([\d.]+,\d{2})/)?.[1] : "") || "";
  const amount = amountText ? Math.round(Number(amountText.replace(/\./g, "").replace(",", ".")) * 100) : 0;
  const invoiceNumber = compact.match(/N[º°o]\s*:?\s*(\d+)/i)?.[1] || compact.match(/N[º°o]\s*:?\s*S[ée]rie\s*:?\s*Emiss[ãa]o\s*:?\s*(\d+)/i)?.[1] || "";
  const barcode = !isInvoice ? compact.match(/(?:\d[ .-]?){44,48}/)?.[0]?.replace(/\D/g, "") || "" : "";
  return { supplierName, supplierDocument, amount, dueDate: due.replace(/(\d{2})[/-](\d{2})[/-](\d{4})/, "$3-$2-$1"), documentNumber: isInvoice && invoiceNumber ? `NF-e ${invoiceNumber}` : barcode, obligationType: isInvoice ? "Débito" : "Boleto", isInvoice };
}
