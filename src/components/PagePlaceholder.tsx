import { TopHeader } from "./TopHeader";

export function PagePlaceholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <TopHeader title={title} subtitle={subtitle} />
      <div className="bg-card border border-border rounded-xl p-10 text-center">
        <p className="text-text-muted text-[13px]">Coming soon.</p>
      </div>
    </div>
  );
}
