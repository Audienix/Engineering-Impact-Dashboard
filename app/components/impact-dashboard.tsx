"use client";

import { useMemo, useState } from "react";
import type { ImpactEngineer, ImpactPayload } from "@/lib/types";
import { MethodologyPanel } from "@/app/components/methodology-panel";

type SortKey =
  | "rank"
  | "login"
  | "composite"
  | "delivery"
  | "leverage"
  | "multiplier"
  | "reliability";

type SortDir = "desc" | "asc";

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  align?: "left" | "right";
  className?: string;
  tooltip?: string;
}> = [
  { key: "rank", label: "Rank", className: "w-14" },
  { key: "login", label: "Engineer", align: "left" },
  { key: "composite", label: "Composite Impact" },
  { key: "delivery", label: "Delivery (40%)" },
  { key: "leverage", label: "Leverage (25%)" },
  {
    key: "multiplier",
    label: "Multiplier (20%)",
    tooltip:
      "Linear min-max score scaled against 99th-percentile cohort review volume outliers. Hover cell for raw review points.",
  },
  { key: "reliability", label: "Reliability (15%)" },
];

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function formatRawPts(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  });
}

function scoreFor(engineer: ImpactEngineer, key: SortKey): number | string {
  switch (key) {
    case "rank":
      return engineer.rank;
    case "login":
      return engineer.login.toLowerCase();
    case "composite":
      return engineer.composite;
    default:
      return engineer.dimensions[key].score;
  }
}

