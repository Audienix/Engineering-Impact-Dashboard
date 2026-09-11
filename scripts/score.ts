import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  isDocsLockfileOnly,
  isReliabilityPr,
  leverageBucket,
  reliabilityNote,
} from "../lib/taxonomy";
import type {
  ImpactEngineer,
  ImpactPayload,
  Pass1PullRequest,
  RawPayload,
  ReviewState,
} from "../lib/types";

const RAW_PATH = resolve(process.cwd(), "data/raw-prs.json");
const OUT_PATH = resolve(process.cwd(), "data/impact.json");
const ELIGIBILITY =
  "human AND (>=2 merged PRs authored OR >=5 reviews across distinct authors)";

const REVIEW_WEIGHT: Record<ReviewState, number> = {
  CHANGES_REQUESTED: 2,
  COMMENTED: 1.5,
  APPROVED: 1,
  DISMISSED: 0,
  PENDING: 0,
};

type EngineerAcc = {
  login: string;
  authored: Pass1PullRequest[];
  deliveryRaw: number;
  deliveryEvidence: Array<{
    pr: Pass1PullRequest;
    contribution: number;
    note: string;
  }>;
  leverageBuckets: Map<string, { weight: number; prCount: number }>;
  multiplierRaw: number;
  multiplierEvidence: Array<{
    pr: Pass1PullRequest;
    state: ReviewState;
    weight: number;
  }>;
  reviewedAuthors: Set<string>;
  reliabilityRaw: number;
  reliabilityEvidence: Array<{ pr: Pass1PullRequest; note: string }>;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function minMax(value: number, min: number, max: number): number {
  if (max === min) return max > 0 ? 100 : 0;
  return ((value - min) / (max - min)) * 100;
}

function isHumanReviewer(login: string, botLogins: Set<string>): boolean {
  if (login.endsWith("[bot]")) return false;
  if (botLogins.has(login)) return false;
  return true;
}

function uniqueByKey<T, K>(items: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  const unique: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function ensureAcc(byLogin: Map<string, EngineerAcc>, login: string): EngineerAcc {
  let acc = byLogin.get(login);
  if (!acc) {
    acc = {
      login,
      authored: [],
      deliveryRaw: 0,
      deliveryEvidence: [],
      leverageBuckets: new Map(),
      multiplierRaw: 0,
      multiplierEvidence: [],
      reviewedAuthors: new Set(),
      reliabilityRaw: 0,
      reliabilityEvidence: [],
    };
    byLogin.set(login, acc);
  }
  return acc;
}

function whyFor(engineer: ImpactEngineer): string {
  const dims = [
    { name: "delivery", score: engineer.dimensions.delivery.score },
    { name: "leverage", score: engineer.dimensions.leverage.score },
    { name: "multiplier", score: engineer.dimensions.multiplier.score },
    { name: "reliability", score: engineer.dimensions.reliability.score },
  ].sort((a, b) => b.score - a.score);
  const lead = dims[0];
  const second = dims[1];
  const deliveryNote = engineer.evidence.delivery[0]?.note;
  const leverageNote = engineer.evidence.leverage[0]?.pathPrefix;
  const parts: string[] = [];
  if (lead.name === "delivery") {
    parts.push(
      `Highest delivery score in this ranking${deliveryNote ? ` (${deliveryNote})` : ""}`,
    );
  } else if (lead.name === "leverage") {
    parts.push(
      `Broad or infra-critical footprint${leverageNote ? ` (${leverageNote})` : ""}`,
    );
  } else if (lead.name === "multiplier") {
    parts.push("Strong review support that helped other humans land merged work");
  } else {
    parts.push("Concentrated work on CI, security, or reliability-critical paths");
  }
  if (second && second.score >= 40) {
    const label =
      second.name === "delivery"
        ? "delivery"
        : second.name === "leverage"
          ? "scope/leverage"
          : second.name === "multiplier"
            ? "review multiplier"
            : "risk/reliability";
    parts.push(`also high ${label}`);
  }
  return `${parts.join("; ")}.`;
}

function scoreAll(raw: RawPayload): ImpactPayload {
  const botLogins = new Set(
    raw.pullRequests
      .filter((pr) => pr.authorType === "bot" && pr.authorLogin)
      .map((pr) => pr.authorLogin as string),
  );

  const byLogin = new Map<string, EngineerAcc>();

  for (const pr of raw.pullRequests) {
    if (pr.authorType !== "human" || !pr.authorLogin) continue;
    const acc = ensureAcc(byLogin, pr.authorLogin);
    acc.authored.push(pr);

    let contribution = 1 + (pr.closedIssueCount >= 1 ? 1 : 0);
    let note = pr.closedIssueCount >= 1 ? `Closed issue(s) ${pr.closedIssueNumbers.slice(0, 3).map((n) => `#${n}`).join(", ")}` : "Merged work";
    if (isDocsLockfileOnly(pr.files)) {
      contribution *= 0.25;
      note = `Docs/lockfile-only (0.25×)${pr.closedIssueCount >= 1 ? "; closed an issue" : ""}`;
    }
    acc.deliveryRaw += contribution;
    acc.deliveryEvidence.push({ pr, contribution, note });

    const seenInPr = new Set<string>();
    for (const path of pr.files) {
      const bucket = leverageBucket(path);
      if (!bucket || seenInPr.has(bucket.id)) continue;
      seenInPr.add(bucket.id);
      const existing = acc.leverageBuckets.get(bucket.id);
      if (existing) existing.prCount += 1;
      else acc.leverageBuckets.set(bucket.id, { weight: bucket.weight, prCount: 1 });
    }

    if (isReliabilityPr(pr.files, pr.labels)) {
      acc.reliabilityRaw += 1;
      acc.reliabilityEvidence.push({ pr, note: reliabilityNote(pr.files, pr.labels) });
    }
  }

  for (const pr of raw.pullRequests) {
    if (pr.authorType !== "human" || !pr.authorLogin) continue;
    for (const review of pr.reviews) {
      const reviewer = review.authorLogin;
      if (!reviewer) continue;
      if (reviewer === pr.authorLogin) continue;
      if (!isHumanReviewer(reviewer, botLogins)) continue;
      const acc = ensureAcc(byLogin, reviewer);
      const weight = REVIEW_WEIGHT[review.state] ?? 0;
      acc.multiplierRaw += weight;
      acc.reviewedAuthors.add(pr.authorLogin);
      if (weight > 0) {
        acc.multiplierEvidence.push({ pr, state: review.state, weight });
      }
    }
  }

  const eligible = [...byLogin.values()].filter(
    (acc) => acc.authored.length >= 2 || acc.reviewedAuthors.size >= 5,
  );

  if (eligible.length === 0) {
    throw new Error("No eligible humans found to score");
  }

  const mins = {
    delivery: Math.min(...eligible.map((acc) => acc.deliveryRaw)),
    leverage: Math.min(
      ...eligible.map((acc) =>
        [...acc.leverageBuckets.values()].reduce((sum, bucket) => sum + bucket.weight, 0),
      ),
    ),
    multiplier: Math.min(...eligible.map((acc) => acc.multiplierRaw)),
    reliability: Math.min(...eligible.map((acc) => acc.reliabilityRaw)),
  };
  const maxs = {
    delivery: Math.max(...eligible.map((acc) => acc.deliveryRaw)),
    leverage: Math.max(
      ...eligible.map((acc) =>
        [...acc.leverageBuckets.values()].reduce((sum, bucket) => sum + bucket.weight, 0),
      ),
    ),
    multiplier: Math.max(...eligible.map((acc) => acc.multiplierRaw)),
    reliability: Math.max(...eligible.map((acc) => acc.reliabilityRaw)),
  };

  const ranked = eligible
    .map((acc) => {
      const leverageRaw = [...acc.leverageBuckets.values()].reduce(
        (sum, bucket) => sum + bucket.weight,
        0,
      );
      const delivery = minMax(acc.deliveryRaw, mins.delivery, maxs.delivery);
      const leverage = minMax(leverageRaw, mins.leverage, maxs.leverage);
      const multiplier = minMax(acc.multiplierRaw, mins.multiplier, maxs.multiplier);
      const reliability = minMax(acc.reliabilityRaw, mins.reliability, maxs.reliability);
      const composite = 0.4 * delivery + 0.25 * leverage + 0.2 * multiplier + 0.15 * reliability;

      const leverageEvidence = [...acc.leverageBuckets.entries()]
        .sort((a, b) => b[1].weight - a[1].weight || b[1].prCount - a[1].prCount)
        .slice(0, 3)
        .map(([id, info]) => ({
          pathPrefix: id,
          prCount: info.prCount,
          note: `weight ${info.weight}`,
        }));

      const engineer: ImpactEngineer = {
        rank: 1,
        login: acc.login,
        name: null,
        avatarUrl: `https://github.com/${acc.login}.png`,
        composite: round1(composite),
        dimensions: {
          delivery: { score: round1(delivery), weight: 0.4, raw: round1(acc.deliveryRaw) },
          leverage: { score: round1(leverage), weight: 0.25, raw: round1(leverageRaw) },
          multiplier: {
            score: round1(multiplier),
            weight: 0.2,
            raw: round1(acc.multiplierRaw),
            distinctAuthors: acc.reviewedAuthors.size,
          },
          reliability: { score: round1(reliability), weight: 0.15, raw: acc.reliabilityRaw },
        },
        why: "",
        evidence: {
          delivery: acc.deliveryEvidence
            .sort((a, b) => b.contribution - a.contribution)
            .slice(0, 3)
            .map((item) => ({
              prNumber: item.pr.number,
              url: item.pr.url,
              title: item.pr.title,
              note: item.note,
            })),
          leverage: leverageEvidence,
          multiplier: uniqueByKey(
              [...acc.multiplierEvidence].sort((a, b) => b.weight - a.weight),
              (item) => item.pr.number,
            )
            .slice(0, 3)
            .map((item) => ({
              prNumber: item.pr.number,
              url: item.pr.url,
              reviewState: item.state,
              note: `${item.state} on @${item.pr.authorLogin}'s PR`,
            })),
          reliability: acc.reliabilityEvidence
            .slice(0, 3)
            .map((item) => ({
              prNumber: item.pr.number,
              url: item.pr.url,
              title: item.pr.title,
              note: item.note,
            })),
        },
      };
      engineer.why = whyFor(engineer);
      return { engineer, delivery, composite };
    })
    .sort((a, b) => {
      if (b.composite !== a.composite) return b.composite - a.composite;
      if (b.delivery !== a.delivery) return b.delivery - a.delivery;
      return b.engineer.dimensions.multiplier.score - a.engineer.dimensions.multiplier.score;
    });

  const top5 = ranked.slice(0, 5).map((row, index) => ({
    ...row.engineer,
    rank: (index + 1) as 1 | 2 | 3 | 4 | 5,
  }));

  return {
    meta: {
      ...raw.meta,
      eligibleHumanCount: eligible.length,
      eligibility: ELIGIBILITY,
      scoredAt: new Date().toISOString(),
      multiplierMaxRaw: round1(maxs.multiplier),
    },
    top5,
  };
}

function printSummary(impact: ImpactPayload) {
  console.log("\n========== IMPACT SCORES ==========");
  console.log(
    `Census: ${impact.meta.totals.prs} merged PRs (${impact.meta.totals.human} human / ${impact.meta.totals.bot} bot)`,
  );
  console.log(`Eligible humans: ${impact.meta.eligibleHumanCount}`);
  console.log("Top 5 most impactful engineers:\n");
  for (const engineer of impact.top5) {
    console.log(
      `#${engineer.rank} @${engineer.login}  composite=${engineer.composite}  D=${engineer.dimensions.delivery.score}  L=${engineer.dimensions.leverage.score}  M=${engineer.dimensions.multiplier.score}  R=${engineer.dimensions.reliability.score}`,
    );
    console.log(`    ${engineer.why}`);
  }
  console.log(`\nWrote ${OUT_PATH}`);
  console.log("===================================\n");
}

function main() {
  const raw = JSON.parse(readFileSync(RAW_PATH, "utf8")) as RawPayload;
  if (!raw.meta.pass2.executed) {
    throw new Error("data/raw-prs.json Pass 2 has not executed; file paths are incomplete");
  }
  const impact = scoreAll(raw);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const tmp = `${OUT_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(impact, null, 2)}\n`);
  renameSync(tmp, OUT_PATH);
  printSummary(impact);
}

main();
