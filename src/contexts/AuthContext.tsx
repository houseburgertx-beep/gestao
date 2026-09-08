"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "manager" | "operator" | "accountant";
  unitId: string; // 'all' | 'central' | 'eunapolis' | 'teixeira' | 'foodpark'
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  registerUser: (email: string, pass: string, name: string, role?: string, unitId?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  registerUser: async () => {},
  resetPassword: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, "users", currentUser.uid);
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
          } else {
            // Criar perfil padrão para novos usuários ou gleucedias1@gmail.com
            const initialProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || "",
              displayName: currentUser.displayName || currentUser.email?.split("@")[0] || "Administrador",
              role: "admin",
              unitId: "all",
            };
            await setDoc(userDocRef, initialProfile);
            setUserProfile(initialProfile);
          }
        } catch (e) {
          console.warn("Erro ao buscar perfil do usuário no Firestore:", e);
          setUserProfile({
            uid: currentUser.uid,
            email: currentUser.email || "",
            displayName: currentUser.displayName || "Usuário House 190",
            role: "admin",
            unitId: "all",
          });
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
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
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const newProfile: UserProfile = {
      uid: cred.user.uid,
      email,
      displayName: name,
      role: role as any,
      unitId,
    };
    await setDoc(doc(db, "users", cred.user.uid), newProfile);
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
