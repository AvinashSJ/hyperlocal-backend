"use client";

import type { ReactNode } from "react";

export function Sensitive({
  visible,
  children,
  className,
}: {
  visible: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!visible) return <span className={className}>₹••••</span>;
  return <span className={className}>{children}</span>;
}
