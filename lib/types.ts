export type AuthorType = "human" | "bot";

export type ReviewState =
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "COMMENTED"
  | "DISMISSED"
  | "PENDING";

export type Pass1PullRequest = {
  number: number;
  url: string;
  title: string;
  mergedAt: string | null;
  authorLogin: string | null;
  authorTypename: string | null;
  authorType: AuthorType;
  labels: string[];
  closedIssueCount: number;
  closedIssueNumbers: number[];
  reviews: Array<{
    authorLogin: string | null;
    state: ReviewState;
    submittedAt: string | null;
  }>;
  files: string[];
  filesFetched?: boolean;
  filesTruncated?: boolean;
};

export type Pass1Payload = {
  meta: {
    repo: "PostHog/posthog";
    windowStart: string;
    windowEnd: string;
    fetchedAt: string;
    searchQueryBase: string;
    totals: { prs: number; human: number; bot: number };
    rateLimit: {
      firstPageCost: number | null;
      firstPageRemaining: number | null;
      finalCost: number | null;
      finalRemaining: number | null;
      resetAt: string | null;
    };
    pass2: {
      batchSize: number;
      estimatedBatchCalls: number;
      executed: boolean;
      completedBatches?: number;
      humanFilesFetched?: number;
      truncatedFileLists?: number;
    };
  };
  pullRequests: Pass1PullRequest[];
};

export type RawPayload = Pass1Payload;

export type ImpactEngineer = {
  rank: 1 | 2 | 3 | 4 | 5;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  composite: number;
  dimensions: {
    delivery: { score: number; weight: 0.4; raw: number };
    leverage: { score: number; weight: 0.25; raw: number };
    multiplier: {
      score: number;
      weight: 0.2;
      raw: number;
      distinctAuthors: number;
    };
    reliability: { score: number; weight: 0.15; raw: number };
  };
  why: string;
  evidence: {
    delivery: Array<{ prNumber: number; url: string; title: string; note: string }>;
    leverage: Array<{ pathPrefix: string; prCount: number; note: string }>;
    multiplier: Array<{
      prNumber: number;
      url: string;
      reviewState: string;
      note: string;
    }>;
    reliability: Array<{ prNumber: number; url: string; title: string; note: string }>;
  };
};

export type ImpactPayload = {
  meta: Pass1Payload["meta"] & {
    eligibleHumanCount: number;
    eligibility: string;
    scoredAt: string;
    multiplierMaxRaw: number;
  };
  top5: ImpactEngineer[];
};
