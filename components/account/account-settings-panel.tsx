"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>CV biodata</CardTitle>
            <CardDescription>Keep a standard professional profile ready for account-facing experiences.</CardDescription>
          </div>
          <Badge className="border-white/15 bg-white/10 text-slate-100">{role === "ADMIN" ? "Admin profile" : "User profile"}</Badge>
        </div>
        <form className="mt-5 space-y-4" onSubmit={saveProfile}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-name">
                Full name
              </label>
              <Input
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
              <Input disabled id="profile-email" value={profile.email} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="profile-mobile">
                Mobile number
              </label>
              <Input
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
                  className="min-h-[96px] w-full resize-y rounded-[18px] border border-white/10 bg-slate-950/40 px-3.5 py-3 text-sm text-slate-100 outline-none backdrop-blur-xl placeholder:text-slate-500 focus:border-sky-400"
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
            <Button disabled={loading || savingProfile} type="submit">
              {savingProfile ? "Saving..." : "Save biodata"}
            </Button>
            {loading ? <p className="text-sm text-slate-400">Loading profile...</p> : null}
            {profileMessage ? <p className="text-sm text-emerald-300">{profileMessage}</p> : null}
            {profileError ? <p className="text-sm text-rose-300">{profileError}</p> : null}
          </div>
        </form>
      </Card>

      <Card>
        <CardTitle>Password</CardTitle>
        <CardDescription>Rotate your password with current-password verification.</CardDescription>
        <form className="mt-5 space-y-4" onSubmit={changePassword}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="current-password">
              Current password
            </label>
            <Input
              autoComplete="current-password"
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
              id="confirm-password"
              onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              type="password"
              value={passwordForm.confirmPassword}
            />
          </div>
          <div className="rounded-[18px] border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Changing your password invalidates the current session and sends you back to sign in with the new secret.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={savingPassword} type="submit">
              {savingPassword ? "Updating..." : "Change password"}
            </Button>
            {passwordMessage ? <p className="text-sm text-emerald-300">{passwordMessage}</p> : null}
            {passwordError ? <p className="text-sm text-rose-300">{passwordError}</p> : null}
          </div>
        </form>
      </Card>
    </div>
  );
}
