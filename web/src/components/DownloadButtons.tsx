import { useState } from "react";
import { downloadQr } from "../lib/qr";
import { Button } from "../ui/Button";
import { IconDownload } from "../ui/icons";
import { useToast } from "../ui/Toast";

/** PNG a 1024 px para pantalla y papel; SVG para lo que se escala sin perder. */
export function DownloadButtons({ value, filename, className }: { value: string; filename: string; className?: string }) {
  const [busy, setBusy] = useState<"png" | "svg" | null>(null);
  const toast = useToast();
  const run = async (format: "png" | "svg") => {
    setBusy(format);
    try {
      await downloadQr(value, filename, format);
    } catch (err) {
      console.error("[download]", err);
      toast({ tone: "danger", title: "Could not generate the file", body: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={`grid grid-cols-2 gap-2 ${className ?? ""}`}>
      <Button onClick={() => run("png")} loading={busy === "png"} aria-label="Download PNG">
        {busy !== "png" && <IconDownload size={16} />}
        PNG
      </Button>
      <Button onClick={() => run("svg")} loading={busy === "svg"} aria-label="Download SVG">
        {busy !== "svg" && <IconDownload size={16} />}
        SVG
      </Button>
    </div>
  );
}
