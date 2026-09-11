const UNCLASSIFIED = new Set([
  "playwright",
  "funnel-udf",
  "share",
  "tools",
  "patches",
]);

const INFRA = new Set([
  ".github",
  "docker",
  "terraform",
  "bin",
  "devenv",
  "common",
  "proto",
]);

const PRODUCT = new Set([
  "frontend",
  "posthog",
  "ee",
  "rust",
  "nodejs",
  "cli",
  "livestream",
  "services",
]);

const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

export type LeverageBucket = { id: string; weight: number };

export function isDocsLockfilePath(path: string): boolean {
  const lower = path.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (lower.startsWith("docs/")) return true;
  if (lower.endsWith(".md")) return true;
  if (base.startsWith("changelog")) return true;
  if (LOCKFILE_NAMES.has(base)) return true;
  return false;
}

export function isDocsLockfileOnly(files: string[]): boolean {
  if (files.length === 0) return false;
  return files.every(isDocsLockfilePath);
}

export function leverageBucket(path: string): LeverageBucket | null {
  const first = path.split("/")[0] ?? "";
  const firstLower = first.toLowerCase();

  if (UNCLASSIFIED.has(firstLower)) return null;

  if (INFRA.has(firstLower)) return { id: firstLower, weight: 2 };
  if (/^dockerfile/i.test(first) || /^docker-compose/i.test(first)) {
    return { id: "docker-root", weight: 2 };
  }

  if (firstLower === "packages") return { id: "packages", weight: 0.5 };

  if (firstLower === "products") {
    const name = path.split("/")[1];
    return { id: name ? `products/${name}` : "products", weight: 1 };
  }

  if (PRODUCT.has(firstLower)) return { id: firstLower, weight: 1 };
  return null;
}

function pathHasAuthToken(path: string): boolean {
  return /(^|\/|[-_.])auth([^a-z]|$)/i.test(path) || /oauth/i.test(path);
}

export function isReliabilityPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (
    lower.startsWith(".github/") ||
    lower.startsWith(".husky/") ||
    lower.startsWith(".semgrep/")
  ) {
    return true;
  }
  const first = path.split("/")[0] ?? "";
  const base = path.split("/").pop() ?? "";
  if (/^dockerfile/i.test(first) || /^docker-compose/i.test(first)) return true;
  if (/^dockerfile/i.test(base) || /^docker-compose/i.test(base)) return true;
  if (
    lower.includes("security") ||
    lower.includes("cve") ||
    lower.includes("secret")
  ) {
    return true;
  }
  if (pathHasAuthToken(path)) return true;
  if (
    lower.startsWith("rust/") ||
    lower.startsWith("livestream/") ||
    lower.startsWith("terraform/")
  ) {
    return true;
  }
  if (
    lower.includes("clickhouse") ||
    lower.includes("dagster") ||
    lower.includes("otel")
  ) {
    return true;
  }
  return false;
}

export function isReliabilityLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    lower.includes("security") ||
    lower.includes("auth") ||
    lower.includes("cve") ||
    lower.includes("secret") ||
    lower.includes("reliability") ||
    lower.includes("incident") ||
    lower.includes("hotfix")
  );
}

export function isReliabilityPr(files: string[], labels: string[]): boolean {
  if (labels.some(isReliabilityLabel)) return true;
  return files.some(isReliabilityPath);
}

export function reliabilityNote(files: string[], labels: string[]): string {
  const hits: string[] = [];
  if (labels.some((label) => label.toLowerCase().includes("security"))) {
    hits.push("security label");
  }
  if (files.some((path) => path.toLowerCase().startsWith(".github/"))) {
    hits.push("CI (.github)");
  }
  if (files.some((path) => path.toLowerCase().startsWith("rust/"))) {
    hits.push("rust/");
  }
  if (files.some((path) => path.toLowerCase().includes("clickhouse"))) {
    hits.push("clickhouse");
  }
  if (files.some((path) => path.toLowerCase().startsWith(".semgrep/"))) {
    hits.push(".semgrep/");
  }
  if (files.some(pathHasAuthToken) || labels.some((label) => label.toLowerCase().includes("auth"))) {
    hits.push("auth");
  }
  if (files.some((path) => path.toLowerCase().startsWith("terraform/"))) {
    hits.push("terraform/");
  }
  if (hits.length === 0) return "Matched reliability/CI/security path or label";
  return hits.slice(0, 3).join(", ");
}
