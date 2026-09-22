"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Wraps a wide admin <table>. On desktop it scrolls sideways as before; on a
 * phone (below md) each row turns into a card and every cell shows its column
 * heading as a label, so nothing sits off-screen to the right. Labels are read
 * from the <th> text and set as `data-label` on each <td>; the layout itself is
 * CSS (`.rt` rules in globals.css). A cell with colSpan (an expanded detail
 * row) spans the whole card with no label.
 */
export function ResponsiveTable({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const label = () => {
      for (const table of Array.from(root.querySelectorAll("table"))) {
        const heads = Array.from(table.querySelectorAll(":scope > thead th")).map((th) => (th.textContent ?? "").trim());
        for (const row of Array.from(table.querySelectorAll(":scope > tbody > tr"))) {
          let col = 0;
          for (const cell of Array.from(row.children) as HTMLTableCellElement[]) {
            const span = cell.colSpan || 1;
            if (span === 1 && heads[col]) cell.setAttribute("data-label", heads[col]);
            else cell.removeAttribute("data-label");
            col += span;
          }
        }
      }
    };
    label();
    const mo = new MutationObserver(label);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("rt overflow-x-auto -mx-1 max-md:mx-0", className)}>
      {children}
    </div>
  );
}
