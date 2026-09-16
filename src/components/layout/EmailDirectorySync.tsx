"use client";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { synchronizeEmailDirectory } from "@/services/emailService";
export function EmailDirectorySync() {
  const {user,userProfile} = useAuth();
  useEffect(() => {
    if (!user || userProfile?.role !== "admin") return;
    const sync = () => { void synchronizeEmailDirectory().catch(console.warn); };
    sync();
    const timer = window.setInterval(sync,60*60*1000);
    window.addEventListener("house190-users-updated",sync);
    return () => {window.clearInterval(timer);window.removeEventListener("house190-users-updated",sync);};
  },[user?.uid,userProfile?.role]);
  return null;
}
