import Link from 'next/link';

const exploreLinks = [
  { label: 'About', href: '/p/about' },
  { label: 'Tours', href: '/p/tours' },
  { label: 'Reviews', href: '/p/reviews' },
  { label: 'Gallery', href: '/p/gallery' },
  { label: 'Book a Tour', href: '/p/booking' },
];

export function PetersFooter() {
  return (
    <footer className="bg-[var(--po-forest)] text-white/80">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--po-gold)]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
                </svg>
              </div>
              <div>
                <div className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-playfair), serif' }}>W.H. Peters</div>
                <div className="text-white/50 text-[10px] uppercase tracking-widest">Outdoor Adventures</div>
              </div>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              Guided kayak eco-tours in Ocean City, MD led by an experienced local naturalist and ACA Certified kayak instructor.
            </p>
          </div>

          {/* Explore */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-4">Explore</h3>
            <ul className="space-y-2">
              {exploreLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/70 hover:text-[var(--po-gold)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-4">Get in Touch</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2 text-white/70">
                <span className="material-icons text-base">phone</span>
                410-507-1025
              </li>
              <li className="flex items-center gap-2 text-white/70">
                <span className="material-icons text-base">email</span>
                info@petersoutdoor.com
              </li>
              <li className="flex items-center gap-2 text-white/70">
                <span className="material-icons text-base">location_on</span>
                Ocean Pines, MD
              </li>
            </ul>
            <div className="flex gap-3 mt-5">
              <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
              <a href="#" className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <svg className="w-4 h-4 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-white/40">
          <p>&copy; {new Date().getFullYear()} W.H. Peters Outdoor Adventures. All rights reserved.</p>
          <div className="flex gap-4 mt-2 sm:mt-0">
            <a href="#" className="hover:text-white/60">Privacy Policy</a>
            <a href="#" className="hover:text-white/60">Terms &amp; Conditions</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
