# 🚀 Engineering Impact Dashboard

An interactive, single-page executive dashboard that evaluates software engineering impact across an open-source repository — e.g. the [PostHog monorepo](https://github.com/PostHog/posthog) — over a **90-day window**.

Built in **Cursor** using **Next.js**, **Tailwind CSS**, and the **GitHub GraphQL API v4**.

**⏱️ Dataset scope:** June 13, 2026 – September 11, 2026 (90 days)

---

## Table of contents

- [Executive Summary & Key Results](#-executive-summary--key-results)
- [The 4-Pillar Impact Model](#-the-4-pillar-impact-model)
- [Architecture & Pipeline](#️-architecture--pipeline)
- [Getting Started](#-getting-started)
- [License](#license)

---

## 🎯 Executive Summary & Key Results

Counting lines of code, raw commits, or superficial PR totals fails to capture true engineering value — especially in a fast-moving, automation-heavy monorepo like PostHog.

This project measures engineer contributions across a **4-Pillar Model** (Delivery, Leverage, Multiplier, and Reliability). Each pillar is min–max normalized across an eligible human cohort, then combined into a weighted composite score. The dashboard surfaces the **top 5** engineers with expandable evidence drawers per dimension.

### Latest run (PostHog/posthog · 2026-06-13 → 2026-09-11)

| Metric | Value |
| --- | --- |
| Merged PRs (total) | 14,936 |
| Human-authored PRs | 13,601 |
| Bot PRs filtered | 1,335 |
| Eligible humans | 178 |
| Eligibility rule | ≥ 2 merged PRs authored **or** ≥ 5 reviews across distinct human authors |

| Rank | Engineer | Composite |
| ---: | --- | ---: |
| 1 | [Gilbert09](https://github.com/Gilbert09) | 65.1 |
| 2 | [webjunkie](https://github.com/webjunkie) | 42.5 |
| 3 | [pauldambra](https://github.com/pauldambra) | 34.8 |
| 4 | [rnegron](https://github.com/rnegron) | 30.3 |
| 5 | [rafaeelaudibert](https://github.com/rafaeelaudibert) | 28.5 |

> Full formulas, taxonomy tables, and normalization caveats are documented below and in the live dashboard’s **How Impact is Calculated** panel.

---

## 📐 The 4-Pillar Impact Model

Scores are derived using a weighted composite model:

$$
\text{Composite Score} = 0.40(\text{Delivery}) + 0.25(\text{Leverage}) + 0.20(\text{Multiplier}) + 0.15(\text{Reliability})
$$

Each dimension is scaled to **0–100** across the eligible cohort before weights are applied. Ties break on Delivery, then Multiplier.

### 1. Delivery Significance (40% weight)

- **What it measures:** Completed user-facing work.
- **Formula:** $1.0\ (\text{base}) + 1.0\ (\text{if closes} \ge 1\ \text{issue})$, downweighted by **0.25×** for pure documentation/lockfile diffs.

### 2. Technical Scope & Leverage (25% weight)

- **What it measures:** Architectural span and core infrastructure footprint.
- **Taxonomy:**
  - **Shared / Infra (2.0×):** `.github/`, `docker/`, `terraform/`, `bin/`, `devenv/`, `common/`, `proto/`
  - **Product buckets (1.0×):** `frontend/`, `posthog/`, `ee/`, `products/`, `rust/`, `nodejs/`, `services/`
  - **Weak leverage (0.5×):** `packages/`
  - **Baseline only (0.0×):** `playwright/`, `funnel-udf/`, `share/`, `tools/`, `patches/`

### 3. Engineering Multiplier (20% weight)

- **What it measures:** Code review throughput and peer enablement on **other humans’** PRs.
- **State weights:** `CHANGES_REQUESTED` (2.0×), `COMMENTED` (1.5×), `APPROVED` (1.0×).
- **Note on compression:** Multiplier scores are min–max normalized across the entire human cohort. Because 1–2 volume outliers performed thousands of review actions, linear scaling compresses high raw review counts (e.g. 411 reviews) to low normalized scores. Full raw points are visible in the UI evidence drawers.

### 4. Risk & Reliability (15% weight)

- **What it measures:** Contributions to system safety and high-stakes infrastructure.
- **Triggers:** Authored PRs touching `.github/`, security/auth paths, `rust/`, `terraform/`, `clickhouse`, or PRs with `incident` / `hotfix` labels.

---

## 🛠️ Architecture & Pipeline

```
GitHub GraphQL API v4
│
├──> Pass 1: Census (paginated search & review collection)  →  data/pass1-prs.json
│
├──> Pass 2: File paths (aliased batches of 18 PRs)       →  data/raw-prs.json
│
└──> Scoring engine (scripts/score.ts)                      →  data/impact.json
     │
     └──> Next.js static server component UI (app/page.tsx)
```

### Design principles

1. **Multi-pass data fetching**
   - **Pass 1** (`npm run fetch`): Paginates 90 days of merged PRs using split-window queries to bypass GitHub’s 1,000-node search cap. Collects authors, reviews, labels, and linked issues. Stops before Pass 2 for manual confirmation.
   - **Pass 2** (`npm run fetch:pass2`): Fetches file paths in aliased GraphQL batches of **18 PRs per request** to avoid payload limits and point exhaustion.

2. **Data hygiene**
   - Filters automated accounts using `__typename === "Bot"` or login ending in `[bot]`.

3. **Static pre-rendering**
   - The page imports `impact.json` at build time — no live GitHub calls on visit. Target: sub-second loads without rate-limit risk on preview hosts.

### Key files

| Path | Role |
| --- | --- |
| [`scripts/fetch.ts`](scripts/fetch.ts) | Pass 1 + Pass 2 orchestrator |
| [`scripts/score.ts`](scripts/score.ts) | Pillar calculation and cohort normalization |
| [`lib/taxonomy.ts`](lib/taxonomy.ts) | Path buckets, docs/lockfile rules, reliability triggers |
| [`data/impact.json`](data/impact.json) | Scored output consumed by the UI |
| [`app/components/impact-dashboard.tsx`](app/components/impact-dashboard.tsx) | Sortable leaderboard + evidence drawers |
| [`app/components/methodology-panel.tsx`](app/components/methodology-panel.tsx) | In-app methodology reference |

---

## 🚦 Getting Started

### Prerequisites

- **Node.js** ≥ 18.0.0
- **GitHub Personal Access Token** with repo read access, or authenticated [`gh`](https://cli.github.com/) CLI

### Installation

```bash
# Clone repository
git clone https://github.com/Audienix/Engineering-Impact-Dashboard.git
cd Engineering-Impact-Dashboard

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the interactive dashboard.

### Regenerate data (optional)

The committed [`data/impact.json`](data/impact.json) is sufficient to run the dashboard. To refresh from GitHub:

```bash
# 1. Configure auth
cp .env.example .env
# Set GITHUB_TOKEN=...  (or rely on `gh auth login`)

# 2. Two-pass fetch
npm run fetch          # Pass 1 → data/pass1-prs.json (stops before Pass 2)
npm run fetch:pass2    # Pass 2 → data/raw-prs.json

# 3. Score
npm run score          # → data/impact.json
```

### Production build

```bash
npm run build
npm start
```

### npm scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run fetch` | Pass 1 census + reviews |
| `npm run fetch:pass2` | Pass 2 file-path batches |
| `npm run score` | Compute pillars → `data/impact.json` |
| `npm run build` | Production build (reads `impact.json`) |

---

## License

Apache-2.0 — see [LICENSE](LICENSE).
