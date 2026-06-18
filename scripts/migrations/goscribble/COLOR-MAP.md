# Scribble (goscribble.ai) — Verified Section Color Map

Source: live computed styles (Playwright `getComputedStyle`), not CSS-variable guesses. Captured 2026-06-12.

## Brand palette (from `:root` + verified)
- **Navy** `#0C1F3F` (dark sections, headings) · navy-mid `#0A2A4A` (gradient end)
- **Teal** `#00B896` (primary accent / CTAs) · teal-dark `#009E80` (hover) · teal-light `#E6F9F5`
- **Off-white** `#F7F9FC` (alternating light sections)
- **White** `#FFFFFF`
- **Text** heading `#0C1F3F`, body `#64748B` (slate)
- Fonts: **Plus Jakarta Sans** (headings + body), **Caveat** (handwritten — logo wordmark + accents)

## Home page section sequence (top → bottom)
| # | Section | BG (verified) | Heading | Body | Notes |
|---|---|---|---|---|---|
| 1 | Hero | **DARK** `linear-gradient(160deg,#0C1F3F,#0A2A4A)` | white | white/65% | eyebrow pill "Active in 12 States · HIPAA Compliant"; title accents "patients"/"paperwork" in teal; 2 CTAs (teal solid + outline); floating product-dashboard mockup + "45 min saved per visit" stat card |
| 2 | Stats bar | **WHITE** `#FFFFFF` | teal numbers | — | 4 stats: 45 min / 1–3 / $4M+ / 12 |
| 3 | Problem | **LIGHT** `#F7F9FC` | navy | slate | 3 cards (3+ hrs daily / highest attrition / $52K to replace RN) |
| 4 | Real-time docs (3 steps) | **WHITE** | navy | slate | 3 steps: Activate at the door / OASIS fills real time / Review & submit |
| 5 | Outcomes | **DARK** `#0C1F3F` | white | white/60% | 3 tabs (For Agencies / For Clinicians / For Patients), 6 metric cards each = 18 |
| 6 | Testimonials | **LIGHT** `#F7F9FC` | navy | slate | 4 cards w/ stars |
| 7 | Integrations | **WHITE** | navy | slate | EHR logos: KanTime, WellSky, Netsmart, Axxess, MatrixCare + "Any HL7/FHIR" |
| 8 | FAQ | **LIGHT** `#F7F9FC` | navy | — | 6 Q&As (accordion) |
| 9 | ROI calculator | **LIGHT** `#F7F9FC` | navy | slate | INTERACTIVE widget → flag; static snapshot: $2.5M / +1,000 / 5,000 / $125K |
| 10 | CTA band | **DARK** `linear-gradient(135deg,#0C1F3F,#0A2A4A)` | white | white/60% | "See a 20-minute demo." 2 buttons |
| 11 | Footer | **DARK** `#0C1F3F` | — | white/45% | Product / Resources / Company columns; address Malvern PA |

**Light/dark rhythm:** D · W · L · W · D · L · W · L · L · D · D. Match exactly — do NOT impose generic alternation. CTAs are **navy gradient**, never purple.
