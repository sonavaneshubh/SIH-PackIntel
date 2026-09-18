# PackIntel - Legal Metrology Compliance & Inspection Platform

PackIntel (Packaged Commodity Intelligence) is an AI-powered platform that scans photographic
evidence of packaged commodities and automatically verifies them against the **Legal Metrology
(Packaged Commodities) Rules, 2011**. It turns a manual, paper-bound inspection workflow into an
instant, app-driven compliance check for Legal Metrology Inspectors across India.

---

## Why PackIntel? (The Problem)

Every packaged product sold in India - from a 500 g flour pouch to a shampoo sachet - must carry
specific declarations under the **Legal Metrology (Packaged Commodities) Rules, 2011**, including:

- Name and address of the manufacturer / packer / importer
- Net quantity (with the exact wording "Net Quantity" or "net qty")
- MRP printed as "MRP Rs. ... (incl. of all taxes)"
- Month and year of manufacture / packing / import
- Customer care details and email
- Best-before / use-before date (where applicable)

**Today the inspector's job is slow and error-prone:** they photograph labels with a phone, manually
read every field, cross-check each declaration against the rules, and jot down risk notes on paper.
Field inspections get backlogged, bad actors slip through, and consumers stay exposed to
short-weighting and misdeclared products.

**PackIntel removes that friction.** One photo in, a compliance verdict and risk score out - in
seconds instead of shifts.

---

## How It Works (Workflow)

```mermaid
flowchart TD
    A[Inspector captures product label photo] --> B{OCR Pipeline}
    B -->|Primary| C[Tesseract OCR]
    B -->|Fallback| D[Google Cloud Vision]
    B -->|Optional multimodal| E[Gemini Vision extraction]
    C --> F[AI extraction normalizes label text]
    D --> F
    E --> F
    F --> G[Structured declarations]
    G --> H[Legal Metrology compliance engine]
    H --> I[Risk score + PASS / FAIL / REVIEW verdict]
    I --> J[Report generation - PDF / JSON]
    J --> K[Inspection record stored in Supabase]


### The end-to-end flow (step by step)

1. **Login** - Inspector signs in via email+OTP, password, or the one-click **Demo Inspector**
   account (no password / OTP needed).
2. **Scan** - Capture (or upload) the product label(s).
3. **Extract** - OCR + AI turn the image into structured label declarations.
4. **Verify** - The compliance engine validates declarations against Legal Metrology rules and
   returns a **PASS / FAIL / REVIEW** verdict with a risk score.
5. **Report** - Generate and download a report (PDF / JSON) for the inspection record.
6. **Audit** - All inspections are stored in Supabase, with full history and analytics dashboards.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, Supabase Auth |
| Backend | Python FastAPI, Tesseract OCR, Google Cloud Vision, Gemini, ReportLab |
| Database | Supabase (Postgres + RLS + Storage) |
| Deployment | Render (backend), Vercel (frontend) |

## Repository Layout

```
PackIntel/
|-- backend/       # Python FastAPI - OCR, AI extraction, compliance engine, reports
|-- frontend/      # Next.js app - inspector UI, auth flows, dashboards, demo login
|-- supabase/      # Database migrations, RLS policies, storage buckets, seed SQL
|-- docs/          # Architecture, API specs, project report, setup guide
|-- render.yaml    # Backend deployment config (Render)
|-- README.md      # This file
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.10+
- Git
- Tesseract OCR 5+ (see docs/SETUP.md - also auto-detected from the standard Windows path)

## End-to-End Setup (Local)

### 1. Clone

```bash
git clone https://github.com/sonavaneshubh/SIH-PackIntel.git
cd SIH-PackIntel
```

### 2. Supabase: project & migrations

