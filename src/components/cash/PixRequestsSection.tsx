"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, Plus, Search, Trash2, X } from "lucide-react";
import { isValidPixKey, PixRequestItem, safeUUID } from "./cashHelpers";
import {
  buildPixDirectory,
  filterPixContacts,
  formatCompactPixKey,
  loadAutoSavePixPreference,
  loadHiddenPixContactIds,
  loadLocalSavedPixContacts,
  normalizePixKeyId,
  normalizeUnitKey,
  persistAutoSavePixPreference,
  persistHiddenPixContactIds,
  persistLocalSavedPixContacts,
  PixDirectoryDatabase,
  SavedPixContact,
  scopedHiddenPixId,
  upsertLocalSavedPixContact,
} from "@/domain/cash/pixContacts";

const DEFAULT_VISIBLE_PILLS = 8;

export function usePixDirectory(data: PixDirectoryDatabase, unitId: string) {
  const unitKey = normalizeUnitKey(unitId);
  const [autoSavePix, setAutoSavePixState] = useState<boolean>(() => loadAutoSavePixPreference());
  const [localSaved, setLocalSaved] = useState<SavedPixContact[]>(() => loadLocalSavedPixContacts());
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => loadHiddenPixContactIds());

  const setAutoSavePix = useCallback((next: boolean) => {
    setAutoSavePixState(next);
    persistAutoSavePixPreference(next);
  }, []);

  const contacts = useMemo(
    () => buildPixDirectory(data, unitKey, localSaved, hiddenIds),
    [data, unitKey, localSaved, hiddenIds],
  );

  const contactsById = useMemo(() => {
    const map = new Map<string, SavedPixContact>();
    for (const c of contacts) map.set(c.id, c);
    return map;
  }, [contacts]);

  const hiddenForUnit = useMemo(() => {
    return hiddenIds.filter((raw) => {
      if (!raw) return false;
      if (raw.includes("::")) {
        const [hUnit] = raw.split("::");
        return !unitKey || unitKey === "all" || normalizeUnitKey(hUnit) === unitKey;
      }
      return true;
    });
  }, [hiddenIds, unitKey]);

  const saveContact = useCallback(
    (entry: { name: string; key: string; defaultDescription?: string }) => {
      const cleanName = String(entry.name || "").trim();
      const cleanKey = String(entry.key || "").trim();
      if (!cleanName || !cleanKey || !isValidPixKey(cleanKey)) return;

      const keyId = normalizePixKeyId(cleanKey);
      if (!keyId) return;
      const scopedId = scopedHiddenPixId(unitKey, keyId);

      setHiddenIds((prev) => {
        const next = prev.filter((id) => id !== scopedId && id !== keyId);
        if (next.length !== prev.length) persistHiddenPixContactIds(next);
        return next;
      });

      setLocalSaved((prev) => {
        const next = upsertLocalSavedPixContact(prev, {
          name: cleanName,
          key: cleanKey,
          defaultDescription: entry.defaultDescription,
          unitId: unitKey,
        });
        persistLocalSavedPixContacts(next);
        return next;
      });
    },
    [unitKey],
  );

  const saveRequestsBatch = useCallback(
    (requests: PixRequestItem[]) => {
      if (!autoSavePix || !requests.length) return;
      const valid = requests.filter(
        (r) => r.name.trim() && r.key.trim() && isValidPixKey(r.key),
      );
      if (!valid.length) return;

      const idsToUnhide = new Set<string>();
      for (const r of valid) {
        const keyId = normalizePixKeyId(r.key);
        if (keyId) {
          idsToUnhide.add(keyId);
          idsToUnhide.add(scopedHiddenPixId(unitKey, keyId));
        }
      }
      setHiddenIds((prev) => {
        const next = prev.filter((id) => !idsToUnhide.has(id));
        if (next.length !== prev.length) persistHiddenPixContactIds(next);
        return next;
      });

      setLocalSaved((prev) => {
        let next = prev;
        for (const r of valid) {
          next = upsertLocalSavedPixContact(next, {
            name: r.name,
            key: r.key,
            defaultDescription: r.description,
            unitId: unitKey,
          });
        }
        persistLocalSavedPixContacts(next);
        return next;
      });
    },
    [autoSavePix, unitKey],
  );

  const removeContact = useCallback(
    (contactId: string) => {
      if (!contactId) return;
      const scopedId = scopedHiddenPixId(unitKey, contactId);
      setLocalSaved((prev) => {
        const next = prev.filter(
          (c) => !(c.id === contactId && normalizeUnitKey(c.unitId) === unitKey),
        );
        persistLocalSavedPixContacts(next);
        return next;
      });
      setHiddenIds((prev) => {
        if (prev.includes(scopedId)) return prev;
        const next = [...prev, scopedId];
        persistHiddenPixContactIds(next);
        return next;
      });
    },
    [unitKey],
  );

  const restoreHidden = useCallback(() => {
    setHiddenIds((prev) => {
      const next = prev.filter((raw) => {
        if (!raw.includes("::")) return false;
        const [hUnit] = raw.split("::");
        return Boolean(unitKey && unitKey !== "all" && normalizeUnitKey(hUnit) !== unitKey);
      });
      persistHiddenPixContactIds(next);
      return next;
    });
  }, [unitKey]);

  return {
    unitId: unitKey,
    contacts,
    contactsById,
    autoSavePix,
    setAutoSavePix,
    saveContact,
    saveRequestsBatch,
    removeContact,
    restoreHidden,
    hiddenCount: hiddenForUnit.length,
  };
}

