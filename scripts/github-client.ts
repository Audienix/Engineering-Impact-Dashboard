import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

type GraphQLBody<T> = {
  data?: T;
  errors?: Array<{ message: string; type?: string }>;
};

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

function envToken(): string | undefined {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return token && token.length > 0 ? token : undefined;
}

export type GraphqlResult<T> = {
  data: T;
  status: number;
  retryAfterSeconds: number | null;
};

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parseGraphQLBody<T>(raw: string, status: number): GraphQLBody<T> {
  try {
    return JSON.parse(raw) as GraphQLBody<T>;
  } catch {
    throw new Error(`[github] non-JSON response (HTTP ${status}): ${raw.slice(0, 400)}`);
  }
}

function ghApiGraphql(query: string, variables: Record<string, unknown>): Promise<{
  status: number;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("gh", ["api", "graphql", "--input", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({
        status: code === 0 ? 200 : 400,
        stdout,
        stderr,
      });
    });
    child.stdin.write(JSON.stringify({ query, variables }));
    child.stdin.end();
  });
}

export async function githubGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphqlResult<T>> {
  const token = envToken();
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let status = 0;
    let retryAfterSeconds: number | null = null;
    let raw = "";

    if (token) {
      const response = await fetch(GITHUB_GRAPHQL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "engineer-impact-dashboard",
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({ query, variables }),
      });
      status = response.status;
      const retryAfterHeader = response.headers.get("retry-after");
      retryAfterSeconds = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10)
        : null;
      raw = await response.text();
    } else {
      const gh = await ghApiGraphql(query, variables);
      raw = gh.stdout || gh.stderr;
      status = gh.status;
      if (gh.stderr && /error|auth|login/i.test(gh.stderr) && !gh.stdout) {
        raw = gh.stderr;
      }
    }

    if (status === 502 || status === 503 || status === 504) {
      const waitMs = Math.min(30_000, 1000 * 2 ** attempt);
      console.warn(
        `[github] HTTP ${status}, retrying in ${waitMs}ms (attempt ${attempt}/${maxAttempts})`,
      );
      await sleep(waitMs);
      continue;
    }

    if (status === 403 || status === 429) {
      const waitMs =
        retryAfterSeconds && Number.isFinite(retryAfterSeconds)
          ? retryAfterSeconds * 1000
          : Math.min(60_000, 2000 * 2 ** attempt);
      console.warn(`[github] HTTP ${status} (rate limit), waiting ${waitMs}ms`);
      await sleep(waitMs);
      continue;
    }

    const body = parseGraphQLBody<T>(raw, status);

    if (status >= 400 && !body.data) {
      throw new Error(
        `[github] GraphQL HTTP ${status}: ${JSON.stringify(body.errors ?? body)}`,
      );
    }

    if (body.errors?.length) {
      const messages = body.errors.map((error) => error.message).join("; ");
      const isRate =
        messages.toLowerCase().includes("rate limit") ||
        messages.toLowerCase().includes("secondary rate");
      if (isRate && attempt < maxAttempts) {
        const waitMs = Math.min(60_000, 2000 * 2 ** attempt);
        console.warn(`[github] GraphQL rate error, waiting ${waitMs}ms: ${messages}`);
        await sleep(waitMs);
        continue;
      }
      if (body.data) {
        console.warn(`[github] GraphQL partial errors (continuing): ${messages}`);
      } else {
        throw new Error(`[github] GraphQL errors: ${messages}`);
      }
    }

    if (!body.data) {
      throw new Error("[github] GraphQL response missing data");
    }

    return { data: body.data, status, retryAfterSeconds };
  }

  throw new Error("[github] exhausted retries");
}
