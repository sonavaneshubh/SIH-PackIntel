# PackIntel — MVP Blueprint & Implementation Guide

**Project:** PackIntel — AI-Powered Legal Metrology Compliance & Inspection Platform
**Event:** SIH 2026 (Smart India Hackathon)
**Authority Domain:** Department of Consumer Affairs / Legal Metrology, Government of India
**Repo:** `github.com/sonavaneshubh/SIH-PackIntel`

---

## 1. Executive Summary

PackIntel is a web platform that automates **Legal Metrology compliance inspection** of packaged commodities in India. An inspector photographs a product label (front and/or back), and the platform:

1. Validates image quality and detects whether it is a food package.
2. Runs **OCR** and **AI vision** to extract the statutory declarations (MRP, net quantity, manufacturer/packer/importer, MFG/Best-before dates, FSSAI, customer-care contacts, vegetarian mark, country of origin, etc.).
3. Validates the extracted data against the codified **Legal Metrology (Packaged Commodities) Rules, 2011**.
4. Produces a **PASS / REVIEW / FAIL verdict** with a **0–100 risk score** and an official **PDF/JSON inspection report**.

The MVP closes a real government pain point: manual label reading is slow, error-prone, and inconsistent. PackIntel digitizes the full workflow — capture → extract → check → report → analytics.

---

## 2. Problem Statement

Governed by the **Legal Metrology Act, 2009** and the **Legal Metrology (Packaged Commodities) Rules, 2011**, every pre-packaged commodity sold in India must carry a legible label declaring:

- Name & complete address of manufacturer / packer / importer
- **Net quantity** (with correct units, e.g. g, kg, ml, l, pcs)
- **MRP** (inclusive of all taxes)
- **Date of manufacture / pack** and **Best-before / Use-by** date
- Customer-care contact, country of origin, FSSAI number (food)
- VEG / NON-VEG mark, certifications, batch/lot number

**Today:** Legal Metrology Inspectors physically read every label, cross-check a large ruleset manually, and hand-write reports. This is slow, costly, and inconsistent across inspectors.

**MVP goal:** Replace the manual workflow with a **scan → AI extraction → rule-check → report** pipeline that takes seconds.

---

## 3. MVP Scope

### 3.1 In-Scope (MVP)

| Area | Delivered |
|---|---|
| Scan pipeline | Photo/upload of label (single face or front+back), image validation, quality grading, package detection, OCR, AI extraction |
| Compliance engine | Codified Legal Metrology rules DB, field-level validation, PASS/REVIEW/FAIL + risk score |
| Inspection workflow | Create inspection, view history, high-priority queue, detail view |
| Reports | PDF (official format) + JSON, stored & downloadable |
| Auth & roles | Signup → admin verification → inspector access; admin oversight |
| Analytics | Compliance statistics & trends dashboards |
| Rules database | Searchable Legal Metrology ruleset with exact statutory citations |

### 3.2 Out-of-Scope (post-MVP)

- Native mobile app / offline scanning (Web PWA in MVP; `android/` scaffolded for later)
- Multi-language OCR (Hindi + regional) — MVP is English-only
- Real-time market/e-commerce trade API integration
- SMS/WhatsApp notifications
- Automatic report signing / e-signature
- ML fine-tuning on local packages dataset (MVP uses pre-trained models)

---

## 4. Target Users & Roles

| Role | Capabilities in MVP |
|---|---|
| **Inspector** (primary) | Scan packages, review extracted declarations, see verdict/risk, generate reports, view own history, analytics, rules |
| **Admin / Legal Metrology officer** | Verify new inspector registrations (email ACCEPT/REJECT), view all inspections, high-priority queue |
| **Super admin** | App settings, engine tuning, notification toggles |

**Registration flow:** new inspector registers → `verification_status = pending` → admin gets an email with ACCEPT/REJECT tokenized action buttons → approved profiles get full access. Self-approval is blocked at the database layer.

