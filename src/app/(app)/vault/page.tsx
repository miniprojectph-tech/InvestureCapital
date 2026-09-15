"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** The Vault was replaced by the Bonuses page in the new compensation plan. */
export default function VaultRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/bonuses");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-5 h-5 text-gold animate-spin" />
    </div>
  );
}
