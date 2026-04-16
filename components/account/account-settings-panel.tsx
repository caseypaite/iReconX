"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { aiProviderCatalog, aiProviderOrder, type AiProviderFormMap } from "@/lib/ai/provider-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { Input } from "@/components/ui/input";
import type { AppRole } from "@/types/auth";

type ProfileState = {
  email: string;
  name: string;
  headline: string;
  location: string;
  summary: string;
  experience: string;
  education: string;
  skills: string;
  websiteUrl: string;
  linkedinUrl: string;
  mobileNumber: string;
  role: AppRole;
};

const emptyProfile: ProfileState = {
  email: "",
  name: "",
  headline: "",
  location: "",
  summary: "",
  experience: "",
  education: "",
  skills: "",
  websiteUrl: "",
  linkedinUrl: "",
  mobileNumber: "",
  role: "USER"
};

const emptyAiSettings: AiProviderFormMap = {
  copilot: {
    endpoint: "",
    model: "",
    apiKey: "",
    source: "default",
    updatedAt: null
  },
  gemini: {
    endpoint: "",
    model: "",
    apiKey: "",
    source: "default",
    updatedAt: null
  },
  mistral: {
    endpoint: "",
    model: "",
    apiKey: "",
    source: "default",
    updatedAt: null
  }
};

const profileFieldClassName = "rounded-[12px]";
const profileTextAreaClassName =
  "min-h-[96px] w-full resize-y rounded-[12px] border border-white/10 bg-slate-950/40 px-3.5 py-3 text-sm text-slate-100 outline-none backdrop-blur-xl placeholder:text-slate-500 focus:border-sky-400";

const profileTextareas: Array<{
  key: "summary" | "experience" | "education" | "skills";
  label: string;
  placeholder: string;
}> = [
  { key: "summary", label: "Professional summary", placeholder: "Concise overview of your background and strengths." },
  { key: "experience", label: "Experience highlights", placeholder: "Key achievements, roles, and project experience." },
  { key: "education", label: "Education", placeholder: "Degrees, certifications, and training." },
  { key: "skills", label: "Core skills", placeholder: "Tools, languages, and domain strengths." }
];

function normalizeProfileInput(profile: Partial<Record<keyof ProfileState, string | AppRole | null>>) {
  return {
    email: profile.email ?? "",
    name: profile.name ?? "",
    headline: profile.headline ?? "",
    location: profile.location ?? "",
    summary: profile.summary ?? "",
    experience: profile.experience ?? "",
    education: profile.education ?? "",
    skills: profile.skills ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    mobileNumber: profile.mobileNumber ?? "",
    role: (profile.role as AppRole | undefined) ?? "USER"
  };
}