---

## 5. Core User Journeys (MVP)

1. **Register & get approved** — signup form (name, designation, department, organization, employee ID, phone) → pending screen → email approval → login.
2. **Scan a label** — dashboard → New Scan → upload/take front + back photos → analyzing animation → declarations review screen (each field with confidence + status) → verdict.
3. **Check compliance** — run the compliance engine against a scan; see per-rule results with legal citations.
4. **Report** — generate & download official PDF/JSON; stored in Supabase Storage.
5. **Follow up** — recent inspections, history, high-priority (failed/high-risk) queue, analytics trends.
6. **Admin ops** — approve/reject inspectors from email or settings panel; resend verification.

---

## 6. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend framework** | Next.js 15 (App Router), React 19, TypeScript | Server/render app, routing, SSR-safe middleware |
| **Styling** | Tailwind CSS 3, clsx, tailwind-merge, lucide-react icons | Responsive inspector/admin UI |
| **Auth client** | @supabase/supabase-js (GoTrue) | Email/password auth, JWT session |
| **Backend framework** | Python 3.10+, FastAPI, Uvicorn, Pydantic v2 | REST API, pipeline orchestration, validation |
| **OCR** | Tesseract (pytesseract) + layout OCR | Local text extraction (front + back) |
| **AI Vision (primary)** | Google Gemini (`google-genai`, multimodal, JSON mode) | Direct label-image → structured declarations extraction with confidence + evidence |
| **AI extractor (secondary)** | Gemini-from-OCR-text; GPT/OpenAI-compatible extractor (optional) | Structured extraction from OCR text |
| **Rule engine** | Codified rules DB (`rules_service`), conditional logic, weighted scoring | Legal Metrology validation & risk scoring |
| **Image processing** | OpenCV (headless), Pillow, NumPy | Blur/quality grading, enhancement, package detection |
| **Database / Auth / Storage** | Supabase: PostgreSQL + RLS, GoTrue auth, Storage buckets | Persistence, security, file store |
| **Reports** | ReportLab, FPDF2 (PDF/Excel/JSON) | Official inspection report generation |
| **Infrastructure** | Vercel (frontend), Render (backend), Supabase Cloud | Hosting & zero-ops deploys |
| **Testing** | pytest (backend), Playwright (frontend) | Unit + integration + E2E |

### 6.1 Key Dependencies

**Frontend (`package.json`):** `next@15`, `react@19`, `@supabase/supabase-js`, `tailwindcss@3`, `lucide-react`, TypeScript 5.7.

**Backend (`requirements.txt`):** `fastapi`, `uvicorn[standard]`, `pydantic v2`, `supabase`, `httpx`, `pytesseract`, `Pillow`, `numpy`, `opencv-python-headless`, `google-genai`, `reportlab`, `fpdf2`.

**Environment variables:** Supabase URL/anon/service-role keys, Gemini API key + vision model, frontend URL, Tesseract path, pipeline tuning knobs. Service-role key lives only on the backend.

---

## 7. AI Usage — Where & How

### 7.1 Pipeline Overview (production order)

```
Image(s) ─► validation ─► package detection ─► quality grading
            └─────────────► Gemini Vision (image) ──► structured fields   [PRIMARY]
            └─────────────► Tesseract OCR ─► text merge ─► Gemini-from-text [FALLBACK]
                                                            └► regex extractor   [LAST RESORT]
all paths ─► normalization + merge ─► compliance engine ─► verdict + risk ─► report
```

### 7.2 Gemini Vision (primary, `gemini_vision.py`)

- Sends the **actual label image** (front, or front+back together via `extract_multi`) directly to Gemini in **JSON response mode** (`response_mime_type: application/json`, `temperature: 0`).
- A strict system prompt (no hallucination): extract **only** visibly printed text; `null` any field that is not clearly present.
- Guards against classic LLM errors:
  - Nutrition values (Carbohydrate, Protein, Sugars, Sodium…) are **rejected** from manufacturer/net-quantity/MRP fields.
  - VEG symbol maps **only** to `vegetarian_mark`, never the brand name.
  - MFD vs PKD vs Best-before disambiguated by context — no date copying between fields.
