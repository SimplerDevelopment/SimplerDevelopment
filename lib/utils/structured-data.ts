import { siteConfig } from '@/config/site';

/**
 * Generate JSON-LD structured data for SEO
 */

export interface OrganizationSchema {
  '@context': 'https://schema.org';
  '@type': 'Organization';
  name: string;
  url: string;
  logo?: string;
  description: string;
  sameAs?: string[];
  contactPoint?: {
    '@type': 'ContactPoint';
    contactType: string;
    email?: string;
  };
}

export interface WebsiteSchema {
  '@context': 'https://schema.org';
  '@type': 'WebSite';
  name: string;
  url: string;
  description: string;
  publisher: {
    '@type': 'Organization';
    name: string;
  };
}

export interface ArticleSchema {
  '@context': 'https://schema.org';
  '@type': 'Article';
  headline: string;
  description: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  author: {
    '@type': 'Organization' | 'Person';
    name: string;
  };
  publisher: {
    '@type': 'Organization';
    name: string;
    logo?: {
      '@type': 'ImageObject';
      url: string;
    };
  };
}

export interface ServiceSchema {
  '@context': 'https://schema.org';
  '@type': 'Service';
  name: string;
  description: string;
  provider: {
    '@type': 'Organization';
    name: string;
  };
  serviceType?: string;
  areaServed?: string;
}

export interface SoftwareApplicationSchema {
  '@context': 'https://schema.org';
  '@type': 'SoftwareApplication';
  name: string;
  url: string;
  applicationCategory: string;
  operatingSystem: string;
  description: string;
  license?: string;
  dateModified?: string;
  offers?: {
    '@type': 'Offer';
    priceCurrency: string;
    price: string;
    priceSpecification?: {
      '@type': 'UnitPriceSpecification';
      description: string;
    };
  };
  featureList?: string[];
}

export interface WebSiteWithSearchActionSchema {
  '@context': 'https://schema.org';
  '@type': 'WebSite';
  name: string;
  url: string;
  potentialAction?: {
    '@type': 'SearchAction';
    target: {
      '@type': 'EntryPoint';
      urlTemplate: string;
    };
    'query-input': string;
  };
}

export interface FAQSchema {
  '@context': 'https://schema.org';
  '@type': 'FAQPage';
  mainEntity: Array<{
    '@type': 'Question';
    name: string;
    acceptedAnswer: {
      '@type': 'Answer';
      text: string;
    };
  }>;
}

export function generateOrganizationSchema(): OrganizationSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/logo.png`,
    description: siteConfig.description,
    sameAs: [
      siteConfig.links.twitter,
      siteConfig.links.github,
      siteConfig.links.linkedin,
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
    },
  };
}

export function generateWebsiteSchema(): WebsiteSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
    },
  };
}

export function generateArticleSchema(
  title: string,
  description: string,
  publishedAt: string,
  image?: string,
  modifiedAt?: string
): ArticleSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    image,
    datePublished: publishedAt,
    dateModified: modifiedAt || publishedAt,
    author: {
      '@type': 'Organization',
      name: siteConfig.name,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
    },
  };
}

export function generateServiceSchema(
  name: string,
  description: string,
  serviceType?: string
): ServiceSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description,
    provider: {
      '@type': 'Organization',
      name: siteConfig.name,
    },
    serviceType,
  };
}

export function generateSoftwareApplicationSchema(): SoftwareApplicationSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    url: siteConfig.url,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'Multi-tenant agency SaaS platform covering website builder, CRM, Company Brain AI knowledge base, email campaigns, bookings, project management, and a 450-tool MCP server. Apache-2.0 licensed and self-hostable.',
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    dateModified: '2026-06-27',
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: '0',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        description: 'Per-module subscriptions. See pricing page for details.',
      },
    },
    featureList: [
      'Block-based visual website editor with 47 built-in block types',
      'CRM with contacts, companies, deals, proposals, and e-signed contracts',
      'Company Brain AI knowledge base with RAG and semantic search (pgvector)',
      '450-tool MCP server at POST /api/mcp (Streamable HTTP)',
      'Email campaign builder with A/B subject-line testing',
      'Online booking and scheduling with Stripe payments',
      'Project management with kanban, sprints, and time logging',
      'White-label agency portal with custom domain and branding',
      'Self-hostable on any Next.js host connected to Postgres',
    ],
  };
}

export function generateWebSiteWithSearchActionSchema(): WebSiteWithSearchActionSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.url}/docs?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function generateFAQSchema(
  faqs: Array<{ question: string; answer: string }>
): FAQSchema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

