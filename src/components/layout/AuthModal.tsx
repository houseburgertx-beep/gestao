"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, UserPlus, Check, AlertCircle } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  required?: boolean;
}

export function AuthModal({ isOpen, onClose, required = false }: AuthModalProps) {
  const { user, userProfile, accessError, login, logout, registerUser, resetPassword } = useAuth();

  const [tab, setTab] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("manager");
  const [unitId, setUnitId] = useState("all");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      setSuccessMsg("Autenticado com sucesso!");
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        setErrorMsg("E-mail ou senha incorretos.");
      } else if (err.code === "auth/user-not-found") {
        setErrorMsg("Usuário não encontrado.");
      } else {
        setErrorMsg(err.message || "Erro ao efetuar login.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await registerUser(email.trim(), password, name.trim(), role, unitId);
      setSuccessMsg("Usuário cadastrado com sucesso!");
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Erro ao registrar usuário.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSuccessMsg("E-mail de redefinição de senha enviado com sucesso!");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Erro ao enviar e-mail de redefinição.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setTab("login");
    await logout();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={user ? "Perfil & Acesso — House 190" : "Acesso à Plataforma"}
      subtitle={
        user
          ? "Gerenciamento de credenciais e permissões"
          : "Faça login com sua conta corporativa vinculada ao Firebase"
      }
      maxWidth="md"
      dismissible={!required}
    >
      {user ? (
        <div className="space-y-5">
          <div className="p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-base dark:bg-zinc-100 dark:text-zinc-900">
              {userProfile?.displayName ? userProfile.displayName.substring(0, 2).toUpperCase() : "AD"}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {userProfile?.displayName || "Administrador"}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Conectado à Nuvem (Firebase)
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  {userProfile?.role === "admin" ? "Diretoria / Master" : "Gerência"}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4 flex items-center justify-between">
            {userProfile?.role === "admin" && (
              <button
                onClick={() => setTab("register")}
                className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center gap-1.5"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Cadastrar outro usuário</span>
              </button>
            )}
            <Button variant="danger" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="h-3.5 w-3.5" />
              <span>Encerrar Sessão</span>
            </Button>
          </div>

          {tab === "register" && (
            <form onSubmit={handleRegister} className="mt-4 p-4 border border-zinc-200 dark:border-zinc-800 rounded-lg space-y-3 bg-zinc-50/50 dark:bg-zinc-900/50">
              <h5 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Novo Usuário / Colaborador de Sistema
              </h5>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">E-mail Corporativo</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@house190.com.br"
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Perfil de Acesso</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                  >
                    <option value="admin">Administrador Geral</option>
                    <option value="manager">Gerente de Unidade</option>
                    <option value="operator">Operador / Caixa</option>
                    <option value="accountant">Contabilidade / Fiscal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Unidade</label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                  >
                    <option value="all">Todas as Unidades</option>
                    <option value="eunapolis">House 190 Eunápolis</option>
                    <option value="teixeira">House 190 Teixeira</option>
                    <option value="foodpark">House Food Park</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">Senha Provisória</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
              </div>

              {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}
              {successMsg && <p className="text-xs text-emerald-500">{successMsg}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setTab("login")}>Cancelar</Button>
                <Button size="sm" type="submit" disabled={loading}>{loading ? "Criando..." : "Salvar Usuário"}</Button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => { setTab("login"); setErrorMsg(""); setSuccessMsg(""); }}
              className={`pb-2 px-4 text-xs font-medium border-b-2 transition-colors ${
                tab === "login"
                  ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => { setTab("forgot"); setErrorMsg(""); setSuccessMsg(""); }}
              className={`pb-2 px-4 text-xs font-medium border-b-2 transition-colors ${
                tab === "forgot"
                  ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Recuperar Senha
            </button>
          </div>

          {tab === "login" && (
            <form onSubmit={handleLogin} className="space-y-3">
              {accessError && !errorMsg && (
                <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{accessError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Digite seu e-mail"
                  className="w-full text-xs px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Senha</label>
                  <button
                    type="button"
                    onClick={() => setTab("forgot")}
                    className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  >
                    Esqueceu?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? "Autenticando..." : "Entrar no Painel"}
              </Button>
            </form>
          )}

          {tab === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-3">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Informe o seu e-mail cadastrado para receber um link de redefinição de senha seguro.
              </p>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Digite seu e-mail cadastrado"
                  className="w-full text-xs px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? "Enviando..." : "Enviar E-mail de Recuperação"}
              </Button>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
