import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { UserMenu } from "./components/UserMenu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
          {/* min-w-0 en el contenedor y shrink-0 en las acciones: el título cede
              espacio antes que los botones, que es lo que se pulsa. El widget de
              "Base URL" que vivía aquí desbordaba la cabecera en móvil (dejaba
              "+ New QR" fuera de la pantalla) y ya no hace falta: la URL pública
              la decide el servidor. */}
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
            <Link href="/" className="flex min-w-0 items-center gap-2 group">
              <span className="text-2xl leading-none">⚡</span>
              <span className="truncate font-bold text-lg group-hover:text-primary transition-colors">
                QR-Forge
              </span>
            </Link>

            <nav className="ml-auto flex shrink-0 items-center gap-2 text-sm">
              {user ? (
                <>
                  <Link
                    href="/new"
                    className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
                  className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
          QR-Forge · self-hosted · no analytics, no tracking beyond your logs
        </footer>
      </body>
    </html>
  );
}
