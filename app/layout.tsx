import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans, Inter, Playfair_Display, Orbitron, Raleway } from "next/font/google";
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

// ─── Retro-future marketing type ────────────────────────────────────────────
// The public marketing pages run on the retro-future design system; its tokens
// name these two exactly. Orbitron is the squared, space-age display face that
// carries the "1950s idea of the future" read; Raleway is the humanist body
// face that keeps long-form copy legible next to it.
//
// preload: TRUE, unlike every font above. These are on the critical path for
// the marketing pages — the hero headline is Orbitron, so deferring it means a
// visible swap on the first thing a visitor sees.
const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = defaultSEO;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  // Detect client site requests — those supply their own nav/footer and skip
  // the app marketing chrome. On a dedicated client host (e.g. a client's own domain)
  // the hostname check is enough. But `staging.simplerdevelopment.com` is an app
  // host that multiplexes BOTH the marketing site (/) and client sites
  // (/sites/<domain>) on one host, so hostname alone can't tell them apart —
  // the middleware forwards `x-site-pathname` on /sites/* routes to mark them.
  const APP_HOSTS = ["localhost", "127.0.0.1", "simplerdevelopment.com", "www.simplerdevelopment.com", "staging.simplerdevelopment.com"];
  const hostname = host.split(":")[0];
  const isSitesRoute = headersList.get("x-site-pathname") !== null;
  const isClientSite = isSitesRoute || (!APP_HOSTS.includes(hostname) && !hostname.endsWith(".railway.app"));
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  // These six app-shell font variables (Geist Sans, DM Sans, Inter, Playfair
  // Display, and the retro-future marketing pair Orbitron/Raleway) back the
  // app/portal marketing chrome and its typography tokens (--font-sans,
  // --font-heading, --font-display, --font-playfair, .retro's stack) — none
  // of which public client sites ever resolve: they bring their own brand
  // fonts and render their own layout. Verified live via a getComputedStyle
  // sweep over every element (+ ::before/::after) on two production
  // client-site pages: zero elements resolved to any of these faces, and
  // --font-sans computed to an empty string on a client-site <body>. Despite
  // that, next/font/google fetched 3 font files (2 preloaded) on every
  // client-site page for nothing — ~104KB and 3 requests × 54 pages. Gate the
  // class list the same way the material-icons preload above is gated.
  // (geistMono is NOT part of this gate — checkout/CheckoutSuccess.tsx under
  // app/sites uses the `font-mono` Tailwind utility, which resolves through
  // --font-mono → var(--font-geist-mono), so client sites still need it.)
  const appShellFontVariables = isClientSite
    ? ""
    : `${geistSans.variable} ${dmSans.variable} ${inter.variable} ${playfairDisplay.variable} ${orbitron.variable} ${raleway.variable}`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <StructuredData data={generateOrganizationSchema()} />
        {/* Material Icons only for the app/portal. Public client sites load it
            (non-blocking) from their own site layout if their content needs it,
            so we don't put a 126KB render-blocking font stylesheet on every
            public page's critical path. */}
        {!isClientSite && (
          <>
            {/* Material Icons is self-hosted (see app/globals.css @font-face).
             *  Preload the woff2 so icon glyphs paint immediately. */}
            <link
              rel="preload"
              href="/fonts/material-icons.woff2"
              as="font"
              type="font/woff2"
              crossOrigin="anonymous"
            />
            {/* Google tag (gtag.js) — SD marketing/app only; tenant client
                sites manage their own analytics via site custom code. Only
                rendered when NEXT_PUBLIC_GA_ID is set, so dev/preview
                environments without the var don't fire GA. */}
            {gaId && (
              <>
                <script
                  async
                  src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
                />
                <script
                  dangerouslySetInnerHTML={{
                    __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`,
                  }}
                />
              </>
            )}
          </>
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
        className={`${geistMono.variable} ${appShellFontVariables} antialiased min-h-screen flex flex-col`}
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
