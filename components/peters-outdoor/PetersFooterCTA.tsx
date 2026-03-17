import Link from 'next/link';

export function PetersFooterCTA() {
  return (
    <section className="bg-[#3D5A3D] py-20 text-center">
      <div className="max-w-2xl mx-auto px-6">
        <h2
          className="text-3xl md:text-4xl font-bold text-white mb-4"
          style={{ fontFamily: 'var(--font-playfair), serif' }}
        >
          Ready for Your Next Adventure?
        </h2>
        <p className="text-white/70 mb-8">
          Book a guided kayak eco-tour and discover the natural beauty of Maryland&apos;s Eastern Shore.
        </p>
        <Link
          href="/p/booking"
          className="inline-block px-8 py-3 rounded-full bg-[var(--po-gold)] text-[var(--po-forest)] font-semibold hover:bg-[var(--po-gold)]/90 transition-colors"
        >
          Book Your Tour Today
        </Link>
      </div>
    </section>
  );
}
