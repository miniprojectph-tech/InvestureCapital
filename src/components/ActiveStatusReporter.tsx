"use client";

import { useActiveStatusReporter } from "@/lib/activeStatus";

/** Member app: tells the team (and the member's Team Leader) whether this member is active or away. Renders nothing. */
export function ActiveStatusReporter() {
  useActiveStatusReporter();
  return null;
}