interface PixRequestsSectionProps {
  pixRequests: PixRequestItem[];
  setPixRequests: React.Dispatch<React.SetStateAction<PixRequestItem[]>>;
  directory: ReturnType<typeof usePixDirectory>;
  compact?: boolean;
}

export function PixRequestsSection({
  pixRequests,
  setPixRequests,
  directory,
  compact = false,
}: PixRequestsSectionProps) {
  const {
    contacts,
    contactsById,
    autoSavePix,
    setAutoSavePix,
    saveContact,
    removeContact,
    restoreHidden,
    hiddenCount,
  } = directory;

  const [shelfQuery, setShelfQuery] = useState("");
  const [showAllSaved, setShowAllSaved] = useState(false);
  const [openSuggestRowId, setOpenSuggestRowId] = useState<string | null>(null);
  const [pendingFocusAmountId, setPendingFocusAmountId] = useState<string | null>(null);
  const amountInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    setShelfQuery("");
    setShowAllSaved(false);
    setOpenSuggestRowId(null);
  }, [directory.unitId]);

  useEffect(() => {
    if (!pendingFocusAmountId) return;
    const el = amountInputRefs.current.get(pendingFocusAmountId);
    if (el) {
      el.focus();
      el.select?.();
      setPendingFocusAmountId(null);
    }
  }, [pendingFocusAmountId, pixRequests]);

  const filteredShelf = useMemo(
    () => filterPixContacts(contacts, shelfQuery),
    [contacts, shelfQuery],
  );

  const visibleShelf = useMemo(() => {
    if (showAllSaved || shelfQuery.trim()) return filteredShelf;
    return filteredShelf.slice(0, DEFAULT_VISIBLE_PILLS);
  }, [filteredShelf, showAllSaved, shelfQuery]);

  const hiddenShelfOverflow = Math.max(0, filteredShelf.length - visibleShelf.length);

  const handlePickSavedContact = useCallback(
    (contact: SavedPixContact, targetRowId?: string) => {
      let focusId = "";
      setPixRequests((rows) => {
        if (targetRowId) {
          focusId = targetRowId;
          return rows.map((r) =>
            r.id === targetRowId
              ? {
                  ...r,
                  name: contact.name,
                  key: contact.key,
                  description: r.description.trim()
                    ? r.description
                    : contact.defaultDescription || "",
                }
              : r,
          );
        }

        const emptyRow = rows.find((r) => !r.name.trim() && !r.key.trim());
        if (emptyRow) {
          focusId = emptyRow.id;
          return rows.map((r) =>
            r.id === emptyRow.id
              ? {
                  ...r,
                  name: contact.name,
                  key: contact.key,
                  description: r.description.trim()
                    ? r.description
                    : contact.defaultDescription || "",
                }
              : r,
          );
        }

        const createdId = safeUUID();
        focusId = createdId;
        return [
          ...rows,
          {
            id: createdId,
            name: contact.name,
            key: contact.key,
            description: contact.defaultDescription || "",
            amount: "",
          },
        ];
      });
      setOpenSuggestRowId(null);
      if (focusId) setPendingFocusAmountId(focusId);
    },
    [setPixRequests],
  );

  const handleFieldBlurAutoSave = useCallback(
    (item: PixRequestItem) => {
      if (!autoSavePix) return;
      if (item.name.trim() && item.key.trim() && isValidPixKey(item.key)) {
        saveContact({
          name: item.name,
          key: item.key,
          defaultDescription: item.description,
        });
      }
    },
    [autoSavePix, saveContact],
  );

  return (
    <section
      className={
        compact
          ? "space-y-3"
          : "rounded-[16px] border border-zinc-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
      }
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Solicitações de PIX (opcional)
          </h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Toque em uma chave salva ou cadastre uma nova para enviar ao financeiro
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={autoSavePix}
            onClick={() => setAutoSavePix(!autoSavePix)}
            title="Salvar novas chaves PIX automaticamente para os próximos fechamentos"
            className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              autoSavePix
                ? "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-400"
            }`}
          >
            <span
              className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${
                autoSavePix ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
              }`}
            >
              <span
                className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow-sm transition-transform ${
                  autoSavePix ? "translate-x-3" : "translate-x-0.5"
                }`}
              />
            </span>
            <span>Salvar PIX automático</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setPixRequests((rows) => [
                ...rows,
                { id: safeUUID(), name: "", key: "", description: "", amount: "" },
              ])
            }
            className="inline-flex items-center gap-1 rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Plus size={13} /> Nova solicitação
          </button>
        </div>
      </div>

      {/* Minimalist Saved PIX Keys Shelf */}
      {(contacts.length > 0 || hiddenCount > 0) && (
        <div className="mt-3.5 border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
              Chaves salvas da loja ({contacts.length}) — toque para preencher
            </span>

            <div className="flex items-center gap-2">
              {contacts.length > 5 && (
                <div className="relative">
                  <Search
                    size={12}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    type="text"
                    value={shelfQuery}
                    onChange={(e) => setShelfQuery(e.target.value)}
                    placeholder="Buscar nome ou PIX..."
                    className="h-7 w-40 rounded-full border border-zinc-200 bg-zinc-50/70 pl-7 pr-6 text-xs text-zinc-800 outline-none transition focus:w-48 focus:border-zinc-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-100"
                  />
                  {shelfQuery && (
                    <button
                      type="button"
                      onClick={() => setShelfQuery("")}
                      aria-label="Limpar busca de chaves PIX"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={restoreHidden}
                  className="text-[11px] text-zinc-400 underline-offset-2 transition hover:text-zinc-700 hover:underline dark:hover:text-zinc-200"
                >
                  Restaurar ({hiddenCount})
                </button>
              )}
            </div>
          </div>

          {visibleShelf.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {visibleShelf.map((contact) => (
                <div
                  key={contact.id}
                  className="group inline-flex max-w-full items-center rounded-full border border-zinc-200/90 bg-zinc-50/80 transition hover:border-zinc-400 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/60 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/80"
                >
                  <button
                    type="button"
                    onClick={() => handlePickSavedContact(contact)}
                    title={`Preencher ${contact.name} (${contact.key})`}
                    className="inline-flex min-w-0 items-center gap-1.5 py-1 pl-2.5 pr-1.5 text-left text-xs"
                  >
                    <span className="max-w-[130px] truncate font-medium text-zinc-800 dark:text-zinc-100">
                      {contact.name}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span className="max-w-[135px] truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      {formatCompactPixKey(contact.key)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeContact(contact.id);
                    }}
                    title="Ocultar este atalho"
                    aria-label={`Remover chave salva de ${contact.name}`}
                    className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-200/70 hover:text-zinc-600 dark:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}

              {hiddenShelfOverflow > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllSaved(true)}
                  className="rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-800 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  +{hiddenShelfOverflow} mais
                </button>
              )}

              {showAllSaved && !shelfQuery.trim() && filteredShelf.length > DEFAULT_VISIBLE_PILLS && (
                <button
                  type="button"
                  onClick={() => setShowAllSaved(false)}
                  className="rounded-full px-2 py-1 text-[11px] text-zinc-400 transition hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  Recolher
                </button>
              )}
            </div>
          ) : shelfQuery.trim() ? (
            <p className="text-[11px] text-zinc-400">
              Nenhuma chave salva encontrada para &ldquo;{shelfQuery.trim()}&rdquo;.
            </p>
          ) : null}
        </div>
      )}

      {/* PIX Request Cards */}
      {pixRequests.length > 0 ? (
        <div className="mt-4 space-y-3">
          {pixRequests.map((item, idx) => {
            const keyTrimmed = item.key.trim();
            const keyValid = !keyTrimmed || isValidPixKey(keyTrimmed);
            const keyId = keyTrimmed ? normalizePixKeyId(keyTrimmed) : "";
            const isAlreadySaved = Boolean(keyId && contactsById.has(keyId));
            const canSaveManually = Boolean(
              item.name.trim() && keyTrimmed && keyValid && !isAlreadySaved,
            );

            const matchedSavedByKey = keyId ? contactsById.get(keyId) : undefined;
            const isAlreadyExactMatch = Boolean(
              matchedSavedByKey &&
                matchedSavedByKey.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
            );
            const nameMatches =
              openSuggestRowId === item.id && contacts.length > 0 && !isAlreadyExactMatch
                ? filterPixContacts(contacts, item.name).slice(0, 5)
                : [];

            return (
              <div
                key={item.id}
                className="space-y-3 rounded-[10px] border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                    Solicitação #{idx + 1}
                  </span>

                  <div className="flex items-center gap-3">
                    {isAlreadySaved && item.name.trim() && keyTrimmed && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        <Check size={12} strokeWidth={2.25} />
                        Chave salva
                      </span>
                    )}

                    {canSaveManually && !autoSavePix && (
                      <button
                        type="button"
                        onClick={() =>
                          saveContact({
                            name: item.name,
                            key: item.key,
                            defaultDescription: item.description,
                          })
                        }
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                      >
                        <Bookmark size={12} />
                        Salvar chave
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setPixRequests((rows) => rows.filter((r) => r.id !== item.id))
                      }
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 transition hover:text-rose-600"
                    >
                      <Trash2 size={13} /> Remover
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Favorecido with minimalist autocomplete */}
                  <div className="relative space-y-1">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Favorecido
                    </label>
                    <input
                      type="text"
                      placeholder="Nome ou fornecedor"
                      value={item.name}
                      onFocus={() => setOpenSuggestRowId(item.id)}
                      onBlur={() => {
                        setTimeout(() => {
                          setOpenSuggestRowId((cur) => (cur === item.id ? null : cur));
                        }, 150);
                        handleFieldBlurAutoSave(item);
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOpenSuggestRowId(item.id);
                        setPixRequests((rows) =>
                          rows.map((r) => (r.id === item.id ? { ...r, name: val } : r)),
                        );
                      }}
                      className="h-10 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    {nameMatches.length > 0 && (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-[10px] border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                        {nameMatches.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handlePickSavedContact(c, item.id);
                            }}
                            className="flex w-full items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 text-left text-xs transition last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                          >
                            <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                              {c.name}
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                              {formatCompactPixKey(c.key)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chave PIX with automatic match fill */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Chave PIX
                    </label>
                    <input
                      type="text"
                      placeholder="CPF, CNPJ, e-mail ou telefone"
                      value={item.key}
                      onBlur={() => handleFieldBlurAutoSave(item)}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = contactsById.get(normalizePixKeyId(val));
                        setPixRequests((rows) =>
                          rows.map((r) => {
                            if (r.id !== item.id) return r;
                            if (matched && !r.name.trim()) {
                              return {
                                ...r,
                                key: val,
                                name: matched.name,
                                description: r.description.trim()
                                  ? r.description
                                  : matched.defaultDescription || "",
                              };
                            }
                            return { ...r, key: val };
                          }),
                        );
                      }}
                      className={`h-10 w-full rounded-[10px] border bg-white px-3 text-[16px] text-zinc-900 outline-none sm:text-sm dark:bg-zinc-900 dark:text-zinc-100 ${
                        !keyValid
                          ? "border-rose-400 focus:border-rose-500"
                          : "border-zinc-200 focus:border-zinc-900 dark:border-zinc-700"
                      }`}
                    />
                    {!keyValid && (
                      <p className="text-[11px] text-rose-600">Formato de chave inválido</p>
                    )}
                  </div>

                  {/* Motivo / Descrição */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Motivo / Descrição
                    </label>
                    <input
                      type="text"
                      placeholder="Ex.: Gás de cozinha emergencial"
                      value={item.description}
                      onBlur={() => handleFieldBlurAutoSave(item)}
                      onChange={(e) =>
                        setPixRequests((rows) =>
                          rows.map((r) =>
                            r.id === item.id ? { ...r, description: e.target.value } : r,
                          ),
                        )
                      }
                      className="h-10 w-full rounded-[10px] border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-zinc-900 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>

                  {/* Valor (auto-focused on quick pick) */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Valor
                    </label>
                    <div className="relative flex items-center rounded-[10px] border border-zinc-200 bg-white transition focus-within:border-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-zinc-400 dark:focus-within:ring-zinc-400/15">
                      <span className="pointer-events-none select-none pl-3 text-xs font-medium text-zinc-400">
                        R$
                      </span>
                      <input
                        ref={(el) => {
                          if (el) amountInputRefs.current.set(item.id, el);
                          else amountInputRefs.current.delete(item.id);
                        }}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0,00"
                        value={item.amount}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        onChange={(e) =>
                          setPixRequests((rows) =>
                            rows.map((r) =>
                              r.id === item.id ? { ...r, amount: e.target.value } : r,
                            ),
                          )
                        }
                        className="h-10 w-full bg-transparent pl-1.5 pr-3 text-[16px] font-medium tabular-nums text-zinc-900 outline-none placeholder:text-zinc-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none sm:text-sm dark:text-zinc-100 dark:placeholder:text-zinc-600"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800">
          Nenhuma solicitação de PIX registrada neste turno.
        </p>
      )}
    </section>
  );
}
