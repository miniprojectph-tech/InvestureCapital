"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** The old mock Activity page — the live feed lives on /transactions. */
export default function ActivityRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/transactions");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-5 h-5 text-gold animate-spin" />
    </div>
  );
}
