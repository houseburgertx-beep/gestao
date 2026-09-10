"use client";

import React, { useState, useEffect } from "react";
import {
  FolderLock,
  Search,
  Upload,
  FileText,
  Download,
  AlertTriangle,
  Clock,
  Tag,
  Building,
  CheckCircle2,
} from "lucide-react";
import { store } from "@/services/store";
import { useUnit } from "@/contexts/UnitContext";
import { DocumentItem } from "@/types";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { downloadFileFromDrive, formatFileSize, nameFileForDrive, uploadFileToDrive } from "@/services/driveService";
import { subscribeDocuments } from "@/services/firestoreService";

export default function DocumentosPage() {
  const { filterByUnit } = useUnit();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // New Doc Form
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<DocumentItem["category"]>("contracts");
  const [newExpiration, setNewExpiration] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    setDocuments(filterByUnit(store.getDocuments()));
    const handleUpdate = () => {
      setDocuments(filterByUnit(store.getDocuments()));
      setTick((t) => t + 1);
    };
    window.addEventListener("house190_data_updated", handleUpdate);
    return () => window.removeEventListener("house190_data_updated", handleUpdate);
  }, [filterByUnit]);

  useEffect(() => {
    const unsubscribe = subscribeDocuments((items) => setDocuments(filterByUnit(items)));
    return unsubscribe;
  }, [filterByUnit]);

  const filteredDocs = documents.filter((d) => {
    if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.title.toLowerCase().includes(q) ||
      d.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !selectedFile) return;

    setUploading(true);
    setUploadError("");
    try {
      const driveFile = nameFileForDrive(selectedFile, newTitle);
      const stored = await uploadFileToDrive(driveFile, "documents");
      const extension = selectedFile.name.split(".").pop()?.toLowerCase() || "arquivo";
      store.addDocument({
        title: newTitle,
        category: newCategory,
        unitId: "all",
        expirationDate: newExpiration || undefined,
        size: formatFileSize(stored.size),
        format: extension,
        url: `drive:${stored.fileId}`,
        driveFileId: stored.fileId,
        originalFileName: stored.fileName,
        mimeType: stored.mimeType,
        tags: ["Google Drive", "Protegido"],
      });
      setIsUploadModalOpen(false);
      setNewTitle("");
      setNewExpiration("");
      setSelectedFile(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (document: DocumentItem) => {
    if (!document.driveFileId) return;
    try {
      await downloadFileFromDrive(document.driveFileId, document.originalFileName || document.title);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível baixar o arquivo.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/60 pb-4 dark:border-zinc-800">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Biblioteca de Documentos & Compliance
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Centralização de alvarás, contratos sociais, manuais, certidões e comprovantes
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsUploadModalOpen(true)}
          className="gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload de Documento</span>
        </Button>
      </div>

      {/* Alert about upcoming expirations */}
      <div className="p-4 rounded-lg border border-amber-200/80 bg-amber-50/40 flex items-center justify-between text-xs dark:bg-amber-950/20 dark:border-amber-900/40">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-zinc-700 dark:text-zinc-300">
            <strong>Atenção ao Vencimento:</strong> O Alvará Sanitário Municipal de Teixeira de Freitas vence em <strong>30/09/2026</strong>. Protocolo de renovação já iniciado.
          </span>
        </div>
        <span className="text-[11px] font-semibold text-amber-800 uppercase dark:text-amber-300">
          Urgente
        </span>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Pesquisar documentos ou tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8.5 pl-8.5 pr-3 text-xs rounded-md border border-zinc-200 bg-white placeholder-zinc-400 focus:outline-none dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-8.5 px-2.5 text-xs rounded-md border border-zinc-200 bg-white text-zinc-700 focus:outline-none dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300"
        >
          <option value="all">Todas as Categorias</option>
          <option value="companies">Alvarás & Empresas</option>
          <option value="contracts">Contratos</option>
          <option value="suppliers">Fornecedores</option>
          <option value="hr">RH & Procedimentos</option>
        </select>
      </div>

      {/* Documents Table */}
      <div className="rounded-lg border border-zinc-200/80 bg-white overflow-hidden shadow-2xs dark:bg-zinc-900 dark:border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-400 font-semibold uppercase tracking-wider text-[10px] dark:bg-zinc-800/60 dark:border-zinc-800">
            <tr>
              <th className="py-3 px-4">Documento</th>
              <th className="py-3 px-4">Categoria</th>
              <th className="py-3 px-4">Unidade</th>
              <th className="py-3 px-4">Vencimento</th>
              <th className="py-3 px-4">Tamanho</th>
              <th className="py-3 px-4 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredDocs.map((doc) => {
              const isExpiringSoon =
                doc.expirationDate && doc.expirationDate <= "2026-09-30";

              return (
                <tr key={doc.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50">
                  <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                      <div>
                        <div>{doc.title}</div>
                        <div className="flex gap-1 mt-0.5">
                          {doc.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[9px] px-1 py-0.2 rounded bg-zinc-100 text-zinc-500 font-mono dark:bg-zinc-800"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                    {doc.category}
                  </td>
                  <td className="py-3 px-4 uppercase text-[10px] font-mono text-zinc-500">
                    {doc.unitId}
                  </td>
                  <td className="py-3 px-4 tabular-nums">
                    {doc.expirationDate ? (
                      <span
                        className={
                          isExpiringSoon
                            ? "font-semibold text-rose-600 dark:text-rose-400"
                            : "text-zinc-600 dark:text-zinc-400"
                        }
                      >
                        {formatDate(doc.expirationDate)}
                      </span>
                    ) : (
                      <span className="text-zinc-400">Indeterminado</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-zinc-500 font-mono text-[11px]">
                    {doc.size}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(doc)}
                      disabled={!doc.driveFileId}
                      className="h-7 text-xs gap-1"
                    >
                      <Download className="h-3 w-3" />
                      <span>Baixar</span>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Enviar Novo Documento"
        subtitle="Adicione contratos, certidões ou alvarás para gestão de vencimentos"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
              Título do Documento
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Alvará de Vigilância Sanitária Eunápolis 2026/2027"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
                Categoria
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
              >
                <option value="companies">Alvarás & Empresas</option>
                <option value="contracts">Contratos</option>
                <option value="suppliers">Fornecedores</option>
                <option value="hr">RH & Políticas</option>
              </select>
            </div>

            <div>
              <label className="block text-zinc-700 font-medium mb-1 dark:text-zinc-300">
                Data de Vencimento
              </label>
              <input
                type="date"
                value={newExpiration}
                onChange={(e) => setNewExpiration(e.target.value)}
                className="w-full h-9 px-3 rounded border border-zinc-200 bg-white dark:bg-zinc-800 dark:border-zinc-700 focus:outline-none"
              />
            </div>
          </div>

          <label className="block border-2 border-dashed border-zinc-200 rounded-lg p-6 text-center text-zinc-500 hover:border-zinc-400 transition-colors cursor-pointer dark:border-zinc-700">
            <Upload className="h-6 w-6 mx-auto text-zinc-400 mb-2" />
            <p className="font-medium">{selectedFile ? selectedFile.name : "Clique para selecionar o arquivo"}</p>
            <p className="text-[11px] text-zinc-400 mt-1">PDF, foto, planilha ou documento até 8 MB</p>
            <input
              type="file"
              required
              className="sr-only"
              accept=".pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.webp,.zip"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            />
          </label>

          {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsUploadModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={uploading || !selectedFile}>
              {uploading ? "Salvando no Drive..." : "Concluir Upload"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
