import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { BaseUrlConfig } from "./components/BaseUrlConfig";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-2xl">⚡</span>
              <span className="font-bold text-lg group-hover:text-primary transition-colors">
                QR-Forge
              </span>
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <BaseUrlConfig />
              <Link
                href="/"
                className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/new"
                className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              >
                + New QR
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
          QR-Forge · self-hosted · no analytics, no tracking beyond your logs
        </footer>
      </body>
    </html>
  );
}
