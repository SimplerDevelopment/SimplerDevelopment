export interface SolutionData {
  slug: string;
  badge: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  features: string[];
  benefits: string[];
  process: {
    title: string;
    description: string;
  }[];
}

export const solutions: SolutionData[] = [
  {
    slug: 'design',
    badge: 'Design',
    title: 'Beautiful, User-Centered Design',
    description: 'Transform your vision into stunning visual experiences. From brand identity to UI/UX design, we craft interfaces that captivate users and drive engagement.',
    color: '#22c55e',
    icon: 'palette',
    features: [
      'Brand Identity & Logo Design',
      'UI/UX Design for Web & Mobile',
      'Design Systems & Style Guides',
      'Wireframing & Prototyping',
      'User Research & Testing',
      'Responsive & Accessible Design',
    ],
    benefits: [
      'Increase user engagement and satisfaction',
      'Build a strong, recognizable brand',
      'Improve conversion rates with data-driven design',
      'Create consistent experiences across all platforms',
    ],
    process: [
      {
        title: 'Discovery & Research',
        description: 'We dive deep into your brand, audience, and goals to understand what makes your business unique.',
      },
      {
        title: 'Design & Iteration',
        description: 'Our designers create multiple concepts, refining based on your feedback until we nail the perfect look.',
      },
      {
        title: 'Testing & Validation',
        description: 'We test designs with real users to ensure they resonate and drive the desired actions.',
      },
      {
        title: 'Delivery & Support',
        description: 'Receive all design assets, documentation, and ongoing support to maintain design excellence.',
      },
    ],
  },
  {
    slug: 'development',
    badge: 'Development',
    title: 'Build Better Apps & Websites',
    description: 'Full-stack development for web, Android, and iOS. We create scalable applications with modern technology, beautiful design, and seamless user experiences.',
    color: '#3b82f6',
    icon: 'code',
    features: [
      'Custom Web Application Development',
      'Native iOS & Android Apps',
      'Progressive Web Apps (PWA)',
      'API Development & Integration',
      'Cloud Infrastructure & DevOps',
      'Performance Optimization',
    ],
    benefits: [
      'Scalable architecture that grows with your business',
      'Fast, responsive applications users love',
      'Reduced development costs with modern frameworks',
      'Ongoing support and maintenance',
    ],
    process: [
      {
        title: 'Planning & Architecture',
        description: 'We define the technical approach, select the right technology stack, and create a detailed development roadmap.',
      },
      {
        title: 'Agile Development',
        description: 'Build in iterative sprints with regular demos and feedback cycles to ensure we stay aligned with your vision.',
      },
      {
        title: 'Testing & Quality Assurance',
        description: 'Comprehensive testing including unit tests, integration tests, and user acceptance testing.',
      },
      {
        title: 'Deployment & Launch',
        description: 'Smooth deployment to production with monitoring, analytics, and post-launch support.',
      },
    ],
  },
  {
    slug: 'ai-automation',
    badge: 'AI & Automation',
    title: 'Intelligent Automation & AI',
    description: 'Harness the power of artificial intelligence to transform your business. Custom AI integrations, intelligent automation, and machine learning solutions that drive results.',
    color: '#a855f7',
    icon: 'smart_toy',
    features: [
      'Custom GPT & LLM Integration',
      'Workflow Automation (n8n, Zapier)',
      'Intelligent Chatbots & Assistants',
      'Data Analysis & Predictive Models',
      'Document Processing & OCR',
      'AI-Powered Content Generation',
    ],
    benefits: [
      'Save hundreds of hours with intelligent automation',
      'Improve accuracy and reduce human error',
      'Unlock insights from your data with AI analysis',
      'Scale operations without scaling headcount',
    ],
    process: [
      {
        title: 'Automation Audit',
        description: 'Identify repetitive tasks and processes ripe for automation across your organization.',
      },
      {
        title: 'Solution Design',
        description: 'Design custom automation workflows and AI integrations tailored to your specific needs.',
      },
      {
        title: 'Implementation & Training',
        description: 'Build and deploy solutions with comprehensive team training and documentation.',
      },
      {
        title: 'Optimization & Scaling',
        description: 'Monitor performance, refine automations, and expand to additional use cases.',
      },
    ],
  },
  {
    slug: 'growth-marketing',
    badge: 'Growth & Marketing',
    title: 'Scale Your Digital Presence',
    description: 'Strategic digital marketing and growth solutions. SEO, content strategy, analytics, and conversion optimization to accelerate your business growth.',
    color: '#ec4899',
    icon: 'trending_up',
    features: [
      'Search Engine Optimization (SEO)',
      'Content Strategy & Creation',
      'Conversion Rate Optimization',
      'Analytics & Data Tracking',
      'Email Marketing Automation',
      'Social Media Strategy',
    ],
    benefits: [
      'Increase organic traffic and visibility',
      'Convert more visitors into customers',
      'Data-driven decisions with clear ROI',
      'Build sustainable, long-term growth',
    ],
    process: [
      {
        title: 'Growth Audit',
        description: 'Analyze your current digital presence, identify opportunities, and benchmark against competitors.',
      },
      {
        title: 'Strategy Development',
        description: 'Create a comprehensive growth roadmap with clear KPIs and measurable objectives.',
      },
      {
        title: 'Execution & Optimization',
        description: 'Implement tactics across channels, continuously testing and optimizing for better results.',
      },
      {
        title: 'Reporting & Scaling',
        description: 'Regular performance reviews with actionable insights to scale what works.',
      },
    ],
  },
  {
    slug: 'partnership',
    badge: 'Partnership',
    title: 'Long-Term Strategic Partnership',
    description: 'More than just a vendor, we become your trusted technology partner. Ongoing support, strategic guidance, and collaborative growth for lasting success.',
    color: '#f97316',
    icon: 'handshake',
    features: [
      'Dedicated Account Management',
      'Strategic Technology Consulting',
      'Priority Support & Maintenance',
      'Ongoing Training & Knowledge Transfer',
      'Scalability Planning & Execution',
      'Technology Roadmap Development',
    ],
    benefits: [
      'Peace of mind with reliable ongoing support',
      'Stay ahead with proactive technology guidance',
      'Reduce costs with retained partner rates',
      'Build institutional knowledge within your team',
    ],
    process: [
      {
        title: 'Partnership Kickoff',
        description: 'Deep dive into your business goals, technology stack, and long-term vision.',
      },
      {
        title: 'Roadmap Planning',
        description: 'Collaborate on a multi-quarter technology roadmap aligned with business objectives.',
      },
      {
        title: 'Continuous Collaboration',
        description: 'Regular check-ins, sprint planning, and strategic reviews to ensure alignment.',
      },
      {
        title: 'Growth & Evolution',
        description: 'Evolve the partnership as your business grows, adapting to new opportunities and challenges.',
      },
    ],
  },
];

export function getSolutionBySlug(slug: string): SolutionData | undefined {
  return solutions.find((solution) => solution.slug === slug);
}

export function getAllSolutions(): SolutionData[] {
  return solutions;
}
