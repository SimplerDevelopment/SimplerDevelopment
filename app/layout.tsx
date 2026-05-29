import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { defaultSEO } from "@/config/seo";
import { StructuredData } from "@/components/seo/StructuredData";
import { generateOrganizationSchema } from "@/lib/utils/structured-data";
import { headers } from "next/headers";
import dynamic from "next/dynamic";

// Code-split the app chrome (NextAuth SessionProvider + LayoutContent →
// marketing Navigation/Footer/UserDropdown, which pull in next-auth/react and
// a pile of icons). Statically importing them bundled all of that into the
// client chunk loaded on EVERY page — including public client sites that never
// render them. Dynamic (ssr:true) keeps them server-rendered where used but
// keeps their chunk off pages (client sites) that don't render them.
const SessionProvider = dynamic(() => import("@/components/SessionProvider"));
const LayoutContent = dynamic(() =>
  import("@/components/LayoutContent").then((m) => m.LayoutContent),
);

// preload: false — these app/portal fonts were being <link rel=preload>ed on
// EVERY route (~180KB of woff2), including public client sites that use their
// own brand fonts (Raleway/Open Sans) and never reference these. With preload
// off they still load on-demand where actually used (var(--font-*)), but no
// longer sit on the critical path of pages that don't use them.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: false,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  preload: false,
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  preload: false,
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
        {/* Material Icons only for the app/portal. Public client sites load it
            (non-blocking) from their own site layout if their content needs it,
            so we don't put a 126KB render-blocking font stylesheet on every
            public page's critical path. */}
        {!isClientSite && (
          <link
            href="https://fonts.googleapis.com/icon?family=Material+Icons"
            rel="stylesheet"
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
        {isClientSite ? (
          // Public client sites supply their own nav/footer (app/sites/[domain]
          // layout) and have no authenticated UI, so they need neither the app
          // marketing chrome (LayoutContent → Navigation/Footer) nor the
          // NextAuth SessionProvider. Skipping both keeps a large amount of
          // unused client JS off every public page. (Verified: no public-site
          // component calls useSession.)
          children
        ) : (
          <SessionProvider>
            <LayoutContent isClientSite={isClientSite}>{children}</LayoutContent>
          </SessionProvider>
        )}
      </body>
    </html>
  );
}
