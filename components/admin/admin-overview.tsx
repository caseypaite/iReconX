import { AdminSettingsConsole } from "@/components/admin/admin-settings-console";
import type { ManagedUser } from "@/components/admin/user-manager";
import type { AdminSettingField } from "@/lib/admin/settings-config";

type AdminOverviewProps = {
  users: ManagedUser[];
  settings: AdminSettingField[];
};

export function AdminOverview({ users, settings }: AdminOverviewProps) {
  return <AdminSettingsConsole initialFields={settings} users={users} />;
}
