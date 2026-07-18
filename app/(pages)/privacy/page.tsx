// Public Privacy Policy. This is a thorough starting draft tailored to the
// platform's actual data flows — have counsel review and fill the bracketed
// business specifics (legal entity, jurisdiction, mailing address) before
// relying on it. Referenced by the OAuth discovery metadata (op_policy_uri).
import { generateSEO } from '@/lib/utils/seo';
import { LegalLayout, LegalSection } from '@/components/legal/LegalLayout';

export const metadata = generateSEO({
  title: 'Privacy Policy',
  description:
    'How SimplerDevelopment collects, uses, shares, and protects personal information across its platform, integrations, and connectors.',
  path: '/privacy',
});

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="June 23, 2026"
      intro="This Privacy Policy explains how SimplerDevelopment (“we,” “us,” “our”) collects, uses, discloses, and safeguards information when you use our platform, websites, APIs, and connectors (the “Service”)."
      crossLink={{ href: '/terms', label: 'Terms of Service' }}
    >
      <LegalSection heading="1. Who This Policy Covers">
        <p>
          SimplerDevelopment provides a multi-tenant platform for agencies and their clients,
          including a client portal, hosted websites, a CRM, an AI-powered “Company Brain,”
          marketing and automation tools, and integrations with third-party services. This policy
          applies to people who create an account, visitors to pages we host, and end users whose
          information is processed through a customer’s workspace.
        </p>
        <p>
          Where we process information on behalf of a customer (for example, contacts in their CRM
          or content in their workspace), that customer is the controller of the data and we act as
          a processor under their instructions and their own privacy notice.
        </p>
      </LegalSection>

      <LegalSection heading="2. Information We Collect">
        <ul>
          <li>
            <strong>Account information</strong> — name, email address, password (stored hashed),
            organization, and role.
          </li>
          <li>
            <strong>Customer content</strong> — data you create or upload, such as CRM records,
            website content, documents, notes, surveys, media, and the knowledge stored in the
            Company Brain.
          </li>
          <li>
            <strong>Billing information</strong> — subscription plan and transaction metadata.
            Payment card details are handled by our payment processor and are not stored on our
            servers.
          </li>
          <li>
            <strong>Integration data</strong> — information you authorize us to access from
            connected third-party services (for example, Google Workspace).
          </li>
          <li>
            <strong>Usage and device data</strong> — log data, IP address, browser/device type,
            and actions taken in the Service, used for security, debugging, and product
            improvement.
          </li>
          <li>
            <strong>Cookies</strong> — used for authentication, session management, and preferences.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. How We Use Information">
        <ul>
          <li>To provide, maintain, secure, and improve the Service.</li>
          <li>To authenticate users and protect against fraud and abuse.</li>
          <li>To process subscriptions and billing.</li>
          <li>To power features you use, including AI features that operate on your content.</li>
          <li>To communicate with you about your account, support requests, and material changes.</li>
          <li>To comply with legal obligations and enforce our agreements.</li>
        </ul>
        <p>We do not sell personal information.</p>
      </LegalSection>

      <LegalSection heading="4. AI Features (Company Brain)">
        <p>
          The Service includes AI features that process your content to generate answers,
          summaries, classifications, embeddings, and similar output. This processing is scoped to
          your workspace and is not used to train third-party foundation models. AI output may be
          inaccurate or incomplete and should be reviewed before you rely on it. To deliver these
          features we send the relevant content to AI model providers acting as our sub-processors
          (see Section&nbsp;5).
        </p>
      </LegalSection>

      <LegalSection heading="5. Third-Party Services and Sub-Processors">
        <p>We rely on trusted third parties to operate the Service. These currently include:</p>
        <ul>
          <li><strong>Payment processing</strong> — Stripe.</li>
          <li><strong>AI model providers</strong> — including Anthropic, to power AI features.</li>
          <li><strong>Productivity integrations</strong> — Google Workspace (Gmail, Calendar, Drive), when you connect them.</li>
          <li><strong>Hosting and infrastructure</strong> — our cloud hosting and database providers.</li>
        </ul>
        <p>
          Each sub-processor receives only the information needed to perform its function and is
          bound by contractual confidentiality and security obligations.
        </p>
      </LegalSection>

      <LegalSection heading="6. Connectors and API Access">
        <p>
          You may connect third-party applications and AI clients to your workspace through our
          API and connectors using OAuth. When you authorize a connection, you grant that
          application access to the specific scopes you approve on the consent screen. Access
          tokens are short-lived and refreshed automatically; we store only a hashed form of each
          token.
        </p>
        <p>
          You are responsible for the applications you connect and the access you grant. You can
          review and revoke connected applications and active tokens at any time from your account
          settings, which immediately ends their access.
        </p>
      </LegalSection>

      <LegalSection heading="7. How We Share Information">
        <p>We disclose information only as described here:</p>
        <ul>
          <li>With sub-processors that help us operate the Service (Section&nbsp;5).</li>
          <li>With applications you explicitly connect or authorize (Section&nbsp;6).</li>
          <li>Within your organization’s workspace, according to the roles and permissions you set.</li>
          <li>When required by law, legal process, or to protect rights, safety, and security.</li>
          <li>In connection with a merger, acquisition, or sale of assets, subject to this policy.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="8. Data Retention">
        <p>
          We retain information for as long as your account is active or as needed to provide the
          Service, then delete or anonymize it within a reasonable period, except where longer
          retention is required for legal, accounting, security, or dispute-resolution purposes.
          Customers may request deletion of workspace data as described below.
        </p>
      </LegalSection>

      <LegalSection heading="9. Security">
        <p>
          We use administrative, technical, and organizational safeguards designed to protect
          information, including encryption in transit, hashing of credentials and tokens, tenant
          isolation, scoped access controls, and access logging. No method of transmission or
          storage is completely secure, and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="10. Your Rights and Choices">
        <p>
          Depending on your location, you may have rights to access, correct, export, or delete
          your personal information, and to object to or restrict certain processing. You can
          exercise many of these directly in the Service, or contact us at the address below. If
          your information is processed on behalf of a customer, please direct your request to that
          customer; we will support them in responding.
        </p>
      </LegalSection>

      <LegalSection heading="11. International Transfers">
        <p>
          We may process and store information in countries other than where you live. Where
          required, we use appropriate safeguards for cross-border transfers of personal
          information.
        </p>
      </LegalSection>

      <LegalSection heading="12. Children’s Privacy">
        <p>
          The Service is not directed to children under 16, and we do not knowingly collect
          personal information from them. If you believe a child has provided us information,
          contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to This Policy">
        <p>
          We may update this policy from time to time. We will revise the “Last updated” date above
          and, for material changes, provide additional notice. Your continued use of the Service
          after changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact Us">
        <p>
          SimplerDevelopment — [Legal entity name], [Mailing address]. Email{' '}
          <a href="mailto:info@simplerdevelopment.com">info@simplerdevelopment.com</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
