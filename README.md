# Quality Plus — Data Quality Platform

An end-to-end data quality management platform for AEM Energy Solutions, built with React, TypeScript, Supabase, and an AI layer powered by n8n + Ollama.

---

## Features

### Core Platform

| Feature | Description |
| --- | --- |
| **Project Management** | Create projects with required name and description, upload custom icons, set public/private visibility, invite team members with Owner / Editor / Viewer roles |
| **Records Explorer** | Browse, search, filter by column values, trim columns, export CSV, and navigate directly to Quality Check from the Records tab |
| **Quality Check** | Configure multi-dimension quality checks per dataset with a template system — save, load, and update named configurations |
| **Result Scores** | Save named quality score results, view historical scores, drill down into per-row details, and compare across datasets |
| **Quality Rules** | Admin panel to define and manage global quality dimensions used across all projects |
| **User Management** | Register users, assign Admin/User roles, manage project memberships via a side drawer |

### Quality Dimensions

| Dimension | What It Checks |
| --- | --- |
| **Completeness** | All values in selected columns are present and not null or empty |
| **Uniqueness** | All values are unique within a column, or across a composite key of multiple columns |
| **Validity** | Values conform to rules: positive/negative only, numeric range, threshold, allowed values list, regex pattern, or data type |
| **Consistency** | Values match a reference — inline list, uploaded CSV, or an existing reference dataset |

### AI Features

| Feature | Description |
| --- | --- |
| **AI Rule Check** | Click **AI Rule Check** in Quality Check configuration — analyses all dataset columns using project context and O&G domain knowledge, then auto-applies validity rules and flags columns that should use Consistency instead |
| **AI Summary** | After saving a result score, automatically triggers an n8n workflow that sends score data to Ollama (Mistral) and writes a natural-language summary back — includes overview, key issues with View Rows links, and recommendations |
| **Failed Rows View** | Per-check failed row inspection and a combined cross-check view showing all failed rows, with search, per-column filter, rows-per-page selector (25/50/100/500/All), and CSV export |
| **PDF Report Export** | Export a full quality report as PDF — includes score overview, AI summary, results grouped by column, and per-row details (failed only or all rows) |

### O&G Domain Knowledge Base

The AI Rule Check uses two Supabase tables to drive recommendations — editable without code changes:

- **`ai_validity_rules`** — platform rule types with config fields and pass/fail logic
- **`ai_domain_knowledge`** — O&G column patterns mapped to recommended rules or Consistency dimension (region, field, basin, platform are flagged as Consistency; production volumes, pressures, temperatures, depths flagged for Validity)

---

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + TypeScript 5 |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Backend | Supabase (PostgreSQL + PostgREST + Storage) |
| AI Orchestration | n8n (self-hosted or cloud) |
| AI Model | Ollama — Mistral 7B Instruct (local) |
| PDF Export | jsPDF + jspdf-autotable |
| Hosting | Vercel |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase project
- n8n instance (optional — required for AI features)
- Ollama with `mistral:7b-instruct` pulled (optional — required for AI features)

### Local Development

```bash
git clone <your-repo-url>
cd data-quality-platform
npm install
npm run dev
```

