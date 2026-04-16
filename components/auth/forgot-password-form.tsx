"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HoverSubtitleTitle } from "@/components/ui/hover-subtitle-title";
import { Input } from "@/components/ui/input";

type Step = "email" | "otp" | "password" | "done";

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [destinationHint, setDestinationHint] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const titles: Record<Step, string> = {
    email: "Reset your password",
    otp: "Enter verification code",
    password: "Set a new password",
    done: "Password updated"
  };

  async function requestCode() {
    setPending(true);
    setError(null);
    setInfo(null);

    const response = await fetch("/api/auth/reset-password/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const payload = (await response.json().catch(() => null)) as {
      challengeId?: string;
      destinationHint?: string;
      expiresInSeconds?: number;
      error?: string;
    } | null;

    setPending(false);

    if (!response.ok) {
      setError(payload?.error ?? "Unable to send the code right now.");
      return false;
    }

    if (payload?.challengeId) {
      setChallengeId(payload.challengeId);
      setDestinationHint(payload.destinationHint ?? "");
      return true;
    }

    // Generic "user not found" — show info and stay on step
    setInfo(payload?.error ?? "If that email has a registered mobile number, a code will be sent.");
    return false;
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await requestCode();
    if (ok) {
      setOtp("");
      setStep("otp");
    }
  }

  async function handleOtpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/reset-password/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, otp })
    });

    const payload = (await response.json().catch(() => null)) as { resetToken?: string; error?: string } | null;

    setPending(false);

    if (!response.ok) {
      setError(payload?.error ?? "Invalid or expired code.");
      return;
    }

    setResetToken(payload?.resetToken ?? "");
    setPassword("");
    setConfirmPassword("");
    setStep("password");
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/reset-password/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetToken, password })
    });

    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

    setPending(false);

    if (!response.ok) {
      setError(payload?.error ?? "Unable to reset password.");
      return;
    }

    setStep("done");
  }

  return (
    <Card className="w-full max-w-md p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <HoverSubtitleTitle
            subtitle={
              <>
                {step === "email" && "Enter your account email to receive a verification code."}
                {step === "otp" && `We sent a 6-digit code to ${destinationHint || "your registered mobile number"}.`}
                {step === "password" && "Choose a new password for your account."}
                {step === "done" && "Your password has been updated. You can now sign in."}
              </>
            }
            title={titles[step]}
          />
        </div>
        {step === "otp" && <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-200">OTP</Badge>}
      </div>

      {step === "email" && (
        <form className="mt-6 space-y-4" onSubmit={handleEmailSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          {info && <p className="text-sm text-sky-300">{info}</p>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <Button className="w-full" disabled={pending} type="submit">
            {pending ? "Sending..." : "Send code"}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form className="mt-6 space-y-4" onSubmit={handleOtpSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="otp">
              Verification code
            </label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              required
            />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex gap-3">
            <Button className="flex-1" disabled={pending} type="submit">
              {pending ? "Verifying..." : "Verify code"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
              }}
            >
              Back
            </Button>
          </div>
          <Button
            className="w-full"
            disabled={pending}
            type="button"
            variant="ghost"
            onClick={() => void requestCode()}
          >
            Send new code
          </Button>
        </form>
      )}

      {step === "password" && (
        <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="new-password">
              New password
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-200" htmlFor="confirm-password">
              Confirm password
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <Button className="w-full" disabled={pending} type="submit">
            {pending ? "Updating..." : "Set new password"}
          </Button>
        </form>
      )}

      {step === "done" && (
        <div className="mt-6 space-y-4">
          <Link
            href="/login"
            className="block w-full rounded-md bg-sky-600 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </Card>
  );
}
