
import { NextRequest, NextResponse } from 'next/server';
import { chromium, Browser, Page } from 'playwright';
import { uploadToS3 } from '@/lib/s3/upload';
import { auth } from '@/lib/auth';

// Configure route for longer execution time (Railway default is 60s)
export const maxDuration = 60; // seconds

// Viewport configurations
const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
} as const;

// Known tracking/analytics script patterns
const SCRIPT_PATTERNS: Record<string, RegExp[]> = {
  analytics: [
    /google-analytics\.com/i,
    /googletagmanager\.com/i,
    /analytics\.google\.com/i,
    /plausible\.io/i,
    /fathom\.com/i,
    /mixpanel\.com/i,
    /segment\.com/i,
    /amplitude\.com/i,
    /hotjar\.com/i,
    /clarity\.ms/i,
    /heap\.io/i,
    /fullstory\.com/i,
  ],
  advertising: [
    /connect\.facebook\.net/i,
    /facebook\.com\/tr/i,
    /snap\.licdn\.com/i,
    /linkedin\.com\/px/i,
    /ads\.linkedin\.com/i,
    /googleads\.g\.doubleclick\.net/i,
    /googlesyndication\.com/i,
    /adservice\.google\.com/i,
    /tiktok\.com\/i18n\/pixel/i,
    /analytics\.tiktok\.com/i,
    /ads\.twitter\.com/i,
    /static\.ads-twitter\.com/i,
    /px\.ads\.linkedin\.com/i,
    /bing\.com\/bat/i,
    /bat\.bing\.com/i,
    /pinterest\.com\/ct/i,
    /snapchat\.com\/scevent/i,
    /reddit\.com\/pixel/i,
  ],
  marketing: [
    /js\.hs-scripts\.com/i,
    /js\.hsforms\.net/i,
    /hubspot\.com/i,
    /mailchimp\.com/i,
    /klaviyo\.com/i,
    /customer\.io/i,
    /intercom\.io/i,
    /intercomcdn\.com/i,
    /drift\.com/i,
    /crisp\.chat/i,
    /tawk\.to/i,
    /livechat\.com/i,
    /zendesk\.com/i,
    /freshdesk\.com/i,
    /olark\.com/i,
    /optinmonster\.com/i,
    /sumo\.com/i,
    /privy\.com/i,
    /convertkit\.com/i,
    /drip\.com/i,
    /activecampaign\.com/i,
    /marketo\.com/i,
    /pardot\.com/i,
    /salesforce\.com/i,
  ],
  tagManagers: [
    /googletagmanager\.com\/gtm/i,
    /segment\.com/i,
    /cdn\.segment\.com/i,
    /tealiumiq\.com/i,
    /ensighten\.com/i,
  ],
  cms: [
    /wp-content/i,
    /wp-includes/i,
    /wordpress/i,
    /webflow\.com/i,
    /squarespace\.com/i,
    /squarespace-cdn\.com/i,
    /wix\.com/i,
    /parastorage\.com/i, // Wix
    /shopify\.com/i,
    /shopifycdn\.com/i,
    /ghost\.io/i,
    /contentful\.com/i,
    /prismic\.io/i,
    /sanity\.io/i,
    /framer\.com/i,
  ],
  ecommerce: [
    /shopify/i,
    /bigcommerce/i,
    /woocommerce/i,
    /magento/i,
    /stripe\.com/i,
    /js\.stripe\.com/i,
    /paypal\.com/i,
    /paypalobjects\.com/i,
    /klarna\.com/i,
    /afterpay\.com/i,
    /sentry\.io/i,
  ],
};

interface ScriptInfo {
  url: string;
  category: string;
  loadTime: 'immediate' | 'delayed' | 'consent-triggered';
  timestamp: number;
}

interface AnalysisResult {
  url: string;
  analyzedAt: string;
  screenshots: {
    desktop: string;
    tablet: string;
    mobile: string;
  };
  scripts: {
    immediate: ScriptInfo[];
    delayed: ScriptInfo[];
    all: string[];
  };
  techStack: {
    analytics: string[];
    advertising: string[];
    marketing: string[];
    tagManagers: string[];
    cms: string[];
    ecommerce: string[];
    other: string[];
  };
  metadata: {
    title: string;
    description: string;
    ogImage: string | null;
    favicon: string | null;
  };
}

function categorizeScript(url: string): { category: string; name: string } | null {
  for (const [category, patterns] of Object.entries(SCRIPT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        // Extract a readable name from the URL
        const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
        const name = match ? match[1] : url;
        return { category, name };
      }
    }
  }
  return null;
}

async function captureScreenshot(
  page: Page,
  viewport: { width: number; height: number },
  viewportName: string,
  url: string
): Promise<string> {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(500); // Allow layout to adjust
  const buffer = await page.screenshot({ fullPage: false, type: 'png' });

  // Upload to S3 instead of base64 encoding
  const domain = new URL(url).hostname.replace(/\./g, '-');
  const timestamp = Date.now();
  const filename = `${domain}-${viewportName}-${timestamp}.png`;

  const result = await uploadToS3(buffer, filename, 'image/png');
  return result.url;
}

