import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Un campo: rótulo asociado por id, control, y una nota debajo. El rótulo es un
 * <label for>, que es lo que lee un lector de pantalla y lo que encuentra
 * Playwright con getByLabel.
 */
export function Field({
  id,
  label,
  required,
  optional,
  hint,
  warn,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  /** La nota, en ámbar: para lo que cambia algo ya impreso. */
  warn?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        <span>{label}</span>
        {required && <span className="req" aria-hidden>*</span>}
        {optional && <span className="opt">optional</span>}
      </label>
      {children}
      {hint && <p className={`hint ${warn ? "hint-warn" : ""}`}>{hint}</p>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { mono?: boolean };

export function Input({ mono, className, ...rest }: InputProps) {
  return <input className={`input ${mono ? "input-mono" : ""} ${className ?? ""}`} {...rest} />;
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean };

export function Textarea({ mono, className, ...rest }: TextareaProps) {
  return <textarea className={`input ${mono ? "input-mono" : ""} ${className ?? ""}`} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`input ${className ?? ""}`} {...rest}>
        {children}
      </select>
      <svg
        aria-hidden
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-3"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function Switch({
  id,
  checked,
  onChange,
  label,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className="switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden />
      <span>{label}</span>
    </label>
  );
}
