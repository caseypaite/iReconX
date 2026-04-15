import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-5xl rounded-[18px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 shadow-2xl">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">iReconX</p>
            <h1 className="text-4xl font-semibold text-white">Recover your access</h1>
            <p className="max-w-2xl text-base text-slate-400">
              Reset your password using the mobile number registered to your account.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[18px] border border-slate-800 bg-slate-950/60 p-5">
                <h2 className="font-medium text-white">SMS verification</h2>
                <p className="mt-2 text-sm text-slate-400">
                  A one-time code is sent to your registered mobile number to confirm your identity.
                </p>
              </div>
              <div className="rounded-[18px] border border-slate-800 bg-slate-950/60 p-5">
                <h2 className="font-medium text-white">Secure token</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Your reset link is time-limited and single-use, keeping your account protected.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
