/**
 * Los iconos, dibujados aquí: trazos de 24 px que heredan el color del texto.
 * Sin dependencia de iconos, igual que el cromado común.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export const IconPlus = (p: IconProps) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const IconSearch = (p: IconProps) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IconBolt = (p: IconProps) => <svg {...base(p)}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>;
export const IconBox = (p: IconProps) => <svg {...base(p)}><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>;
export const IconLink = (p: IconProps) => <svg {...base(p)}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>;
export const IconWifi = (p: IconProps) => <svg {...base(p)}><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a14 14 0 0 1 20 0" /><circle cx="12" cy="19.5" r="1" fill="currentColor" /></svg>;
export const IconMail = (p: IconProps) => <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
export const IconText = (p: IconProps) => <svg {...base(p)}><path d="M4 6h16M4 12h10M4 18h14" /></svg>;
export const IconCopy = (p: IconProps) => <svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
export const IconCheck = (p: IconProps) => <svg {...base(p)}><path d="m5 12 5 5L20 7" /></svg>;
export const IconDownload = (p: IconProps) => <svg {...base(p)}><path d="M12 3v12M6 11l6 6 6-6M4 20h16" /></svg>;
export const IconEdit = (p: IconProps) => <svg {...base(p)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>;
export const IconTrash = (p: IconProps) => <svg {...base(p)}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>;
export const IconExternal = (p: IconProps) => <svg {...base(p)}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>;
export const IconArrowLeft = (p: IconProps) => <svg {...base(p)}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>;
export const IconArrowRight = (p: IconProps) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconChart = (p: IconProps) => <svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
export const IconGlobe = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
export const IconClock = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const IconPower = (p: IconProps) => <svg {...base(p)}><path d="M12 3v9" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></svg>;
export const IconX = (p: IconProps) => <svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>;
export const IconChevron = (p: IconProps) => <svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>;
export const IconAlert = (p: IconProps) => <svg {...base(p)}><path d="M12 3 2 20h20z" /><path d="M12 9v5M12 17h.01" /></svg>;
export const IconInfo = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>;
export const IconEye = (p: IconProps) => <svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IconEyeOff = (p: IconProps) => <svg {...base(p)}><path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 13.4 13.4M9.9 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.3 4.3-.9" /></svg>;
export const IconCalendar = (p: IconProps) => <svg {...base(p)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
export const IconTag = (p: IconProps) => <svg {...base(p)}><path d="M20 12 12 20l-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" /></svg>;
export const IconShield = (p: IconProps) => <svg {...base(p)}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
export const IconPrinter = (p: IconProps) => <svg {...base(p)}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="7" /></svg>;
export const IconRefresh = (p: IconProps) => <svg {...base(p)}><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>;
export const IconSparkle = (p: IconProps) => <svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5 9 9M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5" /></svg>;
export const IconQr = (p: IconProps) => <svg {...base(p)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18v3M20 20h1v1" /></svg>;
export const IconScan = (p: IconProps) => <svg {...base(p)}><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M3 12h18" /></svg>;
export const IconMore = (p: IconProps) => <svg {...base(p)}><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" /></svg>;
export const IconPause = (p: IconProps) => <svg {...base(p)}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>;
export const IconPlay = (p: IconProps) => <svg {...base(p)}><path d="M7 4l12 8-12 8z" /></svg>;
export const IconLogIn = (p: IconProps) => <svg {...base(p)}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>;

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
