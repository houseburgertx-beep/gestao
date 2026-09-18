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

export interface ParsedEmployeeDocument {
  name: string;
  cpf: string;
  birthDate: string;
  admissionDate: string;
  role: string;
  salary: number;
  salaryCents: number;
  salaryFormatted: string;
  workHours: string;
  address: string;
  unitId: "teixeira" | "eunapolis" | "foodpark" | "central";
  department: string;
  contractType: "CLT" | "PJ" | "Estagio";
  cbo: string;
  ctps: string;
  serie: string;
  esocial: string;
  motherName: string;
  fatherName: string;
  notes: string;
}

export function parseEmployeeDocument(text: string): ParsedEmployeeDocument {
  const compact = text.replace(/[ \t]+/g, " ").trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const normalizeDate = (d: string) => {
    if (!d) return "";
    const m = d.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };

  // CPF: strictly 11 digits, standard format 000.000.000-00 or plain 11 digits (exclude CNPJ)
  const cpfFormattedMatch = text.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
  const cpfLabeledMatch = compact.match(/(?:CPF|C\.P\.F\.)\s*[:.-]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
  let cpf = cpfFormattedMatch ? cpfFormattedMatch[0] : (cpfLabeledMatch ? cpfLabeledMatch[1] : "");
  if (cpf && !cpf.includes(".")) {
    cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  // Admission Date
  const admMatch = text.match(/(\d{2}\/\d{2}\/\d{4})\s*\n?\s*Data de Admiss[ãa]o/i) ||
                   text.match(/Data de Admiss[ãa]o\s*[:\s]*\n?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                   text.match(/Admiss[ãa]o\s*[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
  const admissionRaw = admMatch ? admMatch[1] : "";
  const admissionDate = normalizeDate(admissionRaw);

  // Birth Date
  let birthRaw = "";
  const dateBeforeCpf = text.match(/(\d{2}\/\d{2}\/\d{4})\s*\n\s*\d{3}\.\d{3}\.\d{3}-\d{2}/);
  const birthMatch = text.match(/(?:Data de nascimento|Nascimento\b)\s*[:\s]*\n?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                     text.match(/(\d{2}\/\d{2}\/\d{4})[\s\S]{0,80}?(?:Data de nascimento|Nascimento\b)/i);
  if (dateBeforeCpf) {
    birthRaw = dateBeforeCpf[1];
  } else if (birthMatch) {
    birthRaw = birthMatch[1];
  } else {
    const allDates = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
    const candidates = allDates.filter((d) => d !== admissionRaw);
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const [da, ma, ya] = a.split("/").map(Number);
        const [db, mb, yb] = b.split("/").map(Number);
        return (ya * 10000 + ma * 100 + da) - (yb * 10000 + mb * 100 + db);
      });
      birthRaw = candidates[0];
    }
  }
  const birthDate = normalizeDate(birthRaw);

  // Name
  let name = "";
  const blacklistName = /agência|agencia|banco|cargo|empresa|empregador|empregado|unidade|rescisão|rescisao|sindical|residência|residencia|beneficiário|beneficiario|filiação|filiacao|endereço|endereco|house|burguer|burger|hamburgueria|ltda|função|funcao|categoria|esocial/i;

  const isCleanName = (s: string) => {
    if (!s) return false;
    const trimmed = s.trim();
    if (blacklistName.test(trimmed)) return false;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return parts.length >= 2 && parts.every((p) => /^[A-ZÁ-Úa-zà-ú.]+$/.test(p));
  };

  const nameAgencyObs = text.match(/End\.?\s*da\s*agência\s*\n\s*([A-ZÁ-Ú ]{5,60})\s*\n\s*OBSERVAÇÕES/i);
  const nameAboveObs = text.match(/([A-ZÁ-Ú ]{5,60})\s*\n\s*OBSERVAÇÕES/);
  const nameNearRes = text.match(/Benefici[áa]rios\s*\n\s*([A-ZÁ-Ú ]{5,60})\s*\n\s*(?:Rua|Av|Praça|PC|Pç|Alameda|Travessa|Rodovia|Endereço)/i);
  const nameUnderEmp = text.match(/(?:Nome\s+(?:do\s+Empregado|Completo)|\bNome\b)\s*[:\n]\s*([A-ZÁ-Úa-zà-ú ]{5,60})/i);

  if (nameAgencyObs && isCleanName(nameAgencyObs[1])) {
    name = nameAgencyObs[1].trim();
  } else if (nameNearRes && isCleanName(nameNearRes[1])) {
    name = nameNearRes[1].trim();
  } else if (nameAboveObs && isCleanName(nameAboveObs[1])) {
    name = nameAboveObs[1].trim();
  } else if (nameUnderEmp && isCleanName(nameUnderEmp[1])) {
    name = nameUnderEmp[1].trim();
  }

  // Address
  let address = "";
  const addressMatch = text.match(/Benefici[áa]rios\s*\n\s*[^\n]+\n\s*([^\n]+(?:\n[^\n]+)?CEP[^\n]*)/i) ||
                       text.match(/(?:Residência|Endereço)\s*[\n:]\s*([^\n]+(?:\n[^\n]+)?CEP[^\n]*)/i);
  if (addressMatch) {
    address = addressMatch[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  } else {
    const ruaIdx = lines.findIndex((l) => /^Rua\b/i.test(l) || /^(?:Av|Avenida|Al|Alameda|Travessa|Praça|Pç|Rodovia)\b/i.test(l));
    if (ruaIdx !== -1) {
      address = lines[ruaIdx];
      if (ruaIdx + 1 < lines.length && (lines[ruaIdx + 1].includes("CEP") || lines[ruaIdx + 1].includes("BA") || lines[ruaIdx + 1].includes("FREITAS") || lines[ruaIdx + 1].includes("CENTRO"))) {
        address += ", " + lines[ruaIdx + 1];
      }
    }
  }
  address = address.replace(/^,\s*/, "").replace(/\s*,\s*,\s*/g, ", ").trim();

  // Role / Cargo
  let role = "";
  const cargoHeaderMatch = text.match(/Cargo\s*\n\s*([^\n]+?)\s*\n\s*(?:Função|C\.?B\.?O)/i);
  if (cargoHeaderMatch && !/e\/ou função/i.test(cargoHeaderMatch[1])) {
    role = cargoHeaderMatch[1].trim();
  } else {
    const roleMatch = text.match(/Cargo\s*[:\n]\s*([A-ZÁ-Úa-zá-ú0-9 /.-]+?)(?:\s{2,}Função|\s+C\.?B\.?O|\n|$)/i);
    if (roleMatch && !/e\/ou função/i.test(roleMatch[1])) {
      role = roleMatch[1].trim();
    }
  }

  // Salary
  const salMatch = text.match(/([\d.]+,\d{2})\s*R\$/i) ||
                   text.match(/R\$\s*([\d.]+,\d{2})/i) ||
                   text.match(/Salário\s*(?:Por\s+Mês|Base|Nominal|Mensal)?\s*[:\s]*R?\$?\s*([\d.]+,\d{2})/i);
  const salaryFormatted = salMatch ? salMatch[1] : "";
  const salary = salaryFormatted ? parseFloat(salaryFormatted.replace(/\./g, "").replace(",", ".")) : 0;
  const salaryCents = Math.round(salary * 100);

  // Work hours
  const hoursMatch = text.match(/Horário\s*(?:de\s+trabalho)?\s*[:\n]\s*([^\n]+)/i) ||
                     text.match(/Jornada\s*[:\n]\s*([^\n]+)/i);
  let workHours = hoursMatch ? hoursMatch[1].trim() : "44h semanais (Escala 6x1)";

  // CTPS, Série, CBO, eSocial
  const ctpsMatch = text.match(/(\d{5,9})\s*\n\s*CTPS/i) || text.match(/CTPS\s*[:\s]*(\d+)/i);
  const ctps = ctpsMatch ? ctpsMatch[1] : "";
  const serieMatch = text.match(/(\d{3,5})\s*\n\s*\d{2}\//) || text.match(/Série\s*[:\s]*(\d+)/i) || text.match(/(\d{3,5})\s*\n\s*Série/i);
  const serie = serieMatch ? serieMatch[1] : "";
  const cboMatch = text.match(/C\.?B\.?O\.?\s*\n?\s*(\d{4,8})/i);
  const cbo = cboMatch ? cboMatch[1] : "";
  const esocialMatch = text.match(/Matrícula eSocial\s*\n?\s*(\d+)/i) || text.match(/(\d+)\s*\n\s*Empregador\s*\n\s*Matrícula eSocial/i);
  const esocial = esocialMatch ? esocialMatch[1] : "";

  // Filiação
  let fatherName = "";
  let motherName = "";

  // 1. Direct label pattern: "Pai: Nome", "Mãe: Nome"
  const paiDirectMatch = text.match(/(?:Nome do Pai|Pai)\s*[:\-]\s*([A-ZÁ-Úa-zà-ú. ]{4,60})/i);
  if (paiDirectMatch && isCleanName(paiDirectMatch[1])) {
    fatherName = paiDirectMatch[1].trim();
  }
  const maeDirectMatch = text.match(/(?:Nome da Mãe|Mãe)\s*[:\-]\s*([A-ZÁ-Úa-zà-ú. ]{4,60})/i);
  if (maeDirectMatch && isCleanName(maeDirectMatch[1])) {
    motherName = maeDirectMatch[1].trim();
  }

  // 2. Multiline labeled pattern: "Pai\n[Nome]" or "Mãe\n[Nome]"
  if (!fatherName || !motherName) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^Pai$/i.test(line) && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (isCleanName(nextLine) && !/^(?:Mãe|Filiação|CTPS|CPF)/i.test(nextLine)) {
          if (!fatherName) fatherName = nextLine;
        }
      }
      if (/^Mãe$/i.test(line) && i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (isCleanName(nextLine) && !/^(?:Pai|Filiação|CTPS|CPF)/i.test(nextLine)) {
          if (!motherName) motherName = nextLine;
        }
      }
    }
  }

  // 3. Tabular layout (common in eSocial / Registro de Empregado PDFs where filiação values appear before or after FILIAÇÃO)
  if (!fatherName || !motherName) {
    const docMilitarIdx = lines.findIndex((l) => /doc\.?\s*militar/i.test(l));
    if (docMilitarIdx !== -1 && docMilitarIdx + 2 < lines.length) {
      const cand1 = lines[docMilitarIdx + 1].trim();
      const cand2 = lines[docMilitarIdx + 2].trim();
      if (isCleanName(cand1) && isCleanName(cand2)) {
        if (!fatherName) fatherName = cand1;
        if (!motherName) motherName = cand2;
      }
    }
  }

  // 4. Filiação block if names appear directly under FILIAÇÃO header
  if (!fatherName || !motherName) {
    const filiacaoIdx = lines.findIndex((l) => /^FILIA[ÇC][ÃA]O$/i.test(l.trim()));
    if (filiacaoIdx !== -1) {
      const subLines = lines.slice(filiacaoIdx + 1, filiacaoIdx + 6).map((l) => l.trim()).filter((l) => isCleanName(l));
      if (subLines.length >= 2) {
        if (!fatherName) fatherName = subLines[0];
        if (!motherName) motherName = subLines[1];
      }
    }
  }

  // Unit
  let unitId: "teixeira" | "eunapolis" | "foodpark" | "central" = "teixeira";
  if (/eun[áa]polis/i.test(text)) {
    unitId = "eunapolis";
  } else if (/food\s*park/i.test(text)) {
    unitId = "foodpark";
  }

  // Department
  let department = "Cozinha / Produção";
  const rLower = role.toLowerCase();
  if (rLower.includes("supervisor") || rLower.includes("gerente") || rLower.includes("administra") || rLower.includes("rh") || rLower.includes("financeiro")) {
    department = "Gerência / Administrativo";
  } else if (rLower.includes("atendente") || rLower.includes("garçom") || rLower.includes("garcom") || rLower.includes("caixa") || rLower.includes("balcão") || rLower.includes("recepção")) {
    department = "Salão / Atendimento";
  } else if (rLower.includes("bar") || rLower.includes("bebida") || rLower.includes("bartender")) {
    department = "Bar / Bebidas";
  } else if (rLower.includes("estoque") || rLower.includes("compras") || rLower.includes("almoxarif")) {
    department = "Estoque / Compras";
  } else if (rLower.includes("limpeza") || rLower.includes("apoio") || rLower.includes("serviços gerais") || rLower.includes("zelador")) {
    department = "Limpeza / Apoio";
  }

  // Contract type
  let contractType: "CLT" | "PJ" | "Estagio" = "CLT";
  if (/est[áa]gio|estagi[áa]rio/i.test(text)) {
    contractType = "Estagio";
  } else if (/\bPJ\b|pessoa jur[íi]dica/i.test(text)) {
    contractType = "PJ";
  }

  // Notes
  const notesParts: string[] = [];
  if (ctps) notesParts.push(`CTPS: ${ctps}${serie ? ` Série: ${serie}` : ""}`);
  if (cbo) notesParts.push(`CBO: ${cbo}`);
  if (esocial) notesParts.push(`eSocial: ${esocial}`);
  if (motherName) notesParts.push(`Mãe: ${motherName}`);
  if (fatherName) notesParts.push(`Pai: ${fatherName}`);
  const notes = notesParts.join(" | ");

  return {
    name,
    cpf,
    birthDate,
    admissionDate,
    role,
    salary,
    salaryCents,
    salaryFormatted,
    workHours,
    address,
    unitId,
    department,
    contractType,
    cbo,
    ctps,
    serie,
    esocial,
    motherName,
    fatherName,
    notes,
  };
}
/**
 * Splits a multi-page employee registration PDF (like "Ficha de Empregado 5035")
 * into individual employee records. Accepts either an array of page strings or a combined text.
 */
export function parseMultiPageEmployeeDocument(input: string | string[]): ParsedEmployeeDocument[] {
  let pages: string[] = [];

  if (Array.isArray(input)) {
    pages = input.map((s) => s.trim()).filter((s) => s.length > 50);
  } else {
    if (input.includes("--- PAGE_BREAK ---")) {
      pages = input
        .split("--- PAGE_BREAK ---")
        .map((s) => s.trim())
        .filter((s) => s.length > 50);
    } else {
      const cpfRegex = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
      const cpfMatches: RegExpExecArray[] = [];
      let m: RegExpExecArray | null;
      while ((m = cpfRegex.exec(input)) !== null) cpfMatches.push(m);

      if (cpfMatches.length <= 1) {
        pages = [input];
      } else {
        const positions = cpfMatches.map((match) => match.index);
        for (let i = 0; i < positions.length; i++) {
          const start = i === 0 ? 0 : Math.max(0, positions[i] - 400);
          const end =
            i + 1 < positions.length
              ? Math.max(positions[i] + 200, positions[i + 1] - 400)
              : input.length;
          pages.push(input.slice(start, end));
        }
      }
    }
  }

  const results: ParsedEmployeeDocument[] = [];
  const seenCpfs = new Set<string>();

  for (const pageText of pages) {
    const parsed = parseEmployeeDocument(pageText);
    const normCpf = parsed.cpf.replace(/\D/g, "");
    if (normCpf && seenCpfs.has(normCpf)) continue;
    if (parsed.name || parsed.cpf) {
      if (normCpf) seenCpfs.add(normCpf);
      results.push(parsed);
    }
  }
  return results;
}
