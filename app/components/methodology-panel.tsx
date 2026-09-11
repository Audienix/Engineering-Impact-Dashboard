"use client";

import { useState, type ReactNode } from "react";
import type { ImpactPayload } from "@/lib/types";

type Tab = "cohort" | "pillars" | "scale";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "cohort", label: "1. Cohort" },
  { id: "pillars", label: "2. Pillars" },
  { id: "scale", label: "3. Scale" },
];

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatCeiling(value: number | undefined): string {
  const raw = value && value > 0 ? value : 10000;
  if (raw >= 1000) {
    return `~${Math.round(raw / 1000)}k`;
  }
  return `~${formatCount(Math.round(raw))}`;
}

function MultiplierCompressionCallout({
  eligibleCount,
  ceilingLabel,
}: {
  eligibleCount: string;
  ceilingLabel: string;
}) {
  return (
    <aside className="rounded-md border border-sky-200 bg-sky-50 px-2 py-2 text-[11px] leading-snug text-sky-950 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
      <p className="font-semibold text-sky-950 dark:text-sky-50">
        💡 Why are Multiplier Scores heavily compressed?
      </p>
      <p className="mt-1.5">
        <strong className="text-sky-950 dark:text-sky-50">
          Mathematical Cause:{" "}
        </strong>
        Scores are min-max normalized across all {eligibleCount} eligible
        humans over 90 days. Because 1 or 2 cohort outliers executed thousands
        of review actions (setting a high cohort ceiling of {ceilingLabel}{" "}
        pts), linear scaling maps even high review volumes (e.g., 400+ reviews)
        to single-digit scores out of 100.
      </p>
      <p className="mt-1.5">
        <strong className="text-sky-950 dark:text-sky-50">Validation: </strong>
        The raw review activity, reviewer state weights (
        <Code>CHANGES_REQUESTED</Code> = 2x, <Code>COMMENTED</Code> = 1.5x,{" "}
        <Code>APPROVED</Code> = 1x), and specific PR links are preserved in
        full in the expandable evidence logs.
      </p>
    </aside>
  );
}

function Formula({ children }: { children: string }) {
  return (
    <p className="mt-1.5 rounded-md bg-zinc-100 px-2 py-1.5 font-mono text-[11px] leading-snug text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
      {children}
    </p>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-zinc-100 px-0.5 font-mono text-[10px] dark:bg-zinc-900">
      {children}
    </code>
  );
}

function Pillar({
  title,
  weight,
  defaultOpen,
  children,
}: {
  title: string;
  weight: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <summary className="cursor-pointer px-2 py-1.5 text-[12px] font-semibold text-zinc-900 select-none dark:text-zinc-50">
        {title}{" "}
        <span className="font-mono text-[10px] font-normal text-zinc-500">
          {weight}
        </span>
      </summary>
      <div className="space-y-1.5 border-t border-zinc-100 px-2 py-2 text-[11px] leading-snug text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
        {children}
      </div>
    </details>
  );
}

