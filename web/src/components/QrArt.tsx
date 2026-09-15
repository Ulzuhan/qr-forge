import { useMemo } from "react";
import { qrMatrix, type Matrix } from "../lib/qr";

/**
 * El QR dibujado a mano en SVG, a partir de la matriz de la librería.
 *
 * Los módulos se redondean sólo por las esquinas que dan al exterior: un módulo
 * suelto es un círculo, una tira es una píldora y un bloque sigue siendo un
 * bloque. Los tres patrones de búsqueda se dibujan aparte, como anillos, que es
 * lo primero que reconoce cualquier lector. Es el mismo código que se descarga
 * (mismo valor, mismo nivel M): sólo cambia el trazo.
 */
export function QrArt({
  value,
  className,
  ink = "#0b0c11",
  paper = "transparent",
  margin = 2,
  label,
}: {
  value: string;
  className?: string;
  ink?: string;
  paper?: string;
  /** Zona de silencio, en módulos. */
  margin?: number;
  label?: string;
}) {
  const art = useMemo(() => {
    const m = qrMatrix(value);
    return m ? render(m) : null;
  }, [value]);

  if (!art) return null;
  const total = art.size + margin * 2;
  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      className={className}
      role="img"
      aria-label={label ?? "QR code"}
      shapeRendering="geometricPrecision"
    >
      {paper !== "transparent" && <rect width={total} height={total} fill={paper} />}
      <g transform={`translate(${margin} ${margin})`} fill={ink} fillRule="evenodd">
        <path d={art.modules} />
        <path d={art.finders} />
      </g>
    </svg>
  );
}

const FINDER = 7;

function inFinder(row: number, col: number, size: number): boolean {
  const n = size - FINDER;
  return (row < FINDER && col < FINDER) || (row < FINDER && col >= n) || (row >= n && col < FINDER);
}

function render(m: Matrix): { size: number; modules: string; finders: string } {
  const { size, dark } = m;
  const r = 0.5;
  const parts: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!dark(row, col) || inFinder(row, col, size)) continue;
      const up = dark(row - 1, col) && !inFinder(row - 1, col, size);
      const down = dark(row + 1, col) && !inFinder(row + 1, col, size);
      const left = dark(row, col - 1) && !inFinder(row, col - 1, size);
      const right = dark(row, col + 1) && !inFinder(row, col + 1, size);
      const tl = !up && !left ? r : 0;
      const tr = !up && !right ? r : 0;
      const br = !down && !right ? r : 0;
      const bl = !down && !left ? r : 0;
      parts.push(roundedRect(col, row, 1, 1, tl, tr, br, bl));
    }
  }
  const n = size - FINDER;
  const finders = [
    [0, 0],
    [n, 0],
    [0, n],
  ]
    .map(([x, y]) => finder(x, y))
    .join("");
  return { size, modules: parts.join(""), finders };
}

/** Anillo exterior de 7, hueco de 5 y núcleo de 3, todos con esquinas suaves. */
function finder(x: number, y: number): string {
  return (
    roundedRect(x, y, 7, 7, 2.1, 2.1, 2.1, 2.1) +
    roundedRect(x + 1, y + 1, 5, 5, 1.35, 1.35, 1.35, 1.35) +
    roundedRect(x + 2, y + 2, 3, 3, 0.9, 0.9, 0.9, 0.9)
  );
}

function roundedRect(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): string {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  let d = `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}`;
  if (tr) d += `a${f(tr)} ${f(tr)} 0 0 1 ${f(tr)} ${f(tr)}`;
  d += `V${f(y + h - br)}`;
  if (br) d += `a${f(br)} ${f(br)} 0 0 1 ${f(-br)} ${f(br)}`;
  d += `H${f(x + bl)}`;
  if (bl) d += `a${f(bl)} ${f(bl)} 0 0 1 ${f(-bl)} ${f(-bl)}`;
  d += `V${f(y + tl)}`;
  if (tl) d += `a${f(tl)} ${f(tl)} 0 0 1 ${f(tl)} ${f(-tl)}`;
  return d + "Z";
}