- Returns **26 canonical fields**, each with `value`, `confidence (0–100)`, `status` (`detected | not_visible | not_printed | uncertain`), and `evidence` (exact label text justifying the value).
- Also returns `image_quality`, `readability_quality`, `image_analysis` (VEG/NON-VEG symbol flags, country-of-origin visibility) and `confidence_details`.
- **Fallbacks:** transient API errors (503/429) are retried once; hard failures drop to OCR-text extraction.

### 7.3 OCR Layer

- **Tesseract** (primary engine) reads front + back in parallel workers. Combines per-side text with layout regions, **deduplicating lines** so regexes see each declaration once.
- **Layout OCR** preserves reading order/regions for evidence and reports.
- Quality grades (`usable / poor / unusable`) from both a static analyzer (blur, darkness) and the OCR engine's own verdict; the stricter grade wins.

### 7.4 Gemini-from-Text (secondary path)

- When the vision image path is disabled/fails, Tesseract text is combined and sent to Gemini with a "strict extraction, no inference" prompt that maps OCR text → the same canonical field schema. It can only extract what OCR read (no image access → no invented text).

### 7.5 Deterministic Extractor (last resort)

- Regex-based `product_extractor` + `AIService.extract_product_information` extracts fields from combined OCR text. Used when Gemini is unavailable (e.g., offline tests); must never regress fields already detected by a higher-confidence source.

### 7.6 Normalization & Fusion

- `normalization.py` normalizes **dates, phones, emails, FSSAI (14-digit), MRP (currency), quantity/units, whitespace**.
- `merge_gemini_with_ocr` keeps Gemini as primary; OCR fills only the fields Gemini left `not_visible` — it never overwrites detected values. `build_field_diagnostic` logs a per-field provenance trail.

### 7.7 Compliance Engine (rules-based, not generative)

- `rules_service.py` codifies the **Legal Metrology (Packaged Commodities) Rules, 2011 & amendments** as the single source of truth: rule ID, legal citation, applicability (`all / imported / domestic / conditional / perishable`), validation criteria, severity, weight.
- `compliance_service.py` evaluates each rule against extracted fields, returns per-rule `PASS / FAIL / UNCERTAIN / NOT_APPLICABLE`, computes weighted **compliance score** and **risk score (0–100)**, and the overall `pass / review / fail` verdict.
- Design choice: compliance is **100% deterministic and explainable** — AI extracts, code decides, so every verdict is auditable with legal citations.

### 7.8 Why this AI architecture

| Concern | Answer |
|---|---|
| Accuracy | Multimodal Gemini sees the real image (better than OCR for curved/stylized labels) |
| Cost/latency | Vision runs in parallel with OCR in a thread pool → no added serial latency |
| Reliability | Layered fallbacks (vision → Gemini-text → regex) so a degraded AI never blocks scanning |
| Trust | Confidence + evidence on every field; deterministic rule engine with legal citations |
| Hallucination | temperature=0, "only visible text", nutrition guards, regex + format validation |

---

## 8. System Architecture

