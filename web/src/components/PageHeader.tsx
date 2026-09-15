import type { ReactNode } from "react";

/** La cabecera de una pantalla: rótulo pequeño, título, una frase y acciones. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  above,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** Migas o el enlace de vuelta, encima de todo. */
  above?: ReactNode;
}) {
  return (
    <header className="animate-rise">
      {above && <div className="mb-4">{above}</div>}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
          <h1 className="text-[2rem] leading-[1.05] sm:text-[2.6rem]">{title}</h1>
          {lede && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-text-2">{lede}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
