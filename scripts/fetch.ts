import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { classifyAuthor } from "./classify-author";
import { githubGraphql } from "./github-client";
import type { Pass1Payload, Pass1PullRequest, RawPayload, ReviewState } from "../lib/types";

const OWNER = "PostHog";
const REPO = "posthog";
const WINDOW_START = "2026-06-13";
const WINDOW_END = "2026-09-11";
const PASS2_BATCH_SIZE = 18;
const SEARCH_PAGE_SIZE = 50;
const SEARCH_HARD_CAP = 1000;
const OUT_PATH = resolve(process.cwd(), "data/pass1-prs.json");
const RAW_PATH = resolve(process.cwd(), "data/raw-prs.json");

const PASS1_QUERY = `query Pass1Census($searchQuery: String!, $cursor: String) {
  search(query: $searchQuery, type: ISSUE, first: 50, after: $cursor) {
    issueCount
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on PullRequest {
        number
        url
        title
        mergedAt
        author {
          login
          __typename
        }
        labels(first: 10) {
          nodes {
            name
          }
        }
        closingIssuesReferences(first: 10) {
          totalCount
          nodes {
            number
          }
        }
        reviews(first: 20) {
          nodes {
            author {
              login
            }
            state
            submittedAt
          }
        }
      }
    }
  }
  rateLimit {
    cost
    remaining
    resetAt
  }
}`;

type RateLimit = {
  cost: number;
  remaining: number;
  resetAt: string;
};

type Pass1Response = {
  search: {
    issueCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<GraphQLPullRequest | Record<string, never> | null>;
  };
  rateLimit: RateLimit;
};

type GraphQLPullRequest = {
  number: number;
  url: string;
  title: string;
  mergedAt: string | null;
  author: { login: string; __typename: string } | null;
  labels: { nodes: Array<{ name: string }> };
  closingIssuesReferences: {
    totalCount: number;
    nodes: Array<{ number: number }>;
  };
  reviews: {
    nodes: Array<{
      author: { login: string } | null;
      state: ReviewState;
      submittedAt: string | null;
    }>;
  };
};

function searchQueryForRange(from: string, to: string): string {
  return `repo:${OWNER}/${REPO} is:pr is:merged merged:${from}..${to}`;
}

function isPullRequest(node: unknown): node is GraphQLPullRequest {
  return (
    typeof node === "object" &&
    node !== null &&
    "number" in node &&
    typeof (node as GraphQLPullRequest).number === "number" &&
    "url" in node
  );
}

function mapPullRequest(node: GraphQLPullRequest): Pass1PullRequest {
  const authorType = classifyAuthor(node.author);
  return {
    number: node.number,
    url: node.url,
    title: node.title,
    mergedAt: node.mergedAt,
    authorLogin: node.author?.login ?? null,
    authorTypename: node.author?.__typename ?? null,
    authorType,
    labels: node.labels.nodes.map((label) => label.name),
    closedIssueCount: node.closingIssuesReferences.totalCount,
    closedIssueNumbers: node.closingIssuesReferences.nodes.map((issue) => issue.number),
    reviews: node.reviews.nodes.map((review) => ({
      authorLogin: review.author?.login ?? null,
      state: review.state,
      submittedAt: review.submittedAt,
    })),
    files: [],
  };
}

async function waitIfLowRemaining(rateLimit: RateLimit) {
  if (rateLimit.remaining > 50) return;
  const resetAt = Date.parse(rateLimit.resetAt);
  const waitMs = Math.max(0, resetAt - Date.now()) + 1500;
  console.warn(
    `[rateLimit] remaining=${rateLimit.remaining}; waiting ${Math.ceil(waitMs / 1000)}s until ${rateLimit.resetAt}`,
  );
  await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
}

function midpointSplit(from: string, to: string): { leftTo: string; rightFrom: string } | null {
  if (from === to) return null;
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  const mid = new Date(fromMs + Math.floor((toMs - fromMs) / 2));
  const leftTo = mid.toISOString().slice(0, 10);
  const next = new Date(mid);
  next.setUTCDate(next.getUTCDate() + 1);
  const rightFrom = next.toISOString().slice(0, 10);
  if (leftTo < from || rightFrom > to || rightFrom < from) return null;
  return { leftTo, rightFrom };
}

