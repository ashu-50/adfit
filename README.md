# AdFit — AI-Powered Ad-to-Landing Page Fit Analyzer

AdFit analyzes how well a landing page delivers on the promise made in your advertisements.

Paste ad copy or upload ad screenshots, provide a landing page URL, and receive an AI-generated report that identifies message mismatches, broken promises, weak calls-to-action, missing proof, and opportunities to improve conversion rates.

**Live Demo:** https://adfit-f9mx.vercel.app/

---

## The Problem

Most paid advertising campaigns fail because the landing page does not continue the conversation started by the advertisement.

Marketing teams frequently optimize:

- Targeting
- Keywords
- Creative
- Bidding

while overlooking the biggest conversion killer:

> The landing page answers a different question than the advertisement asked.

AdFit solves this by placing the advertisement and landing page side-by-side and evaluating whether the page actually fulfills the ad's promise.

---

# Features

- AI-powered ad analysis using Google Gemini
- Supports both pasted ad copy and screenshot uploads
- Automatic OCR for image-based advertisements
- Landing page content extraction
- Intelligent fallback to Playwright for JavaScript-heavy websites
- Multi-ad campaign analysis
- Persuasion angle clustering
- AI-generated landing page recommendations
- 9-dimensional scoring engine
- PDF, Markdown, JSON and CSV report export
- Project organization
- Dashboard with analysis history
- Usage tracking
- Stripe billing integration
- Real-time progress updates using Server-Sent Events (SSE)
- Authentication with Supabase

---

# Tech Stack

### Frontend

- Next.js 16
- React
- TypeScript
- Tailwind CSS

### Backend

- Next.js Route Handlers
- Prisma ORM
- PostgreSQL
- Supabase

### AI

- Google Gemini
- Gemini Vision (OCR)

### Scraping

- Cheerio
- Playwright

### Storage

- Supabase Storage

### Authentication

- Supabase Auth

### Payments

- Stripe

---

# Architecture

```text
                  +----------------------+
                  |   Ad Copy / Images   |
                  +----------+-----------+
                             |
                             v
                  Gemini OCR / Parsing
                             |
                             |
Landing Page URL ------------+
                             |
                     HTML Fetch
                             |
           +-----------------+-----------------+
           |                                   |
           | Static HTML                       |
           |                                   |
           v                                   v
       Cheerio Extractor              Playwright Renderer
                \                         /
                 \                       /
                  +---------------------+
                  |
                  v
            AI Analysis Engine
                  |
                  v
          Deterministic Scoring
                  |
                  v
          Detailed Analysis Report
```

---

# How It Works

## 1. Landing Page Extraction

AdFit first performs a lightweight HTTP fetch.

Most landing pages are server-rendered, making this approach significantly faster than launching a browser.

If the page is detected as an SPA shell, AdFit automatically switches to a Playwright renderer.

Extracted elements include:

- Hero section
- Headlines
- CTAs
- Pricing
- Testimonials
- FAQ
- Forms
- Navigation
- Trust signals

---

## 2. Advertisement Parsing

Two input methods are supported.

### Text Ads

Structured directly using Gemini.

### Screenshot Ads

- OCR
- Content understanding
- Offer extraction
- CTA detection
- Audience detection

Both produce a common structured advertisement format.

---

## 3. AI Analysis

Gemini compares advertisements with the extracted landing page across nine conversion dimensions.

For multiple advertisements, the system also:

- Clusters ads by persuasion angle
- Identifies dominant messaging
- Generates recommended landing page sections

---

## 4. Deterministic Scoring

Unlike many AI tools, Gemini does **not** calculate the final score.

The model only returns:

- Dimension scores
- Confidence
- Evidence
- Findings
- Recommendations

The application calculates the final score using deterministic business rules, ensuring consistent and repeatable results.

---

# Scoring Model

| Dimension | Weight |
|------------|-------:|
| Message Match | 18% |
| Offer Match | 15% |
| CTA Match | 13% |
| Above-the-Fold Continuity | 12% |
| Persona Match | 11% |
| Product Framing | 10% |
| Proof & Credibility | 9% |
| Objection Handling | 7% |
| Visual Continuity | 5% |

Total Weight = **100%**

---

# Grade Scale

| Score | Grade |
|--------|-------|
| 85+ | A |
| 70–84 | B |
| 55–69 | C |
| 40–54 | D |
| Below 40 | F |

