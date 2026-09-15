import { useEffect, useState } from "react";
import { QrArt } from "./QrArt";
import { IconArrowRight, IconScan } from "../ui/icons";

/**
 * La demostración de la portada: un QR de verdad —apunta a esta misma página—
 * cuyo «destino» va cambiando debajo sin que el código se mueva. Es la promesa
 * del producto en una tarjeta.
 */
const STOPS = [
  { path: "/menu/summer-2025", note: "printed in June" },
  { path: "/menu/autumn-2026", note: "changed in September" },
  { path: "/events/harvest-dinner", note: "one night only" },
];
const SPARK = [3, 5, 4, 7, 6, 9, 8, 12, 10, 14, 13, 17, 15, 19];
const PERIOD_MS = 3200;

export function DestinationDemo({ baseUrl }: { baseUrl: string }) {
  const [active, setActive] = useState(1);
  const [scans, setScans] = useState(1284);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) return;
    setAnimate(true);
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % STOPS.length);
      setScans((n) => n + 1 + Math.floor(Math.random() * 3));
    }, PERIOD_MS);
    return () => window.clearInterval(id);
  }, []);

  const max = Math.max(...SPARK);

  return (
    <div className="relative mx-auto w-full max-w-[24rem]">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[3rem] opacity-80 blur-3xl"
        style={{ background: "radial-gradient(60% 60% at 50% 40%, rgb(255 138 61 / .22), transparent 70%)" }}
      />
      <div className="panel overflow-hidden">
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <div className="paper p-5">
            <QrArt value={baseUrl} label="A real QR code that brings you back to this page" className="block h-auto w-full" />
            <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink/55">
              <IconScan size={14} />
              Scan me · it works
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <p className="eyebrow">Destination</p>
          <ol className="mt-3 space-y-1.5" aria-label="The same printed code, three destinations over time">
            {STOPS.map((stop, i) => {
              const state = i === active ? "active" : i < active || (active === 0 && i === STOPS.length - 1) ? "past" : "next";
              return (
                <li
                  key={stop.path}
                  className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-sm transition-colors duration-500 ${
                    state === "active"
                      ? "border-ember/40 bg-ember/10 text-text-1"
                      : "border-transparent bg-bg-3/40 text-text-3"
                  }`}
                >
                  <span
                    className={`grid size-5 flex-none place-items-center rounded-full border text-[10px] ${
                      state === "active" ? "border-ember bg-ember text-ember-ink" : "border-line-2"
                    }`}
                    aria-hidden
                  >
                    {state === "active" ? <IconArrowRight size={11} /> : null}
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-mono text-xs ${state === "past" ? "line-through decoration-text-3/70" : ""}`}>
                    {stop.path}
                  </span>
                  <span className="hidden text-[11px] text-text-3 sm:inline">{stop.note}</span>
                  {state === "active" && animate && (
                    <span
                      key={active}
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-ember"
                      style={{ animation: `demo-progress ${PERIOD_MS}ms linear forwards` }}
                    />
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex items-end justify-between gap-4 border-t border-line pt-4">
            <div>
              <p className="text-2xl font-bold tabular-nums leading-none">{scans.toLocaleString()}</p>
              <p className="mt-1 text-xs text-text-3">scans · same printed code</p>
            </div>
            <div className="flex h-9 items-end gap-[3px]" aria-hidden>
              {SPARK.map((v, i) => (
                <span
                  key={i}
                  className="w-[5px] rounded-sm bg-ember/70 last:bg-ember"
                  style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes demo-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
    </div>
  );
}
