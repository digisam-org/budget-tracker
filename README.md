# Budget Tracker PWA & Bank Statement Ingestion Engine

A mobile-first Progressive Web App (PWA) and zero-based personal budget management system designed to eliminate manual logging fatigue through frictionless bank statement ingestion (CSV/OFX), automated deduplication, and multi-category segregation.

---

## Key Features

- **Frictionless CSV Dropzone:** Upload raw statement exports from major UK financial institutions (Monzo, Barclays, HSBC, Starling, Amex, Lloyds, and generic bank CSVs).
- **SHA-256 Deduplication:** Deterministic hashing (`accountId + date + amount + raw_description`) prevents duplicate entries across overlapping statement exports.
- **Strict Domain Financial Segregation:**
  - **Living Expenses:** Fixed bills and variable living costs.
  - **Rental Properties:** Segregated rental inflows, letting fees, and property maintenance (calculating pure rental net yields without skewing living expenses).
  - **Savings & Transfers:** Capital allocation to ISAs, SIPPs, and brokerages are treated as transfers and excluded from consumption expenses.
- **Zero-Based Budget Planner:** Allocate every pound (`Total Income - (Expenses + Savings) = £0.00`) with real-time planned vs. actual progress indicators.
- **Mobile Staging & 1-Tap Review Queue:** Fast confirmation for ingested items with quick category chip reassignment and auto-learning rules.
- **Installable PWA:** Configured with Web App Manifest and mobile viewport safe-area ergonomics.

---

## Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React 19)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Database & ORM:** [Drizzle ORM](https://orm.drizzle.team/) with SQLite / [libSQL](https://github.com/tursodatabase/libsql-client-ts)
- **Icons & UI:** [Lucide Icons](https://lucide.dev/)
- **Parsing:** [PapaParse](https://www.papaparse.com/)

---

## Project Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── accounts/route.ts          # Connected accounts endpoint
│   │   ├── budget/route.ts            # Zero-based monthly allocation endpoint
│   │   ├── ingest/route.ts            # CSV parser, detector & deduplication endpoint
│   │   └── transactions/review/route.ts # 1-tap review & learning rule endpoint
│   ├── budget/page.tsx                # Zero-Based Budget Planner view
│   ├── dropzone/page.tsx              # Frictionless Dropzone view
│   ├── review/page.tsx                # Fast Staging & Review Queue view
│   ├── transactions/page.tsx          # Searchable ledger view
│   ├── layout.tsx                     # PWA layout shell & mobile viewport
│   └── page.tsx                       # Dashboard & Monthly KPI cards
├── components/
│   ├── budget/budget-planner-client.tsx
│   ├── mobile-nav.tsx                 # Mobile bottom navigation bar
│   ├── review/review-queue-client.tsx
│   └── transactions/transactions-list-client.tsx
└── lib/
    ├── budget/calculator.ts           # Zero-based budget math & KPI formulas
    ├── classifier/
    │   ├── rules-engine.ts            # Regex & contains rule matcher
    │   └── transfer-matcher.ts        # Internal transfer pair matcher
    ├── db/
    │   ├── index.ts                   # Drizzle client instance
    │   ├── schema.ts                  # Relational schema
    │   └── seed.ts                    # Default UK accounts, categories & rules
    ├── ingestion/
    │   ├── detector.ts                # UK bank format detector
    │   ├── fingerprint.ts             # SHA-256 deduplication hashing
    │   └── normalizer.ts              # Bank row normalizer (minor units in pence)
    └── utils.ts                       # Currency and classname utilities
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Initialize Database & Seed Defaults
```bash
npm run db:push
npm run db:seed
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) on your device or mobile emulator.

---

## Database Management

- `npm run db:push` - Apply schema changes to `budget.db`
- `npm run db:generate` - Generate Drizzle migration files
- `npm run db:seed` - Seed default accounts, categories, and merchant rules
