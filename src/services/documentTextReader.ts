export async function readDocumentText(file: File): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    try {
      const pages: string[] = [];
      for (let number = 1; number <= Math.min(pdf.numPages, 5); number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join(""));
      }
      const text = pages.join("\n");
      if (text.trim().length < 30) throw new Error("Este PDF é uma digitalização. Envie uma foto nítida para leitura.");
      return text;
    } finally { await pdf.destroy(); }
  }
  if (!file.type.startsWith("image/")) throw new Error("Envie PDF, JPG ou PNG.");
  const { recognize } = await import("tesseract.js");
  return (await recognize(file, "por")).data.text;
}