function uniqueByKey<T>(items: T[] | undefined, keyFn: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  const unique: T[] = [];
  for (const item of items ?? []) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function evidenceByDimension(engineer: ImpactEngineer) {
  return {
    delivery: uniqueByKey(engineer.evidence.delivery, (pr) => pr.prNumber).slice(0, 3),
    leverage: uniqueByKey(engineer.evidence.leverage, (bucket) => bucket.pathPrefix).slice(
      0,
      3,
    ),
    multiplier: uniqueByKey(engineer.evidence.multiplier, (pr) => pr.prNumber).slice(0, 3),
    reliability: uniqueByKey(engineer.evidence.reliability, (pr) => pr.prNumber).slice(
      0,
      3,
    ),
  };
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div
        className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function SortButton({
  column,
  active,
  dir,
  onClick,
}: {
  column: (typeof COLUMNS)[number];
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const marker = !active ? "↕" : dir === "desc" ? "↓" : "↑";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-describedby={column.tooltip ? `${column.key}-tip` : undefined}
      className={`group/tip relative flex w-full items-center gap-1 text-[11px] font-medium tracking-wide uppercase ${
        column.align === "left" ? "justify-start text-left" : "justify-end text-right"
      } ${active ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span>{column.label}</span>
      {column.tooltip ? (
        <span
          aria-hidden="true"
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-current text-[8px] leading-none opacity-60"
        >
          i
        </span>
      ) : null}
      <span className="font-mono text-[10px] opacity-70">{marker}</span>
      {column.tooltip ? (
        <span
          id={`${column.key}-tip`}
          role="tooltip"
          className="pointer-events-none absolute top-full right-0 z-30 mt-1 hidden w-56 rounded-md border border-zinc-200 bg-zinc-900 px-2 py-1.5 text-left text-[10px] font-normal normal-case tracking-normal text-zinc-50 shadow-lg group-hover/tip:block group-focus-visible/tip:block dark:border-zinc-700"
        >
          {column.tooltip}
        </span>
      ) : null}
    </button>
  );
}

export function ImpactDashboard({ data }: { data: ImpactPayload }) {
  const { meta, top5 } = data;
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openLogin, setOpenLogin] = useState<string | null>(null);

  const rows = useMemo(() => {
    const copy = [...top5];
    copy.sort((a, b) => {
      const av = scoreFor(a, sortKey);
      const bv = scoreFor(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [top5, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "login" || key === "rank" ? "asc" : "desc");
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-start">
      <section className="min-w-0 xl:col-span-9" aria-label="Leaderboard">
        <div className="mb-3 grid grid-cols-3 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-r border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <p className="font-mono text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {formatCount(meta.totals.prs)}
            </p>
            <p className="text-[11px] text-zinc-500">PRs Analyzed</p>
          </div>
          <div className="border-r border-zinc-200 px-3 py-2 dark:border-zinc-800">
            <p className="font-mono text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {formatCount(meta.totals.human)}
            </p>
            <p className="text-[11px] text-zinc-500">Human Cohort</p>
          </div>
          <div className="px-3 py-2">
            <p className="font-mono text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {formatCount(meta.totals.bot)}
            </p>
            <p className="text-[11px] text-zinc-500">Bots Filtered</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white xl:overflow-visible dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
              <tr>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className={`px-2.5 py-2 ${column.className ?? ""} ${
                      column.tooltip ? "relative z-10" : ""
                    }`}
                  >
                    <SortButton
                      column={column}
                      active={sortKey === column.key}
                      dir={sortDir}
                      onClick={() => toggleSort(column.key)}
                    />
                  </th>
                ))}
                <th className="px-2 py-2 text-right text-[11px] font-medium tracking-wide whitespace-nowrap text-zinc-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((engineer) => {
                const open = openLogin === engineer.login;
                const evidence = evidenceByDimension(engineer);
                const profileUrl = `https://github.com/${engineer.login}`;
                return (
                  <EngineerRows
                    key={engineer.login}
                    engineer={engineer}
                    open={open}
                    evidence={evidence}
                    profileUrl={profileUrl}
                    onToggle={() =>
                      setOpenLogin(open ? null : engineer.login)
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="xl:col-span-3 xl:sticky xl:top-4">
        <MethodologyPanel meta={meta} />
      </aside>
    </div>
  );
}

function EngineerRows({
  engineer,
  open,
  evidence,
  profileUrl,
  onToggle,
}: {
  engineer: ImpactEngineer;
  open: boolean;
  evidence: ReturnType<typeof evidenceByDimension>;
  profileUrl: string;
  onToggle: () => void;
}) {
  const dims = engineer.dimensions;
  return (
    <>
      <tr className="border-b border-zinc-100 dark:border-zinc-800">
        <td className="px-2.5 py-2 text-center font-mono text-xs font-semibold text-zinc-500">
          {engineer.rank}
        </td>
        <td className="px-2.5 py-2">
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:underline"
          >
            <img
              src={engineer.avatarUrl ?? `${profileUrl}.png`}
              alt={`${engineer.login} avatar`}
              width={24}
              height={24}
              className="h-6 w-6 rounded-full bg-zinc-200"
            />
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              @{engineer.login}
            </span>
          </a>
        </td>
        <td className="px-2.5 py-2">
          <p className="text-right font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {engineer.composite.toFixed(1)}
          </p>
          <ScoreBar value={engineer.composite} />
        </td>
        <td className="px-2.5 py-2">
          <p className="text-right font-mono text-xs">{dims.delivery.score.toFixed(1)}</p>
          <ScoreBar value={dims.delivery.score} />
        </td>
        <td className="px-2.5 py-2">
          <p className="text-right font-mono text-xs">{dims.leverage.score.toFixed(1)}</p>
          <ScoreBar value={dims.leverage.score} />
        </td>
        <td
          className="group/mult relative px-2 py-2"
          aria-label={`${dims.multiplier.score.toFixed(1)} out of 100. ${formatRawPts(dims.multiplier.raw)} raw review pts across ${formatCount(dims.multiplier.distinctAuthors ?? 0)} authors`}
        >
          <p className="flex justify-end">
            <span className="inline-flex items-baseline gap-0.5 rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
              {dims.multiplier.score.toFixed(1)}
              <span className="text-zinc-400">/ 100</span>
            </span>
          </p>
          <ScoreBar value={dims.multiplier.score} />
          <span
            role="tooltip"
            className="pointer-events-none absolute top-full right-0 z-20 mt-1 hidden w-44 rounded-md bg-zinc-900 px-2 py-1.5 text-left text-[10px] leading-snug font-normal text-zinc-50 shadow-lg group-hover/mult:block group-focus-within/mult:block"
          >
            {formatRawPts(dims.multiplier.raw)} raw review pts across{" "}
            {formatCount(dims.multiplier.distinctAuthors ?? 0)} authors
          </span>
        </td>
        <td className="px-2.5 py-2">
          <p className="text-right font-mono text-xs">{dims.reliability.score.toFixed(1)}</p>
          <ScoreBar value={dims.reliability.score} />
        </td>
        <td className="px-2 py-2 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="rounded-md border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {open ? "Hide Evidence" : "View Evidence"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-zinc-100 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
          <td colSpan={8} className="px-3 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <EvidenceGroup
                label="Delivery"
                items={evidence.delivery.map((pr) => ({
                  href: pr.url,
                  text: pr.title,
                  note: pr.note,
                }))}
              />
              <EvidenceGroup
                label="Leverage"
                items={evidence.leverage.map((bucket) => ({
                  text: bucket.pathPrefix,
                  note: bucket.note,
                }))}
              />
              <EvidenceGroup
                label="Multiplier"
                items={evidence.multiplier.map((pr) => ({
                  href: pr.url,
                  text: `#${pr.prNumber}`,
                  note: pr.note,
                }))}
              />
              <EvidenceGroup
                label="Reliability"
                items={evidence.reliability.map((pr) => ({
                  href: pr.url,
                  text: pr.title,
                  note: pr.note,
                }))}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function EvidenceGroup({
  label,
  items,
}: {
  label: string;
  items: Array<{ href?: string; text: string; note: string }>;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
        {label} · top 3
      </p>
      <ul className="space-y-0.5">
        {items.map((item, index) => (
          <li
            key={`${label}-${index}-${item.href ?? item.text}`}
            className="text-[11px] leading-snug"
          >
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-700 dark:text-zinc-100"
              >
                {item.text}
              </a>
            ) : (
              <span className="font-mono text-zinc-800 dark:text-zinc-200">
                {item.text}
              </span>
            )}
            <span className="text-zinc-500"> — {item.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
