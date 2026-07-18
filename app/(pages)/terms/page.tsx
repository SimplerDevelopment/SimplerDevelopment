// Public Terms of Service. Thorough starting draft tailored to the platform —
// have counsel review and fill the bracketed business specifics (legal entity,
// governing-law jurisdiction, mailing address) before relying on it.
// Referenced by the OAuth discovery metadata (op_tos_uri).
import { generateSEO } from '@/lib/utils/seo';
import { LegalLayout, LegalSection } from '@/components/legal/LegalLayout';

export const metadata = generateSEO({
  title: 'Terms of Service',
  description:
    'The terms governing your use of the SimplerDevelopment platform, APIs, connectors, and related services.',
  path: '/terms',
});

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="June 23, 2026"
      intro="These Terms of Service (“Terms”) govern your access to and use of the SimplerDevelopment platform, websites, APIs, and connectors (the “Service”). By using the Service, you agree to these Terms."
      crossLink={{ href: '/privacy', label: 'Privacy Policy' }}
    >
      <LegalSection heading="1. Acceptance of Terms">
        <p>
          By accessing or using the Service, you agree to be bound by these Terms and our{' '}
          <a href="/privacy">Privacy Policy</a>. If you use the Service on behalf of an
          organization, you represent that you are authorized to bind that organization, and
          “you” refers to that organization.
        </p>
      </LegalSection>

      <LegalSection heading="2. The Service">
        <p>
          SimplerDevelopment provides a multi-tenant platform that may include a client portal,
          hosted websites, a CRM, an AI-powered “Company Brain,” marketing and automation tools,
          and integrations and connectors with third-party services. We may add, change, or remove
          features over time.
        </p>
      </LegalSection>

      <LegalSection heading="3. Accounts and Eligibility">
        <ul>
          <li>You must provide accurate information and keep your account credentials secure.</li>
          <li>You are responsible for all activity that occurs under your account.</li>
          <li>You must be at least 16 years old and legally able to enter into these Terms.</li>
          <li>Notify us promptly of any unauthorized use of your account.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Subscriptions, Billing, and Payment">
        <p>
          Paid plans are billed in advance on a recurring basis through our payment processor and
          renew automatically until cancelled. You authorize us to charge your payment method for
          applicable fees and taxes. Except where required by law or expressly stated, fees are
          non-refundable. We may change pricing on prospective notice; changes take effect at your
          next renewal. You can cancel at any time, effective at the end of the current billing
          period.
        </p>
      </LegalSection>

      <LegalSection heading="5. Acceptable Use">
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service unlawfully or to infringe others’ rights.</li>
          <li>Upload malware or attempt to breach, probe, or disrupt the Service or its security.</li>
          <li>Access another tenant’s data or attempt to circumvent access controls or tenant isolation.</li>
          <li>Reverse engineer the Service except to the extent permitted by law.</li>
          <li>Send spam or unsolicited communications through the Service.</li>
          <li>Use the Service to build a competing product or to scrape data at scale without authorization.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Your Content">
        <p>
          You retain all rights to the content you create, upload, or store in the Service (“Your
          Content”). You grant us a limited license to host, process, transmit, and display Your
          Content solely to operate and improve the Service and to provide it to you. You are
          responsible for Your Content and for having the necessary rights and consents to use it.
        </p>
      </LegalSection>

      <LegalSection heading="7. AI Features and Output">
        <p>
          The Service includes AI features that generate output based on your content and prompts.
          AI output may be inaccurate, incomplete, or unsuitable for your purposes, and is provided
          without warranty. You are responsible for reviewing AI output before relying on it,
          particularly for decisions with legal, financial, or safety implications.
        </p>
      </LegalSection>

      <LegalSection heading="8. API, Connectors, and Integrations">
        <p>
          We offer an API and connectors that let you and authorized third-party applications
          access your workspace via OAuth. You are responsible for the applications you connect,
          the scopes you grant, and any activity performed through them. We may apply rate limits
          and may suspend access that threatens the security, integrity, or availability of the
          Service. Your use of connected third-party services is also subject to their terms.
        </p>
      </LegalSection>

      <LegalSection heading="9. Intellectual Property">
        <p>
          The Service, including its software, design, and trademarks, is owned by us and our
          licensors and is protected by intellectual property laws. These Terms grant you a
          limited, non-exclusive, non-transferable right to use the Service; no other rights are
          granted by implication.
        </p>
      </LegalSection>

      <LegalSection heading="10. Confidentiality">
        <p>
          Each party may receive non-public information from the other. The receiving party will
          protect such information with reasonable care and use it only to exercise its rights and
          perform its obligations under these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="11. Disclaimers">
        <p>
          The Service is provided “as is” and “as available,” without warranties of any kind,
          whether express, implied, or statutory, including warranties of merchantability, fitness
          for a particular purpose, and non-infringement. We do not warrant that the Service will
          be uninterrupted, error-free, or secure.
        </p>
      </LegalSection>

      <LegalSection heading="12. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, we will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for lost profits, revenue,
          or data. Our total liability arising out of or relating to the Service will not exceed
          the amounts you paid us for the Service in the twelve months before the event giving rise
          to the claim.
        </p>
      </LegalSection>

      <LegalSection heading="13. Indemnification">
        <p>
          You will indemnify and hold us harmless from claims, damages, and expenses arising out of
          Your Content, your use of the Service, or your breach of these Terms, to the extent
          permitted by law.
        </p>
      </LegalSection>

      <LegalSection heading="14. Term and Termination">
        <p>
          These Terms remain in effect while you use the Service. You may stop using the Service at
          any time. We may suspend or terminate access if you breach these Terms or to protect the
          Service. Upon termination, your right to use the Service ends; we will make Your Content
          available for export for a reasonable period unless prohibited by law.
        </p>
      </LegalSection>

      <LegalSection heading="15. Changes to These Terms">
        <p>
          We may update these Terms from time to time. We will revise the “Last updated” date above
          and, for material changes, provide additional notice. Your continued use of the Service
          after changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection heading="16. Governing Law and Disputes">
        <p>
          These Terms are governed by the laws of [Governing-law jurisdiction], without regard to
          its conflict-of-laws rules. The courts located in [Venue] will have exclusive
          jurisdiction over disputes, except that either party may seek injunctive relief to
          protect its intellectual property or confidential information.
        </p>
      </LegalSection>

      <LegalSection heading="17. Contact Us">
        <p>
          SimplerDevelopment — [Legal entity name], [Mailing address]. Email{' '}
          <a href="mailto:info@simplerdevelopment.com">info@simplerdevelopment.com</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
