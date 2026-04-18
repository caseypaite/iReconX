import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Bot, CheckCircle2, Database, Layers3, Lock, Sparkles, Workflow } from "lucide-react";

import { getServerSession } from "@/lib/auth/session";
import {
  applicationAreas,
  featureGroups,
  latestUpdates,
  libraryHighlights,
  stackGroups,
  workflowSteps
} from "@/lib/marketing";
import { loadSiteName } from "@/lib/site-name";

const quickStats = [
  { label: "Workspace surfaces", value: "5", detail: "Data Studio, Dictionary, Import, Transform, Admin" },
  { label: "Primary AI providers", value: "3", detail: "GitHub Models, Gemini, Mistral" },
  { label: "Layered container path", value: "2", detail: "Reusable base image plus app overlay" }
] as const;

const trustPoints = [
  "Role-aware routing and server-enforced sessions",
  "Encrypted governed connector settings",
  "Source dictionaries and schema-aware AI handoff"
] as const;

export default async function HomePage({
  searchParams
}: {
  searchParams?: {
    public?: string;
  };
}) {
  const session = await getServerSession();
  const siteName = await loadSiteName();

  if (session && searchParams?.public !== "1") {
    redirect(session.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#020617_100%)] text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-4 backdrop-blur-xl">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">{siteName}</p>
            <p className="mt-1 text-sm text-slate-400">Governed analytics, transform automation, and desktop-style data exploration.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="text-slate-300 transition hover:text-white" href="#platform">
              Platform
            </Link>
            <Link className="text-slate-300 transition hover:text-white" href="#updates">
              Updates
            </Link>
            <Link className="text-slate-300 transition hover:text-white" href="/about">
              About
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-slate-200 transition hover:border-sky-400/40 hover:text-white"
              href="/signup"
            >
              Create account
            </Link>
            <Link className="rounded-full bg-sky-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-sky-300" href="/login">
              Sign in
            </Link>
          </div>
        </header>

        <section className="grid flex-1 gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="space-y-8">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
                <Sparkles className="h-3.5 w-3.5" />
                Desktop analytics and governed workflow studio
              </div>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                  Govern data workflows from one professional workspace.
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                  {siteName} combines a floating-window analyst desktop, persistent-import aware Data Studio, a dedicated
                  Data Dictionary Manager, hybrid JavaScript and tidyverse transforms, and an audited admin control plane
                  on a secure Next.js, Prisma, and PostgreSQL foundation.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-sky-300" href="/login">
                  Open workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link className="rounded-full border border-white/10 px-5 py-3 text-sm text-slate-100 transition hover:border-white/20 hover:bg-white/[0.04]" href="/about">
                  Explore architecture
                </Link>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {quickStats.map((stat) => (
                <article key={stat.label} className="rounded-[22px] border border-white/10 bg-slate-950/45 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.28)]">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{stat.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{stat.value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{stat.detail}</p>
                </article>
              ))}
            </div>

            <section id="platform" className="rounded-[30px] border border-white/10 bg-slate-950/45 p-6 lg:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Platform overview</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                      Designed for teams that need governed access, business-aware source definitions, repeatable transforms, and a workspace that supports parallel analyst activity.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                  <Lock className="h-3.5 w-3.5" />
                  Secure by default
                </div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {featureGroups.map((feature) => {
                  const Icon = feature.icon;

                  return (
                    <article key={feature.title} className="rounded-[22px] border border-white/10 bg-slate-950/35 p-5">
                      <div className="flex items-center gap-3">
                        <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3 text-sky-300">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-400">{feature.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[30px] border border-white/10 bg-slate-950/45 p-6 lg:p-7">
              <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                {applicationAreas.map((area) => (
                  <article key={area.title} className="rounded-[22px] border border-white/10 bg-slate-950/35 p-5">
                    <h3 className="text-base font-semibold text-white">{area.title}</h3>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
                      {area.items.map((item) => (
                        <li key={item} className="flex gap-2">
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section id="updates" className="rounded-[30px] border border-sky-400/15 bg-slate-950/55 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.34)]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3 text-sky-300">
                  <Workflow className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Latest updates</h2>
                    <p className="mt-1 text-sm text-slate-400">Recent workflow capabilities shipping across the public site, analyst desktop, and admin-controlled runtime.</p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {latestUpdates.map((update) => {
                  const Icon = update.icon;

                  return (
                    <article key={update.title} className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-slate-200">
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <h3 className="text-sm font-semibold text-white">{update.title}</h3>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-400">{update.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[30px] border border-white/10 bg-slate-950/55 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-3 text-violet-300">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Technology stack</h2>
                  <p className="mt-1 text-sm text-slate-400">Framework, workflow runtime, security, state, and persistence layers used across the product.</p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {stackGroups.map((group) => (
                  <div key={group.area} className="rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                    <p className="text-sm font-semibold text-white">{group.area}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.items.map((item) => (
                        <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>

        <section className="grid gap-6 rounded-[32px] border border-white/10 bg-slate-950/45 p-6 lg:grid-cols-[0.9fr_1.1fr] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
              <Layers3 className="h-3.5 w-3.5" />
              Operating model
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-white">Typical delivery flow</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              The product is organized around a controlled path from access and ingestion through source definition, transformation, and governance.
            </p>
            <div className="mt-6 space-y-2">
              {trustPoints.map((point) => (
                <div key={point} className="flex items-center gap-2 text-sm text-slate-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {point}
                </div>
              ))}
            </div>
          </div>
          <ol className="space-y-3">
            {workflowSteps.map((step, index) => (
              <li key={step} className="flex gap-3 rounded-[20px] border border-white/10 bg-slate-950/35 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sm font-semibold text-sky-300">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-slate-300">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 rounded-[32px] border border-white/10 bg-slate-950/45 p-6 lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Key libraries in use</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">
                A focused set of framework, state, import-processing, and security libraries supports the current implementation.
              </p>
            </div>
            <Link className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.04]" href="/about">
              View detailed About page
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {libraryHighlights.map((library) => (
              <article key={library.name} className="rounded-[22px] border border-white/10 bg-slate-950/35 p-5">
                <h3 className="text-sm font-semibold text-white">{library.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{library.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[32px] border border-sky-400/20 bg-gradient-to-r from-sky-400/10 via-cyan-400/10 to-violet-400/10 p-6 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs text-sky-100">
                <Bot className="h-3.5 w-3.5" />
                Public overview with protected workspace handoff
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-white sm:text-3xl">
                Review the platform publicly, then move into the secure analyst or admin experience.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                 Signed-in users still flow directly into their protected workspace by default, while dedicated public links can open the landing and About pages when needed.
               </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="rounded-full bg-sky-400 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-300" href="/login">
                Sign in
              </Link>
              <Link className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-slate-100 transition hover:border-white/20 hover:bg-white/[0.04]" href="/about">
                About the stack
              </Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