function buildPayload(
  pullRequests: Pass1PullRequest[],
  fetchedAt: string,
  rateMeta: Pass1Payload["meta"]["rateLimit"],
): Pass1Payload {
  const { human, bot } = summarize(pullRequests);
  const estimatedBatchCalls = Math.ceil(human / PASS2_BATCH_SIZE);
  return {
    meta: {
      repo: "PostHog/posthog",
      windowStart: `${WINDOW_START}T00:00:00.000Z`,
      windowEnd: `${WINDOW_END}T23:59:59.999Z`,
      fetchedAt,
      searchQueryBase: searchQueryForRange(WINDOW_START, WINDOW_END),
      totals: { prs: pullRequests.length, human, bot },
      rateLimit: rateMeta,
      pass2: {
        batchSize: PASS2_BATCH_SIZE,
        estimatedBatchCalls,
        executed: false,
      },
    },
    pullRequests,
  };
}

function saveJson(path: string, payload: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload)}\n`);
  renameSync(tmp, path);
}

function savePayload(payload: Pass1Payload) {
  saveJson(OUT_PATH, payload);
}

function saveRaw(payload: RawPayload) {
  saveJson(RAW_PATH, payload);
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function buildPass2Query(numbers: number[]): string {
  const fields = numbers
    .map(
      (number) => `    pr_${number}: pullRequest(number: ${number}) {
      number
      files(first: 100) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          path
        }
      }
    }`,
    )
    .join("\n");
  return `query Pass2FilesBatch($owner: String!, $repoName: String!) {
  repository(owner: $owner, name: $repoName) {
${fields}
  }
  rateLimit {
    cost
    remaining
    resetAt
  }
}`;
}

type Pass2Response = {
  repository: Record<
    string,
    {
      number: number;
      files: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{ path: string }>;
      };
    } | null
  > | null;
  rateLimit: RateLimit;
};

async function fetchPass2Batch(numbers: number[]): Promise<Pass2Response> {
  if (numbers.length === 0) {
    throw new Error("empty Pass 2 batch");
  }
  try {
    const { data } = await githubGraphql<Pass2Response>(buildPass2Query(numbers), {
      owner: OWNER,
      repoName: REPO,
    });
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const tooComplex =
      message.toLowerCase().includes("complexity") ||
      message.toLowerCase().includes("timeout") ||
      numbers.length > 1 && message.toLowerCase().includes("something went wrong");
    if (tooComplex && numbers.length > 1) {
      const mid = Math.ceil(numbers.length / 2);
      console.warn(
        `[pass2] splitting batch of ${numbers.length} after error: ${message.slice(0, 180)}`,
      );
      const left = await fetchPass2Batch(numbers.slice(0, mid));
      const right = await fetchPass2Batch(numbers.slice(mid));
      return {
        repository: { ...(left.repository ?? {}), ...(right.repository ?? {}) },
        rateLimit: right.rateLimit,
      };
    }
    throw error;
  }
}

function applyPass2Files(
  byNumber: Map<number, Pass1PullRequest>,
  data: Pass2Response,
): { fetched: number; truncated: number } {
  let fetched = 0;
  let truncated = 0;
  for (const node of Object.values(data.repository ?? {})) {
    if (!node) continue;
    const pr = byNumber.get(node.number);
    if (!pr) continue;
    pr.files = node.files.nodes.map((file) => file.path);
    pr.filesFetched = true;
    pr.filesTruncated = node.files.pageInfo.hasNextPage;
    fetched += 1;
    if (pr.filesTruncated) truncated += 1;
  }
  return { fetched, truncated };
}

async function runPass2() {
  if (!existsSync(OUT_PATH)) {
    throw new Error(`Missing ${OUT_PATH}. Run Pass 1 first.`);
  }

  const pass1 = JSON.parse(readFileSync(OUT_PATH, "utf8")) as Pass1Payload;
  const existingRaw = existsSync(RAW_PATH)
    ? (JSON.parse(readFileSync(RAW_PATH, "utf8")) as RawPayload)
    : null;

  const previousFiles = new Map<number, Pass1PullRequest>();
  if (existingRaw) {
    for (const pr of existingRaw.pullRequests) previousFiles.set(pr.number, pr);
  }

  const byNumber = new Map<number, Pass1PullRequest>();
  for (const pr of pass1.pullRequests) {
    const prev = previousFiles.get(pr.number);
    byNumber.set(pr.number, {
      ...pr,
      files: prev?.filesFetched ? prev.files : [],
      filesFetched: prev?.filesFetched ?? false,
      filesTruncated: prev?.filesTruncated ?? false,
    });
  }

  const pending = [...byNumber.values()].filter(
    (pr) => pr.authorType === "human" && !pr.filesFetched,
  );
  const batches = chunk(
    pending.map((pr) => pr.number),
    PASS2_BATCH_SIZE,
  );

  console.log(
    `[pass2] human PRs pending=${pending.length} alreadyFetched=${
      pass1.meta.totals.human - pending.length
    } batches=${batches.length} (size ${PASS2_BATCH_SIZE})`,
  );

  let completedBatches = 0;
  let truncatedFileLists = [...byNumber.values()].filter((pr) => pr.filesTruncated).length;
  const rateMeta = { ...pass1.meta.rateLimit };

  for (const numbers of batches) {
    const data = await fetchPass2Batch(numbers);
    const applied = applyPass2Files(byNumber, data);
    truncatedFileLists += applied.truncated;
    completedBatches += 1;
    rateMeta.finalCost = data.rateLimit.cost;
    rateMeta.finalRemaining = data.rateLimit.remaining;
    rateMeta.resetAt = data.rateLimit.resetAt;

    if (completedBatches === 1) {
      console.log(
        `[pass2] first batch rateLimit.cost=${data.rateLimit.cost} remaining=${data.rateLimit.remaining} resetAt=${data.rateLimit.resetAt}`,
      );
    }

    if (completedBatches % 10 === 0 || completedBatches === batches.length) {
      console.log(
        `[pass2] batch ${completedBatches}/${batches.length} fetched=${applied.fetched} truncated+=${applied.truncated} remaining=${data.rateLimit.remaining}`,
      );
    }

    if (completedBatches % 20 === 0 || completedBatches === batches.length) {
      const pullRequests = [...byNumber.values()].sort((a, b) => a.number - b.number);
      const humanFilesFetched = pullRequests.filter(
        (pr) => pr.authorType === "human" && pr.filesFetched,
      ).length;
      saveRaw({
        ...pass1,
        meta: {
          ...pass1.meta,
          rateLimit: rateMeta,
          pass2: {
            batchSize: PASS2_BATCH_SIZE,
            estimatedBatchCalls: batches.length,
            executed: humanFilesFetched >= pass1.meta.totals.human,
            completedBatches,
            humanFilesFetched,
            truncatedFileLists,
          },
        },
        pullRequests,
      });
      console.log(`[pass2] checkpoint ${humanFilesFetched}/${pass1.meta.totals.human} → ${RAW_PATH}`);
    }

    await waitIfLowRemaining(data.rateLimit);
  }

  const pullRequests = [...byNumber.values()].sort((a, b) => a.number - b.number);
  const humanFilesFetched = pullRequests.filter(
    (pr) => pr.authorType === "human" && pr.filesFetched,
  ).length;
  const missing = pullRequests.filter(
    (pr) => pr.authorType === "human" && !pr.filesFetched,
  ).length;

  const raw: RawPayload = {
    ...pass1,
    meta: {
      ...pass1.meta,
      rateLimit: rateMeta,
      pass2: {
        batchSize: PASS2_BATCH_SIZE,
        estimatedBatchCalls: Math.ceil(pass1.meta.totals.human / PASS2_BATCH_SIZE),
        executed: missing === 0,
        completedBatches,
        humanFilesFetched,
        truncatedFileLists,
      },
    },
    pullRequests,
  };
  saveRaw(raw);

  console.log("\n========== PASS 2 COMPLETE ==========");
  console.log(`Human PRs with files:     ${humanFilesFetched}/${pass1.meta.totals.human}`);
  console.log(`Missing file lists:       ${missing}`);
  console.log(`Truncated at 100 files:   ${truncatedFileLists}`);
  console.log(`Batches executed:         ${completedBatches}`);
  console.log(`Final rateLimit.remaining:${rateMeta.finalRemaining} (last cost=${rateMeta.finalCost})`);
  console.log(`Wrote:                    ${RAW_PATH}`);
  console.log("=====================================\n");

  if (missing > 0) {
    throw new Error(`Pass 2 finished with ${missing} human PRs still missing files`);
  }
}

async function fetchSearchPage(searchQuery: string, cursor: string | null) {
  const { data } = await githubGraphql<Pass1Response>(PASS1_QUERY, {
    searchQuery,
    cursor,
  });
  return data;
}

async function paginateWindow(
  from: string,
  to: string,
  byNumber: Map<number, Pass1PullRequest>,
  rateMeta: Pass1Payload["meta"]["rateLimit"],
  stats: { pages: number; firstPageLogged: boolean; lastCheckpoint: number },
) {
  const searchQuery = searchQueryForRange(from, to);
  let cursor: string | null = null;
  let page = 0;
  let issueCount = 0;

  while (true) {
    const data = await fetchSearchPage(searchQuery, cursor);
    page += 1;
    stats.pages += 1;
    issueCount = data.search.issueCount;
    rateMeta.finalCost = data.rateLimit.cost;
    rateMeta.finalRemaining = data.rateLimit.remaining;
    rateMeta.resetAt = data.rateLimit.resetAt;

    if (!stats.firstPageLogged) {
      stats.firstPageLogged = true;
      rateMeta.firstPageCost = data.rateLimit.cost;
      rateMeta.firstPageRemaining = data.rateLimit.remaining;
      console.log(
        `[pass1] first page rateLimit.cost=${data.rateLimit.cost} remaining=${data.rateLimit.remaining} resetAt=${data.rateLimit.resetAt}`,
      );
      console.log(`[pass1] full-window issueCount reported by GitHub search: ${issueCount}`);
    }

    if (page === 1 && issueCount > SEARCH_HARD_CAP) {
      const split = midpointSplit(from, to);
      if (split) {
        console.log(
          `[pass1] window ${from}..${to} has issueCount=${issueCount} (>${SEARCH_HARD_CAP}); splitting at ${split.leftTo} / ${split.rightFrom}`,
        );
        await paginateWindow(from, split.leftTo, byNumber, rateMeta, stats);
        await paginateWindow(split.rightFrom, to, byNumber, rateMeta, stats);
        return;
      }
      console.warn(
        `[pass1] window ${from}..${to} has issueCount=${issueCount} and cannot be split further; fetching first ${SEARCH_HARD_CAP} only`,
      );
    }

    for (const node of data.search.nodes) {
      if (!isPullRequest(node)) continue;
      byNumber.set(node.number, mapPullRequest(node));
    }

    console.log(
      `[pass1] ${from}..${to} page ${page}: +${data.search.nodes.filter(isPullRequest).length} PRs, unique=${byNumber.size}, remaining=${data.rateLimit.remaining}`,
    );

    if (byNumber.size - stats.lastCheckpoint >= 500) {
      stats.lastCheckpoint = byNumber.size;
      const checkpoint = [...byNumber.values()].sort((a, b) => a.number - b.number);
      savePayload(buildPayload(checkpoint, new Date().toISOString(), rateMeta));
      console.log(`[pass1] checkpointed ${byNumber.size} PRs → ${OUT_PATH}`);
    }

    await waitIfLowRemaining(data.rateLimit);

    if (!data.search.pageInfo.hasNextPage) break;
    cursor = data.search.pageInfo.endCursor;
    if (page * SEARCH_PAGE_SIZE >= SEARCH_HARD_CAP) {
      console.warn(
        `[pass1] hit search hard cap on ${from}..${to} after ${page} pages`,
      );
      break;
    }
  }
}

function summarize(prs: Pass1PullRequest[]) {
  let human = 0;
  let bot = 0;
  for (const pr of prs) {
    if (pr.authorType === "bot") bot += 1;
    else human += 1;
  }
  return { human, bot };
}

function printStopSummary(payload: Pass1Payload) {
  const { totals, rateLimit, pass2 } = payload.meta;
  console.log("\n========== PASS 1 COMPLETE — STOPPING BEFORE PASS 2 ==========");
  console.log(`Total merged PRs fetched:     ${totals.prs}`);
  console.log(`Human-authored PRs:           ${totals.human}`);
  console.log(`Bot/automation PRs:           ${totals.bot}`);
  console.log(`Final rateLimit.remaining:    ${rateLimit.finalRemaining} (last cost=${rateLimit.finalCost})`);
  console.log(`Estimated Pass 2 batch calls: ${pass2.estimatedBatchCalls} (batch size ${pass2.batchSize}, human PRs only)`);
  console.log(`Wrote:                        ${OUT_PATH}`);
  console.log("Pass 2 was NOT executed. Waiting for manual confirmation.");
  console.log("================================================================\n");
}

async function main() {
  if (process.argv.includes("--pass2")) {
    await runPass2();
    return;
  }

  const fetchedAt = new Date().toISOString();
  const byNumber = new Map<number, Pass1PullRequest>();
  const rateMeta: Pass1Payload["meta"]["rateLimit"] = {
    firstPageCost: null,
    firstPageRemaining: null,
    finalCost: null,
    finalRemaining: null,
    resetAt: null,
  };
  const stats = { pages: 0, firstPageLogged: false, lastCheckpoint: 0 };

  console.log(
    `[pass1] census ${searchQueryForRange(WINDOW_START, WINDOW_END)} (page size ${SEARCH_PAGE_SIZE})`,
  );

  await paginateWindow(WINDOW_START, WINDOW_END, byNumber, rateMeta, stats);

  const pullRequests = [...byNumber.values()].sort((a, b) => a.number - b.number);
  const payload = buildPayload(pullRequests, fetchedAt, rateMeta);

  savePayload(payload);
  console.log(
    `[pass1] complete. pages=${stats.pages} cost_first=${rateMeta.firstPageCost} remaining_first=${rateMeta.firstPageRemaining} remaining_final=${rateMeta.finalRemaining} resetAt=${rateMeta.resetAt}`,
  );
  printStopSummary(payload);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
