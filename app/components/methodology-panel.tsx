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
        Why Multiplier scores look compressed
      </p>
      <p className="mt-1.5">
        The 0–100 scale is relative to all {eligibleCount} eligible humans.
        One or two people have thousands of review points (ceiling{" "}
        {ceilingLabel}). Same as the Scale example: a huge max makes even 400+
        reviews map to a small 0–100 score.
      </p>
      <p className="mt-1.5">
        Raw review points and PR links stay in the evidence drawer.
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

function Example({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] leading-snug text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">Example</p>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
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
              Who is scored, and what data we keep
            </h3>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Time window.{" "}
              </strong>
              Last 90 days of merged PRs:{" "}
              <Code>{`${windowStart} → ${windowEnd}`}</Code>.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Bots.{" "}
              </strong>
              GitHub Bot accounts and logins ending in{" "}
              <Code>[bot]</Code> are excluded.{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {bots} bots filtered.
              </strong>
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Who is eligible.{" "}
              </strong>
              An engineer is scored if they authored at least 2 merged human
              PRs, or reviewed at least 5 different human authors.{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {eligible} eligible humans.
              </strong>
            </p>
            <Formula>
              {`eligible ⇔ authoredPRs ≥ 2  ∨  distinctAuthorsReviewed ≥ 5`}
            </Formula>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                First 100 files only.{" "}
              </strong>
              We only inspect the first 100 files in each PR (GitHub payload
              limit). Extra paths are ignored for docs-only checks, leverage
              buckets, and reliability matches.
            </p>
            <p>
              In this run,{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">
                {truncated} PRs
              </strong>{" "}
              had more than 100 files.
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
                In practice: each of your merged PRs earns points for shipping
                work. Ticketed work scores higher. Docs-only diffs keep a
                fraction of those points — they are not a third bonus you add.
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li>
                  <strong>Base:</strong> 1.0 for every merged PR
                </li>
                <li>
                  <strong>Issue bonus:</strong> +1.0 if the PR closes at least
                  one GitHub issue
                </li>
                <li>
                  <strong>Docs/lockfile penalty:</strong> keep ×0.25 of that
                  total only when <em>every</em> path is docs, markdown,
                  changelog, or a lockfile. A PR that also changes product code
                  is not penalized.
                </li>
              </ul>
              <Formula>
                Raw Delivery = Σ ((Base + IssueBonus) × DocPenalty)
              </Formula>
              <Example>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>
                    Feature PR closing #412 →{" "}
                    <Code>(1 + 1) × 1 = 2</Code>
                  </li>
                  <li>
                    README-only PR → <Code>(1 + 0) × 0.25 = 0.25</Code>
                  </li>
                  <li>
                    Changelog that closes an issue →{" "}
                    <Code>(1 + 1) × 0.25 = 0.5</Code>
                  </li>
                </ul>
                <p>Sum those values across the engineer’s merged PRs.</p>
              </Example>
            </Pillar>

            <Pillar title="Technical Scope & Leverage" weight="25%">
              <p>
                In practice: we score unique top-level areas you touched in 90
                days, not every file and not every PR in the same folder.
              </p>
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
                  <strong>Weak ×0.5:</strong> <Code>packages/</Code> (once, even
                  if many packages)
                </li>
                <li>
                  <strong>Unclassified ×0.0:</strong> <Code>playwright/</Code>,{" "}
                  <Code>funnel-udf/</Code>, <Code>share/</Code>,{" "}
                  <Code>tools/</Code>, <Code>patches/</Code> — still count in
                  Delivery, not here
                </li>
              </ul>
              <Formula>
                Raw Leverage = Σ(uniqueInfra×2) + Σ(uniqueProduct×1) +
                (packages×0.5)
              </Formula>
              <Example>
                <p>
                  Sam touches <Code>frontend/</Code> on many PRs, plus{" "}
                  <Code>.github/</Code> and <Code>packages/</Code> →{" "}
                  <Code>1 + 2 + 0.5 = 3.5</Code>. A tenth PR in{" "}
                  <Code>frontend/</Code> adds nothing new.
                </p>
              </Example>
            </Pillar>

            <Pillar title="Engineering Multiplier" weight="20%" defaultOpen>
              <p>
                In practice: points for reviewing other people’s PRs. Requesting
                changes counts more than a rubber-stamp approve. Your own PRs
                and bot PRs do not count. How many distinct authors you
                reviewed is only for eligibility, not this score.
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
              <Example>
                <p>
                  Two <Code>APPROVED</Code> (1+1), one <Code>COMMENTED</Code>{" "}
                  (1.5), one <Code>CHANGES_REQUESTED</Code> (2) →{" "}
                  <strong>5.5</strong> raw.
                </p>
              </Example>
              <MultiplierCompressionCallout
                eligibleCount={eligible}
                ceilingLabel={formatCeiling(meta.multiplierMaxRaw)}
              />
            </Pillar>

            <Pillar title="Risk & Reliability" weight="15%">
              <p>
                In practice: count authored PRs that touch CI, security, or
                high-stakes infra, or carry incident/hotfix/security labels. One
                PR counts once even if many files match.
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
              <Example>
                <p>
                  A PR changing <Code>rust/</Code> and <Code>clickhouse</Code> ={" "}
                  <strong>1</strong>. A second PR labeled <Code>hotfix</Code> ={" "}
                  +1. Total raw = 2.
                </p>
              </Example>
            </Pillar>
          </section>
        ) : null}

        {tab === "scale" ? (
          <section className="space-y-3 text-[12px] leading-snug text-zinc-600 dark:text-zinc-300">
            <h3 className="text-[11px] font-semibold tracking-wide text-zinc-900 uppercase dark:text-zinc-100">
              How 0–100 scores are built
            </h3>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                100 is not a universal benchmark.{" "}
              </strong>
              For each pillar, 100 is the eligible engineer with the highest
              raw total in this 90-day window; 0 is the lowest. Everyone else
              sits on that line among the {eligible} eligible humans. Weights
              are applied after scaling.
            </p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>
                <strong className="text-zinc-900 dark:text-zinc-100">
                  raw
                </strong>{" "}
                — that engineer’s unscaled points for the pillar (shown in the
                evidence drawer)
              </li>
              <li>
                <strong className="text-zinc-900 dark:text-zinc-100">
                  min / max
                </strong>{" "}
                — lowest and highest raw among eligible humans
              </li>
            </ul>
            <Formula>
              {`score = 100 × (raw − min) / (max − min)`}
            </Formula>
            <Example>
              <p>
                Delivery min = 10, max = 110, Alex’s raw = 60:
              </p>
              <p className="font-mono">
                (60 − 10) / (110 − 10) × 100 = 50
              </p>
              <p>
                Alex is halfway between the weakest and strongest Delivery in
                the cohort.
              </p>
            </Example>
            <Formula>
              Composite = 0.40D + 0.25L + 0.20M + 0.15R
            </Formula>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Review compression.{" "}
              </strong>
              Same math: if Multiplier max is thousands of points, even 400
              reviews sit close to 0 on a 0–100 scale.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Tie-break.{" "}
              </strong>
              Higher Delivery, then higher Multiplier.
            </p>
            <p>
              <strong className="text-zinc-900 dark:text-zinc-100">
                Evidence.{" "}
              </strong>
              Each row’s drawer shows the top 3 backing GitHub PRs per pillar
              (directory prefixes for leverage). Unclassified paths (
              <Code>playwright/</Code>, <Code>funnel-udf/</Code>,{" "}
              <Code>share/</Code>, <Code>tools/</Code>, <Code>patches/</Code>)
              still earn Delivery, not Leverage.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