export function MethodologyPanel({ meta }: { meta: ImpactPayload["meta"] }) {
  const [tab, setTab] = useState<Tab>("pillars");
  const bots = formatCount(meta.totals.bot);
  const eligible = formatCount(meta.eligibleHumanCount);
  const truncated = formatCount(meta.pass2.truncatedFileLists ?? 0);
  const windowStart = meta.windowStart.slice(0, 10);
  const windowEnd = meta.windowEnd.slice(0, 10);

  return (
    <div className="flex max-h-[calc(100vh-8.5rem)] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="shrink-0 border-b border-zinc-200 px-3 pt-3 pb-2 dark:border-zinc-800">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          How Impact is Calculated
        </h2>
        <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
          C = 0.40D + 0.25L + 0.20M + 0.15R
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-1.5 py-1 text-[11px] font-medium ${
                tab === item.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
              aria-pressed={tab === item.id}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {tab === "cohort" ? (
          <section className="space-y-3 text-[12px] leading-snug text-zinc-600 dark:text-zinc-300">
            <h3 className="text-[11px] font-semibold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">
              Cohort Eligibility &amp; Data Hygiene
            </h3>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Time Window.{" "}
              </strong>
              Last 90 days{" "}
              <Code>{`[${windowStart}, ${windowEnd}]`}</Code> ≈{" "}
              <Code>[fetchedAt − 90d, fetchedAt]</Code>, filtered on PR{" "}
              <Code>mergedAt</Code>.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Bot Exclusions.{" "}
              </strong>
              PRs or reviews by{" "}
              <Code>author.__typename === &quot;Bot&quot;</Code> or login{" "}
              <Code>/[bot]$/i</Code> are excluded.{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {bots} bots filtered.
              </strong>
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Cohort Eligibility.{" "}
              </strong>
              An engineer is eligible if they authored ≥ 2 merged human PRs{" "}
              <em>or</em> conducted ≥ 5 reviews across distinct human authors.{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {eligible} eligible humans.
              </strong>
            </p>
            <Formula>
              {`eligible ⇔ authoredPRs ≥ 2  ∨  distinctAuthorsReviewed ≥ 5`}
            </Formula>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                File cap.{" "}
              </strong>
              Pass 2 stores ≤ 100 paths per PR ({truncated} PRs truncated).
            </p>
          </section>
        ) : null}

        {tab === "pillars" ? (
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">
              4-Pillar Scoring Model
            </h3>

            <Pillar title="Delivery Significance" weight="40%" defaultOpen>
              <p>
                Completed user-facing value per authored merged human PR.
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>
                  <strong>Base:</strong> 1.0 per merged PR
                </li>
                <li>
                  <strong>Issue bonus:</strong> +1.0 if{" "}
                  <Code>closedIssueCount ≥ 1</Code>
                </li>
                <li>
                  <strong>Doc/lockfile penalty:</strong> ×0.25 if 100% of paths
                  match <Code>docs/</Code>, <Code>*.md</Code>,{" "}
                  <Code>CHANGELOG*</Code>, <Code>package-lock.json</Code>,{" "}
                  <Code>pnpm-lock.yaml</Code>, or <Code>yarn.lock</Code>
                </li>
              </ul>
              <Formula>
                Raw Delivery = Σ ((Base + IssueBonus) × DocPenalty)
              </Formula>
            </Pillar>

            <Pillar title="Technical Scope & Leverage" weight="25%">
              <p>Architectural breadth via unique directory buckets.</p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>
                  <strong>Infra ×2.0:</strong> <Code>.github/</Code>,{" "}
                  <Code>docker/</Code>, <Code>Dockerfile*</Code>,{" "}
                  <Code>docker-compose*</Code>, <Code>terraform/</Code>,{" "}
                  <Code>bin/</Code>, <Code>devenv/</Code>, <Code>common/</Code>,{" "}
                  <Code>proto/</Code>
                </li>
                <li>
                  <strong>Product ×1.0:</strong> <Code>frontend/</Code>,{" "}
                  <Code>posthog/</Code>, <Code>ee/</Code>,{" "}
                  <Code>products/&lt;name&gt;/</Code>, <Code>rust/</Code>,{" "}
                  <Code>nodejs/</Code>, <Code>cli/</Code>,{" "}
                  <Code>livestream/</Code>, <Code>services/</Code>
                </li>
                <li>
                  <strong>Weak ×0.5:</strong> <Code>packages/</Code> (two
                  isolated packages, one bucket)
                </li>
                <li>
                  <strong>Unclassified ×0.0:</strong> <Code>playwright/</Code>,{" "}
                  <Code>funnel-udf/</Code>, <Code>share/</Code>,{" "}
                  <Code>tools/</Code>, <Code>patches/</Code> — baseline
                  delivery only
                </li>
              </ul>
              <Formula>
                Raw Leverage = Σ(uniqueInfra×2) + Σ(uniqueProduct×1) +
                (packages×0.5)
              </Formula>
            </Pillar>

            <Pillar title="Engineering Multiplier" weight="20%" defaultOpen>
              <p>
                Review throughput on human PRs where reviewer ≠ author. Bot PRs
                do not count. Distinct-author count is eligibility only, not
                this score.
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>
                  <Code>CHANGES_REQUESTED</Code> = 2.0
                </li>
                <li>
                  <Code>COMMENTED</Code> = 1.5
                </li>
                <li>
                  <Code>APPROVED</Code> = 1.0
                </li>
                <li>
                  <Code>DISMISSED</Code> = 0.0
                </li>
              </ul>
              <Formula>Raw Multiplier = Σ WeightedReviewState</Formula>
              <MultiplierCompressionCallout
                eligibleCount={eligible}
                ceilingLabel={formatCeiling(meta.multiplierMaxRaw)}
              />
            </Pillar>

            <Pillar title="Risk & Reliability" weight="15%">
              <p>
                A PR counts if <em>any</em> file or label matches
                (case-insensitive):
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>
                  <strong>CI/CD:</strong> <Code>.github/</Code>,{" "}
                  <Code>.husky/</Code>, <Code>Dockerfile*</Code>,{" "}
                  <Code>docker-compose*</Code>, <Code>.semgrep/</Code>
                </li>
                <li>
                  <strong>Security:</strong> path/label contains{" "}
                  <Code>security</Code>, <Code>auth</Code>, <Code>cve</Code>,{" "}
                  <Code>secret</Code>, or path under <Code>.semgrep/</Code>
                </li>
                <li>
                  <strong>Reliability:</strong> <Code>rust/</Code>,{" "}
                  <Code>livestream/</Code>, <Code>terraform/</Code>,{" "}
                  <Code>clickhouse</Code>, <Code>dagster</Code>,{" "}
                  <Code>otel</Code>, or labels <Code>reliability</Code> /{" "}
                  <Code>incident</Code> / <Code>hotfix</Code>
                </li>
              </ul>
              <Formula>Raw Risk = count of matching authored PRs</Formula>
            </Pillar>
          </section>
        ) : null}

        {tab === "scale" ? (
          <section className="space-y-3 text-[12px] leading-snug text-zinc-600 dark:text-zinc-300">
            <h3 className="text-[11px] font-semibold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">
              Normalization &amp; Evidence
            </h3>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Min-max scaling.{" "}
              </strong>
              Each raw dimension is mapped to 0–100 across the {eligible}{" "}
              eligible humans, then weights are applied. 100 = the peak
              benchmark in that pillar over 90 days.
            </p>
            <Formula>
              {`score_i = 100 × (raw_i − min) / (max − min)`}
            </Formula>
            <Formula>
              Composite = 0.40D + 0.25L + 0.20M + 0.15R
            </Formula>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Review compression.{" "}
              </strong>
              Multiplier scores look low because min-max scales against extreme
              cohort volume outliers.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Tie-break.{" "}
              </strong>
              Higher Delivery, then higher Multiplier.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Evidence auditability.{" "}
              </strong>
              Each engineer’s row exposes the top 3 backing GitHub PR links per
              dimension (path prefixes for leverage).
            </p>
            <p>
              Unclassified paths (<Code>playwright/</Code>,{" "}
              <Code>funnel-udf/</Code>, <Code>share/</Code>, <Code>tools/</Code>
              , <Code>patches/</Code>) get baseline delivery only. File lists
              cap at 100 paths ({truncated} PRs capped).
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
