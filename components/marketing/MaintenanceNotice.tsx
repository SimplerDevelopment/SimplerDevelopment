import { Button } from '@/components/ui/Button';

/**
 * TEMPORARY HOTFIX — gates the public Solutions marketing pages behind a
 * scheduled-maintenance notice while the per-solution product screenshots are
 * being finalized, so in-progress galleries aren't shown to visitors.
 *
 * TO LIFT: set SOLUTIONS_UNDER_MAINTENANCE to false (or delete this file and
 * the two early-return imports in app/(pages)/solutions/page.tsx and
 * app/(pages)/solutions/[slug]/page.tsx).
 */
export const SOLUTIONS_UNDER_MAINTENANCE = false;

export function MaintenanceNotice() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-dot-grid px-4 py-24">
      <div className="max-w-lg text-center">
        <span className="material-icons text-primary" style={{ fontSize: '64px' }}>
          engineering
        </span>
        <p className="text-primary font-mono text-sm font-semibold mt-6 mb-3 tracking-wider">
          {`// SCHEDULED MAINTENANCE`}
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-4 leading-tight">
          We&apos;re polishing this page
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Our Solutions pages are getting a quick refresh and will be back shortly.
          In the meantime, we&apos;d love to walk you through the platform directly.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button href="/contact" size="lg">
            Book a Demo
            <span className="material-icons text-lg ml-1">arrow_forward</span>
          </Button>
          <Button href="/" variant="outline" size="lg">
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
