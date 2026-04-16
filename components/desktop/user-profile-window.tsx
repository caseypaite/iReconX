import { AccountSettingsPanel } from "@/components/account/account-settings-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import type { AppRole } from "@/types/auth";

type UserProfileWindowProps = {
  role: AppRole;
  userName?: string | null;
};

export function UserProfileWindow({ role, userName }: UserProfileWindowProps) {
  return (
    <div className="space-y-[5px] p-[3px]">
      <Card className="flex items-center justify-between gap-4 rounded-[12px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">My Profile</p>
          <HoverHelperLabel
            as="h3"
            helper="CV biodata and password settings for your account."
            label={userName ?? role}
            labelClassName="mt-2 text-2xl font-semibold text-white"
            tooltipClassName="text-sm"
          />
        </div>
        <Badge className="rounded-[12px] border-white/15 bg-white/10 text-slate-100">
          {role === "ADMIN" ? "Admin" : "User"}
        </Badge>
      </Card>

      <AccountSettingsPanel role={role} />
    </div>
  );
}
