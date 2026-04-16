import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import "@/app/globals.css";
import { loadSiteName } from "@/lib/site-name";
import { getSiteUrl } from "@/lib/site-url";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl();
  const siteName = await loadSiteName();

  return {
    title: siteName,
    description: "Secure data analytics and exploration studio with RBAC.",
    metadataBase: siteUrl ?? undefined,
    alternates: siteUrl
      ? {
          canonical: "/"
        }
      : undefined,
    openGraph: siteUrl
      ? {
          siteName,
          url: siteUrl
        }
      : undefined
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