export function AccountSettingsPanel({ role }: { role: AppRole }) {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileState>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiProviderFormMap>(emptyAiSettings);
  const [loadingAiSettings, setLoadingAiSettings] = useState(true);
  const [savingAiSettings, setSavingAiSettings] = useState(false);
  const [aiSettingsMessage, setAiSettingsMessage] = useState<string | null>(null);
  const [aiSettingsError, setAiSettingsError] = useState<string | null>(null);
  const [revealedAiKeys, setRevealedAiKeys] = useState<Partial<Record<keyof AiProviderFormMap, boolean>>>({});
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    nextPassword: "",
    confirmPassword: ""
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setProfileError(null);
      try {
        const response = await fetch("/api/account/profile", {
          cache: "no-store"
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              profile?: Partial<Record<keyof ProfileState, string | AppRole | null>>;
            }
          | null;

        if (!response.ok || !payload?.profile) {
          if (!cancelled) {
            setProfileError(payload?.error ?? "Unable to load account profile.");
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setProfile(normalizeProfileInput(payload.profile));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setProfileError("Unable to load account profile.");
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAiSettings() {
      setLoadingAiSettings(true);
      setAiSettingsError(null);

      try {
        const response = await fetch("/api/account/ai-settings", {
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              providers?: AiProviderFormMap;
            }
          | null;

        if (!response.ok || !payload?.providers) {
          if (!cancelled) {
            setAiSettingsError(payload?.error ?? "Unable to load AI settings.");
            setLoadingAiSettings(false);
          }
          return;
        }

        if (!cancelled) {
          setAiSettings(payload.providers);
          setLoadingAiSettings(false);
        }
      } catch {
        if (!cancelled) {
          setAiSettingsError("Unable to load AI settings.");
          setLoadingAiSettings(false);
        }
      }
    }

    void loadAiSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileMessage(null);
    setProfileError(null);

    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: profile.name,
          headline: profile.headline,
          location: profile.location,
          summary: profile.summary,
          experience: profile.experience,
          education: profile.education,
          skills: profile.skills,
          websiteUrl: profile.websiteUrl,
          linkedinUrl: profile.linkedinUrl,
          mobileNumber: profile.mobileNumber
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            profile?: Partial<Record<keyof ProfileState, string | AppRole | null>>;
          }
        | null;

      if (!response.ok || !payload?.profile) {
        setProfileError(payload?.error ?? "Unable to save account profile.");
        setSavingProfile(false);
        return;
      }

      setProfile(normalizeProfileInput(payload.profile));
      setProfileMessage("Biodata saved.");
      setSavingProfile(false);
      router.refresh();
    } catch {
      setProfileError("Unable to save account profile.");
      setSavingProfile(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setPasswordMessage(null);
    setPasswordError(null);

    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(passwordForm)
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; redirectTo?: string } | null;

      if (!response.ok) {
        setPasswordError(payload?.error ?? "Unable to change password.");
        setSavingPassword(false);
        return;
      }

      setPasswordMessage("Password changed. Sign in again to continue.");
      setSavingPassword(false);
      setPasswordForm({
        currentPassword: "",
        nextPassword: "",
        confirmPassword: ""
      });

      router.push((payload?.redirectTo ?? "/login") as Route);
      router.refresh();
    } catch {
      setPasswordError("Unable to change password.");
      setSavingPassword(false);
    }
  }

  async function saveAiSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAiSettings(true);
    setAiSettingsMessage(null);
    setAiSettingsError(null);

    try {
      const response = await fetch("/api/account/ai-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          providers: aiSettings
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            providers?: AiProviderFormMap;
          }
        | null;

      if (!response.ok || !payload?.providers) {
        setAiSettingsError(payload?.error ?? "Unable to save AI settings.");
        setSavingAiSettings(false);
        return;
      }

      setAiSettings(payload.providers);
      setAiSettingsMessage("AI provider settings saved for this account.");
      setSavingAiSettings(false);
    } catch {
      setAiSettingsError("Unable to save AI settings.");
      setSavingAiSettings(false);
    }
  }

  function formatAiSettingsSource(provider: keyof AiProviderFormMap) {
    const current = aiSettings[provider];

    if (current.source === "account") {
      return current.updatedAt ? `Saved ${new Date(current.updatedAt).toLocaleString()}` : "Saved to your account";
    }

    if (current.source === "legacy-admin") {
      return "Inherited from your previous admin Copilot settings";
    }

    return "Using built-in defaults until you save your own values";
  }

  return (
    <div className="space-y-[5px]">
      <div className="grid gap-[5px] lg:grid-cols-[1.2fr_0.8fr]">
      <Card className="rounded-[12px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <HoverSubtitleTitle
              subtitle="Keep a standard professional profile ready for account-facing experiences."
              title="CV biodata"
            />
          </div>
          <Badge className="rounded-[12px] border-white/15 bg-white/10 text-slate-100">
            {role === "ADMIN" ? "Admin profile" : "User profile"}
          </Badge>
        </div>
        <form className="mt-5 space-y-4" onSubmit={saveProfile}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-name">
                Full name
              </label>
              <Input
                className={profileFieldClassName}
                id="profile-name"
                onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))}
                placeholder="Jane Analyst"
                value={profile.name}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-headline">
                Professional headline
              </label>
              <Input
                className={profileFieldClassName}
                id="profile-headline"
                onChange={(event) => setProfile((current) => ({ ...current, headline: event.target.value }))}
                placeholder="Data analyst | BI | SQL"
                value={profile.headline}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-email">
                Email
              </label>
              <Input className={profileFieldClassName} disabled id="profile-email" value={profile.email} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-mobile">
                Mobile number
              </label>
              <Input
                className={profileFieldClassName}
                id="profile-mobile"
                onChange={(event) => setProfile((current) => ({ ...current, mobileNumber: event.target.value }))}
                placeholder="9876543210"
                value={profile.mobileNumber}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-location">
                Location
              </label>
              <Input
                className={profileFieldClassName}
                id="profile-location"
                onChange={(event) => setProfile((current) => ({ ...current, location: event.target.value }))}
                placeholder="Bengaluru, India"
                value={profile.location}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-website">
                Website
              </label>
              <Input
                className={profileFieldClassName}
                id="profile-website"
                onChange={(event) => setProfile((current) => ({ ...current, websiteUrl: event.target.value }))}
                placeholder="https://portfolio.example"
                value={profile.websiteUrl}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-linkedin">
                LinkedIn
              </label>
              <Input
                className={profileFieldClassName}
                id="profile-linkedin"
                onChange={(event) => setProfile((current) => ({ ...current, linkedinUrl: event.target.value }))}
                placeholder="https://linkedin.com/in/your-handle"
                value={profile.linkedinUrl}
              />
            </div>
          </div>
          <div className="grid gap-4">
            {profileTextareas.map((field) => (
              <div key={field.key} className="space-y-2">
                <label className="text-sm font-medium text-slate-200" htmlFor={`profile-${field.key}`}>
                  {field.label}
                </label>
                <textarea
                  className={profileTextAreaClassName}
                  disabled={loading}
                  id={`profile-${field.key}`}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      [field.key]: event.target.value
                    }))
                  }
                  placeholder={field.placeholder}
                  value={profile[field.key]}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-[12px]" disabled={loading || savingProfile} type="submit">
              {savingProfile ? "Saving..." : "Save biodata"}
            </Button>
            {loading ? <p className="text-sm text-slate-400">Loading profile...</p> : null}
            {profileMessage ? <p className="text-sm text-emerald-300">{profileMessage}</p> : null}
            {profileError ? <p className="text-sm text-rose-300">{profileError}</p> : null}
          </div>
        </form>
      </Card>

      <Card className="rounded-[12px]">
        <HoverSubtitleTitle
          subtitle="Rotate your password with current-password verification."
          title="Password"
        />
        <form className="mt-5 space-y-4" onSubmit={changePassword}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="current-password">
              Current password
            </label>
            <Input
              autoComplete="current-password"
              className={profileFieldClassName}
              id="current-password"
              onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
              type="password"
              value={passwordForm.currentPassword}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="next-password">
              New password
            </label>
            <Input
              autoComplete="new-password"
              className={profileFieldClassName}
              id="next-password"
              onChange={(event) => setPasswordForm((current) => ({ ...current, nextPassword: event.target.value }))}
              type="password"
              value={passwordForm.nextPassword}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="confirm-password">
              Confirm new password
            </label>
            <Input
              autoComplete="new-password"
              className={profileFieldClassName}
              id="confirm-password"
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              type="password"
              value={passwordForm.confirmPassword}
            />
          </div>
          <div className="rounded-[12px] border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Changing your password invalidates the current session and sends you back to sign in with the new secret.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-[12px]" disabled={savingPassword} type="submit">
              {savingPassword ? "Updating..." : "Change password"}
            </Button>
            {passwordMessage ? <p className="text-sm text-emerald-300">{passwordMessage}</p> : null}
            {passwordError ? <p className="text-sm text-rose-300">{passwordError}</p> : null}
          </div>
        </form>
      </Card>
      </div>

      <Card className="rounded-[12px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <HoverSubtitleTitle
              subtitle="AI endpoints, models, and API keys are personal to this account and are only used when you generate plugins."
              title="AI provider configuration"
            />
          </div>
          <Badge className="rounded-[12px] border-white/15 bg-white/10 text-slate-100">Personal keys only</Badge>
        </div>
        <form className="mt-5 space-y-4" onSubmit={saveAiSettings}>
          <div className="grid gap-4 xl:grid-cols-3">
            {aiProviderOrder.map((provider) => {
              const details = aiProviderCatalog[provider];
              const isVisible = Boolean(revealedAiKeys[provider]);

              return (
                <div key={provider} className="rounded-[12px] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{details.label}</p>
                      <p className="mt-1 text-sm text-slate-400">{details.description}</p>
                    </div>
                    <Badge className="rounded-[12px] border-white/15 bg-white/10 text-slate-200">
                      {provider.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{formatAiSettingsSource(provider)}</p>
                  <div className="mt-4 space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-200" htmlFor={`${provider}-endpoint`}>
                        Endpoint
                      </label>
                      <Input
                        className={profileFieldClassName}
                        id={`${provider}-endpoint`}
                        onChange={(event) =>
                          setAiSettings((current) => ({
                            ...current,
                            [provider]: {
                              ...current[provider],
                              endpoint: event.target.value
                            }
                          }))
                        }
                        placeholder={details.endpointPlaceholder}
                        value={aiSettings[provider].endpoint}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-200" htmlFor={`${provider}-model`}>
                        Model
                      </label>
                      <Input
                        className={profileFieldClassName}
                        id={`${provider}-model`}
                        onChange={(event) =>
                          setAiSettings((current) => ({
                            ...current,
                            [provider]: {
                              ...current[provider],
                              model: event.target.value
                            }
                          }))
                        }
                        placeholder={details.modelPlaceholder}
                        value={aiSettings[provider].model}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-200" htmlFor={`${provider}-api-key`}>
                        API key
                      </label>
                      <div className="flex gap-2">
                        <Input
                          className={profileFieldClassName}
                          id={`${provider}-api-key`}
                          onChange={(event) =>
                            setAiSettings((current) => ({
                              ...current,
                              [provider]: {
                                ...current[provider],
                                apiKey: event.target.value
                              }
                            }))
                          }
                          placeholder="Enter your personal provider key"
                          type={isVisible ? "text" : "password"}
                          value={aiSettings[provider].apiKey}
                        />
                        <Button
                          className="rounded-[12px]"
                          onClick={() =>
                            setRevealedAiKeys((current) => ({
                              ...current,
                              [provider]: !current[provider]
                            }))
                          }
                          type="button"
                          variant="outline"
                        >
                          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Leave endpoint or model blank to use the provider defaults shown in the placeholders.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-[12px]" disabled={loadingAiSettings || savingAiSettings} type="submit">
              {savingAiSettings ? "Saving..." : "Save AI settings"}
            </Button>
            {loadingAiSettings ? <p className="text-sm text-slate-400">Loading AI settings...</p> : null}
            {aiSettingsMessage ? <p className="text-sm text-emerald-300">{aiSettingsMessage}</p> : null}
            {aiSettingsError ? <p className="text-sm text-rose-300">{aiSettingsError}</p> : null}
          </div>
        </form>
      </Card>
    </div>
  );
}
