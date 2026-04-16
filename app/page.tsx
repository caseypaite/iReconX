import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bot,
  Database,
  FileSpreadsheet,
  Layers3,
  Lock,
  Radar,
  ShieldCheck,
  Sparkles,
  Wand2,
  Workflow
} from "lucide-react";

import { getServerSession } from "@/lib/auth/session";
import { loadSiteName } from "@/lib/site-name";

const featureGroups = [
  {
    title: "Desktop analytics workspace",
    description:
      "A floating-window interface for governed exploration, transform design, summaries, pivots, and overlapping analyst workflows.",
    icon: Layers3
  },
  {
    title: "Data import and staging",
    description:
      "CSV and Excel ingestion with a guided import wizard, type conversion, temporary analysis staging, and optional persistent import storage.",
    icon: FileSpreadsheet
  },
  {
    title: "Visual transform pipeline",
    description:
      "Drag plugin blocks into a graph, connect execution paths, inspect node output, and iterate with user-owned AI-assisted result previews.",
    icon: Workflow
  },
  {
    title: "Governance and security",
    description:
      "Role-aware access, OTP-aware sign-in flows, encrypted connection settings, audited activity, and server-side session enforcement.",
    icon: ShieldCheck
  }
] as const;

const stackGroups = [
  {
    area: "Application framework",
    items: ["Next.js 14 App Router", "React 18", "TypeScript"]
  },
  {
    area: "UI and interaction",
    items: ["Tailwind CSS", "lucide-react", "react-rnd"]
  },
  {
    area: "Data and persistence",
    items: ["Prisma ORM", "PostgreSQL", "XLSX import parsing"]
  },
  {
    area: "Security and validation",
    items: ["jose JWT sessions", "bcryptjs", "Zod"]
  },
  {
    area: "Client state and data flows",
    items: ["Zustand", "@tanstack/react-query", "HTTP-only cookie sessions"]
  }
] as const;

const libraryHighlights = [
  {
    name: "next",
    detail: "Routing, server components, APIs, metadata, and protected app structure."
  },
  {
    name: "react / react-dom",
    detail: "Interactive UI composition across auth, desktop shell, and studio tooling."
  },
  {
    name: "@prisma/client + prisma",
    detail: "Database modeling, multi-schema persistence, and typed data access."
  },
  {
    name: "tailwindcss + autoprefixer + postcss",
    detail: "Utility-first styling and design-system level layout work."
  },
  {
    name: "jose",
    detail: "JWT signing and verification for cookie-backed sessions."
  },
  {
    name: "bcryptjs",
    detail: "Password hashing for local account authentication."
  },
  {
    name: "zod",
    detail: "Validation for auth flows, API inputs, and config payloads."
  },
  {
    name: "xlsx",
    detail: "Spreadsheet inspection, sampling, and import-wizard parsing."
  },
  {
    name: "zustand",
    detail: "Shared desktop and studio workspace state across floating windows."
  },
  {
    name: "@tanstack/react-query",
    detail: "Client-side async state and data synchronization patterns."
  },
  {
    name: "react-rnd",
    detail: "Resizable and draggable desktop-style window interactions."
  },
  {
    name: "lucide-react",
    detail: "Iconography across dashboards, utilities, studios, and controls."
  }
] as const;

const workflowSteps = [
  "Authenticate with role-aware access and optional OTP enforcement.",
  "Import files or load governed sources into the Data Studio workspace.",
  "Run summaries, pivots, and plugin pipelines against staged datasets.",
  "Inspect raw node output, result previews, and AI-assisted visual suggestions.",
  "Manage users, sources, and operational controls from the admin plane."
] as const;

