"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * "Back to FAQ": returns to the question the member came from (the FAQ button
 * passes ?back=/faq#<id>); anyone who opened the page directly goes to the FAQ.
 * Only paths inside the app are accepted, so the link can't be pointed elsewhere.
 */
export function BackButton({ className, label = "Back to FAQ" }: { className?: string; label?: string }) {
  const params = useSearchParams();
  const raw = params.get("back") ?? "";
  const href = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/faq";
  return (
    <Link href={href} className={className} aria-label={label}>
      <ArrowLeft style={{ width: 14, height: 14 }} /> {label}
    </Link>
  );
}
