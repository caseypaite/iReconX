"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { Input } from "@/components/ui/input";

export function LoginForm({ siteName }: { siteName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [destinationHint, setDestinationHint] = useState<string | null>(null);

  async function submitCredentials() {
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Unable to sign in.");
      setPending(false);
      return;
    }

    const payload = (await response.json()) as
      | { redirectTo: string }
      | { requiresOtp: true; challengeId: string; destinationHint: string };

    if ("requiresOtp" in payload) {
      setChallengeId(payload.challengeId);
      setDestinationHint(payload.destinationHint);
      setOtp("");
      setStep("otp");
      setPending(false);
      return;
    }

    router.push(payload.redirectTo as Route);
    router.refresh();
  }

  async function handleCredentialsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitCredentials();
  }

  async function handleOtpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!challengeId) {
      setError("Your verification session expired. Sign in again.");
      setStep("credentials");
      return;
    }

    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/login/verify-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ challengeId, otp })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Unable to verify the code.");
      setPending(false);
      return;
    }

    const payload = (await response.json()) as { redirectTo: string };
    router.push(payload.redirectTo as Route);
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <HoverSubtitleTitle
            subtitle={
              step === "credentials"
                ? "Use an Admin or Analyst account to access the correct dashboard."
                : `We sent a 6-digit code to ${destinationHint ?? "your registered mobile number"}.`
            }
            title={step === "credentials" ? `Sign in to ${siteName}` : "Enter verification code"}
          />
        </div>
        {step === "otp" ? <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-200">2FA</Badge> : null}
      </div>
      <form className="mt-6 space-y-4" onSubmit={step === "credentials" ? handleCredentialsSubmit : handleOtpSubmit}>
        {step === "credentials" ? (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="otp">
                Verification code
              </label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                required
              />
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" disabled={pending} type="submit">
                {pending ? "Verifying..." : "Verify code"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setStep("credentials");
                  setChallengeId(null);
                  setDestinationHint(null);
                  setOtp("");
                  setError(null);
                }}
              >
                Back
              </Button>
            </div>
            <Button className="w-full" disabled={pending} type="button" variant="ghost" onClick={() => void submitCredentials()}>
              Send a new code
            </Button>
          </>
        )}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {step === "credentials" ? (
          <>
            <Button className="w-full" disabled={pending} type="submit">
              {pending ? "Signing in..." : "Sign in"}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <Link href="/forgot-password" className="text-slate-400 hover:text-sky-300 transition-colors">
                Forgot password?
              </Link>
              <Link href="/signup" className="text-slate-400 hover:text-sky-300 transition-colors">
                Create account
              </Link>
            </div>
          </>
        ) : null}
      </form>
    </Card>
  );
}