---

# Scoring Rules

The scoring engine applies several deterministic rules.

### Critical Finding Ceiling

Critical issues cap the final score regardless of strengths elsewhere.

Example:

A landing page with a misleading CTA cannot receive a high grade simply because it has strong testimonials.

---

### Confidence Damping

Low-confidence AI outputs are pulled toward neutral instead of being trusted blindly.

---

### Weight Redistribution

If a scoring dimension cannot be evaluated (for example, no screenshots are provided), its weight is redistributed proportionally rather than unfairly reducing the overall score.

---

# API

| Endpoint | Methods | Description |
|-----------|----------|-------------|
| `/api/analyses` | GET, POST | Create and list analyses |
| `/api/analyses/[id]` | GET, DELETE | Retrieve or delete an analysis |
| `/api/analyses/[id]/events` | GET | Live progress stream |
| `/api/analyses/[id]/export` | GET | Export reports |
| `/api/analyses/[id]/rerun` | POST | Re-run an analysis |
| `/api/projects` | GET, POST | Manage projects |
| `/api/uploads` | POST | Generate signed upload URLs |
| `/api/usage` | GET | Usage statistics |
| `/api/health` | GET | Health check |
| `/api/billing/*` | POST | Stripe checkout and portal |
| `/auth/callback` | GET | Authentication callback |
| `/auth/signout` | POST | Logout |

---

# Engineering Decisions

## Static HTML First

A standard HTTP fetch is attempted before launching Playwright.

Typical response times:

- Static fetch ≈ 200 ms
- Playwright ≈ 4 seconds

This keeps analyses fast while still supporting JavaScript-heavy websites.

---

## Deterministic Scoring

Business rules are implemented in application code instead of relying entirely on AI.

Benefits:

- Consistent scores
- Predictable grading
- Easier testing
- Repeatable behavior

---

## Atomic Quota Reservation

Quota reservations are performed atomically using a single SQL statement to prevent race conditions during concurrent requests.

---

## Background Processing

Long-running analysis tasks execute after the initial response, allowing users to receive an analysis ID immediately while processing continues asynchronously.

---

## SSE Progress Updates

Analysis progress is streamed using Server-Sent Events backed by PostgreSQL polling, avoiding the complexity of maintaining WebSocket infrastructure.

---

## Stripe Synchronization

Subscription state is synchronized directly from Stripe webhooks, ensuring idempotent billing updates even when events arrive out of order.

---

# Running Locally

## Requirements

- Node.js >= 20.11
- PostgreSQL / Supabase
- Gemini API Key

Install dependencies

```bash
pnpm install
```

Copy environment variables

```bash
cp .env.example .env.local
```

Run database migrations

```bash
pnpm db:migrate
```

Apply RLS policies

```bash
pnpm db:rls
```

Seed demo data

```bash
pnpm db:seed
```

Start development server

```bash
pnpm dev
```

---

# Testing

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All commands pass successfully.

The scoring engine is fully unit tested to ensure:

- Weight calculations remain correct
- Critical finding ceilings behave consistently
- Confidence damping is deterministic
- Weight redistribution is accurate

---

# Screens

| Route | Description |
|--------|-------------|
| `/` | Landing page |
| `/login` | Authentication |
| `/signup` | Registration |
| `/dashboard` | Analytics dashboard |
| `/new` | New analysis |
| `/analyses` | Analysis history |
| `/analyses/[id]` | Detailed report |
| `/projects` | Project management |
| `/settings/billing` | Billing & subscription |

---

# Project Highlights

- AI-assisted landing page optimization
- Intelligent OCR pipeline
- Automatic rendering strategy selection
- Deterministic scoring engine
- Multi-ad campaign clustering
- Exportable reports
- Enterprise-ready authentication
- Subscription billing
- Background processing
- Real-time progress tracking

---

# Current Limitations

- Prisma migrations are not included in the repository.
- API key authentication is planned but not implemented.
- Audit event logging model exists but is not yet used.
- Component and end-to-end tests are planned.
- Uploaded screenshots are analyzed but are not yet displayed within the final report.

---

# Future Improvements

- API Key authentication
- Audit logging
- Component testing
- End-to-end testing
- Screenshot previews inside reports
- Additional AI models
- Team collaboration
- Organization workspaces
- Advanced analytics

---

# License

MIT License

---
