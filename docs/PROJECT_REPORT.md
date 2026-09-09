# PackIntel — Full Project Implementation Report

**Project:** PackIntel — AI-Powered Legal Metrology Compliance & Inspection Platform
**Event:** SIH 2026 (Smart India Hackathon)
**Authority Domain:** Department of Consumer Affairs / Legal Metrology, Government of India
**Repo:** `https://github.com/sonavaneshubh/SIH-PackIntel.git`
**Live frontend:** `https://sih-pack-intel.vercel.app`

---

## 1. Problem Statement

Packaged (pre-packaged) commodities sold in India are governed by the **Legal Metrology Act, 2009** and related packaged-commodity rules. Every pre-packaged item must carry a valid label declaring the **name & address of manufacturer**, **net quantity**, **MRP**, **date of manufacture/use-by**, **ingredients**, **customer-care contact**, etc.

**The problem:** Manual enforcement and compliance checking of packaged labels is slow, error-prone, and inconsistent. Inspectors must physically read every label, cross-check it against a large ruleset, compute risk, and generate reports by hand.

**Our solution:** PackIntel uses **AI (OCR + generative vision) + a legal-rule compliance engine** to automatically scan a package label, extract the mandatory declarations, validate them against the Legal Metrology ruleset, produce a **risk/pass-fail verdict**, and generate an official inspection report.

---

## 2. Objectives

1. Automatically extract leaflet/label data from a package photo using OCR + AI vision.
2. Validate extracted data against statutory **Legal Metrology rules**.
3. Provide a clear **Compliance verdict + risk score**.
4. Digitize the full inspection workflow for a **Government inspector**.
5. Provide secure **role-based access** (new inspector registration → admin approval → access).
6. Generate downloadable **PDF/JSON inspection reports**.
7. Maintain full **audit history** and **compliance analytics** for enforcement.

---

## 3. High-Level Architecture

```
┌────────────────────────────┐     REST (HTTP/5000)      ┌─────────────────────────────┐
│   FRONTEND (Next.js 15)    │ ────────────────────────► │  BACKEND (Python FastAPI)   │
│  React 19 + TypeScript     │                            │  OCR / AI / Compliance      │
│  Tailwind CSS, App Router  │ ◄──────────────────────── │  PDF Report Engine          │
└────────────┬───────────────┘                            └──────────────┬──────────────┘
             │  Supabase Auth + Anon client                                  │ SUPABASE
             ▼                                                               ▼ SERVICE ROLE
┌────────────────────────────────────────────────────────────────────────────┐
│                 SUPABASE (Auth + PostgreSQL + Storage buckets)              │
│   - profiles (verification), inspections, extracted labels, compliance,    │
│     reports, images, product info, rules DB                                │
└────────────────────────────────────────────────────────────────────────────┘
```

**Three tiers:**
- **Frontend** — Next.js 15, React 19, TypeScript, Tailwind. Web interface for scanning, results, reports, dashboards, settings, and admin.
- **Backend** — Python 3.10+ / FastAPI. Handles OCR, Gemini Vision extraction, compliance evaluation, risk scoring, and PDF report generation. Secure server-side access to Supabase via service-role key.
- **Supabase** — Auth (GoTrue), PostgreSQL persistence, RLS, and storage buckets for inspection images & generated reports.

---

## 4. Technology Stack

| Layer | Tools |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, lucide-react, clsx, tailwind-merge |
| Backend | Python 3.10+, FastAPI, Uvicorn, Pydantic v2 |
| OCR | Tesseract (pytesseract), Google Cloud Vision, custom layout/text normalizers |
| AI Vision | Google Gemini (google-genai) for declarations extraction, GPT/LLM extractor |
| Image Processing | OpenCV (headless), Pillow, NumPy, blur/quality detection, image enhancement |
| Database / Auth | Supabase (PostgreSQL + Auth/GoTrue), RLS, storage buckets |
| Reports | ReportLab, FPDF2 (PDF), JSON |
| Infra | Vercel (frontend deploy), Render (backend deploy), Docker-ready |

---

## 5. Frontend Feature Map (Pages)

