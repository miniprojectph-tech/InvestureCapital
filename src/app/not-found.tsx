import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-canvas text-text flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-[16px] font-semibold m-0 mb-1.5">Page not found</p>
        <p className="text-[12px] text-text-muted m-0 mb-5">That link doesn&apos;t lead anywhere. It may have been moved or removed.</p>
        <Link href="/dashboard" className="inline-block px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110">
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
