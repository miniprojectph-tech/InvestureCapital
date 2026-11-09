"use client";

import { TAG_COLORS, type AccountTag } from "@/lib/accountTags";
import { cn } from "@/lib/utils";

/** Small colored tag chips (admin screens only). */
export function TagChips({ tags, className }: { tags: AccountTag[]; className?: string }) {
  if (!tags.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {tags.map((t) => <TagChip key={t.id} tag={t} />)}
    </span>
  );
}

export function TagChip({ tag }: { tag: AccountTag }) {
  const c = TAG_COLORS[tag.color];
  return (
    <span className="text-[9px] leading-[15px] px-1.5 rounded-full border whitespace-nowrap max-w-[120px] truncate" style={{ color: c.text, background: c.bg, borderColor: c.border }} title={tag.name}>
      {tag.name}
    </span>
  );
}

export function TagDot({ tag, className }: { tag: AccountTag; className?: string }) {
  return <span className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", className)} style={{ background: TAG_COLORS[tag.color].dot }} />;
}