| Page / Route | Purpose |
|---|---|
| `/` | Marketing / home landing |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Authentication |
| `/verification-pending`, `/verification-rejected`, `/access-denied` | Account lifecycle / access control |
| `/inspector/dashboard` | Authorized inspector workspace |
| `/dashboard` | Main compliance dashboard |
| `/scan/new`, `/scan/analyzing`, `/scan/ocr`, `/scan/declarations` | Package scanning pipeline (camera upload → AI analysis → declarations review) |
| `/results` | Pass/fail compliance results |
| `/recent-inspections`, `/history` | Inspection history |
| `/high-priority-inspections` | Prioritized enforcement queue |
| `/analytics` | Compliance statistics & trends |
| `/rules` | Legal Metrology rule database |
| `/reports` | Generated report view / download |
| `/settings` | App & engine settings (OCR, compliance thresholds, reports, notifications, admin approval/resend) |
| `/support`, `/privacy`, `/terms` | Info pages |
| `/admin/inspector-verification/[token]` | Admin review of inspector registration |

---

## 6. Backend Modules

- `api/routes/scan.py` — OCR + AI extraction pipeline entry.
- `api/routes/compliance.py` — Legal Metrology compliance check & risk score.
- `api/routes/inspection.py` — create/read inspection records.
- `api/routes/reports.py` — report generation (PDF/JSON).
- `services/gemini_vision.py`, `vision_service.py`, `product_extractor.py` — AI declaration extraction.
- `services/ocr_service.py`, `ocr_space_service.py`, `layout_ocr.py` — OCR backends.
- `services/image_preprocessor.py`, `image_quality.py`, `image_validation.py`, `package_detector.py` — image pipeline (blur, enhancement, validation).
- `services/compliance_service.py`, `rules_service.py` — rule engine & scoring.
- `services/report_service.py` — PDF/JSON report generation.
- `services/normalization.py`, `text_normalizer.py`, `merge_service.py` — data cleanup/fusion.
- `core/security.py`, `core/memory.py`, `core/config.py` — security, memory mgmt, config.

---

## 7. Database Schema (Supabase)

Core tables & responsibilities:
- **profiles** — inspectors/admins; holds `role`, `verification_status` (`pending|approved|rejected`), `designation`, `department`, `organization`, `location`, `inspector_employee_id`, `phone`, and verification-token audit fields (`verification_token_hash`, `verified_at`, `verified_by`, `rejection_reason`).
- **inspections** — each inspection record (inspector_id, timestamps, products, status).
- **extracted labels / product info** — OCR + AI declarations normalized.
- **compliance results** — per-inspection legal-rule pass/fail + risk score.
- **inspection images / reports** — metadata pointing into Storage buckets.
- **rule database** — the Legal Metrology ruleset used by the compliance engine.
- **Storage buckets** — `inspection-images`, `inspection-reports`.

All policies enforced via **Row Level Security (RLS)**: inspectors see only their own rows; admins can view/verify all; admin verification cannot be done by the user themselves (self-approval blocked in the DB policy).

---

## 8. The Scan / Inspection Workflow

1. **Capture** — Inspector takes a photo (or uploads) of the package label via the camera UI; front/back handling supported.
2. **Preprocess** — Backend validates image quality (blur, darkness), enhances it, and detects the package region.
3. **OCR** — Text is extracted from the label (Tesseract / Google Vision).
4. **AI Extraction** — Gemini Vision + extractor pulls structured declarations: product name, manufacturer, **net quantity**, **MRP**, **date of manufacture / best-before**, ingredients, customer care, etc.
5. **Normalization & Merge** — Cleaned fields fused into a single structured extraction.
6. **Compliance Check** — Compliance service validates against the Legal Metrology rules and computes a **risk score** + **pass/fail / amber** verdict.
7. **Result** — Inspector reviews declarations and the pass/fail result.
8. **Report** — A professional PDF/JSON report is generated and stored for download/sharing.

---

## 9. Authentication & Access Control (Inspector Verification Lifecycle)

