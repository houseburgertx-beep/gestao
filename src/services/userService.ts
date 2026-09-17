import { collection, doc, onSnapshot, setDoc, deleteDoc, Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserProfile } from "@/contexts/AuthContext";

export function subscribeUsers(
  onData: (users: UserProfile[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email || "",
          displayName: data.displayName || "",
          role: data.role || "operator",
          unitId: data.unitId || "all",
          active: data.active !== false,
        } as UserProfile;
      });
      // Sort alphabetically by displayName or email
      list.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
      onData(list);
    },
    (err) => {
      console.error("Erro ao listar usuários:", err);
      if (onError) onError(err);
    }
  );
}

export async function deleteUserAccount(uid: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("house190-users-updated"));
  }
}

export async function updateUserAccount(
  uid: string,
  patch: Partial<UserProfile>
): Promise<void> {
  await setDoc(doc(db, "users", uid), patch, { merge: true });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("house190-users-updated"));
  }
}