export default async function HomePage() {
  const session = await getServerSession();
  const siteName = await loadSiteName();

  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : "/dashboard");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_45%,_#020617_100%)] text-slate-100">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-sky-300">{siteName}</p>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Secure analytics, governed data operations, transform pipelines, and desktop-style exploration in one workspace.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:border-sky-400/40 hover:text-white"
              href="/signup"
            >
              Create account
            </Link>
            <Link
              className="rounded-full bg-sky-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-300"
              href="/login"
            >
              Sign in
            </Link>
          </div>
        </header>

        <div className="grid flex-1 gap-10 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="space-y-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-200">
                <Sparkles className="h-3.5 w-3.5" />
                Desktop analytics platform with governed AI-assisted workflows
              </div>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Build, inspect, transform, and govern data workflows from a single full-stack analytics studio.
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                {siteName} combines a floating-window analyst workspace, transform pipeline builder, guided file imports,
                result inspection, and an admin control plane on top of a secure Next.js, Prisma, and PostgreSQL stack.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {featureGroups.map((feature) => {
                const Icon = feature.icon;

                return (
                  <article
                    key={feature.title}
                    className="rounded-[24px] border border-white/10 bg-slate-950/50 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.35)] backdrop-blur"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3 text-sky-300">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h2 className="text-lg font-semibold text-white">{feature.title}</h2>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-400">{feature.description}</p>
                  </article>
                );
              })}
            </div>

            <section className="rounded-[28px] border border-white/10 bg-slate-950/45 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-300">
                  <Radar className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">What the platform covers</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    The current project spans public access, protected analyst flows, admin governance, and AI-enabled transform tooling.
                  </p>
                </div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-white/10 bg-slate-950/40 p-5">
                  <h3 className="text-base font-semibold text-white">Analyst capabilities</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-400">
                    <li>Desktop shell with overlapping floating windows</li>
                    <li>Data Studio summaries, pivots, filters, and governed source loading</li>
                    <li>Independent import window with spreadsheet sampling and type conversion</li>
                    <li>Transform Studio plugin chains, per-node execution, raw output inspection</li>
                    <li>AI result viewer driven by each user&apos;s configured provider keys</li>
                  </ul>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-slate-950/40 p-5">
                  <h3 className="text-base font-semibold text-white">Admin and platform controls</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-400">
                    <li>Role-based routing for admin and user experiences</li>
                    <li>User management, account activation, and session invalidation</li>
                    <li>Governed data source registration with encrypted configuration</li>
                    <li>Audit coverage for auth, resource changes, and execution activity</li>
                    <li>Site branding, identity settings, and user-scoped AI configuration</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.4)]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-3 text-violet-300">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Technology stack</h2>
                  <p className="mt-1 text-sm text-slate-400">Core frameworks, storage, security, and interaction layers used by the project.</p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {stackGroups.map((group) => (
                  <div key={group.area} className="rounded-[20px] border border-white/10 bg-slate-950/40 p-4">
                    <p className="text-sm font-semibold text-white">{group.area}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.items.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-300">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Typical workflow</h2>
                  <p className="mt-1 text-sm text-slate-400">How the main pieces fit together inside the application.</p>
                </div>
              </div>
              <ol className="mt-6 space-y-3">
                {workflowSteps.map((step, index) => (
                  <li key={step} className="flex gap-3 rounded-[20px] border border-white/10 bg-slate-950/40 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400/15 text-sm font-semibold text-sky-300">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-6 text-slate-300">{step}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>

        <section className="rounded-[32px] border border-white/10 bg-slate-950/45 p-6 lg:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white">Key libraries in use</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-400">
                The project is built from a focused set of frontend, backend, security, and import-processing libraries.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              <Lock className="h-3.5 w-3.5" />
              Production-oriented stack with secure defaults
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

        <section className="mt-8 rounded-[32px] border border-sky-400/20 bg-gradient-to-r from-sky-400/10 via-cyan-400/10 to-violet-400/10 p-6 lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs text-sky-100">
                <Bot className="h-3.5 w-3.5" />
                Built for governed analytics and extensible workflow automation
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-white sm:text-3xl">
                Explore the platform from the public homepage, then sign in to reach the protected workspace.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                The landing page introduces the product, while authenticated users are still routed directly into their admin or analyst experience.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-sky-400 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-300"
                href="/login"
              >
                Open workspace
              </Link>
              <Link
                className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-slate-100 transition hover:border-white/20 hover:bg-white/[0.04]"
                href="/signup"
              >
                Create account
              </Link>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
