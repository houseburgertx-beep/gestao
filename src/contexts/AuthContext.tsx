"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";
import { deleteApp, getApps, initializeApp } from "firebase/app";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, firebaseConfig } from "@/lib/firebase";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "manager" | "operator" | "accountant";
  unitId: string; // 'all' | 'central' | 'eunapolis' | 'teixeira' | 'foodpark'
  active?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  accessError: string;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  registerUser: (email: string, pass: string, name: string, role?: string, unitId?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  accessError: "",
  login: async () => {},
  logout: async () => {},
  registerUser: async () => {},
  resetPassword: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState("");

  useEffect(() => {
    let resolved = false;

    // Safety fallback: if Firebase auth or Firestore takes longer than 4s, stop loading so user can log in
    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        setLoading(false);
      }
    }, 4000);

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, "users", currentUser.uid);
          
          // Fetch with 4s timeout to prevent hanging on slow connection
          const snap = await Promise.race([
            getDoc(userDocRef),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout ao buscar perfil")), 4000)
            ),
          ]);

          if (snap.exists()) {
            const profile = snap.data() as UserProfile;
            if (profile.active === false) {
              setAccessError("Este acesso está desativado. Fale com o administrador.");
              await fbSignOut(auth);
              return;
            }
            setAccessError("");
            setUserProfile(profile);
          } else {
            if (currentUser.uid !== "X3rPLrYN6OediKCZnn1cI8GHmVm2") {
              setAccessError("Usuário sem perfil autorizado. Peça ao administrador para criar o acesso.");
              await fbSignOut(auth);
              return;
            }

            // Inicialização segura do proprietário da plataforma.
            const initialProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || "",
              displayName: currentUser.displayName || currentUser.email?.split("@")[0] || "Administrador",
              role: "admin",
              unitId: "all",
              active: true,
            };
            await setDoc(userDocRef, initialProfile);
            setUserProfile(initialProfile);
          }
        } catch (e) {
          console.warn("Erro ao buscar perfil do usuário no Firestore:", e);
          setAccessError("Não foi possível validar seu perfil no Firebase. Tente novamente.");
          try { await fbSignOut(auth); } catch {}
        } finally {
          resolved = true;
          setLoading(false);
        }
      } else {
        setUserProfile(null);
        resolved = true;
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, []);

  const login = async (email: string, pass: string) => {
    setAccessError("");
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const logout = async () => {
    await fbSignOut(auth);
    setUser(null);
    setUserProfile(null);
  };

  const registerUser = async (
    email: string,
    pass: string,
    name: string,
    role: string = "manager",
    unitId: string = "all"
  ) => {
    if (!user || userProfile?.role !== "admin") {
      throw new Error("Apenas administradores podem cadastrar usuários.");
    }

    const secondaryName = "house190-user-management";
    const existingSecondary = getApps().find((app) => app.name === secondaryName);
    if (existingSecondary) await deleteApp(existingSecondary);
    const secondaryApp = initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = (await import("firebase/auth")).getAuth(secondaryApp);

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
      const newProfile: UserProfile = {
        uid: cred.user.uid,
        email,
        displayName: name,
        role: role as UserProfile["role"],
        unitId,
        active: true,
      };
      try {
        await setDoc(doc(db, "users", cred.user.uid), newProfile);
        window.dispatchEvent(new Event("house190-users-updated"));
      } catch (error) {
        await deleteUser(cred.user).catch(() => {});
        throw error;
      }
      await fbSignOut(secondaryAuth);
    } finally {
      await deleteApp(secondaryApp);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        accessError,
        login,
        logout,
        registerUser,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
