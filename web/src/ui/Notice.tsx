import type { ReactNode } from "react";
import { IconAlert, IconBolt, IconInfo } from "./icons";

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "ember" | "plain";
  children: ReactNode;
  className?: string;
}) {
  const icon =
    tone === "danger" || tone === "warn" ? <IconAlert size={18} /> : tone === "ember" ? <IconBolt size={18} /> : <IconInfo size={18} />;
  return (
    <div className={`notice ${tone !== "plain" ? `notice-${tone}` : ""} ${className ?? ""}`} role={tone === "danger" ? "alert" : undefined}>
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
