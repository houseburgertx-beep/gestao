import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  arrayUnion,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sendNotificationEmail } from "./emailService";
import type {
  Employee,
  Supplier,
  AccountPayable,
  UnitGoal,
  AppNotification,
  DailyRevenue,
  DocumentItem,
} from "@/types";

// ==========================================
// 1. EMPLOYEES (COLABORADORES)
// ==========================================
export async function getEmployeesFromFirestore(): Promise<Employee[]> {
  try {
    const colRef = collection(db, "employees");
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Employee));
  } catch (error) {
    console.warn("Erro ao buscar colaboradores do Firestore:", error);
    return [];
  }
}

export async function saveEmployeeToFirestore(employee: Employee): Promise<string> {
  const colRef = collection(db, "employees");
  if (employee.id) {
    const docRef = doc(db, "employees", employee.id);
    await setDoc(docRef, employee, { merge: true });
    return employee.id;
  } else {
    const docRef = await addDoc(colRef, employee);
    await updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }
}

export async function deleteEmployeeFromFirestore(id: string): Promise<void> {
  const docRef = doc(db, "employees", id);
  await deleteDoc(docRef);
}

export function subscribeEmployees(callback: (employees: Employee[]) => void): Unsubscribe {
  const colRef = collection(db, "employees");
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Employee));
      callback(list);
    },
    (err) => console.warn("Erro no snapshot de colaboradores:", err)
  );
}

// ==========================================
// 2. SUPPLIERS (FORNECEDORES)
// ==========================================
export async function getSuppliersFromFirestore(): Promise<Supplier[]> {
  try {
    const colRef = collection(db, "suppliers");
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Supplier));
  } catch (error) {
    console.warn("Erro ao buscar fornecedores do Firestore:", error);
    return [];
  }
}

export async function saveSupplierToFirestore(supplier: Supplier): Promise<string> {
  const colRef = collection(db, "suppliers");
  if (supplier.id) {
    const docRef = doc(db, "suppliers", supplier.id);
    await setDoc(docRef, supplier, { merge: true });
    return supplier.id;
  } else {
    const docRef = await addDoc(colRef, supplier);
    await updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }
}

export async function deleteSupplierFromFirestore(id: string): Promise<void> {
  const docRef = doc(db, "suppliers", id);
  await deleteDoc(docRef);
}

export function subscribeSuppliers(callback: (suppliers: Supplier[]) => void): Unsubscribe {
  const colRef = collection(db, "suppliers");
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Supplier));
      callback(list);
    },
    (err) => console.warn("Erro no snapshot de fornecedores:", err)
  );
}

// ==========================================
// 3. ACCOUNTS PAYABLE (CONTAS A PAGAR)
// ==========================================
export async function getAccountsPayableFromFirestore(): Promise<AccountPayable[]> {
  try {
    const colRef = collection(db, "accounts_payable");
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as AccountPayable));
  } catch (error) {
    console.warn("Erro ao buscar contas a pagar do Firestore:", error);
    return [];
  }
}

export async function saveAccountPayableToFirestore(account: AccountPayable): Promise<string> {
  const colRef = collection(db, "accounts_payable");
  if (account.id) {
    const docRef = doc(db, "accounts_payable", account.id);
    await setDoc(docRef, account, { merge: true });
    return account.id;
  } else {
    const docRef = await addDoc(colRef, account);
    await updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }
}

export async function deleteAccountPayableFromFirestore(id: string): Promise<void> {
  const docRef = doc(db, "accounts_payable", id);
  await deleteDoc(docRef);
}

export function subscribeAccountsPayable(callback: (accounts: AccountPayable[]) => void): Unsubscribe {
  const colRef = collection(db, "accounts_payable");
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as AccountPayable));
      callback(list);
    },
    (err) => console.warn("Erro no snapshot de contas a pagar:", err)
  );
}

// ==========================================
// 4. UNIT GOALS (METAS)
// ==========================================
export async function getGoalsFromFirestore(): Promise<UnitGoal[]> {
  try {
    const colRef = collection(db, "unit_goals");
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as UnitGoal));
  } catch (error) {
    console.warn("Erro ao buscar metas do Firestore:", error);
    return [];
  }
}

export async function saveGoalToFirestore(goal: UnitGoal): Promise<string> {
  const colRef = collection(db, "unit_goals");
  if (goal.id) {
    const docRef = doc(db, "unit_goals", goal.id);
    await setDoc(docRef, goal, { merge: true });
    return goal.id;
  } else {
    const docRef = await addDoc(colRef, goal);
    await updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }
}