```
┌────────────────────────────┐     REST (HTTP 5000)      ┌─────────────────────────────┐
│   FRONTEND (Next.js 15)    │ ────────────────────────► │  BACKEND (Python FastAPI)   │
│  React 19 + TypeScript     │                            │  OCR / AI / Compliance      │
│  Tailwind, App Router      │ ◄──────────────────────── │  PDF Report Engine          │
└────────────┬───────────────┘                            └──────────────┬──────────────┘
             │  Supabase Auth (anon client)                                │ SUPABASE
             ▼                                                             ▼ SERVICE ROLE
┌────────────────────────────────────────────────────────────────────────────┐
│              SUPABASE (Auth + PostgreSQL + RLS + Storage)                   │
│  profiles · inspections · inspection_images · extracted_labels ·           │
│  compliance_results · inspection_reports · product_info · rules DB         │
│  Buckets: inspection-images, inspection-reports                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Monorepo Layout

```
PackIntel/
├── frontend/    # Next.js 15 app (app router pages, features/, components/, lib/, middleware.ts)
├── backend/     # FastAPI (api/routes, services/*, schemas/, core/), pytest suite
├── supabase/    # migrations/, schema.sql, RLS policies, storage bucket configs
├── docs/        # ARCHITECTURE · API_SPEC · SETUP · PROJECT_REPORT · MVP
└── render.yaml  # Render blueprint (backend worker/service)
```

### 8.2 Frontend Routes (MVP)

| Route | Purpose |
|---|---|
| `/` | Home / landing |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Auth |
| `/verification-pending`, `/verification-rejected`, `/access-denied` | Account lifecycle gating |
| `/inspector/dashboard`, `/dashboard` | Workspaces |
| `/scan/new`, `/scan/analyzing`, `/scan/ocr`, `/scan/declarations` | Scan pipeline UI |
| `/results` | Verdict + per-rule results |
| `/recent-inspections`, `/history` | History |
| `/high-priority-inspections` | Enforcement queue |
| `/analytics` | Stats & trends |
| `/rules` | Searchable rules DB |
| `/reports` | Report view/download |
| `/settings`, `/support`, `/privacy`, `/terms` | Meta |
| `/admin/*` | Admin verification server routes + UI |

### 8.3 Backend Modules

- `api/routes/` — `scan.py`, `inspection.py`, `compliance.py`, `reports.py`
- `services/` — `gemini_vision`, `vision_service`, `product_extractor`, `ocr_service`, `ocr_space_service`, `layout_ocr`, `image_preprocessor`, `image_quality`, `image_validation`, `package_detector`, `compliance_service`, `rules_service`, `report_service`, `normalization`, `text_normalizer`, `merge_service`, `storage_service`, `ai_service`
- `core/` — `config`, `security`, `memory`
- `schemas/` — `product`, `inspection`, `compliance`

---

## 9. Data Model (Supabase)

| Table | Key fields |
|---|---|
| `profiles` | email, full_name, role (`inspector/admin`), designation, department, organization, location, inspector_employee_id, phone, `verification_status` (`pending/approved/rejected`), verification token hash + expiry, verified_by/at, rejection_reason |
| `inspections` | inspection_number (unique), inspector_id, product_name, category, manufacturer, is_imported, status, overall_result, risk_score |
| `inspection_images` | inspection_id, storage_path, public_url, image_type (`label_front/back`), file_name/size/mime |
| `extracted_labels` | inspection_id (unique), raw_ocr_text, declarations (JSONB canonical fields), bounding_boxes |
| `compliance_results` | inspection_id, rule_id/name, status (`pass/fail/warning`), details |
| `inspection_reports` | inspection_id, storage_path, public_url, report_type, file_size |
| `product_information` / rules tables | normalized product data + codified rule set (migrations) |

**Security:** RLS enabled on all tables; inspectors read/write only their own rows; admins view/verify all; DB triggers deny **self-approval**; missing verification state defaults to **pending/blocked**.

---

## 10. API Surface

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/scan/status` | Pipeline readiness (OCR/Vision flags, thresholds) |
| POST | `/api/scan` | Full scan pipeline (multipart upload or JSON URLs) → declarations + compliance |
| POST | `/api/inspection` | Persist inspection record |
| GET | `/api/inspections` | History (paginated) |
| GET | `/api/inspection/{id}` | Inspection detail |
| POST | `/api/compliance/check` | Rule compliance check + risk score |
| POST | `/api/reports/generate` | PDF/JSON report generation |

**Frontend server APIs (auth/verification):** `/api/signup/notify-admin`, `/api/signup/verify-action`, `/api/admin/verification/[token]`, `/api/admin/verify`, `/api/admin/resend`.

---

## 11. Non-Functional Requirements (MVP)

- **Security:** JWT gated routes via Next.js middleware; service-role key server-side only; hashed single-use 24h verification tokens; RLS enforced; no secrets in client.
- **Performance:** parallel side processing (thread pool), image downscaling to 1600px, memory logging; scan completes in seconds.
- **Reliability:** degraded AI never aborts a scan (non-aborting detection/quality/OCR); structured error JSON with CORS-safe headers.
- **Observability:** structured `[PACKINTEL][...]` logs across OCR, Gemini, merge & compliance stages.
- **Portability:** Docker-ready, environment-driven config, offline-safe test suite (Gemini forced off in tests).

---

## 12. Build Plan / Milestones

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M1 — Foundation** | Monorepo, Next.js app, FastAPI skeleton, Supabase schema + RLS, CI, health endpoint | App + API + DB run locally; /health green |
| **M2 — Scan pipeline** | Upload/validation, quality, package detection, Tesseract OCR, extraction schema | POST /scan returns `extracted_declarations` |
| **M3 — AI extraction** | Gemini Vision primary + Gemini-text fallback + merge/normalization | 26-field JSON with confidence/evidence; fallback works offline |
| **M4 — Compliance engine** | Codified rules DB, per-rule evaluation, score + risk + verdict | `/api/compliance/check` returns explainable verdict |
| **M5 — Inspection & reports** | Create/read inspections, PDF/JSON reports, storage | Full inspection lifecycle end-to-end |
| **M6 — Auth & roles** | Signup → admin verification email flow → role-gated routes | New inspector blocked until admin approves; self-approval impossible |
| **M7 — UX & analytics** | Dashboard, scans UI, results, history, priority queue, analytics, settings | Inspector can complete a scan → report → download in one session |
| **M8 — Harden & deploy** | Tests, memory/error hardening, Vercel + Render + Supabase deploy | Live demo env; pytest + Playwright green |

---

## 13. Testing Strategy

- **Backend (pytest):** scan pipeline, Gemini result parsing (mocked), OCR failure paths, compliance scoring, multi-side scans, report generation, API contracts.
- **Frontend (Playwright):** auth flows, scan wizard, results rendering, admin verification.
- **Manual demo:** real package labels (front/back) for inspector demo.

---

## 14. Deployment

| Component | Platform | URL |
|---|---|---|
| Frontend | Vercel | `https://sih-pack-intel.vercel.app` |
| Backend | Render (via `render.yaml`) | `https://packintel-backend.onrender.com` |
| DB / Auth / Storage | Supabase Cloud | project `uzjhnipkzuzhbgagniwe` |
| Source | GitHub | main branch auto-deploys |

---

## 15. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| LLM hallucination on labels | temperature=0, only-visible-text prompt, nutrition guards, regex/format validation, evidence on every field |
| Gemini outage/quota | layered fallback (vision → Gemini-text → regex) + retry on transient errors |
| OCR on poor images | quality grading, enhancement, clear "upload a better image" messaging, non-aborting pipeline |
| Admin email lost | resend route, tokenized email actions, pending-page polling |
| Scope creep | hard MVP boundary (see §3); everything else parked in future scope |

---

## 16. Success Metrics

- Scan success rate (declarations extracted + verdict generated) ≥ 95%
- Mean scan latency (upload → verdict) in seconds
- % of labels auto-classified PASS vs requiring human review
- Inspector time per inspection (target: < 2 min incl. report)
- Risk-limit: fraction of failed labels missed by engine (target: near-zero for coded rules)

---

*Maintained in `docs/MVP.md` · Companion docs: `docs/ARCHITECTURE.md`, `docs/API_SPEC.md`, `docs/SETUP.md`, `docs/PROJECT_REPORT.md`.*