import { Bot, Database, FileSpreadsheet, Layers3, ShieldCheck, Workflow, type LucideIcon } from "lucide-react";

export type MarketingFeature = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export type MarketingStackGroup = {
  area: string;
  items: string[];
};

export type MarketingLibraryHighlight = {
  name: string;
  detail: string;
};

export const featureGroups: readonly MarketingFeature[] = [
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

export const latestUpdates: readonly MarketingFeature[] = [
  {
    title: "Persistent import workspace",
    description:
      "Typed CSV and Excel uploads can stay in temporary analysis or be copied into a persistent import store, then reloaded straight into Data Studio and Transform Studio.",
    icon: FileSpreadsheet
  },
  {
    title: "Hybrid transform graphs",
    description:
      "Transform Studio now mixes saved JavaScript plugins with server-side tidyverse entry and R workflow nodes, so teams can wire browser-safe and governed SQL execution into one graph.",
    icon: Workflow
  },
  {
    title: "Governed SQL handoff",
    description:
      "Tidyverse entry nodes resolve governed PostgreSQL, MySQL, and persistent imported tables without exposing connection credentials in the browser.",
    icon: Database
  },
  {
    title: "Personal AI provider controls",
    description:
      "Plugin generation and result previews now work with user-scoped GitHub Copilot / Models, Gemini, and Mistral settings so each workspace keeps its own credentials.",
    icon: Bot
  }
] as const;

export const stackGroups: readonly MarketingStackGroup[] = [
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

export const libraryHighlights: readonly MarketingLibraryHighlight[] = [
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

export const workflowSteps = [
  "Authenticate with role-aware access and optional OTP enforcement.",
  "Import files with typed column conversion, then keep them temporary or copy them into the persistent import store.",
  "Load governed sources or persistent imported tables into Data Studio and Transform Studio workspaces.",
  "Run hybrid JavaScript and tidyverse workflow graphs, inspect node output, and publish final datasets back to Data Studio.",
  "Generate plugins and AI-assisted result previews with your own GitHub Copilot / Models, Gemini, or Mistral settings.",
  "Manage users, sources, and operational controls from the admin plane."
] as const;

export const applicationAreas = [
  {
    title: "Public and authentication surfaces",
    items: [
      "Landing page, About page, signup, login, and OTP-aware authentication flows",
      "JWT-backed sessions with server-side role routing for analyst and admin users"
    ]
  },
  {
    title: "Analyst workspace",
    items: [
      "Desktop shell with overlapping windows, Data Studio, Transform Studio, and import tooling",
      "Summaries, pivots, plugin execution, tidyverse workflows, and AI-assisted result previews"
    ]
  },
  {
    title: "Admin governance plane",
    items: [
      "User lifecycle management, account activation, and session invalidation controls",
      "Governed data source registration, encrypted settings, auditing, and site-level identity configuration"
    ]
  }
] as const;