1. Create a project at [supabase.com](https://supabase.com) and note the Project URL, the anon
   (public) key, and the service-role key (Settings > API).
2. Apply the migrations in `supabase/migrations/` **in filename order** to create the tables, RLS
   policies, and storage buckets. You can run them in the Supabase Dashboard (SQL Editor) or with:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
3. The two most recent migrations add support used by the demo & auth system:
   - `20260918000010_inspector_suspended_status.sql`
   - `20260919000011_inspector_otp_access_type.sql`

### 3. Backend: virtual env & server

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  |  source .venv/bin/activate  # Unix
pip install -r requirements.txt
copy .env.example .env          # Windows  |  cp .env.example .env  # Unix
# fill SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL in backend/.env

uvicorn app.main:app --reload --host 0.0.0.0 --port 5000
```

- API base: `http://localhost:5000`
- Interactive docs (Swagger UI): `http://localhost:5000/docs`
- Health check: `http://localhost:5000/health`

### 4. Frontend: install & dev server

```bash
cd frontend
npm install
copy .env.example .env.local    # Windows  |  cp .env.example .env.local  # Unix
# fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL

npm run dev
```

Frontend dev server: `http://localhost:3000`

> **If the app looks stale after pulling new code:** stop the server, delete `frontend/.next`,
> and restart. A cached Next.js build silently drops newly added routes.

## One-Click Demo Inspector Login

The homepage has a **"Use Demo Inspector Account"** button that provisions a real, approved,
demo inspector and signs you straight into the inspector dashboard - no password or OTP.

Provision / re-create the demo account (idempotent):

```bash
cd frontend
node --env-file=.env.local scripts/seed-demo-inspector.mjs
```

How it works:
- `POST /api/auth/demo-login` resolves the pre-authorized demo inspector
  (`DEMO_INS_ID`, default `DEMO-INS-001`) with `access_type='demo'`.
- It mints a real Supabase session for that account and hands it to the browser.
- The client adopts the session via `establishSession()` and routes to `/dashboard`.
- `DEMO_SHOW_OTP=true` (demo builds only) echoes the one-time code in the API response so the
  login screen can display it - there is no SMS/email gateway in the SIH build.

## Environment Variables

### Frontend (`frontend/.env.local`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here
NEXT_PUBLIC_API_URL=http://localhost:5000

# Server-side only (never NEXT_PUBLIC_): required for demo login / inspector auth / admin ops
SUPABASE_SERVICE_ROLE_KEY=

# Demo inspector account (used by scripts/seed-demo-inspector.mjs and demo-login route)
DEMO_INSPECTOR_ID=DEMO-INS-001
DEMO_INSPECTOR_NAME=Demo Legal Metrology Inspector
DEMO_INSPECTOR_PASSWORD=            # optional: unlock password login for demo account

# Demo-only: echo the one-time code in the OTP API response so the login screen can show it
# (no SMS gateway in the SIH build). Leave unset or false in any real deployment.
DEMO_SHOW_OTP=false

# Admin bootstrap allowlist (account whose email matches is treated as admin pre-promotion)
ADMIN_VERIFICATION_EMAIL=
```

### Backend (`backend/.env`):

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
FRONTEND_URL=http://localhost:3000
TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe   # optional
```

> **IMPORTANT**: `SUPABASE_SERVICE_ROLE_KEY` must ONLY exist in `backend/.env` and
> `frontend/.env.local` (server-side, unprefixed). It must NEVER be exposed to client/browser
> code, and `.env.local` is gitignored - never commit it.

## REST API Endpoints

- `GET /health` - health status check
- `POST /api/scan` - OCR processing & AI declaration extraction
- `POST /api/inspection` - create a new inspection record
- `GET /api/inspections` - inspection history
- `GET /api/inspections/{id}` - detailed inspection data
- `POST /api/compliance/check` - Legal Metrology compliance check & risk score
- `POST /api/reports/generate` - generate downloadable inspection report (PDF/JSON)
- `POST /api/auth/demo-login` - one-click demo inspector session
- `POST /api/auth/request-otp` / `POST /api/auth/verify-otp` - OTP inspector login
- `POST /api/auth/login` - password inspector login

## Running Tests

```bash
# Backend (pytest)
cd backend
.venv\Scripts\activate
pytest -q

# Frontend typecheck
cd frontend
npx tsc --noEmit

# Frontend lint
npm run lint
```

## Deployment

- **Backend - Render**: deploy from `render.yaml`. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `FRONTEND_URL` (and optional OCR/Gemini keys) as environment variables on the service.
- **Frontend - Vercel**: import the `frontend/` directory, then set `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_URL` in the project's environment.

## Security Notes

- Service-role keys are server-side only and never committed (`.env.local` is gitignored).
- Row-Level Security restricts table access to authenticated inspectors.
- The demo inspector is pre-approved with `access_type='demo'`; the demo session still goes
  through the same authorization path as every other login.
- `ADMIN_VERIFICATION_EMAIL` is a bootstrap allowlist only - promote real admins via the database
  once the platform is in production.

## Team Development Boundaries

- **Frontend Engineers**: work primarily inside `frontend/`
- **Backend Engineers**: work primarily inside `backend/`
- **Database Schema Owners**: manage migrations inside `supabase/`
- **Documentation**: maintain architectural and API guides inside `docs/`
