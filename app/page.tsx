import impactJson from "@/data/impact.json";
import { ImpactDashboard } from "@/app/components/impact-dashboard";
import type { ImpactPayload } from "@/lib/types";

const impact = impactJson as ImpactPayload;

export default function Home() {
  const { meta } = impact;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col gap-4 px-2 py-4 sm:px-3">
        <header className="shrink-0 space-y-1">
          <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
            PostHog/posthog · {meta.windowStart.slice(0, 10)} →{" "}
            {meta.windowEnd.slice(0, 10)}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            PostHog Engineering Impact Dashboard (90-Day Analysis)
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Top 5 Engineers: @Gilbert09 (Delivery Lead), @webjunkie (Leverage
            Lead), @pauldambra, @rnegron (Reliability Lead), and
            @rafaeelaudibert.
          </p>
        </header>

        <ImpactDashboard data={impact} />
      </main>
    </div>
  );
}