export function subscribeGoals(callback: (goals: UnitGoal[]) => void): Unsubscribe {
  const colRef = collection(db, "unit_goals");
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as UnitGoal));
      callback(list);
    },
    (err) => console.warn("Erro no snapshot de metas:", err)
  );
}

// ==========================================
// 5. NOTIFICATIONS (NOTIFICAÇÕES EM TEMPO REAL)
// ==========================================
export async function getNotificationsFromFirestore(): Promise<AppNotification[]> {
  try {
    const colRef = collection(db, "notifications");
    const q = query(colRef, orderBy("timestamp", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as AppNotification));
  } catch (error) {
    console.warn("Erro ao buscar notificações do Firestore:", error);
    return [];
  }
}

export async function addNotificationToFirestore(
  notification: Omit<AppNotification, "id">
): Promise<string> {
  try {
    const colRef = collection(db, "notifications");
    const docRef = await addDoc(colRef, {
      ...notification,
      timestamp: notification.timestamp || new Date().toISOString(),
      read: false,
      readBy: [],
    });
    await updateDoc(docRef, { id: docRef.id });
    await sendNotificationEmail(docRef.id, notification);
    return docRef.id;
  } catch (error) {
    console.warn("Erro ao salvar notificação:", error);
    return "";
  }
}

export async function markNotificationAsReadInFirestore(id: string, userId: string): Promise<void> {
  try {
    const docRef = doc(db, "notifications", id);
    await updateDoc(docRef, { readBy: arrayUnion(userId) });
  } catch (error) {
    console.warn("Erro ao marcar notificação como lida:", error);
  }
}

export async function markAllNotificationsAsReadInFirestore(userId: string): Promise<void> {
  try {
    const colRef = collection(db, "notifications");
    const snapshot = await getDocs(query(colRef, orderBy("timestamp", "desc"), limit(50)));
    const promises = snapshot.docs
      .filter((d) => !((d.data().readBy as string[] | undefined) || []).includes(userId))
      .map((d) => updateDoc(d.ref, { readBy: arrayUnion(userId) }));
    await Promise.all(promises);
  } catch (error) {
    console.warn("Erro ao marcar todas notificações:", error);
  }
}

export function subscribeNotifications(
  userId: string,
  callback: (notifications: AppNotification[]) => void
): Unsubscribe {
  const colRef = collection(db, "notifications");
  const q = query(colRef, orderBy("timestamp", "desc"), limit(30));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data() as AppNotification;
        const readBy = data.readBy || [];
        return {
          ...data,
          id: d.id,
          read: readBy.length > 0 ? readBy.includes(userId) : Boolean(data.read),
        } as AppNotification;
      });
      callback(list);
    },
    (err) => console.warn("Erro no snapshot de notificações:", err)
  );
}

// ==========================================
// 6. TAKEEAT REVENUE CLOUD CACHE (FATURAMENTO SINCRONIZADO)
// ==========================================
export async function saveTakeatRevenuesToCloud(revenues: DailyRevenue[]): Promise<void> {
  try {
    for (const rev of revenues) {
      if (!rev.id) continue;
      const docRef = doc(db, "daily_revenues", rev.id);
      await setDoc(docRef, rev, { merge: true });
    }
  } catch (error) {
    console.warn("Erro ao salvar faturamento na nuvem:", error);
  }
}

export async function getDailyRevenuesFromCloud(): Promise<DailyRevenue[]> {
  try {
    const colRef = collection(db, "daily_revenues");
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as DailyRevenue));
  } catch (error) {
    console.warn("Erro ao buscar faturamento da nuvem:", error);
    return [];
  }
}

// ==========================================
// 7. DOCUMENTS (METADADOS DOS ARQUIVOS NO DRIVE)
// ==========================================
export async function getDocumentsFromFirestore(): Promise<DocumentItem[]> {
  try {
    const snapshot = await getDocs(collection(db, "documents"));
    return snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as DocumentItem));
  } catch (error) {
    console.warn("Erro ao buscar documentos:", error);
    return [];
  }
}

export async function saveDocumentToFirestore(item: DocumentItem): Promise<string> {
  await setDoc(doc(db, "documents", item.id), item, { merge: true });
  return item.id;
}

export function subscribeDocuments(callback: (items: DocumentItem[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, "documents"),
    (snapshot) => callback(snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as DocumentItem))),
    (error) => console.warn("Erro ao sincronizar documentos:", error)
  );
}
