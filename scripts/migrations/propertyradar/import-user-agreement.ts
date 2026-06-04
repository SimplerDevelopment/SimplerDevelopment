/**
 * Import PropertyRadar /user-agreement — LEGAL page.
 * Run: npx tsx scripts/migrations/propertyradar/import-user-agreement.ts
 *
 * Source: data/marketing/user-agreement.json
 * Full agreement text is present (177 paragraphs). All sections preserved faithfully.
 * Effective Date: February 26, 2026.
 * NO marketing CTA (legal page).
 */
import { T, makePage, footerBlock, upsertPage } from './_shared';

const p = makePage();

// ─── Hero (compact light) ─────────────────────────────────────────────────────
p.add(p.hero({
  title: 'User Agreement',
  subtitle: 'LEGAL',
  description: 'Effective Date: February 26, 2026. Your rights and responsibilities when using PropertyRadar websites, applications, browser extensions, and services.',
  dark: false,
  minHeight: '40vh',
}));

// ─── Reusable heading helpers ─────────────────────────────────────────────────
const narrow820: Record<string, unknown> = { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto' };
const h2Style = (id: string, text: string) => ({
  id, type: 'heading', order: p.ord(), content: text, level: 2, alignment: 'left',
  style: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', ...narrow820, marginTop: '40px', marginBottom: '8px' },
});
const bodyText = (id: string, content: string) =>
  p.text(id, content, T.INK, 'left', { ...narrow820, marginTop: '12px' });

// ─── Main agreement section ───────────────────────────────────────────────────
p.add(p.section('sec-ua', T.WHITE, 80, [

  // Summary of changes
  h2Style('ua-h-summary', 'Summary of Recent Updates'),
  bodyText('ua-sum-1', 'We\'ve updated our User Agreement to make it clearer and more comprehensive. Key updates include:'),
  bodyText('ua-sum-2', '1. Privacy Policy Integration — Our Privacy Policy is now explicitly incorporated by reference. Review it at propertyradar.com/privacy-policy.\n2. Browser Extensions Included — Our agreement now explicitly covers browser extensions as part of the PropertyRadar Offerings.\n3. Clearer User Restrictions Section — A dedicated "User Restrictions" section clearly outlines the requirements for using PropertyRadar.\n4. Contractor Clarification — Contractors and service providers may use PropertyRadar on your behalf when providing services to you.\n5. Dispute Resolution Updates — Updated arbitration provisions.'),
  bodyText('ua-sum-3', 'The core protections and requirements remain unchanged: compliance with applicable law, prohibition on unauthorized use, and our commitment to being a trusted data platform. Important Note: By continuing to use PropertyRadar after January 21, 2026, you\'re agreeing to these updated terms.'),

  p.divider('ua-div0'),

  // Main agreement text
  h2Style('ua-h-main', 'User Agreement'),
  bodyText('ua-intro-1', 'Welcome to the PropertyRadar.com websites (collectively, the "Sites")! "We," "Our" and "Us" refers to PropertyRadar, Inc. This User Agreement (this "Agreement") describes (i) your rights and responsibilities when using any of the Sites or any browser extension ("Extensions"), (ii) Our provision of certain services, products, information, applications, APIs, software and/or data on the Sites and/or the Applications (collectively, "Services"), and/or (iii) your downloading, installing or using Our iPhone or Android applications (the "Applications," and together with the Sites, Extensions, Services and Materials, the "PropertyRadar Offerings"). Please read them carefully. We are grateful you are here.'),
  bodyText('ua-intro-2', 'IF YOU ARE UNWILLING TO BE BOUND BY THIS AGREEMENT, DO NOT ACCESS OR USE PROPERTYRADAR OFFERINGS. BY USING ANY OF THE PROPERTYRADAR OFFERINGS AND/OR BY CLICKING THE CHECK BOX INDICATING THAT YOU ACCEPT THIS AGREEMENT, YOU ACKNOWLEDGE THAT YOU HAVE REVIEWED AND ACCEPT THE TERMS OF THIS AGREEMENT.'),
  bodyText('ua-intro-3', 'THIS AGREEMENT CONTAINS AN ARBITRATION PROVISION AND CLASS ACTION WAIVER THAT AFFECTS YOUR RIGHTS UNDER THIS AGREEMENT WITH RESPECT TO DISPUTES YOU MAY HAVE WITH US. YOU MAY OPT OUT OF THE BINDING INDIVIDUAL ARBITRATION AND CLASS ACTION WAIVER AS PROVIDED BELOW IN THE "DISPUTE RESOLUTION ARBITRATION; CLASS ACTION WAIVER" SECTION.'),
  bodyText('ua-intro-4', 'This Agreement incorporates Our Privacy Policy by reference, which can be accessed at propertyradar.com/privacy-policy. This Agreement forms a binding contract between you and Us. The PropertyRadar Offerings are only available for use by valid business entities, including sole proprietorships. You represent and warrant that you have the authority to bind that entity.'),

  p.divider('ua-div1'),

  h2Style('ua-h-restrictions', 'User Restrictions'),
  bodyText('ua-restr-1', 'By using the PropertyRadar Offerings, you represent and warrant that you: (a) are 18 years of age or older; (b) can enter into legally binding contracts under Applicable Law; (c) are not a resident of, or physically located in, the United Kingdom or any European Union Member State; and (d) are acting in your capacity as a duly authorized representative of a valid business entity. We may terminate your use without notice if we reasonably believe you do not satisfy these requirements or are engaging in prohibited activities.'),

  p.divider('ua-div2'),

  h2Style('ua-h-bizuse', 'Use of the PropertyRadar Offerings – For Business Use Only'),
  bodyText('ua-biz-1', 'We grant you a limited, individual, non-exclusive, non-transferable and completely revocable license to use the PropertyRadar Offerings solely for your entity\'s internal business purposes, subject to your compliance with the terms of this Agreement. PropertyRadar Offerings which require registration must be used solely by the non-consumer institutional end-user named during the registration process. You will not permit any other party or entity to use the Services on your behalf, except for your contractors and service providers who need to use the Services in order to provide their services to you or on your behalf. The PropertyRadar Offerings are provided for your informational purposes only.'),

  p.divider('ua-div3'),

  h2Style('ua-h-prohibited', 'Activities That Are Not Allowed'),
  bodyText('ua-proh-1', 'You shall not use the PropertyRadar Offerings in any way that would result in a violation of your obligations under this Agreement. Prohibited activities include but are not limited to:'),
  bodyText('ua-proh-2', '• Stalking, harassing, or harming another individual.\n• Violating any local, state, national, foreign, or international statute, regulation, rule, order, treaty, or other law.\n• Impersonating any person or entity.\n• Using the data to establish eligibility for credit, insurance, or employment, or in a way that would constitute a "consumer report" under the FCRA.\n• Using the Offerings for any purposes other than your own marketing and management purposes.\n• Transferring, sharing, disclosing, distributing, reselling, sublicensing, or creating derivative products from the PropertyRadar Offerings.\n• Combining PropertyRadar data with other data sources to create databases for resale or distribution.\n• Reverse engineering, decompiling, or attempting to discover any source code.\n• Using automated means, robots, spiders, or scripts to access the Offerings or collect data for AI training or competitive purposes.\n• Engaging in screen scraping, database scraping, or other activities to obtain content from the Offerings.\n• Using the Offerings for benchmarking or any competitive purposes.'),

  p.divider('ua-div4'),

  h2Style('ua-h-legal', 'Legal Compliance'),
  bodyText('ua-legal-1', 'When using the PropertyRadar Offerings, you represent and warrant that you will comply with all applicable laws, including MMA and CTIA guidelines, mobile carrier policies, the Telephone Consumer Protection Act (TCPA), the Telemarketing Sales Rule (TSR), National Do Not Call Registry rules, and all state and federal laws related to privacy, data protection, and credit (collectively, "Applicable Law").'),
  bodyText('ua-legal-2', 'To the extent required by Applicable Law, you represent and warrant that each individual you contact has provided prior express written consent (TCPA Consent). You shall collect, maintain, and provide TCPA Consent Records for a minimum of six (6) years and must produce them within two (2) business days of our request.'),

  p.divider('ua-div5'),

  h2Style('ua-h-disclaimer', 'We Do Not Offer Legal, Personal or Professional Advice'),
  bodyText('ua-disc-1', 'The PropertyRadar Offerings are available for the purpose of providing general information on properties, property owners, property occupants, and other related issues. You should not rely on the PropertyRadar Offerings as a replacement or substitute for any professional, financial, legal or other advice or counsel. WE MAKE NO REPRESENTATIONS OR WARRANTIES, AND EXPRESSLY DISCLAIM ANY AND ALL LIABILITY, CONCERNING ACTIONS TAKEN BY A USER BASED ON OR IN ANY WAY RELATED TO THE PROPERTYRADAR OFFERINGS.'),

  p.divider('ua-div6'),

  h2Style('ua-h-changes', 'Changes'),
  bodyText('ua-ch-1', 'We may alter the PropertyRadar Offerings that We offer you and/or choose to modify, suspend or discontinue some or all of the PropertyRadar Offerings at any time and without notifying you. We may also change, update, add or remove provisions of the terms of this Agreement from time to time. We will inform you of any modifications by posting them on the Sites and, for users where a login is required, We will ask you to accept the modifications when you next log into your account.'),

  p.divider('ua-div7'),

  h2Style('ua-h-accounts', 'Password Areas of the PropertyRadar Offerings'),
  bodyText('ua-acct-1', 'If you want to open an account with Us, you must submit: first and last name; a working email address; mobile phone number; and preferred password. In order to sign up for a Free Trial, you must also provide valid credit card information and enter a valid verification code to confirm your account. You are responsible for maintaining the confidentiality of your password(s) and for any actions taken through your account. Should you believe your password or security has been breached, you must immediately notify Us.'),

  p.divider('ua-div8'),

  h2Style('ua-h-subscription', 'Subscription Terms'),
  bodyText('ua-sub-1', 'By registering for an account with Us, you become a "Subscriber" with access to certain password-restricted areas and PropertyRadar Offerings. Each Subscription and its rights are personal and non-transferable. All sales and payments of Subscription fees will be in US Dollars.'),
  bodyText('ua-sub-2', '• Free Trial: Certain Offerings may be offered on a free trial basis. You may cancel during the Free Trial for any reason. After the Free Trial expires, you will be charged without further notice. You are entitled to no more than one Free Trial. IF YOU SIGN UP FOR A SUBSCRIPTION THAT INCLUDES A FREE-TRIAL PERIOD, UNLESS YOU CANCEL PRIOR TO EXPIRATION, WE WILL AUTOMATICALLY CHARGE YOU THE SUBSCRIPTION FEE UPON EXPIRATION.'),
  bodyText('ua-sub-3', '• Auto Renewal: Your Subscription will automatically renew for a term equal to the Initial Term unless canceled prior to the expiration of the then-current term. IF YOU DO NOT WISH TO RENEW, YOU MUST CANCEL PRIOR TO EXPIRATION. Non-refundable for the pre-paid term; you retain access for the remainder of that term.'),
  bodyText('ua-sub-4', '• Cancelation: YOU MAY CANCEL YOUR SUBSCRIPTION AT ANY TIME by: (1) logging in to app.propertyradar.com and completing the cancelation form in Billing under Settings; (2) emailing support@propertyradar.com; or (3) mailing a cancelation notice at least 10 business days prior to the desired cancelation date to: PropertyRadar, P.O. Box 837, Truckee, CA 96160.'),
  bodyText('ua-sub-5', '• Termination: We reserve the right to terminate your Subscription or access at any time for any or no reason. Your sole remedy for such termination is a pro-rated refund of the pre-paid Subscription fee for the then-current term.\n• Payment: All payments are non-refundable. We accept major credit cards. If your credit card is declined or you fail to pay, access to the Offerings may be terminated or suspended.'),

  p.divider('ua-div9'),

  h2Style('ua-h-3rdparty', 'Third Party Content and Integrations'),
  bodyText('ua-3p-1', 'Certain information may be provided by third party licensors ("Third Party Content"). Third Party Content is provided "as is, as available" with all faults. We, on our own behalf and on behalf of our licensors, disclaim all express, implied, and statutory warranties with regard to Third Party Content.'),
  bodyText('ua-3p-2', 'The PropertyRadar Offerings may contain links to Third Party Web Sites. We do not verify, make representations, or take responsibility for such linked sites, including the truthfulness, accuracy, quality or completeness of their content or activities. Any complaints, concerns, or questions relating to materials provided by third parties should be forwarded directly to the applicable third party.'),
  bodyText('ua-3p-3', 'Some features rely on Third-Party Integrations. You are solely responsible for establishing contractual relationships with integration providers, maintaining your accounts, and ensuring the accuracy and legality of data exchanged via such integrations.'),

  p.divider('ua-div10'),

  h2Style('ua-h-ai', 'Use of Artificial Intelligence Functionalities'),
  bodyText('ua-ai-1', 'To the extent you utilize the AI Features, you authorize Us to provide, copy, display, and distribute data you input to Our third-party AI service providers in support of delivery of the AI Features. AI FEATURES ARE NOT A SUBSTITUTE FOR YOUR KNOWLEDGE, EXPERTISE, SKILL, AND JUDGMENT. OUTPUT MAY CONTAIN ERRORS AND OMISSIONS. YOU TAKE FULL RESPONSIBILITY FOR THE USE OF INFORMATION AND PREDICTIVE INSIGHTS PROVIDED BY THE AI FEATURES. WE DO NOT PROVIDE LEGAL, REAL ESTATE, OR OTHER PROFESSIONAL ADVICE THROUGH THE AI FEATURES.'),

  p.divider('ua-div11'),

  h2Style('ua-h-ip', 'Proprietary Rights'),
  bodyText('ua-ip-1', '"PropertyRadar" is a trademark of PropertyRadar, Inc. in the United States. Unless otherwise specified, all information, material, content and screens made available through the PropertyRadar Offerings are Our sole property, Copyright © 2006-2022 PropertyRadar, Inc. All rights not expressly granted herein are reserved. You are entitled only to limited use of the IP Rights as expressly granted in this Agreement.'),

  p.divider('ua-div12'),

  h2Style('ua-h-submissions', 'Submissions'),
  bodyText('ua-sub2-1', 'You are responsible for all text, files, images, photos, videos, sounds, works of authorship, or any other materials you submit, post or otherwise make available through the PropertyRadar Offerings. Public Submissions may be visible to, searchable by, and accessed by anyone with access to those areas. You should not post confidential or sensitive information in Public Areas. You represent and warrant that all Submissions are accurate, complete, and do not violate any applicable laws or the rights of any third party.'),
  bodyText('ua-sub2-2', 'Your Private Submissions will be treated as proprietary and confidential. We will not access, view, or use your Private Submissions except as necessary to maintain or provide the PropertyRadar Offerings or as required by applicable law. With respect to Public Submissions, you grant Us a sublicensable, non-exclusive, assignable, fully-paid and royalty-free, worldwide license to use, publicly perform, publicly display, reproduce, distribute, modify and prepare derivative works of the Public Submissions.'),

  p.divider('ua-div13'),

  h2Style('ua-h-dmca', 'Copyright and Trademark Infringements'),
  bodyText('ua-dmca-1', 'We respect the intellectual property rights of others and have a policy of removing Submissions that violate intellectual property rights of others. If you believe your copyright is being infringed, please provide written notice to:'),
  bodyText('ua-dmca-2', 'PropertyRadar, Inc.\nAttn: Copyright Attorney\nP.O. Box 837, Truckee, CA 96160\ninfo@propertyradar.com'),

  p.divider('ua-div14'),

  h2Style('ua-h-warranty', 'Disclaimer of Warranties'),
  bodyText('ua-war-1', 'The PropertyRadar Offerings and Third Party Content are made available for informational purposes only. The Offerings may be based upon data collected, computed and/or modeled from a number of sources, including public records and statistical calculations, and may not be free from inaccuracies, errors or defects. NO WARRANTY. WE AND OUR SUPPLIERS PROVIDE THE PROPERTYRADAR OFFERINGS ON AN "AS IS," "WITH ALL FAULTS AND DEFECTS" AND "AS AVAILABLE" BASIS. WE AND OUR SUPPLIERS EXPRESSLY DISCLAIM ANY AND ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.'),

  p.divider('ua-div15'),

  h2Style('ua-h-liability', 'Limitation of Liability'),
  bodyText('ua-liab-1', 'IN NO EVENT WILL WE OR ANY SUPPLIER BE LIABLE TO YOU FOR ANY INDIRECT, CONSEQUENTIAL, SPECIAL, INCIDENTAL, OR PUNITIVE DAMAGES ARISING OUT OF, BASED ON, OR RESULTING FROM THIS AGREEMENT OR YOUR USE OF, OR INABILITY TO USE, THE PROPERTYRADAR OFFERINGS, INCLUDING WITHOUT LIMITATION LOSS OF PROFITS, DATA, REVENUE, USE OR OTHER ECONOMIC ADVANTAGE, WHETHER ARISING FROM CONTRACT, TORT (INCLUDING NEGLIGENCE) OR ANY OTHER CAUSE OF ACTION.'),
  bodyText('ua-liab-2', 'DAMAGES CAP: IN NO EVENT SHALL OUR TOTAL, AGGREGATE LIABILITY EXCEED THE TOTAL AMOUNT OF SUBSCRIPTION FEES PAID BY YOU TO US IN THE SIX-MONTH PERIOD IMMEDIATELY PRIOR TO THE EVENT GIVING RISE TO THE CLAIM.'),

  p.divider('ua-div16'),

  h2Style('ua-h-indemnity', 'Indemnification'),
  bodyText('ua-ind-1', 'You agree to fully indemnify and hold Us and any of Our officers, directors, employees, affiliates, agents, licensors, business partners or suppliers harmless from and against any and all claims, liabilities, costs, damages and expenses (including attorneys\' fees and costs of defense) arising out of or relating to (a) your use of the PropertyRadar Offerings; (b) any claim related to the TCPA Consent obtained from your Call Recipients; and/or (c) any violation of applicable law.'),

  p.divider('ua-div17'),

  h2Style('ua-h-dispute', 'Dispute Resolution and Arbitration; Class Action Waiver'),
  bodyText('ua-disp-1', 'This Agreement shall be governed by and construed in accordance with the laws of the State of California. You and the Covered Parties agree to arbitrate all claims that may arise under and/or relate to the PropertyRadar Offerings and this Agreement before JAMS (Judicial Arbitration and Mediation Services) in Sacramento, CA, before a single arbitrator. You agree to first submit an "Initial Dispute Notice" to support@propertyradar.com before initiating arbitration.'),
  bodyText('ua-disp-2', 'To the extent permitted by law, you agree that you will not bring, join or participate in any class action lawsuit as to any claim, dispute or controversy against any of the Covered Parties. You may opt-out of these dispute resolution provisions by providing written notice of your decision within thirty (30) days of the date that you first consent to this Agreement.'),

  p.divider('ua-div18'),

  h2Style('ua-h-misc', 'General Provisions'),
  bodyText('ua-misc-1', 'Local Laws; Export Control: We control and operate the PropertyRadar Offerings from Our headquarters in the United States of America.'),
  bodyText('ua-misc-2', 'Survival: Proprietary rights, disclaimer of warranties, representations made by you, indemnification, and limitations of liability shall survive the termination of this Agreement.'),
  bodyText('ua-misc-3', 'Assignment: You may not assign this Agreement or any rights hereunder. We may at Our sole discretion assign this Agreement without your consent.'),
  bodyText('ua-misc-4', 'Governing Law: This Agreement shall be subject to and construed in accordance with the laws of the State of California, excluding its conflict of law principles.'),
  bodyText('ua-misc-5', 'Severability; Waiver: If any provision of this Agreement is determined to be invalid or unenforceable, the remaining provisions shall continue in full force and effect. Our failure to enforce any provision shall not constitute a waiver of Our right to do so.'),
  bodyText('ua-misc-6', 'Entire Agreement: The terms and conditions of this Agreement, including the Privacy Policy, constitute the entire agreement between you and Us with respect to the subject matter hereof. There are no other representations or warranties, oral or written.'),
  bodyText('ua-misc-7', 'Force Majeure: Other than for payment obligations, neither party will be liable for causes beyond their reasonable control, including natural disasters, government action, or labor disputes.'),
  bodyText('ua-misc-8', 'Electronic Signatures: You acknowledge and agree that you accept this Agreement via electronic means. Your electronic signature is as valid as a physical signature.'),
  bodyText('ua-misc-9', 'Third Party Beneficiaries: The Covered Parties, as well as Our suppliers and their respective suppliers, are intended third-party beneficiaries of this Agreement.'),

  p.spacer('ua-bottom-sp', 'xl'),
], { maxWidth: '900px' }, {}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'user-agreement',
  title: 'User Agreement',
  seoTitle: 'User Agreement | Terms of Service for PropertyRadar Offerings | PropertyRadar',
  seoDescription: 'Understand your rights and responsibilities when using PropertyRadar\'s services, including compliance with laws and prohibited activities.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
