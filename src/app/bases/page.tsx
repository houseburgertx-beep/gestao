"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  useEffect(() => router.replace("/"), [router]);
  return <p className="text-sm text-zinc-500">Abrindo o painel...</p>;
}
