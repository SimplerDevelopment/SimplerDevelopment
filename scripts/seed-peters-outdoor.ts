import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

function uid() {
  return crypto.randomUUID();
}

// Placeholder images from Unsplash (nature/kayak themed)
const IMG = {
  heroHome: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1920&q=80',
  heroAbout: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1920&q=80',
  heroTours: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1920&q=80',
  heroReviews: 'https://images.unsplash.com/photo-1500964757637-9867a8c1a0eb?w=1920&q=80',
  heroGallery: 'https://images.unsplash.com/photo-1527004013197-933c4bb611b3?w=1920&q=80',
  heroBooking: 'https://images.unsplash.com/photo-1468956398224-6d6f66e22c35?w=1920&q=80',
  tour1: 'https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=800&q=80',
  tour2: 'https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?w=800&q=80',
  tour3: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800&q=80',
  tour4: 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=800&q=80',
  horses: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=800&q=80',
  guide: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&q=80',
  sunset: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=800&q=80',
  moon: 'https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=800&q=80',
  gallery1: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80',
  gallery2: 'https://images.unsplash.com/photo-1472396961693-142e6e269027?w=800&q=80',
  gallery3: 'https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?w=800&q=80',
  gallery4: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=800&q=80',
  gallery5: 'https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=800&q=80',
  gallery6: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800&q=80',
  gallery7: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=800&q=80',
  gallery8: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80',
};

const pageSettings = {
  backgroundColor: '#FAF9F6',
  color: '#1A2E1A',
};