async function analyzeWebsite(url: string): Promise<AnalysisResult> {
  let browser: Browser | null = null;

  try {
    // Launch browser with production-optimized settings
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Overcome limited resource problems
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Important for Railway/containerized environments
        '--disable-extensions',
      ],
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    const page = await context.newPage();
    
    // Track all network requests
    const allScripts: string[] = [];
    const immediateScripts: ScriptInfo[] = [];
    const delayedScripts: ScriptInfo[] = [];
    const startTime = Date.now();
    const IMMEDIATE_THRESHOLD = 3000; // Scripts loading within 3s are "immediate"
    
    page.on('request', (request) => {
      if (request.resourceType() === 'script') {
        const scriptUrl = request.url();
        allScripts.push(scriptUrl);
        
        const categorized = categorizeScript(scriptUrl);
        const elapsed = Date.now() - startTime;
        
        if (categorized) {
          const scriptInfo: ScriptInfo = {
            url: scriptUrl,
            category: categorized.category,
            loadTime: elapsed < IMMEDIATE_THRESHOLD ? 'immediate' : 'delayed',
            timestamp: elapsed,
          };
          
          if (elapsed < IMMEDIATE_THRESHOLD) {
            immediateScripts.push(scriptInfo);
          } else {
            delayedScripts.push(scriptInfo);
          }
        }
      }
    });
    
    // Navigate to the page
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    // Wait additional time to catch lazy-loaded scripts
    await page.waitForTimeout(5000);
    
    // Try to trigger consent banner if present (common selectors)
    const consentSelectors = [
      '[class*="cookie"] button[class*="accept"]',
      '[class*="consent"] button[class*="accept"]',
      '[id*="cookie"] button[class*="accept"]',
      'button[class*="cookie-accept"]',
      '[class*="gdpr"] button',
      '#onetrust-accept-btn-handler',
      '.cc-accept',
      '[data-testid="cookie-accept"]',
    ];
    
    for (const selector of consentSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await page.waitForTimeout(3000); // Wait for consent-triggered scripts
          break;
        }
      } catch {
        // Continue trying other selectors
      }
    }
    
    // Extract metadata
    const metadata = await page.evaluate(() => {
      const getMetaContent = (name: string): string => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta?.getAttribute('content') || '';
      };
      
      return {
        title: document.title || '',
        description: getMetaContent('description') || getMetaContent('og:description'),
        ogImage: getMetaContent('og:image') || null,
        favicon: document.querySelector<HTMLLinkElement>('link[rel="icon"], link[rel="shortcut icon"]')?.href || null,
      };
    });
    
    // Capture screenshots at different viewports
    const screenshots = {
      desktop: await captureScreenshot(page, VIEWPORTS.desktop, 'desktop', url),
      tablet: await captureScreenshot(page, VIEWPORTS.tablet, 'tablet', url),
      mobile: await captureScreenshot(page, VIEWPORTS.mobile, 'mobile', url),
    };
    
    // Build tech stack summary
    const techStack: AnalysisResult['techStack'] = {
      analytics: [],
      advertising: [],
      marketing: [],
      tagManagers: [],
      cms: [],
      ecommerce: [],
      other: [],
    };
    
    const seenTools = new Set<string>();
    
    [...immediateScripts, ...delayedScripts].forEach((script) => {
      const categorized = categorizeScript(script.url);
      if (categorized && !seenTools.has(categorized.name)) {
        seenTools.add(categorized.name);
        const category = categorized.category as keyof typeof techStack;
        if (techStack[category]) {
          techStack[category].push(categorized.name);
        } else {
          techStack.other.push(categorized.name);
        }
      }
    });
    
    return {
      url,
      analyzedAt: new Date().toISOString(),
      screenshots,
      scripts: {
        immediate: immediateScripts,
        delayed: delayedScripts,
        all: [...new Set(allScripts)],
      },
      techStack,
      metadata,
    };

  } catch (error) {
    throw error;
  } finally {
    // Always close browser to prevent memory leaks
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
}

export async function POST(request: NextRequest) {
  // Auth: previously unauthenticated. POST drives a Playwright Chromium
  // navigation, which is both an SSRF primitive (can probe internal services)
  // and an unbounded resource sink. Limit to staff for now; SSRF blocklist on
  // the resolved IP belongs to W2 — see .planning/audits/security-fix-plan.md.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const role = (session.user as { role?: string } | undefined)?.role;
  if (role !== 'admin' && role !== 'editor' && role !== 'employee') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validate URL
    let validatedUrl: string;
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      validatedUrl = parsed.href;
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL provided' },
        { status: 400 }
      );
    }

    const result = await analyzeWebsite(validatedUrl);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze website' },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint for health check
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'website-analyzer',
    endpoints: {
      POST: '/api/analyze-site',
      body: { url: 'string' },
    },
  });
}