App runs at: **http://localhost:5173**

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Supabase (required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# n8n AI Summary — triggers after saving a result score (optional)
VITE_N8N_WEBHOOK_URL=https://your-n8n.example.com/webhook/data-quality-summary

# n8n AI Rule Check — synchronous validity recommendations (optional)
VITE_N8N_VALIDITY_WEBHOOK_URL=https://your-n8n.example.com/webhook/validity-recommender
```

Get Supabase keys from: **Supabase Dashboard → Settings → API**

---

## Database Setup

Run these SQL files in your **Supabase SQL Editor** in order:

### 1. Core schema
Set up the main application tables (projects, datasets, quality results, scores, users).
> Schema managed via Supabase dashboard — see existing tables in your project.

### 2. AI Knowledge Base
```sql
-- Creates ai_validity_rules and ai_domain_knowledge tables with O&G seed data
-- File: supabase/migrations/ai_knowledge_base.sql
```

### 3. Framework Nodes (System Overview)
```sql
-- Creates framework_nodes table for the System Overview mind map
-- File: supabase/migrations/framework_nodes_update.sql
```

### 4. Cascade deletes (recommended)
```sql
-- Ensures deleting a dataset also deletes all its quality scores
ALTER TABLE quality_result_scores
DROP CONSTRAINT IF EXISTS quality_result_scores_dataset_id_fkey;

ALTER TABLE quality_result_scores
ADD CONSTRAINT quality_result_scores_dataset_id_fkey
  FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE;

-- Add ai_summary column to quality_result_scores
ALTER TABLE quality_result_scores
ADD COLUMN IF NOT EXISTS ai_summary TEXT;
```

---

## n8n Workflow Setup (AI Features)

Two n8n workflows are included in the project root:

### AI Summary — `n8n-ai-summary-workflow.json`
Triggered after a result score is saved. Sends score data to Ollama, writes the generated summary back to Supabase.

**Setup:**
1. Import `n8n-ai-summary-workflow.json` into n8n
2. In the **Save to Supabase** node — replace `YOUR_SUPABASE_SERVICE_ROLE_KEY` with your service role key (Supabase → Settings → API)
3. Set your Ollama credentials on the **Ollama Chat Model** node
4. Activate the workflow

### AI Rule Check — `n8n-validity-recommender-workflow.json`
Synchronous — called when the user clicks **AI Rule Check**. Fetches domain knowledge from Supabase, builds a prompt, calls Ollama, and returns JSON recommendations directly to the app.

**Setup:**
1. Import `n8n-validity-recommender-workflow.json` into n8n
2. Set your Ollama credentials on the **Ollama Chat Model** node
3. Activate the workflow

### Ollama model
```bash
ollama pull mistral:7b-instruct
```

---

## Project Structure

```
data-quality-platform/
├── src/
│   ├── components/
│   │   ├── AiSummaryPanel.tsx         # AI-generated summary after result score save
│   │   ├── AiValidityRecommender.tsx  # AI Rule Check panel in Quality Check config
│   │   ├── CombinedFailedRowsModal.tsx # All failed rows across all checks
│   │   ├── DimensionConfigModal.tsx   # Per-column quality rule configuration
│   │   ├── FailedRowsModal.tsx        # Per-check failed row inspection
│   │   ├── PdfExportModal.tsx         # PDF report export options modal
│   │   ├── ProjectSettingsPanel.tsx   # Project settings slide-over
│   │   ├── QualityConfiguration.tsx  # Main quality check configuration page
│   │   ├── QualityDimensionCard.tsx  # Per-dimension column management card
│   │   └── ResultsView.tsx           # Quality check results (grouped by column)
│   ├── lib/
│   │   ├── api-client.ts             # Supabase API client (all data operations)
│   │   ├── logger.ts                 # Client-side logger
│   │   ├── pdf-export.ts             # jsPDF report generator
│   │   ├── quality-engine.ts         # Pure TypeScript quality check logic
│   │   └── supabase.ts               # Supabase client initialisation
│   ├── pages/
│   │   ├── AdminPage.tsx             # User management (admin only)
│   │   ├── Dashboard.tsx             # Project list and creation
│   │   ├── DimensionConfig.tsx       # Global quality dimensions admin
│   │   ├── GuidePage.tsx             # Built-in user guide
│   │   ├── ProjectView.tsx           # Main project view (Records / Quality Check / Result Scores)
│   │   ├── Records.tsx               # Dataset table viewer
│   │   ├── Score.tsx                 # Quality check flow (upload → configure → results)
│   │   └── SystemOverviewPage.tsx    # Admin system overview (framework + tech stack)
│   ├── types/
│   │   └── database.ts               # TypeScript interfaces for all Supabase tables
│   └── contexts/
│       └── UserContext.tsx            # Auth state via React Context
├── supabase/
│   ├── functions/
│   │   └── mssql-query/              # Edge Function: MSSQL database proxy
│   └── migrations/
│       ├── ai_knowledge_base.sql     # AI validity rules + O&G domain knowledge seed
│       └── framework_nodes_update.sql # System overview framework node updates
├── n8n-ai-summary-workflow.json      # n8n workflow: AI quality score summary
├── n8n-validity-recommender-workflow.json  # n8n workflow: AI rule recommendations
├── public/
│   └── dataqualityplus.png           # App logo
└── package.json
```

---

## Deployment (Vercel)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_N8N_WEBHOOK_URL` *(optional)*
   - `VITE_N8N_VALIDITY_WEBHOOK_URL` *(optional)*
3. Deploy — Vercel auto-detects Vite and builds correctly

---

## Available Scripts

```bash
npm run dev           # Start development server (http://localhost:5173)
npm run build         # Build for production
npm run preview       # Preview production build locally
npm run lint          # Run ESLint
npm run typecheck     # TypeScript type check (no emit)
npm test              # Run Vitest tests
npm run test:ui       # Run tests with Vitest UI
npm run test:coverage # Generate test coverage report
```

---

## Navigation

| Tab / Page | Access |
| --- | --- |
| Dashboard | All users — project list and creation |
| Records | All project members — dataset browser with Quality Check shortcut |
| Quality Check | Editors and above — run and configure quality checks |
| Result Scores | All project members — view saved quality scores and AI summaries |
| Quality Rules | Admin only — manage global quality dimensions |
| Guide | All users — built-in step-by-step documentation |
| System Overview | Admin only — framework capabilities and technology stack |

---

## License

Copyright AEM ENERGY SOLUTIONS. All rights reserved.
