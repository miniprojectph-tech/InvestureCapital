"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/**
 * App-wide safety net: if a page throws while rendering, the member sees this
 * instead of a blank screen, with a way to retry or go back to the dashboard.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-dvh bg-canvas text-text flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-[16px] font-semibold m-0 mb-1.5">Something went wrong</p>
        <p className="text-[12px] text-text-muted m-0 mb-5">
          This page couldn&apos;t load. Your balances and placements are safe. Try again, and if it keeps happening, message the admin.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => unstable_retry()}
            className="px-4 py-2 bg-gold text-gold-dark rounded-lg text-[12px] font-medium hover:brightness-110"
          >
            Try again
          </button>
          <a href="/dashboard" className="px-4 py-2 border border-border-strong rounded-lg text-[12px] text-text hover:bg-card-elev">
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
