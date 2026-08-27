"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      onClick={handleCopy}
      className="px-3 py-2 text-sm rounded-md bg-muted hover:bg-muted/70 transition-colors"
      title="Copy to clipboard"
      aria-label="Copy to clipboard"
    >
      {copied ? "✓" : "📋"}
    </button>
  );
}
