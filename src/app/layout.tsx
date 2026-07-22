import type { Metadata, Viewport } from "next";
import { clientEnv } from "@/lib/env";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: "adfit — does your landing page keep the ad's promise?",
    template: "%s · adfit",
  },
  description:
    "Paste your ads, add the landing page, and get a scored report on exactly where the promise breaks after the click.",
  openGraph: {
    title: "adfit",
    description: "Score how well your landing page delivers on the ad that earned the click.",
    url: clientEnv.NEXT_PUBLIC_APP_URL,
    siteName: "adfit",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is required: next-themes writes the class on
    // <html> before React hydrates, which is the point of it.
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-dvh bg-background font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
