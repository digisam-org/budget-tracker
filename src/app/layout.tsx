import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileNav } from "@/components/mobile-nav";
import { PwaProvider } from "@/components/pwa/pwa-provider";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Budget Tracker | PWA & CSV Ingestion Engine",
  description: "Self-directed zero-based personal budget PWA with frictionless bank statement ingestion",
  manifest: `${basePath}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Budget Tracker",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100 flex flex-col font-sans pb-20 selection:bg-emerald-500/30 selection:text-emerald-300">
        <PwaProvider>
          <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6">
            {children}
          </main>
          <MobileNav />
        </PwaProvider>
      </body>
    </html>
  );
}
