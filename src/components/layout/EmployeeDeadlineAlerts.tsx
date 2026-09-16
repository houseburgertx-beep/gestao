"use client";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeEmployees, addNotificationToFirestore } from "@/services/firestoreService";
import { dateToday, addDays } from "@/domain/management/model";
import type { Employee } from "@/types";

export function EmployeeDeadlineAlerts() {
  const { user, userProfile } = useAuth();
  useEffect(() => {
    if (!user || !["admin", "accountant"].includes(userProfile?.role || "")) return;
    let employees: Employee[] = [];
    const inFlight = new Set<string>();
    const check = () => {
      const today = dateToday();
      for (const employee of employees.filter((item) => item.status !== "terminated")) {
        for (const [label, date] of [["Período de experiência", employee.experienceEndDate], ["Férias", employee.vacationStart]] as const) {
          if (!date || date < today || date > addDays(today,30)) continue;
          const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
          const bucket = days === 0 ? 0 : days <= 3 ? 3 : days <= 7 ? 7 : days <= 15 ? 15 : 30;
          const key = `house190-rh-email:${user.uid}:${employee.id}:${label}:${date}:${bucket}`;
          if (inFlight.has(key) || localStorage.getItem(key)) continue;
          inFlight.add(key);
          void addNotificationToFirestore({type:"vacation",title:`${label} — ${employee.name}`,message:`${employee.name}: ${label.toLowerCase()} ${days === 0 ? "hoje" : `em ${days} dia(s)`}. Confira o cadastro e organize as providências.`,details:[{label:"Funcionário",value:employee.name},{label:"Evento",value:label},{label:"Data",value:date.split("-").reverse().join("/")},{label:"Unidade",value:employee.unitId},{label:"Cargo",value:employee.role}],link:"/rh/",severity:days <= 3 ? "warning" : "info",read:false,timestamp:new Date().toISOString()}).then((id) => { if (id) localStorage.setItem(key,"sent"); }).finally(() => inFlight.delete(key));
        }
      }
    };
    const unsubscribe = subscribeEmployees((items) => { employees = items; check(); });
    const timer = window.setInterval(check,60 * 60 * 1000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  },[user?.uid,userProfile?.role]);
  return null;
}
