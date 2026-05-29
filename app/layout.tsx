import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { defaultSEO } from "@/config/seo";
import { StructuredData } from "@/components/seo/StructuredData";
import { generateOrganizationSchema } from "@/lib/utils/structured-data";
import { headers } from "next/headers";
import SessionProvider from "@/components/SessionProvider";
import { LayoutContent } from "@/components/LayoutContent";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = defaultSEO;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  // Detect client site subdomains — anything that's not the main app hostname
  const APP_HOSTS = ["localhost", "127.0.0.1", "simplerdevelopment.com", "www.simplerdevelopment.com"];
  const hostname = host.split(":")[0];
  const isClientSite = !APP_HOSTS.includes(hostname) && !hostname.endsWith(".railway.app");
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <StructuredData data={generateOrganizationSchema()} />
        {/* Material Icons is self-hosted (see app/globals.css @font-face).
            Preload the woff2 on app/portal pages so icon glyphs paint
            immediately; client sites pick it up lazily via globals.css to
            keep the public critical path lean. */}
        {!isClientSite && (
          <link
            rel="preload"
            href="/fonts/material-icons.woff2"
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'system';
                  const root = document.documentElement;

                  if (theme === 'system') {
                    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                    root.classList.add(systemTheme);
                  } else {
                    root.classList.add(theme);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${inter.variable} ${playfairDisplay.variable} antialiased min-h-screen flex flex-col`}
      >
        <SessionProvider>
          <LayoutContent isClientSite={isClientSite}>{children}</LayoutContent>
        </SessionProvider>
      </body>
    </html>
  );
}