// ============================================================================
// HOME PAGE
// ============================================================================
const homeBlocks = [
  {
    id: uid(), type: 'hero', order: 0,
    title: 'Paddle. Explore. Learn.',
    subtitle: 'Guided kayak eco-tours through pristine maritime waterways and coastal habitats.',
    ctaText: 'Book a Tour',
    ctaLink: '/p/booking',
    secondaryCtaText: 'Explore Tours',
    secondaryCtaLink: '/p/tours',
    backgroundImage: IMG.heroHome,
    style: { padding: '120px 0 80px 0' },
  },
  {
    id: uid(), type: 'services-grid', order: 1,
    services: [
      { id: uid(), title: 'ACA Certified', description: 'Professional paddling instruction and safety protocols.', icon: 'verified' },
      { id: uid(), title: 'Local Naturalist', description: 'Expert knowledge of local ecosystems and wildlife.', icon: 'eco' },
      { id: uid(), title: 'Small Groups', description: 'Intimate group sizes for a personalized experience.', icon: 'groups' },
      { id: uid(), title: 'Sunset & Full Moon', description: 'Magical evening and nighttime paddling adventures.', icon: 'nights_stay' },
    ],
    columns: 4,
    style: { padding: '48px 24px', maxWidth: '1200px', margin: '0 auto' },
  },
  {
    id: uid(), type: 'section', order: 2,
    blocks: [
      {
        id: uid(), type: 'heading', order: 0,
        content: 'Discover Maryland\'s Hidden Waterways',
        level: 2,
        alignment: 'center',
        style: { fontFamily: 'var(--font-playfair), serif', fontSize: '2.25rem', margin: '0 0 8px 0' },
      },
      {
        id: uid(), type: 'text', order: 1,
        content: 'Each tour is a unique journey through diverse ecosystems, rich history, and stunning natural beauty.',
        alignment: 'center',
        style: { color: '#7A9B6D', margin: '0 0 32px 0' },
      },
      {
        id: uid(), type: 'card-grid', order: 2,
        cards: [
          { id: uid(), title: 'Pocomoke River', description: 'Explore the northernmost bald cypress swamp on the East Coast.', image: IMG.tour2, link: '/p/tours' },
          { id: uid(), title: 'Assateague Island', description: 'Paddle alongside wild horses and pristine barrier island beaches.', image: IMG.horses, link: '/p/tours' },
          { id: uid(), title: 'Newport Bay', description: 'Discover salt marshes and coastal waterbird habitats.', image: IMG.tour1, link: '/p/tours' },
        ],
        columns: 3,
      },
    ],
    maxWidth: '1200px',
    paddingTop: '64px',
    paddingBottom: '64px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  {
    id: uid(), type: 'featured-content', order: 3,
    title: 'A Legacy of Love for Nature',
    description: 'W.H. Peters Outdoor Adventures is inspired by the naturalist roots of the Peters family — from fishing local waterways to exploring every trail within Ocean City. Founded as a way to share this love of nature through eco-tours, each trip connects people with the wild world just beyond the boardwalk.',
    imageUrl: IMG.guide,
    imagePosition: 'right',
    buttonText: 'About Our Story',
    buttonUrl: '/p/about',
    stats: [
      { id: uid(), value: '15+', label: 'Years Experience' },
      { id: uid(), value: '500+', label: 'Happy Guests' },
    ],
    style: { padding: '64px 24px', maxWidth: '1200px', margin: '0 auto' },
  },
  {
    id: uid(), type: 'section', order: 4,
    blocks: [
      {
        id: uid(), type: 'heading', order: 0,
        content: 'What Our Guests Say',
        level: 2,
        alignment: 'center',
        style: { fontFamily: 'var(--font-playfair), serif', fontSize: '2.25rem', margin: '0 0 32px 0' },
      },
      {
        id: uid(), type: 'columns', order: 1,
        columns: [
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"The kayak tour was amazing! I learned so much and felt completely at ease. The guide\'s knowledge of the local ecosystem was incredible."</p><p><strong>Emily Johnson</strong><br/><em style="color: #7A9B6D">Newport Bay Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"A fantastic experience! The guide was knowledgeable and the scenery was breathtaking. We saw a family of deer along the way."</p><p><strong>Michael Chen</strong><br/><em style="color: #7A9B6D">Pocomoke River Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"Highly recommend! The kayak instruction was top notch and very educational. As a first-time kayaker, I felt safe and supported."</p><p><strong>Sophie Martinez</strong><br/><em style="color: #7A9B6D">Sunset Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
        ],
        gap: 'md',
      },
    ],
    backgroundColor: '#FAF9F6',
    maxWidth: '1200px',
    paddingTop: '64px',
    paddingBottom: '64px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  {
    id: uid(), type: 'columns', order: 5,
    columns: [
      {
        id: uid(), width: 50, blocks: [
          {
            id: uid(), type: 'section', order: 0,
            blocks: [
              { id: uid(), type: 'heading', order: 0, content: 'Sunset Tours', level: 3, style: { fontFamily: 'var(--font-playfair), serif', color: '#ffffff', fontSize: '1.75rem' } },
              { id: uid(), type: 'text', order: 1, content: 'Watch the sun descend as you paddle through serene waters at golden hour.', style: { color: '#ffffff' } },
              { id: uid(), type: 'button', order: 2, text: 'Book Sunset Tour', url: '/p/booking', variant: 'primary', style: { backgroundColor: '#C8A951', color: '#2D4A2D', borderRadius: '9999px' } },
            ],
            backgroundImage: IMG.sunset,
            backgroundSize: 'cover',
            paddingTop: '120px',
            paddingBottom: '40px',
            paddingLeft: '32px',
            paddingRight: '32px',
            cssClass: 'rounded-xl overflow-hidden',
          },
        ],
      },
      {
        id: uid(), width: 50, blocks: [
          {
            id: uid(), type: 'section', order: 0,
            blocks: [
              { id: uid(), type: 'heading', order: 0, content: 'Full Moon Tours', level: 3, style: { fontFamily: 'var(--font-playfair), serif', color: '#ffffff', fontSize: '1.75rem' } },
              { id: uid(), type: 'text', order: 1, content: 'A magical nighttime paddling experience under the light of the full moon.', style: { color: '#ffffff' } },
              { id: uid(), type: 'button', order: 2, text: 'Book Full Moon Tour', url: '/p/booking', variant: 'primary', style: { backgroundColor: '#C8A951', color: '#2D4A2D', borderRadius: '9999px' } },
            ],
            backgroundImage: IMG.moon,
            backgroundSize: 'cover',
            paddingTop: '120px',
            paddingBottom: '40px',
            paddingLeft: '32px',
            paddingRight: '32px',
            cssClass: 'rounded-xl overflow-hidden',
          },
        ],
      },
    ],
    gap: 'md',
    style: { padding: '0 24px 64px', maxWidth: '1200px', margin: '0 auto' },
  },
];

