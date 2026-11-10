import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Serendipity — The $1 Networking Brain",
  description:
    "The right person is already in the room. Muse Ember uncovers the connections nobody knew existed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#05060f] text-white">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#05060f]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-cyan-400 text-lg font-black">
                ✦
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-black tracking-tight">
                  SERENDIPITY
                </span>
                <span className="block text-[11px] tracking-wide text-white/60">
                  The $1 Networking Brain · Muse Ember
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link
                href="/"
                className="rounded-full px-4 py-2 text-white/80 hover:bg-white/10 hover:text-white"
              >
                Live Network
              </Link>
              <Link
                href="/join"
                className="rounded-full bg-white px-4 py-2 font-semibold text-black hover:bg-cyan-200"
              >
                Join →
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="border-t border-white/10 py-8 text-center text-xs text-white/40">
          Built with Muse Ember via OpenRouter · meta/muse-ember ·{" "}
          <span className="text-white/60">
            Runtime inference tracked live on this page.
          </span>
        </footer>
      </body>
    </html>
  );
}