- **Registration** → new profile created as `verification_status = pending` (via DB trigger + signup form).
- **Admin approval email** → an email with **ACCEPT / REJECT** action buttons is sent to the configured admin.
- Admin click invokes a **server API** (`/api/signup/verify-action`) that updates the `profiles` row (authoritative source) and syncs auth `user_metadata`.
- **Route enforcement (server-side middleware)** decodes the access-token JWT:
  - no session → `/login`
  - role ≠ inspector → `/access-denied`
  - pending (or missing status) → `/verification-pending`
  - rejected → `/verification-rejected`
  - approved → project access
- **DB-authoritative login:** on sign-in the app reads the current `profiles` row (not stale JWT/localStorage) and routes strictly by it; it reconciles the token metadata so middleware agrees.
- **Demo inspector** account for quick demonstration.
- **Security hardening:** missing verification status defaults to pending; missing/legacy profiles never silently approved; admins approved/promoted explicitly.

---

## 10. Key API Endpoints (Backend, port 5000)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/api/scan` | OCR + AI declaration extraction |
| POST | `/api/inspection` | Create inspection record |
| GET | `/api/inspections` | Inspection history |
| GET | `/api/inspection/{id}` | Inspection detail |
| POST | `/api/compliance/check` | Legal Metrology rule compliance + risk score |
| POST | `/api/reports/generate` | Generate PDF/JSON report |

**Frontend server API routes:** `/api/signup/notify-admin`, `/api/signup/verify-action`, `/api/admin/verification/[token]`, `/api/admin/verify`, `/api/admin/resend` — handle the email-approval workflow.

---

## 11. Recent Work / Feature Highlights (current sprint)

1. **Direct email accept/reject approval** — Admin approves/rejects an inspector in one click from the email (no login needed), returns JSON; token is single-use, hashed, 24h expiry.
2. **DB-authoritative login fix** — Removed the "approved user bounced to pending" bug; login now routes by the live `profiles` value.
3. **Middleware security fix** — absent `verification_status` now blocks (pending) instead of silently allowing, closing a project-access bypass.
4. **Legacy account data reconciliation** — approved the confirmed trusted/admin accounts; other pending users left blocked.
5. **Pending-page UX** — polls DB, shows "Account Approved" + "Go to Login", sign-out before landing on login.
6. **Sidebar updates** — Inspector Workspace placement, pending-account navigation.

---

## 12. Deployment

| Component | Platform | URL |
|---|---|---|
| Frontend | Vercel | `https://sih-pack-intel.vercel.app` |
| Backend | Render | `https://packintel-backend.onrender.com` |
| Database/Auth/Storage | Supabase Cloud | project `uzjhnipkzuzhbgagniwe` (anon + service-role key) |
| Source | GitHub | `github.com/sonavaneshubh/SIH-PackIntel` (main branch auto-deploys) |

Environment secrets (Supabase URL/anon/service-role, Resend API key, admin email, backend API URL) are configured in the deploy platforms; `.env.local` is gitignored and never committed.

---

## 13. Security Measures

- Supabase **RLS** with role-based profile policies; self-approval blocked at the DB layer.
- Backend service-role key is **server-side only**, never exposed to the browser.
- Verification links use **hashed, single-use, expiring tokens**.
- Middleware enforces access on **every protected route** regardless of how the URL is reached (direct nav, refresh, back/forward).
- Missing/ambiguous verification state defaults to **blocked**.

---

## 14. Impact & Benefits

- **Speed:** seconds instead of manual label reading.
- **Accuracy:** consistent, AI-powered extraction + rule-based validation.
- **Scale:** digital enforcement across inspectors, districts and commodity types.
- **Transparency:** auditable history, risk scores, downloadable official reports.
- **Governance:** secure, approved-inspector-only access; admin oversight.

---

## 15. Future Scope

- Mobile native app + offline scanning.
- Multi-language label recognition (Hindi + regional).
- Deeper analytics / trend dashboards for enforcement agencies.
- Integration with trade/e-commerce compliance APIs.
- SMS + WhatsApp notifications for inspectors.

---

## 16. How to Run Locally

```bash
# Frontend
cd frontend
npm install
npm run dev            # http://localhost:3000

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 5000
# API docs: http://localhost:5000/docs
```

---

*End of report. Prepared to support a PowerPoint presentation; each numbered section maps to one or two slides.*
