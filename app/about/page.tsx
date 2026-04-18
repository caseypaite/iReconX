import Link from "next/link";
import { ArrowLeft, Database, Layers3, Lock, Workflow } from "lucide-react";

import { applicationAreas, libraryHighlights, stackGroups } from "@/lib/marketing";
import { loadSiteName } from "@/lib/site-name";

export default async function AboutPage() {
  const siteName = await loadSiteName();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#020617_100%)] text-slate-100">
      <section className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
        <header className="rounded-[26px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">{siteName}</p>
              <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">About the platform architecture</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400 sm:text-base">
                This page summarizes the technology choices, libraries, and application structure currently used across the public site,
                the protected desktop workspace, and the admin governance plane.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/[0.04]" href="/?public=1">
                <ArrowLeft className="h-4 w-4" />
                Back to landing page
              </Link>
              <Link className="rounded-full bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300" href="/login">
                Sign in
              </Link>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[28px] border border-white/10 bg-slate-950/45 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3 text-sky-300">
                <Layers3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-white">Application areas</h2>
                <p className="mt-1 text-sm text-slate-400">How the codebase is divided across public, analyst, and admin surfaces.</p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {applicationAreas.map((area) => (
                <article key={area.title} className="rounded-[20px] border border-white/10 bg-slate-950/35 p-5">
                  <h3 className="text-base font-semibold text-white">{area.title}</h3>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
                    {area.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-slate-950/45 p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-3 text-violet-300">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-white">Technology stack</h2>
                <p className="mt-1 text-sm text-slate-400">Frameworks and runtime layers currently in use.</p>
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

        <section className="mt-8 rounded-[30px] border border-white/10 bg-slate-950/45 p-6 lg:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-300">
              <Workflow className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">Libraries used by the project</h2>
              <p className="mt-1 text-sm text-slate-400">Core packages that shape routing, UI, persistence, security, and data handling.</p>
            </div>
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

        <section className="mt-8 rounded-[30px] border border-white/10 bg-slate-950/45 p-6 lg:p-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-300">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">Platform notes</h2>
              <p className="mt-1 text-sm text-slate-400">Security and runtime conventions reflected in the current implementation.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-[22px] border border-white/10 bg-slate-950/35 p-5">
              <h3 className="text-base font-semibold text-white">Authentication and authorization</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Sessions are signed with JWTs via <code>jose</code>, stored in HTTP-only cookies, and revalidated server-side.
                Role-aware routing separates analyst and admin experiences without depending on client-only checks.
              </p>
            </article>
            <article className="rounded-[22px] border border-white/10 bg-slate-950/35 p-5">
              <h3 className="text-base font-semibold text-white">Data and workflow runtime</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Prisma and PostgreSQL back users, audit data, governed sources, temporary analysis tables, and persistent imports.
                Transform Studio combines browser-safe JavaScript nodes with server-executed tidyverse steps for governed source access.
              </p>
            </article>
          </div>
        </section>
      </section>
    </main>
  );
}
