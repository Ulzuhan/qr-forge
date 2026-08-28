import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { UserMenu } from "./components/UserMenu";
import { KaiCorpFooter } from "./components/kaicorp-footer";
import { KaiCorpHeader } from "./components/kaicorp-header";

const display = Space_Grotesk({ variable: "--font-display", weight: ["500", "700"], subsets: ["latin"] });
const sans = Inter({ variable: "--font-sans", weight: ["400", "500"], subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono", weight: ["400", "500"], subsets: ["latin"] });

/**
 * The public origin, for canonical and social previews.
 *
 * QRFORGE_PUBLIC_URL already exists and is the most load-bearing variable here
 * — it is what gets printed into every code — so canonical and Open Graph
 * agree with the paper by construction. Unset, none is emitted: Next would
 * resolve relative URLs against localhost, and a canonical pointing there is
 * worse than no canonical at all.
 */
const publicUrl = process.env.QRFORGE_PUBLIC_URL?.trim();
const base = publicUrl ? new URL(publicUrl) : undefined;

const TITLE = "QR-Forge — dynamic QR codes you keep control of";
const DESCRIPTION =
  "Print the code once and change where it points forever after. Scans counted by day and country — never IP, never referrer. Self-hosted and open source.";

export const metadata: Metadata = {
  ...(base ? { metadataBase: base, alternates: { canonical: "/" } } : {}),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "QR-Forge",
    locale: "en_US",
    ...(base ? { url: "/", images: [{ url: "/og.jpg", width: 760, height: 475, alt: "QR-Forge: one printed code whose destination is being changed" }] } : {}),
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await currentUser();

  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <KaiCorpHeader app="QR-Forge">
          {user ? (
            <>
              <Link
                href="/new"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {/* En móvil no cabe el texto completo junto al menú. */}
                <span className="sm:hidden">+ New</span>
                <span className="hidden sm:inline">+ New QR</span>
              </Link>
              <UserMenu email={user.email} />
            </>
          ) : (
            <Link
              href="/api/auth/login"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          )}
        </KaiCorpHeader>

        <main className="flex-1">{children}</main>

        <KaiCorpFooter current="qr-forge" />
      </body>
    </html>
  );
}