// ============================================================================
// ABOUT PAGE
// ============================================================================
const aboutBlocks = [
  {
    id: uid(), type: 'hero', order: 0,
    title: 'Discover Our Journey',
    subtitle: 'Our Story',
    backgroundImage: IMG.heroAbout,
    style: { padding: '120px 0 80px 0' },
  },
  {
    id: uid(), type: 'section', order: 1,
    blocks: [
      {
        id: uid(), type: 'text', order: 0,
        content: '<p style="text-align:center;color:#7A9B6D;text-transform:uppercase;letter-spacing:0.15em;font-size:0.75rem;font-weight:600">OUR MISSION</p>',
      },
      {
        id: uid(), type: 'heading', order: 1,
        content: 'Inspiring Connection to Nature',
        level: 2,
        alignment: 'center',
        style: { fontFamily: 'var(--font-playfair), serif', fontSize: '2.25rem', margin: '8px 0 24px 0' },
      },
      {
        id: uid(), type: 'text', order: 2,
        content: '<p>W.H. Peters Outdoor Adventures was founded on a profound love of exploring, observing, and learning from our local environment. Guided by a local naturalist with ACA Certified kayak instructor credentials, we deliver the finest eco-tours — setting ourselves apart with genuine knowledge of the ecosystems, hands-on paddling guidance, and an unwavering passion for environmental understanding and preservation that feels part of the natural world itself — not something manufactured, while still remaining accessible and inviting.</p>',
        style: { maxWidth: '800px', margin: '0 auto 24px', lineHeight: '1.8' },
      },
      {
        id: uid(), type: 'quote', order: 3,
        content: 'When someone begins to view nature as <em>theirs</em> — as something special and worth protecting — that\'s where real change begins.',
        style: { maxWidth: '700px', margin: '32px auto', borderColor: '#C8A951', backgroundColor: '#2D4A2D', color: '#ffffff', padding: '32px', borderRadius: '12px' },
      },
      {
        id: uid(), type: 'text', order: 4,
        content: '<p>Through W.H. Peters Outdoor Adventures, nature is not merely on display for our guests\' entertainment, but rather a source of awe, wonder and respect. Every paddle stroke is an opportunity to learn, observe, and connect with the world around us.</p>',
        style: { maxWidth: '800px', margin: '24px auto 0', lineHeight: '1.8' },
      },
    ],
    maxWidth: '1200px',
    paddingTop: '64px',
    paddingBottom: '64px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  {
    id: uid(), type: 'section', order: 2,
    blocks: [
      {
        id: uid(), type: 'heading', order: 0,
        content: 'My Story',
        level: 2,
        style: { fontFamily: 'var(--font-playfair), serif', fontSize: '2.25rem', margin: '0 0 24px 0' },
      },
      {
        id: uid(), type: 'columns', order: 1,
        columns: [
          {
            id: uid(), width: 60, blocks: [
              {
                id: uid(), type: 'text', order: 0,
                content: '<p>Bill Peters, a kid who grew up in Salisbury, MD in Baltimore, left for school, life, and returned. The son of parents who loved the outdoors, their connection to the Eastern Shore has deep roots.</p><p>The Peters family has fished these waters, explored these marshes and observed wildlife here for generations. What started as childhood adventures along the Wicomico River grew into a professional passion. After years in outdoor education, Bill founded W.H. Peters Outdoor Adventures to share his intimate knowledge of Maryland\'s coastal ecosystems.</p><p>As an ACA-certified kayak instructor, Bill ensures every trip combines safety, education, and wonder. He doesn\'t just show you where the eagles nest — he helps you understand why they chose that spot, how the tides shape their habitat, and what we can do to protect it all.</p><p>Every tour is personal. Whether it\'s your first time in a kayak or you\'ve paddled for decades, Bill meets you where you are and creates an experience that connects you more deeply with the natural world.</p>',
                style: { lineHeight: '1.8' },
              },
            ],
          },
          {
            id: uid(), width: 40, blocks: [
              { id: uid(), type: 'image', order: 0, url: IMG.guide, alt: 'Bill Peters - Guide and Naturalist', style: { borderRadius: '12px' } },
            ],
            padding: 'md',
          },
        ],
        gap: 'lg',
      },
    ],
    maxWidth: '1200px',
    paddingTop: '64px',
    paddingBottom: '64px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
];

// ============================================================================
// TOURS PAGE
// ============================================================================
const toursBlocks = [
  {
    id: uid(), type: 'hero', order: 0,
    title: 'Explore Nature\'s Wonders',
    subtitle: 'Guided Eco-Tours',
    backgroundImage: IMG.heroTours,
    style: { padding: '120px 0 80px 0' },
  },
  {
    id: uid(), type: 'section', order: 1,
    blocks: [
      {
        id: uid(), type: 'text', order: 0,
        content: '<p style="max-width:800px;margin:0 auto 32px;text-align:center">Join us for an unforgettable kayak eco-tour led by an experienced, local naturalist and ACA certified coastal kayak instructor. Experience diverse ecosystems, learn about local wildlife and cultural history, all while surrounding yourself in the captivating beauty of nature\'s unique wonders.</p>',
      },
      {
        id: uid(), type: 'services-grid', order: 1,
        services: [
          { id: uid(), title: 'All Skill Levels', description: '', icon: 'school' },
          { id: uid(), title: 'Equipment Provided', description: '', icon: 'kayaking' },
          { id: uid(), title: 'Small Groups', description: '', icon: 'groups' },
          { id: uid(), title: 'ACA Certified', description: '', icon: 'verified' },
          { id: uid(), title: 'Family Friendly', description: '', icon: 'family_restroom' },
          { id: uid(), title: 'Custom Available', description: '', icon: 'tune' },
        ],
        columns: 3,
      },
    ],
    maxWidth: '1200px',
    paddingTop: '48px',
    paddingBottom: '24px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  // Tour 1: Newport Bay
  {
    id: uid(), type: 'columns', order: 2,
    columns: [
      {
        id: uid(), width: 45, blocks: [
          { id: uid(), type: 'image', order: 0, url: IMG.tour1, alt: 'Newport Bay Salt Marsh', width: 'full', style: { borderRadius: '12px' } },
        ],
      },
      {
        id: uid(), width: 55, blocks: [
          { id: uid(), type: 'heading', order: 0, content: 'Newport Bay Salt Marsh', level: 3, style: { fontFamily: 'var(--font-playfair), serif', fontSize: '1.75rem' } },
          { id: uid(), type: 'text', order: 1, content: '<p>Kayak through a pristine golden-green Newport Bay\'s salt marsh. Observe blue herons, osprey, egrets, various terns, and other wildlife while exploring the estuary that feeds the Isle of Wight Bay.</p><p style="color:#7A9B6D;margin-top:16px"><strong>Duration:</strong> 2-3 hours &nbsp; <strong>Difficulty:</strong> Easy &nbsp; <strong>Max Group:</strong> 6</p>' },
          { id: uid(), type: 'button', order: 2, text: 'Book This Tour', url: '/p/booking', style: { backgroundColor: '#C8A951', color: '#2D4A2D', borderRadius: '9999px' } },
        ],
        verticalAlign: 'center',
        padding: 'md',
      },
    ],
    gap: 'lg',
    style: { padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' },
  },
  // Tour 2: Pocomoke River
  {
    id: uid(), type: 'columns', order: 3,
    columns: [
      {
        id: uid(), width: 55, blocks: [
          { id: uid(), type: 'heading', order: 0, content: 'Pocomoke River Bald Cypress Swamp', level: 3, style: { fontFamily: 'var(--font-playfair), serif', fontSize: '1.75rem' } },
          { id: uid(), type: 'text', order: 1, content: '<p>Navigate the ancient waterways of the Pocomoke River. Home to the northernmost stand of bald cypress trees in the United States. Watch for bald eagles, river otters, and turtles as you glide through this prehistoric landscape.</p><p style="color:#7A9B6D;margin-top:16px"><strong>Duration:</strong> 3-4 hours &nbsp; <strong>Difficulty:</strong> Moderate &nbsp; <strong>Max Group:</strong> 6</p>' },
          { id: uid(), type: 'button', order: 2, text: 'Book This Tour', url: '/p/booking', style: { backgroundColor: '#C8A951', color: '#2D4A2D', borderRadius: '9999px' } },
        ],
        verticalAlign: 'center',
        padding: 'md',
      },
      {
        id: uid(), width: 45, blocks: [
          { id: uid(), type: 'image', order: 0, url: IMG.tour2, alt: 'Pocomoke River Cypress Swamp', width: 'full', style: { borderRadius: '12px' } },
        ],
      },
    ],
    gap: 'lg',
    style: { padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' },
  },
  // Tour 3: St. Martin River
  {
    id: uid(), type: 'columns', order: 4,
    columns: [
      {
        id: uid(), width: 45, blocks: [
          { id: uid(), type: 'image', order: 0, url: IMG.tour3, alt: 'St. Martin River', width: 'full', style: { borderRadius: '12px' } },
        ],
      },
      {
        id: uid(), width: 55, blocks: [
          { id: uid(), type: 'heading', order: 0, content: 'St. Martin River', level: 3, style: { fontFamily: 'var(--font-playfair), serif', fontSize: '1.75rem' } },
          { id: uid(), type: 'text', order: 1, content: '<p>Paddle the calm waters of the St. Martin River and take in a scenic blend of maritime forest, tidal creeks, and coastal birds. This is a gentle, relaxing tour perfect for beginners and nature lovers.</p><p style="color:#7A9B6D;margin-top:16px"><strong>Duration:</strong> 2-3 hours &nbsp; <strong>Difficulty:</strong> Easy &nbsp; <strong>Max Group:</strong> 6</p>' },
          { id: uid(), type: 'button', order: 2, text: 'Book This Tour', url: '/p/booking', style: { backgroundColor: '#C8A951', color: '#2D4A2D', borderRadius: '9999px' } },
        ],
        verticalAlign: 'center',
        padding: 'md',
      },
    ],
    gap: 'lg',
    style: { padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' },
  },
  // Tour 4: Assateague Island
  {
    id: uid(), type: 'columns', order: 5,
    columns: [
      {
        id: uid(), width: 55, blocks: [
          { id: uid(), type: 'heading', order: 0, content: 'Assateague Island National Seashore', level: 3, style: { fontFamily: 'var(--font-playfair), serif', fontSize: '1.75rem' } },
          { id: uid(), type: 'text', order: 1, content: '<p>Explore Assateague\'s legendary wild horses, expansive salt marshes, and stunning barriers island coastline. Paddle through bays, cross tidal creeks, and stop to observe shorebirds and the famous wild ponies in their natural habitat.</p><p style="color:#7A9B6D;margin-top:16px"><strong>Duration:</strong> 3-4 hours &nbsp; <strong>Difficulty:</strong> Moderate &nbsp; <strong>Max Group:</strong> 6</p>' },
          { id: uid(), type: 'button', order: 2, text: 'Book This Tour', url: '/p/booking', style: { backgroundColor: '#C8A951', color: '#2D4A2D', borderRadius: '9999px' } },
        ],
        verticalAlign: 'center',
        padding: 'md',
      },
      {
        id: uid(), width: 45, blocks: [
          { id: uid(), type: 'image', order: 0, url: IMG.tour4, alt: 'Assateague Island', width: 'full', style: { borderRadius: '12px' } },
        ],
      },
    ],
    gap: 'lg',
    style: { padding: '32px 24px', maxWidth: '1200px', margin: '0 auto' },
  },
  // Sunset & Full Moon section
  {
    id: uid(), type: 'section', order: 6,
    blocks: [
      {
        id: uid(), type: 'heading', order: 0,
        content: 'Sunset & Full Moon Tours',
        level: 2,
        alignment: 'center',
        style: { fontFamily: 'var(--font-playfair), serif', fontStyle: 'italic', fontSize: '2.25rem', margin: '0 0 32px 0' },
      },
      {
        id: uid(), type: 'columns', order: 1,
        columns: [
          {
            id: uid(), width: 50, blocks: [
              {
                id: uid(), type: 'section', order: 0,
                blocks: [
                  { id: uid(), type: 'heading', order: 0, content: 'Sunset Kayak Tour', level: 3, style: { fontFamily: 'var(--font-playfair), serif', color: '#ffffff' } },
                  { id: uid(), type: 'text', order: 1, content: 'Watch the sun descend as you paddle through serene waters at golden hour.', style: { color: '#ffffff' } },
                ],
                backgroundImage: IMG.sunset,
                backgroundSize: 'cover',
                paddingTop: '100px',
                paddingBottom: '24px',
                paddingLeft: '24px',
                paddingRight: '24px',
                cssClass: 'rounded-xl overflow-hidden',
              },
            ],
          },
          {
            id: uid(), width: 50, blocks: [
              {
                id: uid(), type: 'section', order: 0,
                blocks: [
                  { id: uid(), type: 'heading', order: 0, content: 'Full Moon Kayak Tour', level: 3, style: { fontFamily: 'var(--font-playfair), serif', color: '#ffffff' } },
                  { id: uid(), type: 'text', order: 1, content: 'A magical nighttime paddle under the glow of the full moon.', style: { color: '#ffffff' } },
                ],
                backgroundImage: IMG.moon,
                backgroundSize: 'cover',
                paddingTop: '100px',
                paddingBottom: '24px',
                paddingLeft: '24px',
                paddingRight: '24px',
                cssClass: 'rounded-xl overflow-hidden',
              },
            ],
          },
        ],
        gap: 'md',
      },
    ],
    maxWidth: '1200px',
    paddingTop: '64px',
    paddingBottom: '64px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
  // Important Information
  {
    id: uid(), type: 'section', order: 7,
    blocks: [
      {
        id: uid(), type: 'accordion', order: 0,
        title: 'Important Information',
        items: [
          { id: uid(), title: 'What to Bring', content: 'Water shoes or sandals with straps, sunscreen, hat, sunglasses with strap, water bottle. Dress for the weather. We supply all paddling equipment.' },
          { id: uid(), title: 'Safety & Requirements', content: 'All participants must be able to swim. Children under 16 must be accompanied by an adult. Life jackets (PFDs) are provided and required for all participants.' },
          { id: uid(), title: 'Cancellation Policy', content: 'Full refund if cancelled 48 hours before tour time. 50% refund within 24-48 hours. No refund within 24 hours. We reserve the right to cancel for unsafe weather conditions with full refund.' },
          { id: uid(), title: 'Meeting Location', content: 'Exact meeting location details are provided via email after booking. Generally, we meet at a public boat launch in Ocean Pines or nearby, depending on the tour.' },
          { id: uid(), title: 'Custom Tours', content: 'All tours are customizable. Dates, times, and locations can be adjusted to accommodate your group. Contact us to build your perfect adventure.' },
        ],
      },
    ],
    maxWidth: '800px',
    paddingTop: '48px',
    paddingBottom: '64px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
];

// ============================================================================
// REVIEWS PAGE
// ============================================================================
const reviewsBlocks = [
  {
    id: uid(), type: 'hero', order: 0,
    title: 'What Our Guests Say',
    subtitle: 'Testimonials',
    backgroundImage: IMG.heroReviews,
    style: { padding: '120px 0 80px 0' },
  },
  {
    id: uid(), type: 'stats', order: 1,
    stats: [
      { id: uid(), value: '5.0', label: 'Average Rating' },
      { id: uid(), value: '100%', label: 'Would Recommend' },
      { id: uid(), value: '500+', label: 'Happy Guests' },
    ],
    columns: 3,
    style: { padding: '48px 24px', maxWidth: '800px', margin: '0 auto' },
  },
  {
    id: uid(), type: 'text', order: 2,
    content: '<p style="text-align:center;max-width:700px;margin:0 auto">At W.H. Peters Outdoor Adventures, we prioritize your experience. Here\'s what our wonderful guests have to say about their eco-tours and kayak adventures.</p>',
    style: { padding: '0 24px 48px' },
  },
  {
    id: uid(), type: 'section', order: 3,
    blocks: [
      {
        id: uid(), type: 'columns', order: 0,
        columns: [
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"The kayak tour was amazing! I learned so much and felt completely at ease. The guide\'s knowledge of the local ecosystem was incredible — I never knew there was so much hidden beauty right here on the Eastern Shore."</p><p style="margin-top:16px"><strong>Emily Johnson</strong><br/><em style="color: #7A9B6D">Newport Bay Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"A fantastic adventure! The guide was knowledgeable and the scenery was breathtaking. We saw so many birds and even a family of deer along the river. This was the highlight of our vacation!"</p><p style="margin-top:16px"><strong>Michael Chen</strong><br/><em style="color: #7A9B6D">Pocomoke River Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"Highly recommend! The kayak instruction was top notch and very educational. As a first-time kayaker, I felt safe and supported the entire time. Can\'t wait to come back for the full moon tour!"</p><p style="margin-top:16px"><strong>Sophie Martinez</strong><br/><em style="color: #7A9B6D">Sunset Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
        ],
        gap: 'md',
      },
      {
        id: uid(), type: 'columns', order: 1,
        columns: [
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"We booked the Assateague Island trip for our anniversary and it was absolutely magical. Seeing the wild horses from the water was an experience we\'ll never forget. The guide\'s passion for conservation really shines through."</p><p style="margin-top:16px"><strong>David & Sarah Thompson</strong><br/><em style="color: #7A9B6D">Assateague Island Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"The full moon kayak tour was otherworldly. Paddling under the moonlight with the sounds of nature all around us was an experience I can\'t describe. Truly a must-do if you\'re in the Ocean City area!"</p><p style="margin-top:16px"><strong>Rachel Kim</strong><br/><em style="color: #7A9B6D">Full Moon Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
          {
            id: uid(), width: 33, blocks: [
              { id: uid(), type: 'text', order: 0, content: '<p>&#9733;&#9733;&#9733;&#9733;&#9733;</p><p>"We brought our kids (ages 10 and 13) on the St. Martin River tour. They learned so much about the local wildlife and history. It\'s rare to find an activity the whole family genuinely enjoys — this was it."</p><p style="margin-top:16px"><strong>James & Linda Peterson</strong><br/><em style="color: #7A9B6D">St. Martin River Tour</em></p>', style: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } },
            ],
          },
        ],
        gap: 'md',
      },
    ],
    maxWidth: '1200px',
    paddingTop: '0',
    paddingBottom: '64px',
    paddingLeft: '24px',
    paddingRight: '24px',
  },
];

// ============================================================================
// GALLERY PAGE
// ============================================================================
const galleryBlocks = [
  {
    id: uid(), type: 'hero', order: 0,
    title: 'Gallery',
    subtitle: 'Moments on the Water',
    backgroundImage: IMG.heroGallery,
    style: { padding: '120px 0 80px 0' },
  },
  {
    id: uid(), type: 'gallery', order: 1,
    images: [
      { id: uid(), url: IMG.gallery1, alt: 'Kayaking at sunset on the bay', caption: 'Golden hour on the bay' },
      { id: uid(), url: IMG.gallery2, alt: 'Wildlife along the river', caption: 'Wildlife encounters' },
      { id: uid(), url: IMG.gallery3, alt: 'Cypress swamp paddling', caption: 'Pocomoke River cypress swamp' },
      { id: uid(), url: IMG.gallery4, alt: 'Wild horses of Assateague', caption: 'Assateague wild horses' },
      { id: uid(), url: IMG.gallery5, alt: 'Coastal marshlands', caption: 'Coastal salt marshes' },
      { id: uid(), url: IMG.gallery6, alt: 'Forest canopy over water', caption: 'Canopy trails' },
      { id: uid(), url: IMG.gallery7, alt: 'Sunset kayak tour', caption: 'Sunset kayak tour' },
      { id: uid(), url: IMG.gallery8, alt: 'Mountain lake reflection', caption: 'Calm waters reflection' },
    ],
    layout: 'masonry',
    columns: 3,
    lightbox: true,
    gap: 'md',
    style: { padding: '48px 24px', maxWidth: '1200px', margin: '0 auto' },
  },
];

// ============================================================================
// BOOKING PAGE
// ============================================================================
const bookingBlocks = [
  {
    id: uid(), type: 'hero', order: 0,
    title: 'Book a Tour',
    subtitle: 'Reserve Your Spot',
    backgroundImage: IMG.heroBooking,
    style: { padding: '120px 0 80px 0' },
  },
  {
    id: uid(), type: 'columns', order: 1,
    columns: [
      {
        id: uid(), width: 65, blocks: [
          {
            id: uid(), type: 'heading', order: 0,
            content: 'Choose Your Adventure',
            level: 2,
            style: { fontFamily: 'var(--font-playfair), serif', fontSize: '2rem', margin: '0 0 24px 0' },
          },
          // Tour listing items as text blocks with styled cards
          { id: uid(), type: 'text', order: 1, content: '<div style="padding:20px;background:#fff;border-radius:12px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div><h3 style="font-family:var(--font-playfair),serif;font-size:1.25rem;margin:0 0 4px">Newport Bay Salt Marsh Tour</h3><p style="color:#7A9B6D;font-size:0.875rem;margin:0">Salt marsh, tidal creeks, osprey & herons</p><p style="font-size:0.75rem;color:#999;margin:4px 0 0">&#128337; 2-3 hours &nbsp; &#128101; Up to 6 guests</p></div><a href="#" style="padding:8px 20px;background:#C8A951;color:#2D4A2D;border-radius:9999px;text-decoration:none;font-weight:600;font-size:0.875rem">Inquire Now</a></div></div>' },
          { id: uid(), type: 'text', order: 2, content: '<div style="padding:20px;background:#fff;border-radius:12px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div><h3 style="font-family:var(--font-playfair),serif;font-size:1.25rem;margin:0 0 4px">Pocomoke Cypress Swamp Tour</h3><p style="color:#7A9B6D;font-size:0.875rem;margin:0">Bald cypress, eagles, river otters & turtles</p><p style="font-size:0.75rem;color:#999;margin:4px 0 0">&#128337; 3-4 hours &nbsp; &#128101; Up to 6 guests</p></div><a href="#" style="padding:8px 20px;background:#C8A951;color:#2D4A2D;border-radius:9999px;text-decoration:none;font-weight:600;font-size:0.875rem">Inquire Now</a></div></div>' },
          { id: uid(), type: 'text', order: 3, content: '<div style="padding:20px;background:#fff;border-radius:12px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div><h3 style="font-family:var(--font-playfair),serif;font-size:1.25rem;margin:0 0 4px">St. Martin River Tour</h3><p style="color:#7A9B6D;font-size:0.875rem;margin:0">Maritime, forests, eagles & tidal history</p><p style="font-size:0.75rem;color:#999;margin:4px 0 0">&#128337; 2-3 hours &nbsp; &#128101; Up to 6 guests</p></div><a href="#" style="padding:8px 20px;background:#C8A951;color:#2D4A2D;border-radius:9999px;text-decoration:none;font-weight:600;font-size:0.875rem">Inquire Now</a></div></div>' },
          { id: uid(), type: 'text', order: 4, content: '<div style="padding:20px;background:#fff;border-radius:12px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div><h3 style="font-family:var(--font-playfair),serif;font-size:1.25rem;margin:0 0 4px">Assateague Island Tour</h3><p style="color:#7A9B6D;font-size:0.875rem;margin:0">Wild horses, barrier island ecology</p><p style="font-size:0.75rem;color:#999;margin:4px 0 0">&#128337; 3-4 hours &nbsp; &#128101; Up to 6 guests</p></div><a href="#" style="padding:8px 20px;background:#C8A951;color:#2D4A2D;border-radius:9999px;text-decoration:none;font-weight:600;font-size:0.875rem">Inquire Now</a></div></div>' },
          { id: uid(), type: 'text', order: 5, content: '<div style="padding:20px;background:#fff;border-radius:12px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div><h3 style="font-family:var(--font-playfair),serif;font-size:1.25rem;margin:0 0 4px">Sunset Kayak Tour</h3><p style="color:#7A9B6D;font-size:0.875rem;margin:0">Golden hour, stunning skies, serene waters</p><p style="font-size:0.75rem;color:#999;margin:4px 0 0">&#128337; 2-3 hours &nbsp; &#128101; Up to 4 guests</p></div><a href="#" style="padding:8px 20px;background:#C8A951;color:#2D4A2D;border-radius:9999px;text-decoration:none;font-weight:600;font-size:0.875rem">Inquire Now</a></div></div>' },
          { id: uid(), type: 'text', order: 6, content: '<div style="padding:20px;background:#fff;border-radius:12px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08)"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div><h3 style="font-family:var(--font-playfair),serif;font-size:1.25rem;margin:0 0 4px">Full Moon Kayak Tour</h3><p style="color:#7A9B6D;font-size:0.875rem;margin:0">Moonlit paddle, night sounds, magical atmosphere</p><p style="font-size:0.75rem;color:#999;margin:4px 0 0">&#128337; 2-3 hours &nbsp; &#128101; Up to 4 guests</p></div><a href="#" style="padding:8px 20px;background:#C8A951;color:#2D4A2D;border-radius:9999px;text-decoration:none;font-weight:600;font-size:0.875rem">Inquire Now</a></div></div>' },
          { id: uid(), type: 'text', order: 7, content: '<p style="margin-top:24px;padding:16px;background:#f0f4ef;border-radius:8px;font-size:0.875rem"><strong style="color:#C8A951">&#9733; Custom Tours Available:</strong> All tours are customizable. Dates, times, and locations can be adjusted to accommodate your group. Contact us to build your perfect adventure.</p>' },
        ],
      },
      {
        id: uid(), width: 35, blocks: [
          {
            id: uid(), type: 'section', order: 0,
            blocks: [
              { id: uid(), type: 'heading', order: 0, content: 'Ready to Paddle?', level: 3, style: { fontFamily: 'var(--font-playfair), serif', fontStyle: 'italic', color: '#ffffff', fontSize: '1.5rem' } },
              { id: uid(), type: 'text', order: 1, content: '<p style="color:rgba(255,255,255,0.8)">Contact us to check availability, ask questions, or book your guided kayak eco-tour. We\'ll help you choose the perfect adventure.</p>', style: { margin: '0 0 16px 0' } },
              { id: uid(), type: 'text', order: 2, content: '<p style="color:rgba(255,255,255,0.9)"><strong>Phone:</strong> 410-507-1025</p><p style="color:rgba(255,255,255,0.9)"><strong>Email:</strong> info@petersoutdoor.com</p>', style: { margin: '0 0 24px 0' } },
              { id: uid(), type: 'heading', order: 3, content: 'What\'s Included', level: 4, style: { color: '#C8A951', fontSize: '1rem' } },
              { id: uid(), type: 'text', order: 4, content: '<ul style="color:rgba(255,255,255,0.8);padding-left:20px"><li>Kayak & paddle equipment</li><li>Safety gear (PFD)</li><li>Expert naturalist guide</li><li>Wildlife & ecology education</li></ul>' },
              { id: uid(), type: 'heading', order: 5, content: 'What to Bring', level: 4, style: { color: '#C8A951', fontSize: '1rem', marginTop: '16px' } },
              { id: uid(), type: 'text', order: 6, content: '<ul style="color:rgba(255,255,255,0.8);padding-left:20px"><li>Water shoes/sandals with straps</li><li>Sunscreen & hat</li><li>Water bottle</li><li>Camera (waterproof recommended)</li></ul>' },
            ],
            backgroundColor: '#3D5A3D',
            paddingTop: '32px',
            paddingBottom: '32px',
            paddingLeft: '24px',
            paddingRight: '24px',
            cssClass: 'rounded-xl',
          },
        ],
      },
    ],
    gap: 'lg',
    style: { padding: '48px 24px', maxWidth: '1200px', margin: '0 auto' },
  },
];

// ============================================================================
// SEED FUNCTION
// ============================================================================
const pages = [
  { slug: 'home', title: 'Home', blocks: homeBlocks },
  { slug: 'about', title: 'About', blocks: aboutBlocks },
  { slug: 'tours', title: 'Tours', blocks: toursBlocks },
  { slug: 'reviews', title: 'Reviews', blocks: reviewsBlocks },
  { slug: 'gallery', title: 'Gallery', blocks: galleryBlocks },
  { slug: 'booking', title: 'Booking', blocks: bookingBlocks },
];

async function seedPetersOutdoor() {
  try {
    const { db } = await import('../lib/db');
    const { posts } = await import('../lib/db/schema');
    const { eq, and } = await import('drizzle-orm');

    for (const page of pages) {
      const content = JSON.stringify({
        blocks: page.blocks,
        pageSettings,
        version: '1.0',
      });

      // Check if page already exists
      const existing = await db
        .select()
        .from(posts)
        .where(and(eq(posts.slug, page.slug), eq(posts.postType, 'page')))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(posts)
          .set({
            title: page.title,
            content,
            published: true,
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(posts.id, existing[0].id));
        console.log(`Updated page: ${page.slug}`);
      } else {
        // Insert new
        await db.insert(posts).values({
          title: page.title,
          slug: page.slug,
          postType: 'page',
          content,
          published: true,
          publishedAt: new Date(),
        });
        console.log(`Created page: ${page.slug}`);
      }
    }

    console.log('\nPeters Outdoor pages seeded successfully!');
    console.log('Visit: /p/home, /p/about, /p/tours, /p/reviews, /p/gallery, /p/booking');
  } catch (error) {
    console.error('Error seeding Peters Outdoor pages:', error);
  }

  process.exit(0);
}

seedPetersOutdoor();
