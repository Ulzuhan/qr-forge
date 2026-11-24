/* Adaptado para React+Vite a partir de kaicorplabs-web/theme/kaicorp-header.tsx. */
import Link from "../navigation";
import { KaiCorpAppSwitcher } from "./kaicorp-app-switcher";

export function KaiCorpHeader({
  app,
  current,
  showSwitcher = false,
  children,
}: {
  app: string;
  current?: string;
  showSwitcher?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{
        borderColor: "var(--kc-line)",
        background: "color-mix(in oklab, var(--kc-bg) 78%, transparent)",
      }}
    >
      <div className="mx-auto flex h-[60px] w-full max-w-[74rem] items-center gap-3 px-4 sm:px-6">
        {showSwitcher && <KaiCorpAppSwitcher current={current} />}

        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
          title={app}
        >
          <img src="/kaicorp-mark.png" alt="" width={26} height={26} className="block size-[26px] shrink-0" />
          <span
            className="truncate text-[16px] font-semibold tracking-tight"
            style={{ color: "var(--kc-text-1)", fontFamily: "var(--kc-font-display)" }}
          >
            {app}
          </span>
        </Link>

        {children && <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}
