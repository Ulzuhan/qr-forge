import { useMemo, useState } from "react";
import { formatDay } from "../lib/format";

type Day = { day: string; count: number };

/**
 * La serie completa de la ventana: el servidor manda sólo los días con
 * escaneos y el periodo (dailySince, dailyDays); aquí se rellenan los huecos
 * con ceros para que el eje sea el tiempo y no «los días con actividad».
 */
export function fillSeries(daily: Day[], since: string, now: Date = new Date()): Day[] {
  const counts = new Map(daily.map((d) => [d.day, d.count]));
  const start = new Date(since);
  let t = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  let end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const last = daily[daily.length - 1]?.day;
  if (last && last > new Date(end).toISOString().slice(0, 10)) end = Date.parse(last + "T00:00:00Z");
  const out: Day[] = [];
  for (; t <= end; t += 86_400_000) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push({ day: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

const W = 640;
const H = 190;
const PAD = { top: 18, right: 8, bottom: 26, left: 34 };

export function ScanChart({ daily, since }: { daily: Day[]; since: string }) {
  const series = useMemo(() => fillSeries(daily, since), [daily, since]);
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(1, ...series.map((d) => d.count));
  const top = niceCeil(max);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / series.length;
  const barW = Math.max(3, Math.min(18, step * 0.62));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const ticks = [0, top / 2, top];
  const labelEvery = Math.max(1, Math.round(series.length / 5));
  const busiest = series.reduce((best, d, i) => (d.count > series[best].count ? i : best), 0);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Scans per day for the last ${series.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="bar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-ember-2)" />
            <stop offset="1" stopColor="var(--color-ember)" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill="var(--color-text-3)" fontFamily="var(--font-mono)">
              {t}
            </text>
          </g>
        ))}
        {series.map((d, i) => {
          const cx = PAD.left + step * i + step / 2;
          const h = Math.max(0, y(0) - y(d.count));
          const active = hover === i;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={cx - step / 2} y={PAD.top} width={step} height={innerH} fill="transparent" />
              {d.count > 0 ? (
                <rect
                  x={cx - barW / 2}
                  y={y(d.count)}
                  width={barW}
                  height={h}
                  rx={Math.min(4, barW / 2)}
                  fill={active || i === busiest ? "var(--color-ember-2)" : "url(#bar)"}
                  style={{ transition: "fill .15s" }}
                />
              ) : (
                <rect x={cx - barW / 2} y={y(0) - 2} width={barW} height={2} rx={1} fill={active ? "var(--color-text-3)" : "var(--color-line-2)"} />
              )}
              <title>{`${formatDay(d.day)}: ${d.count} scan${d.count === 1 ? "" : "s"}`}</title>
              {(i % labelEvery === 0 || i === series.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-text-3)" fontFamily="var(--font-mono)">
                  {formatDay(d.day)}
                </text>
              )}
            </g>
          );
        })}
        {hover !== null && (
          <g pointerEvents="none">
            {(() => {
              const d = series[hover];
              const cx = PAD.left + step * hover + step / 2;
              const label = `${formatDay(d.day)} · ${d.count}`;
              const w = label.length * 6.4 + 16;
              const x = Math.min(Math.max(cx - w / 2, PAD.left), W - PAD.right - w);
              const ty = Math.max(4, y(d.count) - 30);
              return (
                <>
                  <rect x={x} y={ty} width={w} height={22} rx={6} fill="var(--color-bg-3)" stroke="var(--color-line-2)" />
                  <text x={x + w / 2} y={ty + 15} textAnchor="middle" fontSize="11" fill="var(--color-text-1)" fontFamily="var(--font-mono)">
                    {label}
                  </text>
                </>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(n));
  const norm = n / mag;
  const step = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}
