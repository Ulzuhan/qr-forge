import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Link from "../navigation";
import { Spinner } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
type Size = "sm" | "md" | "lg";

function classes(variant: Variant, size: Size, icon: boolean, block: boolean, extra?: string) {
  return [
    "btn",
    `btn-${variant}`,
    size !== "md" && `btn-${size}`,
    icon && "btn-icon",
    block && "btn-block",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Sólo icono: cuadrado, y el nombre accesible va en aria-label. */
  icon?: boolean;
  block?: boolean;
  loading?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon = false,
  block = false,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes(variant, size, icon, block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  size?: Size;
  icon?: boolean;
  block?: boolean;
  children?: ReactNode;
};

export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon = false,
  block = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={classes(variant, size, icon, block, className)} {...rest}>
      {children}
    </Link>
  );
}
