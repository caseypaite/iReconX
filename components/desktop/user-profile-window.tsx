import { AccountSettingsPanel } from "@/components/account/account-settings-panel";
import { Badge } from "@/components/ui/badge";
import type { AppRole } from "@/types/auth";

type UserProfileWindowProps = {
  role: AppRole;
  userName?: string | null;
};

export function UserProfileWindow({ role, userName }: UserProfileWindowProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">My Profile</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{userName ?? role}</h3>
          <p className="mt-1 text-sm text-slate-300">CV biodata and password settings for your account.</p>
        </div>
        <Badge className="border-white/15 bg-white/10 text-slate-100">{role === "ADMIN" ? "Admin" : "User"}</Badge>
      </div>

      <AccountSettingsPanel role={role} />
    </div>
  );
}
