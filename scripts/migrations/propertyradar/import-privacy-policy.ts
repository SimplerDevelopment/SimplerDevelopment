/**
 * Import PropertyRadar /privacy-policy — LEGAL page.
 * Run: npx tsx scripts/migrations/propertyradar/import-privacy-policy.ts
 *
 * Source: data/marketing/privacy-policy.json
 * Full policy text is present and substantial. All sections preserved faithfully.
 * NO marketing CTA (legal page).
 */
import { T, makePage, footerBlock, upsertPage } from './_shared';

const p = makePage();

// ─── Hero (compact light) ─────────────────────────────────────────────────────
p.add(p.hero({
  title: 'Privacy Policy',
  subtitle: 'LEGAL',
  description: 'Last Updated: August 22, 2025. How PropertyRadar collects, uses, and protects your personal information — and how you can exercise your privacy rights.',
  dark: false,
  minHeight: '40vh',
}));

// ─── Heading styles (reused) ──────────────────────────────────────────────────
const narrow820: Record<string, unknown> = { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto' };
const h2Style = (id: string, text: string) => ({
  id, type: 'heading', order: p.ord(), content: text, level: 2, alignment: 'left',
  style: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', ...narrow820, marginTop: '40px', marginBottom: '8px' },
});
const h3Style = (id: string, text: string) => ({
  id, type: 'heading', order: p.ord(), content: text, level: 3, alignment: 'left',
  style: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600', ...narrow820, marginTop: '28px', marginBottom: '6px' },
});
const bodyText = (id: string, content: string) =>
  p.text(id, content, T.INK, 'left', { ...narrow820, marginTop: '12px' });

// ─── Main policy section ──────────────────────────────────────────────────────
p.add(p.section('sec-policy', T.WHITE, 80, [

  // Intro paragraphs
  bodyText('pp-i1', 'PropertyRadar, Inc. (“PropertyRadar,” “we,” “us,” or “our”), want you to be informed about our data protection practices and your privacy rights. This Privacy Policy (“Policy”) is designed to help you understand how we may collect, use, share or otherwise process information through our services and how you can exercise your privacy rights.'),
  bodyText('pp-i2', 'We may process your personal information on our websites (“Sites”), our mobile application (“App”), our online community forum, social media pages, marketing activities, when we gather public-records information or receive information from other businesses, and through offering our subscription-based data offerings (collectively “Services”).'),
  bodyText('pp-i3', 'To make it easier for you to find and understand the parts of this Policy, we’ve called out terms when they may apply uniquely to you, depending on how you interact with our Services. You may interact with our Services in one or more of the capacities below:'),
  bodyText('pp-i4', '• You are an Online Visitor, when you browse our Sites by interacting with our content, registering and participating in our online community, and engaging with us in the ordinary course of our business.\n• You are a Subscriber if and when you engage with us as a business that subscribes to our subscription-based data product for businesses (“Business Data Product”) on a trial or paid basis.\n• You are an Individual if you are a member of the public whose personal information is included in our Business Data Product. Our Business Data Product consists of data lawfully made available from government records and other public sources (e.g., foreclosure records, county recorder records, courthouse records) that we supplement and enhance with information we gather separately.'),
  bodyText('pp-i5', 'Regardless of who you are or how you interact with our Services, WE DO NOT SELL PERSONAL INFORMATION YOU PROVIDE TO US DIRECTLY as a Subscriber, Online Visitor, job applicant or employee.'),
  bodyText('pp-i6', 'If you have questions about this Policy, our privacy practices, or wish to exercise your privacy rights, please review this Policy in full and contact us as set forth below.'),

  p.divider('pp-div1'),

  // PERSONAL INFORMATION WE COLLECT
  h2Style('pp-h-collect', 'PERSONAL INFORMATION WE COLLECT'),
  bodyText('pp-collect-1', 'The categories of personal information we collect depend on how you interact with us, our Services, and the requirements of applicable law. We collect information that you provide to us, information we obtain automatically when you use our Services, and information from other sources including Data Sources, as described below.'),
  h3Style('pp-h-direct', 'Personal Information You Provide to Us Directly'),
  bodyText('pp-direct-1', 'We may collect personal information from you that you provide to us directly. WE DO NOT SELL PERSONAL INFORMATION YOU PROVIDE TO US DIRECTLY as a Subscriber, Online Visitor, job applicant or employee. Ways you may provide personal information include:'),
  bodyText('pp-direct-2', '• Account Creation: name, email address, username, mobile phone number, company name, password, industry, and interests.\n• Subscription Information: payment details associated with your subscription (processed by a third-party payment processor).\n• Subscriber Content: notes, files, photos, values, analysis, lists, phone numbers, emails, and other data you add to your account.\n• Your Communications with Us: email address and other information you provide when contacting support or requesting information.\n• Public Communities and Content: information shared in public forums or via the public sharing features of our Sites.\n• Promotional Activities, User Feedback and Surveys, Conferences and Events, Business Development, Job Applications.'),
  h3Style('pp-h-auto', 'Personal Information Collected Automatically'),
  bodyText('pp-auto-1', 'We may collect certain information automatically when you use our Services, such as your IP address, user settings, MAC address, cookie identifiers, mobile advertising identifiers, browser or device information, location information (including approximate location derived from IP address), and information about your use of our Services such as pages visited, links clicked, content types interacted with, frequency and duration of activities.'),
  bodyText('pp-auto-2', 'We use technologies including cookies, pixel tags, local storage objects (“Technologies”) to automatically collect information. Our uses fall into these categories: Essential (required for site access and security), Performance and Functionality (enhanced features and preference tracking), Analytics and Customization (understanding site usage, including Google Analytics and Mouseflow session recording), and Advertising/Targeting (personalized ads via Google DoubleClick/AdWords and similar partners).'),
  h3Style('pp-h-other', 'Personal Information Collected from Other Sources'),
  bodyText('pp-other-1', 'We may obtain personal information about you from other sources, including through third-party services and organizations. In conjunction with developing and offering our Business Data Product, we enrich public data with data from various Data Sources. If you access our Services through a third-party application, we may collect personal information from that application if you have made such information available via your privacy settings.'),

  p.divider('pp-div2'),

  // HOW WE USE PERSONAL INFORMATION
  h2Style('pp-h-use', 'HOW WE USE PERSONAL INFORMATION'),
  bodyText('pp-use-1', 'We use personal information for a variety of business purposes, including to provide our Services, for administrative purposes, and to market our Business Data Product and other Services.'),
  h3Style('pp-h-provide', 'Provide Our Services'),
  bodyText('pp-provide-1', 'Building the Business Data Product for Subscribers; managing your subscription and accounts; providing access to certain areas and features; answering support requests; communicating about your accounts, activities, and promotions; communicating about policy changes and legal matters; processing and completing transactions; and allowing you to register for events.'),
  h3Style('pp-h-admin', 'Administrative and Legal Purposes'),
  bodyText('pp-admin-1', 'Pursuing our legitimate interests such as direct marketing, research and development, network and information security, and fraud prevention; detecting security incidents; measuring interest and engagement; improving our Services; developing new products; ensuring internal quality control; authenticating and verifying identities; debugging; auditing; enforcing our agreements and policies; and complying with our legal obligations.'),
  h3Style('pp-h-mktg', 'Marketing and Advertising'),
  bodyText('pp-mktg-1', 'We may use your personal information to tailor your experience with our Services and to provide you with content and advertisements as permitted by applicable law. Some of the ways we may market to you include email campaigns, text messages, custom audience advertising, and “interest-based” or “personalized advertising,” including through cross-device tracking. If you have any questions about our marketing practices or would like to opt out of using your personal information for marketing purposes, you can learn more about your choices in the YOUR PRIVACY CHOICES AND RIGHTS section of this Policy.'),

  p.divider('pp-div3'),

  // HOW WE DISCLOSE
  h2Style('pp-h-disclose', 'HOW WE DISCLOSE YOUR PERSONAL INFORMATION'),
  bodyText('pp-dis-1', 'We disclose your personal information to third parties for a variety of business purposes, including to provide our Services, to protect us or others, or in the event of a major business transaction such as a merger, sale, or asset transfer.'),
  bodyText('pp-dis-2', 'Categories of third parties with whom we may share your personal information include: Service Providers (IT support, hosting, payment processing, customer service); Business Partners; Other Users or Third Parties you interact with; Advertising Partners (who may set tracking technologies on our Services); Application Licensors; Browser Extension providers; API/SDK partners; and Subscribers (businesses that purchase data through our Business Data Product).'),
  bodyText('pp-dis-3', 'No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. All other categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.'),
  bodyText('pp-dis-4', 'We may also access, preserve, and disclose information to comply with law enforcement requests and legal process, to protect rights or safety, to enforce our policies, or in connection with a merger, acquisition, financing, or asset transfer.'),

  p.divider('pp-div4'),

  // YOUR PRIVACY CHOICES AND RIGHTS
  h2Style('pp-h-rights', 'YOUR PRIVACY CHOICES AND RIGHTS'),
  bodyText('pp-rights-0', 'The privacy choices you may have about your personal information are determined by applicable law. Your rights vary based on your state of residency and not all rights apply to everyone. We will not discriminate against you when you exercise or attempt to exercise any privacy rights conferred by applicable laws.'),
  bodyText('pp-rights-1', '• Email Communications: Use the unsubscribe link in any email to opt out of marketing emails. You will continue to receive transaction-related and legal notices.\n• Text Messages: Follow opt-out instructions in the text message.\n• Mobile Devices / Push Notifications: Adjust notification settings in your device or our App.\n• Phone Calls: Follow opt-out instructions on the call or contact us.\n• Do Not Track: We do not respond to DNT signals.\n• Opt-Out Preference Signals: We honor Global Privacy Control (GPC) for site browsing data where required.\n• Cookies and Personalized Advertising: Adjust preferences through the Cookie Banner or your device settings.\n• Request Opt-Out of sale of your personal information (note: does not apply to publicly available information).\n• Request to Know: Disclose categories and specific pieces of personal information collected about you.\n• Request to Delete: Request deletion of personal information (subject to exceptions for publicly available information).\n• Request to Correct: Request correction of inaccurate or incomplete personal information.\n• Request Restriction: Limit certain uses or processing of your personal information.\n• Withdraw Consent: Withdraw consent to processing (prospective only; fulfilled via Request to Delete).'),

  p.divider('pp-div5'),

  // CONTACT US
  h2Style('pp-h-contact', 'CONTACT US / EXERCISE YOUR PRIVACY RIGHTS'),
  bodyText('pp-contact-1', 'If you have any questions about our privacy practices or this Policy, or to exercise your rights as detailed in this Policy, you can reach us by:'),
  bodyText('pp-contact-2', '• Making an online request at propertyradar.com/privacy-requests\n• Telephone: 888-914-9661 + pin 640 222'),
  bodyText('pp-contact-3', 'We will verify your identity before processing requests by matching identifying information you provide (e.g., name, email address, account information). You may designate an authorized agent to submit requests on your behalf. You may also have the right to appeal our decision by submitting an appeal request using the same method as your original request.'),

  p.divider('pp-div6'),

  // SECURITY
  h2Style('pp-h-security', 'SECURITY OF YOUR INFORMATION'),
  bodyText('pp-sec-1', 'We take steps to ensure that your information is treated securely and in accordance with this Policy. Unfortunately, no system is 100% secure, and we cannot ensure or warrant the security of any information you provide to us. To the fullest extent permitted by applicable law, we do not accept liability for unauthorized access, use, disclosure, or loss of personal information. By using our Services or providing personal information to us, you agree that we may communicate with you electronically regarding security, privacy, and administrative issues relating to your use of our Services.'),

  p.divider('pp-div7'),

  // RETENTION
  h2Style('pp-h-retention', 'RETENTION OF PERSONAL INFORMATION'),
  bodyText('pp-ret-1', 'We store personal information we collect as described in this Policy for as long as you use our Services, or as necessary to fulfill the purpose(s) for which it was collected, provide our Services, resolve disputes, establish legal defenses, conduct audits, pursue legitimate business purposes, enforce our agreements, and comply with applicable laws.'),

  p.divider('pp-div8'),

  // SUPPLEMENTAL NOTICE
  h2Style('pp-h-suppl', 'SUPPLEMENTAL NOTICE FOR RESIDENTS OF CERTAIN U.S. STATES AND CALIFORNIA NOTICE AT COLLECTION'),
  bodyText('pp-suppl-1', 'This Supplemental Policy is for residents of states that have adopted comprehensive privacy legislation. The following summarizes the categories of personal information we collect, sell or share and for what purposes.'),
  h3Style('pp-h-biz', 'Personal Information Disclosed for a Business Purpose'),
  bodyText('pp-biz-1', 'Categories disclosed to service providers, business partners, advertising networks, analytics providers, and government entities include: Identifiers (name, alias, unique identifiers, IP address, email); Personal Records (name, postal address, phone, email); Commercial Information (subscription records); Internet Activity (browsing, search history, site interaction); Geolocation Data; Sensory Data; and Sensitive Personal Information (SSN, driver’s license, account login, precise geolocation).'),
  h3Style('pp-h-sold', 'Personal Information Sold'),
  bodyText('pp-sold-1', 'WE DO NOT SELL PERSONAL INFORMATION YOU PROVIDE TO US DIRECTLY as a Subscriber, job applicant or employee. We sell “publicly available” Personal Information lawfully made available from government records. Categories sold to Subscribers (real estate agents, investors, developers, government agencies, insurance companies, home service professionals) include: Identifiers, Personal Records, Commercial Information, Professional/Employment Information, Internet Activity, Sensory Data, and Inferences.'),
  h3Style('pp-h-shared', 'Personal Information Shared'),
  bodyText('pp-shared-1', 'Personal information shared for cross-contextual advertising includes: Identifiers (online identifiers, IP address); Internet Activity (browsing history, online behavior, interest data); and Inferences about individual preferences and characteristics. Shared with advertising networks, internet service providers, data analytics providers, operating systems and platforms, and social networks.'),

  p.divider('pp-div9'),

  // TEXAS DATA BROKER
  h2Style('pp-h-texas', 'TEXAS DATA BROKER NOTICE'),
  bodyText('pp-texas-1', 'The entity maintaining this website is a data broker under Texas law. To conduct business in Texas, a data broker must register with the Texas Secretary of State (Texas SOS). Information about data broker registrants is available on the Texas SOS website.'),

  p.divider('pp-div10'),

  // CHILDREN'S INFORMATION
  h2Style('pp-h-children', 'CHILDREN\'S INFORMATION'),
  bodyText('pp-children-1', 'Our Services are not directed to persons under the age of 16 and we do not knowingly collect, disclose, sell or share personal information of persons under 16 years of age. Protecting children\'s privacy online is very important to us. If you are a parent or guardian and believe your child has uploaded personal information to our site without your consent, please Contact Us. If we become aware that a child has provided us with personal information in violation of applicable law, we will delete any personal information we have collected, unless we have a legal obligation to keep it, and if applicable, terminate the child\'s account.'),

  p.divider('pp-div11'),

  // OTHER PROVISIONS
  h2Style('pp-h-other2', 'OTHER PROVISIONS'),
  bodyText('pp-other2-1', 'Third-Party Websites/Applications. The Services may contain links to other websites/applications and other websites/applications may reference or link to our Services. These third-party services are not controlled by us. We encourage our users to read the privacy policies of each website and application with which they interact. We do not endorse, screen, or approve, and are not responsible for, the privacy practices or content of such other websites or applications. You agree that if you elect to provide personal information to third-party websites or applications encountered on our Sites or through our Services, you do so at your own risk.'),

  p.divider('pp-div12'),

  // CHANGES TO OUR NOTICE
  h2Style('pp-h-changes', 'CHANGES TO OUR NOTICE'),
  bodyText('pp-changes-1', 'We may revise this Policy from time to time in our sole discretion. If there are any material changes to this Policy, we will notify you as required by applicable law. You understand and agree that you will be deemed to have accepted the updated Policy if you continue to use our Services after the new Policy takes effect.'),

  p.spacer('pp-bottom-sp', 'xl'),
], { maxWidth: '900px' }, {}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  seoTitle: 'Privacy Policy Overview | Personal Information Collection and Use | PropertyRadar',
  seoDescription: 'Discover how PropertyRadar collects, uses, and protects your personal information while ensuring your privacy rights are respected across our services.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
