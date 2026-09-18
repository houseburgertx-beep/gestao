export async function readDocumentPages(file: File): Promise<string[]> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/gestao/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    try {
      const pages: string[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
            .join("")
        );
      }
      return pages;
    } finally {
      await pdf.destroy();
    }
  }
  if (!file.type.startsWith("image/")) throw new Error("Envie PDF, JPG ou PNG.");
  const { recognize } = await import("tesseract.js");
  const text = (await recognize(file, "por")).data.text;
  return [text];
}

export async function readDocumentText(file: File): Promise<string> {
  const pages = await readDocumentPages(file);
  const text = pages.join("\n\n--- PAGE_BREAK ---\n\n");
  if (text.trim().length < 30) throw new Error("Este documento parece vazio ou ilegível. Envie um arquivo com texto nítido.");
  return text;
}

