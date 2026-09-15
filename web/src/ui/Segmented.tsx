import type { KeyboardEvent, ReactNode } from "react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
};

/**
 * Un grupo de opciones excluyentes con semántica de radio: flechas para moverse,
 * aria-checked para saber cuál está activa.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    else return;
    e.preventDefault();
    onChange(options[next].value);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
    buttons[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={`seg ${className ?? ""}`} onKeyDown={move}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className="seg-item"
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
