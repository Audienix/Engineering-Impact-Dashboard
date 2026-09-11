# Engineering Impact Dashboard

A transparent, 4-pillar data pipeline and single-page Next.js dashboard that evaluates software engineer impact from 90 days of GitHub monorepo data. Built for [PostHog/posthog](https://github.com/PostHog/posthog): multi-pass GraphQL fetching, bot filtering, cohort normalization, and dynamic cohort normalization.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The page reads [`data/impact.json`](data/impact.json) at build time (no live GitHub calls on visit).

## Regenerate data

1. Add a GitHub PAT with repo read access to `.env`:

   ```bash
   cp .env.example .env
   # GITHUB_TOKEN=...
   ```

2. Run the two-pass fetch (Pass 1 census → Pass 2 file paths):

   ```bash
   npm run fetch          # Pass 1 only (stops for confirmation)
   npm run fetch:pass2    # Pass 2 file batches → data/raw-prs.json
   ```

3. Score into `data/impact.json`:

   ```bash
   npm run score
   ```

## Scoring model

Composite = **40% Delivery** + **25% Leverage** + **20% Multiplier** + **15% Reliability**, each min–max normalized across the eligible human cohort. See the **How Impact is Calculated** panel on the dashboard for formulas, taxonomy, and caveats.

## License

Apache-2.0 — see [LICENSE](LICENSE).
