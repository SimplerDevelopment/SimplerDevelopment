// Public-site tracking-script renderer.
//
// Server component (no 'use client') so Next's <Script> strategy='afterInteractive'
// hoists correctly into <head>. The shape of `config` is the Drizzle row for
// site_tracking; the field catalog lives in lib/site-tracking/providers.ts.
//
// Two exports:
//   - <TrackingScripts /> emits <Script>/<meta>/<head>-bound markup. Layouts
//     can drop it anywhere in the tree; <Script> is hoisted by the framework.
//   - <TrackingNoscriptBody /> emits the markup that MUST live inside <body>
//     (GTM <noscript><iframe>, customBodyHtml). Layouts should render this
//     at the very top of body content.
//
// Both bail out silently when the config is null, disabled, or empty so the
// layout can include them unconditionally.

import Script from 'next/script';
import type { siteTracking } from '@/lib/db/schema';
import { hasAnyTracking } from '@/lib/site-tracking/providers';

type SiteTrackingRow = typeof siteTracking.$inferSelect;

interface Props {
  config: SiteTrackingRow | null;
}

// Wrap an id for safe embedding in a JS string literal in an inline script.
// Vendor IDs are already pattern-validated upstream — this is defense-in-depth
// against future regex loosening. We escape \, ', ", newline, and < (the last
// to prevent </script> sneaking out of a string).
function jsString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')
    .replace(/</g, '\\u003c');
}

export function TrackingScripts({ config }: Props): React.ReactElement | null {
  if (!config) return null;
  if (config.enabled === false) return null;
  if (!hasAnyTracking(config)) return null;

  const elements: React.ReactNode[] = [];

  // ─── Google Analytics 4 ───────────────────────────────────────────────────
  if (config.gaMeasurementId) {
    const id = jsString(config.gaMeasurementId);
    elements.push(
      <Script
        key="gtag-loader"
        id="gtag-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.gaMeasurementId)}`}
        strategy="afterInteractive"
      />,
      <Script
        key="gtag-init"
        id="gtag-init"
        strategy="afterInteractive"
      >
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>,
    );
  }

  // ─── Google Tag Manager (head half — noscript half is in TrackingNoscriptBody) ─
  if (config.gtmContainerId) {
    const id = jsString(config.gtmContainerId);
    elements.push(
      <Script
        key="gtm-init"
        id="gtm-init"
        strategy="afterInteractive"
      >
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');`}
      </Script>,
    );
  }

  // ─── Meta (Facebook) Pixel ────────────────────────────────────────────────
  if (config.metaPixelId) {
    const id = jsString(config.metaPixelId);
    elements.push(
      <Script
        key="meta-pixel"
        id="meta-pixel"
        strategy="afterInteractive"
      >
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${id}');
fbq('track', 'PageView');`}
      </Script>,
      <noscript key="meta-pixel-noscript">
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(config.metaPixelId)}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>,
    );
  }

  // ─── Microsoft Clarity ────────────────────────────────────────────────────
  if (config.clarityProjectId) {
    const id = jsString(config.clarityProjectId);
    elements.push(
      <Script
        key="clarity"
        id="clarity"
        strategy="afterInteractive"
      >
        {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${id}");`}
      </Script>,
    );
  }

  // ─── Hotjar ───────────────────────────────────────────────────────────────
  if (config.hotjarSiteId) {
    const id = jsString(config.hotjarSiteId);
    elements.push(
      <Script
        key="hotjar"
        id="hotjar"
        strategy="afterInteractive"
      >
        {`(function(h,o,t,j,a,r){
h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
h._hjSettings={hjid:${id},hjsv:6};
a=o.getElementsByTagName('head')[0];
r=o.createElement('script');r.async=1;
r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
a.appendChild(r);
})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`}
      </Script>,
    );
  }

  // ─── LinkedIn Insight Tag ─────────────────────────────────────────────────
  if (config.linkedinPartnerId) {
    const id = jsString(config.linkedinPartnerId);
    elements.push(
      <Script
        key="linkedin-insight"
        id="linkedin-insight"
        strategy="afterInteractive"
      >
        {`_linkedin_partner_id = "${id}";
window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
window._linkedin_data_partner_ids.push(_linkedin_partner_id);
(function(l) {
if (!l){window.lintrk = function(a,b){window.lintrk.q.push([a,b])};
window.lintrk.q=[]}
var s = document.getElementsByTagName("script")[0];
var b = document.createElement("script");
b.type = "text/javascript";b.async = true;
b.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
s.parentNode.insertBefore(b, s);})(window.lintrk);`}
      </Script>,
      <noscript key="linkedin-insight-noscript">
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://px.ads.linkedin.com/collect/?pid=${encodeURIComponent(config.linkedinPartnerId)}&fmt=gif`}
        />
      </noscript>,
    );
  }

  // ─── TikTok Pixel ─────────────────────────────────────────────────────────
  if (config.tiktokPixelId) {
    const id = jsString(config.tiktokPixelId);
    elements.push(
      <Script
        key="tiktok-pixel"
        id="tiktok-pixel"
        strategy="afterInteractive"
      >
        {`!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],
ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;
ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;
e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load('${id}');
ttq.page();
}(window, document, 'ttq');`}
      </Script>,
    );
  }

  // ─── Custom <head> HTML escape hatch ──────────────────────────────────────
  // Rendered as raw HTML; normalizeTrackingValue strips javascript: URLs at
  // save time. This is the documented escape hatch for vendors we don't have
  // first-class support for yet.
  if (config.customHeadHtml && config.customHeadHtml.trim().length > 0) {
    elements.push(
      <div
        key="custom-head-html"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: config.customHeadHtml }}
      />,
    );
  }

  return <>{elements}</>;
}

export function TrackingNoscriptBody({ config }: Props): React.ReactElement | null {
  if (!config) return null;
  if (config.enabled === false) return null;
  if (!hasAnyTracking(config)) return null;

  const elements: React.ReactNode[] = [];

  // GTM's <body> noscript half — required for users with JS disabled.
  if (config.gtmContainerId) {
    elements.push(
      <noscript key="gtm-noscript">
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(config.gtmContainerId)}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
          title="gtm"
        />
      </noscript>,
    );
  }

  // Custom <body> HTML escape hatch — top of body, before chrome.
  if (config.customBodyHtml && config.customBodyHtml.trim().length > 0) {
    elements.push(
      <div
        key="custom-body-html"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: config.customBodyHtml }}
      />,
    );
  }

  if (elements.length === 0) return null;
  return <>{elements}</>;
}
