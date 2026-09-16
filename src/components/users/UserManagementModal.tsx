"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  X, 
  UserPlus, 
  Search, 
  Trash2, 
  Edit2, 
  Check, 
  AlertTriangle, 
  Shield, 
  Building2, 
  KeyRound, 
  UserX,
  RefreshCw,
  Eye,
  EyeOff
} from "lucide-react";
import { useAuth, UserProfile } from "@/contexts/AuthContext";
import { subscribeUsers } from "@/services/userService";
import { normalizeRole } from "@/components/layout/managementNavigation";

const UNIT_NAMES: Record<string, string> = {
  all: "Todas as Unidades",
  central: "Administração Central",
  teixeira: "House 190 Teixeira",
  eunapolis: "House 190 Eunápolis",
  foodpark: "House Food Park",
};

const ROLE_LABELS: Record<string, { label: string; tone: string }> = {
  admin: { label: "Administrador / Diretoria", tone: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200" },
  accountant: { label: "Financeiro / Contador", tone: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200" },
  manager: { label: "Gerente de Unidade", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200" },
  operator: { label: "Operador de Caixa", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200" },
};

export function UserManagementModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { user: currentUser, registerUser, updateUserProfile, deleteUserProfile, resetPassword } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  
  // Views inside modal: "list" | "create" | "edit"
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("operator");
  const [unitId, setUnitId] = useState("all");
  const [isActive, setIsActive] = useState(true);

  // Action status
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Delete confirmation
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Subscribe to real-time users list
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const unsub = subscribeUsers(
      (list) => {
        setUsers(list);
        setLoading(false);
      },
      () => {
        setErrorMsg("Não foi possível carregar os usuários.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isOpen]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q));

      const norm = normalizeRole(u.role);
      const matchRole = roleFilter === "all" || norm === roleFilter;
      const matchUnit = unitFilter === "all" || u.unitId === unitFilter;

      return matchSearch && matchRole && matchUnit;
    });
  }, [users, search, roleFilter, unitFilter]);

  const handleOpenCreate = () => {
    setName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setRole("operator");
    setUnitId("all");
    setIsActive(true);
    setErrorMsg("");
    setSuccessMsg("");
    setView("create");
  };

  const handleOpenEdit = (targetUser: UserProfile) => {
    setEditingUser(targetUser);
    setName(targetUser.displayName || "");
    setEmail(targetUser.email || "");
    setRole(normalizeRole(targetUser.role));
    setUnitId(targetUser.unitId || "all");
    setIsActive(targetUser.active !== false);
    setErrorMsg("");
    setSuccessMsg("");
    setView("edit");
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSubmitting(true);
    try {
      if (password.length < 6) {
        throw new Error("A senha provisória deve conter no mínimo 6 caracteres.");
      }
      await registerUser(email.trim(), password, name.trim(), role, unitId);
      setSuccessMsg(`Usuário ${name} cadastrado com sucesso!`);
      setTimeout(() => {
        setView("list");
        setSuccessMsg("");
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao cadastrar usuário.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setErrorMsg("");
    setSuccessMsg("");
    setSubmitting(true);
    try {
      await updateUserProfile(editingUser.uid, {
        displayName: name.trim(),
        role: role as UserProfile["role"],
        unitId,
        active: isActive,
      });
      setSuccessMsg(`Cadastro de ${name} atualizado com sucesso!`);
      setTimeout(() => {
        setView("list");
        setEditingUser(null);
        setSuccessMsg("");
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || "Erro ao atualizar dados do usuário.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    setErrorMsg("");
    try {
      await deleteUserProfile(userToDelete.uid);
      const deletedName = userToDelete.displayName || userToDelete.email;
      setUserToDelete(null);
      setSuccessMsg(`Usuário ${deletedName} removido com sucesso.`);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || "Não foi possível excluir o usuário.");
    } finally {
      setDeleting(false);
    }
  };

  const handleResetPassword = async (userEmail: string) => {
    try {
      await resetPassword(userEmail);
      alert(`E-mail de redefinição de senha enviado para ${userEmail}.`);
    } catch (err: any) {
      alert(err.message || "Erro ao solicitar redefinição de senha.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[90vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <header className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 flex items-center justify-center shadow-xs">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Gerenciamento de Usuários
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  {users.length} cadastrados
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Controle de acessos, papéis corporativos e permissões por loja
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        {/* Action feedback toasts */}
        {errorMsg && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <Check size={15} className="shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Content Views */}
        {view === "list" ? (
          <div className="flex-1 flex flex-col overflow-hidden p-6 gap-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="flex-1 flex flex-wrap sm:flex-nowrap gap-2 items-center">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou e-mail..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition"
                  />
                </div>

                {/* Role Filter */}
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                >
                  <option value="all">Todos os papéis</option>
                  <option value="admin">Administrador / Diretoria</option>
                  <option value="accountant">Financeiro / Contador</option>
                  <option value="manager">Gerente de Unidade</option>
                  <option value="operator">Operador de Caixa</option>
                </select>

                {/* Unit Filter */}
                <select
                  value={unitFilter}
                  onChange={(e) => setUnitFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:outline-none"
                >
                  <option value="all">Todas as unidades</option>
                  <option value="teixeira">House 190 Teixeira</option>
                  <option value="eunapolis">House 190 Eunápolis</option>
                  <option value="foodpark">House Food Park</option>
                </select>
              </div>

              {/* Add User Button */}
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-xl shadow-md shadow-purple-500/20 transition active:scale-[0.98]"
              >
                <UserPlus size={15} />
                <span>Novo Usuário</span>
              </button>
            </div>

            {/* Users Table / List */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              {loading ? (
                <div className="p-12 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                  <RefreshCw size={24} className="animate-spin text-purple-600" />
                  <span>Carregando lista de usuários...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-xs text-zinc-500 flex flex-col items-center gap-2">
                  <UserX size={32} className="text-zinc-400" />
                  <strong className="text-zinc-700 dark:text-zinc-300">Nenhum usuário encontrado</strong>
                  <span>Tente ajustar os filtros ou cadastre um novo usuário.</span>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Usuário</th>
                      <th className="py-3 px-4">Perfil / Função</th>
                      <th className="py-3 px-4">Unidade</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {filteredUsers.map((u) => {
                      const norm = normalizeRole(u.role);
                      const roleConfig = ROLE_LABELS[norm] || { label: u.role, tone: "bg-zinc-100 text-zinc-700" };
                      const isMe = currentUser?.uid === u.uid;

                      return (
                        <tr key={u.uid} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition">
                          {/* User info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-700 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                                {u.displayName ? u.displayName.substring(0, 2).toUpperCase() : u.email.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                                  <span>{u.displayName || "Sem nome"}</span>
                                  {isMe && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                      Você
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-zinc-500 truncate">{u.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${roleConfig.tone}`}>
                              {roleConfig.label}
                            </span>
                          </td>

                          {/* Unit */}
                          <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                            <div className="flex items-center gap-1">
                              <Building2 size={13} className="text-zinc-400" />
                              <span>{UNIT_NAMES[u.unitId] || u.unitId || "Todas as Unidades"}</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            {u.active !== false ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ativo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Inativo
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleResetPassword(u.email)}
                                title="Enviar e-mail para redefinir senha"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 transition"
                              >
                                <KeyRound size={14} />
                              </button>
                              <button
                                onClick={() => handleOpenEdit(u)}
                                title="Editar papel e unidade"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition"
                              >
                                <Edit2 size={14} />
                              </button>
                              {!isMe && (
                                <button
                                  onClick={() => setUserToDelete(u)}
                                  title="Excluir usuário"
                                  className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          /* Create or Edit Form */
          <form
            onSubmit={view === "create" ? handleCreateSubmit : handleEditSubmit}
            className="flex-1 overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {view === "create" ? <UserPlus size={16} className="text-purple-600" /> : <Edit2 size={16} className="text-purple-600" />}
                <span>{view === "create" ? "Cadastrar Novo Colaborador" : `Editar Dados de ${editingUser?.displayName || editingUser?.email}`}</span>
              </h3>
              <button
                type="button"
                onClick={() => setView("list")}
                className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Voltar para lista
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex.: Carlos Souza"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  disabled={view === "edit"}
                  placeholder="usuario@house190.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 disabled:opacity-60"
                />
                {view === "edit" && <small className="text-[10px] text-zinc-400">O e-mail não pode ser alterado diretamente.</small>}
              </div>

              {view === "create" && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Senha Provisória *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full text-xs pl-3 pr-10 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <small className="text-[10px] text-zinc-500">O usuário poderá alterar a senha posteriormente.</small>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Perfil de Acesso (Função) *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                >
                  <option value="admin">Administrador Geral (Diretoria / Gestão Total)</option>
                  <option value="accountant">Financeiro / Contador (Contas, Bancos, Relatórios)</option>
                  <option value="manager">Gerente de Unidade (Vendas, Metas, Tarefas)</option>
                  <option value="operator">Operador de Caixa (Fechamentos de Caixa)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Unidade Atribuída *
                </label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                >
                  <option value="all">Todas as Unidades (Geral)</option>
                  <option value="teixeira">House 190 Teixeira de Freitas</option>
                  <option value="eunapolis">House 190 Eunápolis</option>
                  <option value="foodpark">House Food Park</option>
                  <option value="central">Administração Central</option>
                </select>
              </div>

              {view === "edit" && (
                <div className="sm:col-span-2 flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="userActiveCheck"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500"
                  />
                  <label htmlFor="userActiveCheck" className="text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    Conta Ativa (se desmarcado, o usuário não conseguirá acessar o sistema)
                  </label>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setView("list")}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-xl shadow-md shadow-purple-500/20 transition disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>{view === "create" ? "Criar Usuário" : "Salvar Alterações"}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Delete Confirmation Modal */}
        {userToDelete && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Excluir usuário do sistema?
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Tem certeza que deseja excluir o acesso de <strong>{userToDelete.displayName || userToDelete.email}</strong>? Esta ação revogará o acesso imediatamente.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setUserToDelete(null)}
                  className="w-full px-4 py-2 text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={confirmDelete}
                  className="w-full px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2"
                >
                  {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  <span>{deleting ? "Excluindo..." : "Confirmar Exclusão"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
