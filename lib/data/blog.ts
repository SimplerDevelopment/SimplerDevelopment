export interface BlogCategory {
  slug: string;
  name: string;
  description: string;
  color: string;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  category: string;
  author: string;
  authorImage?: string;
  publishedAt: string;
  readTime: number;
  tags: { tag: string }[];
  featured?: boolean;
}

export const blogCategories: BlogCategory[] = [
  {
    slug: 'design',
    name: 'Design',
    description: 'UI/UX design trends, tips, and best practices',
    color: '#22c55e',
  },
  {
    slug: 'development',
    name: 'Development',
    description: 'Web and mobile development tutorials and insights',
    color: '#3b82f6',
  },
  {
    slug: 'ai-automation',
    name: 'AI & Automation',
    description: 'Artificial intelligence and workflow automation',
    color: '#a855f7',
  },
  {
    slug: 'growth',
    name: 'Growth & Marketing',
    description: 'Digital marketing strategies and growth hacking',
    color: '#ec4899',
  },
  {
    slug: 'case-studies',
    name: 'Case Studies',
    description: 'Real-world project success stories',
    color: '#f97316',
  },
];

export const blogPosts: BlogPost[] = [
  {
    id: '1',
    slug: 'modern-web-design-trends-2026',
    title: 'Modern Web Design Trends for 2026',
    excerpt: 'Explore the latest web design trends shaping the digital landscape in 2026, from immersive 3D experiences to minimalist interfaces.',
    content: `
      <h2>The Evolution of Web Design</h2>
      <p>Web design continues to evolve rapidly, with 2026 bringing exciting new trends that blend aesthetics with functionality. Let's explore the key trends shaping the future of web design.</p>

      <h3>1. Immersive 3D Experiences</h3>
      <p>Three-dimensional elements are no longer a luxury but a standard expectation. From product showcases to interactive backgrounds, 3D graphics powered by WebGL and Three.js are creating more engaging user experiences.</p>

      <h3>2. Dark Mode by Default</h3>
      <p>With user preference for dark themes continuing to grow, many sites are now designing with dark mode as the primary interface, offering light mode as an alternative.</p>

      <h3>3. Micro-interactions and Animations</h3>
      <p>Subtle animations and micro-interactions provide feedback and enhance the overall user experience. These small details make interfaces feel more alive and responsive.</p>

      <h3>4. AI-Powered Personalization</h3>
      <p>Machine learning algorithms are enabling websites to adapt content and layouts based on user behavior, creating truly personalized experiences.</p>

      <h2>Implementing These Trends</h2>
      <p>While trends are exciting, it's important to implement them thoughtfully. Focus on enhancing user experience rather than adding features for their own sake. Test thoroughly and prioritize accessibility.</p>
    `,
    category: 'design',
    author: 'Sarah Chen',
    publishedAt: '2026-01-10',
    readTime: 8,
    tags: [
      { tag: 'Web Design' },
      { tag: 'Trends' },
      { tag: 'UI/UX' },
    ],
    featured: true,
  },
  {
    id: '2',
    slug: 'next-js-16-performance-optimization',
    title: 'Next.js 16: Performance Optimization Techniques',
    excerpt: 'Learn how to maximize performance in Next.js 16 with advanced optimization techniques, from image optimization to server components.',
    content: `
      <h2>Getting the Most Out of Next.js 16</h2>
      <p>Next.js 16 introduces powerful new features that can significantly improve your application's performance. This guide covers essential optimization techniques.</p>

      <h3>Server Components by Default</h3>
      <p>Next.js 16 makes Server Components the default, reducing JavaScript bundle sizes and improving initial load times. Learn when to use Client Components strategically.</p>

      <h3>Image Optimization</h3>
      <p>The built-in Image component now offers even better optimization. Use responsive images, lazy loading, and modern formats like WebP and AVIF automatically.</p>

      <h3>Code Splitting and Dynamic Imports</h3>
      <p>Implement code splitting to load only what's needed. Dynamic imports with React.lazy() can dramatically reduce initial bundle sizes.</p>

      <h2>Measuring Performance</h2>
      <p>Use the built-in Analytics and Core Web Vitals monitoring to track real user metrics. Focus on LCP, FID, and CLS to ensure a great user experience.</p>
    `,
    category: 'development',
    author: 'Marcus Rodriguez',
    publishedAt: '2026-01-08',
    readTime: 10,
    tags: [
      { tag: 'Next.js' },
      { tag: 'Performance' },
      { tag: 'React' },
    ],
    featured: true,
  },
  {
    id: '3',
    slug: 'ai-powered-workflow-automation',
    title: 'Building AI-Powered Workflow Automation',
    excerpt: 'Discover how to leverage GPT-4 and Claude to automate complex business workflows, saving time and reducing errors.',
    content: `
      <h2>The Power of AI Automation</h2>
      <p>AI-powered automation is transforming how businesses operate. By combining large language models with workflow automation tools, you can create intelligent systems that handle complex tasks.</p>

      <h3>Choosing the Right AI Model</h3>
      <p>GPT-4, Claude, and other LLMs each have strengths. GPT-4 excels at creative tasks, while Claude offers better reasoning for complex analysis. Choose based on your specific needs.</p>

      <h3>Integration Strategies</h3>
      <p>Use tools like n8n, Zapier, or custom APIs to connect AI models with your existing systems. Proper error handling and fallback mechanisms are essential.</p>

      <h3>Real-World Use Cases</h3>
      <ul>
        <li>Customer support automation</li>
        <li>Content generation and summarization</li>
        <li>Data extraction and analysis</li>
        <li>Email triage and response</li>
      </ul>

      <h2>Best Practices</h2>
      <p>Always validate AI outputs, implement human oversight for critical decisions, and continuously monitor and improve your prompts based on results.</p>
    `,
    category: 'ai-automation',
    author: 'Alex Thompson',
    publishedAt: '2026-01-05',
    readTime: 12,
    tags: [
      { tag: 'AI' },
      { tag: 'Automation' },
      { tag: 'GPT-4' },
      { tag: 'Claude' },
    ],
    featured: true,
  },
  {
    id: '4',
    slug: 'seo-strategies-2026',
    title: 'SEO Strategies That Actually Work in 2026',
    excerpt: 'Cut through the noise with proven SEO strategies that drive organic traffic and improve search rankings in 2026.',
    content: `
      <h2>Modern SEO: Beyond Keywords</h2>
      <p>SEO in 2026 requires a holistic approach that combines technical excellence, quality content, and user experience optimization.</p>

      <h3>Core Web Vitals Still Matter</h3>
      <p>Page speed, interactivity, and visual stability remain crucial ranking factors. Optimize your Core Web Vitals to stay competitive.</p>

      <h3>AI-Generated Content Detection</h3>
      <p>Search engines are getting better at detecting low-quality AI content. Focus on creating genuinely helpful, original content that provides real value.</p>

      <h3>E-E-A-T Principles</h3>
      <p>Experience, Expertise, Authoritativeness, and Trustworthiness are more important than ever. Build author profiles, cite sources, and demonstrate expertise.</p>

      <h2>Technical SEO Essentials</h2>
      <ul>
        <li>Proper schema markup for rich results</li>
        <li>Mobile-first indexing optimization</li>
        <li>Clean URL structure and internal linking</li>
        <li>XML sitemaps and robots.txt optimization</li>
      </ul>
    `,
    category: 'growth',
    author: 'Jennifer Lee',
    publishedAt: '2026-01-03',
    readTime: 9,
    tags: [
      { tag: 'SEO' },
      { tag: 'Marketing' },
      { tag: 'Content Strategy' },
    ],
  },
  {
    id: '5',
    slug: 'building-saas-mvp',
    title: 'How We Built a SaaS MVP in 4 Weeks',
    excerpt: 'A detailed case study of our rapid MVP development process, from ideation to launch, using modern development tools and practices.',
    content: `
      <h2>The Challenge</h2>
      <p>Our client needed to validate their SaaS idea quickly before committing significant resources. We had 4 weeks to build and launch a functional MVP.</p>

      <h3>Technology Stack</h3>
      <p>We chose Next.js for rapid development, Supabase for backend services, and Stripe for payments. This stack allowed us to move fast without sacrificing quality.</p>

      <h3>Week 1: Planning and Design</h3>
      <p>We spent the first week defining core features, creating wireframes, and setting up the development environment. Clear scope definition was crucial.</p>

      <h3>Week 2-3: Core Development</h3>
      <p>Focus was on building the essential features: user authentication, core functionality, and basic dashboard. We used component libraries to accelerate UI development.</p>

      <h3>Week 4: Polish and Launch</h3>
      <p>The final week involved bug fixes, performance optimization, and preparing for launch. We also set up analytics and monitoring.</p>

      <h2>Results</h2>
      <p>The MVP launched on schedule with 50 beta users. Within 2 months, it validated the business model and secured seed funding. The key was focusing ruthlessly on core value proposition.</p>
    `,
    category: 'case-studies',
    author: 'David Park',
    publishedAt: '2025-12-28',
    readTime: 15,
    tags: [
      { tag: 'SaaS' },
      { tag: 'MVP' },
      { tag: 'Case Study' },
    ],
    featured: false,
  },
  {
    id: '6',
    slug: 'react-19-new-features',
    title: 'What\'s New in React 19: A Comprehensive Guide',
    excerpt: 'Explore the exciting new features in React 19, including the new compiler, Server Actions, and improved concurrent rendering.',
    content: `
      <h2>React 19 Brings Major Improvements</h2>
      <p>React 19 introduces significant changes that improve both developer experience and application performance.</p>

      <h3>React Compiler</h3>
      <p>The new React Compiler automatically optimizes your components, reducing the need for manual memoization with useMemo and useCallback.</p>

      <h3>Server Actions</h3>
      <p>Server Actions provide a seamless way to execute server-side code from client components, simplifying form submissions and data mutations.</p>

      <h3>Enhanced Concurrent Rendering</h3>
      <p>Improved concurrent features make React applications more responsive, with better handling of high-priority updates and smoother animations.</p>

      <h2>Migration Guide</h2>
      <p>While React 19 maintains backward compatibility, some APIs are deprecated. Follow the official migration guide and update gradually to take advantage of new features.</p>
    `,
    category: 'development',
    author: 'Emily Watson',
    publishedAt: '2025-12-22',
    readTime: 11,
    tags: [
      { tag: 'React' },
      { tag: 'JavaScript' },
      { tag: 'Web Development' },
    ],
  },
];

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

export function getAllBlogPosts(): BlogPost[] {
  return blogPosts.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getFeaturedBlogPosts(): BlogPost[] {
  return blogPosts
    .filter((post) => post.featured)
    .sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
}

export function getBlogPostsByCategory(categorySlug: string): BlogPost[] {
  return blogPosts
    .filter((post) => post.category === categorySlug)
    .sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
}

export function getCategoryBySlug(slug: string): BlogCategory | undefined {
  return blogCategories.find((category) => category.slug === slug);
}

export function getAllCategories(): BlogCategory[] {
  return blogCategories;
}
