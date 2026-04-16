import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/app/providers";
import "@/app/globals.css";
import { getSiteUrl } from "@/lib/site-url";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl();

  return {
    title: "iReconX Analytics Studio",
    description: "Secure data analytics and exploration studio with RBAC.",
    metadataBase: siteUrl ?? undefined,
    alternates: siteUrl
      ? {
          canonical: "/"
        }
      : undefined,
    openGraph: siteUrl
      ? {
          siteName: "iReconX Analytics Studio",
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
