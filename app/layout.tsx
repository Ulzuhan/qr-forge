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

export const metadata: Metadata = {
  title: "QR-Forge — Dynamic QR Codes & Analytics",
  description:
    "Create dynamic, editable QR codes with scan tracking. Self-hosted.",
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
