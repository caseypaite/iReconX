"use client";

import { Role } from "@prisma/client";
import { Eye, EyeOff, PlusCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { HoverHelperLabel } from "@/components/ui/hover-helper-label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  mobileNumber: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
};

type ApiManagedUser = Omit<ManagedUser, "createdAt"> & {
  createdAt: string | Date;
};

type UserFormState = {
  email: string;
  name: string;
  mobileNumber: string;
  role: Role;
  isActive: boolean;
  password: string;
};

const emptyForm: UserFormState = {
  email: "",
  name: "",
  mobileNumber: "",
  role: Role.USER,
  isActive: true,
  password: ""
};

function buildForm(user: ManagedUser): UserFormState {
  return {
    email: user.email,
    name: user.name ?? "",
    mobileNumber: user.mobileNumber ?? "",
    role: user.role,
    isActive: user.isActive,
    password: ""
  };
}

function normalizeUser(user: ApiManagedUser): ManagedUser {
  return {
    ...user,
    createdAt: user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt)
  };
}

export function UserManager({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers.map(normalizeUser));
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  function resetForNewUser() {
    setSelectedUserId(null);
    setForm(emptyForm);
    setShowPassword(false);
    setMessage(null);
    setError(null);
  }

  function selectUser(user: ManagedUser) {
    setSelectedUserId(user.id);
    setForm(buildForm(user));
    setShowPassword(false);
    setMessage(null);
    setError(null);
  }

  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const payload = {
      email: form.email,
      name: form.name || undefined,
      mobileNumber: form.mobileNumber || null,
      role: form.role,
      isActive: form.isActive,
      ...(form.password ? { password: form.password } : {})
    };

    try {
      const response = await fetch(
        selectedUserId ? `/api/admin/users/${selectedUserId}` : "/api/admin/users",
        {
          method: selectedUserId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(selectedUserId ? payload : { ...payload, password: form.password })
        }
      );

      const result = (await response.json().catch(() => null)) as
        | {
            error?: string;
            user?: ApiManagedUser;
          }
        | null;

      if (!response.ok || !result?.user) {
        setError(result?.error ?? "Unable to save user.");
        setSaving(false);
        return;
      }

      const normalizedUser = normalizeUser(result.user);

      if (selectedUserId) {
        setUsers((current) => current.map((user) => (user.id === normalizedUser.id ? { ...user, ...normalizedUser } : user)));
        setSelectedUserId(normalizedUser.id);
        setForm(buildForm({ ...selectedUser, ...normalizedUser } as ManagedUser));
        setMessage("User updated.");
      } else {
        setUsers((current) => [normalizedUser, ...current]);
        setSelectedUserId(normalizedUser.id);
        setForm(buildForm(normalizedUser));
        setMessage("User created.");
      }

      setShowPassword(false);
      setSaving(false);
    } catch {
      setError("Unable to save user.");
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[18px] border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Managed users</p>
          <p className="mt-1 text-sm text-slate-400">
            Create accounts with only the basic onboarding fields. Users complete their biodata themselves after initial login.
          </p>
        </div>
        <Button onClick={resetForNewUser} type="button" variant="outline">
          <PlusCircle className="mr-2 h-4 w-4" />
          New user
        </Button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2">
          {users.map((user) => (
            <button
              key={user.id}
              className={cn(
                "w-full rounded-[18px] border px-4 py-3 text-left transition",
                selectedUserId === user.id
                  ? "border-sky-400/50 bg-sky-400/10 text-white"
                  : "border-white/10 bg-slate-950/20 text-slate-200 hover:bg-white/10"
              )}
              onClick={() => selectUser(user)}
              type="button"
            >
              <HoverHelperLabel
                helper={user.email}
                label={user.name || user.email}
                labelClassName="font-medium"
                wrapperClassName="max-w-full"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{user.role}</span>
                <span>{user.isActive ? "Active" : "Inactive"}</span>
              </div>
            </button>
          ))}
        </div>

        <form className="space-y-4" onSubmit={saveUser}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="user-name">
                Full name
              </label>
              <Input
                id="user-name"
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Jane Analyst"
                value={form.name}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="user-email">
                Email
              </label>
              <Input
                id="user-email"
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="jane@example.com"
                type="email"
                value={form.email}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="user-mobile">
                Mobile number
              </label>
              <Input
                id="user-mobile"
                onChange={(event) => setForm((current) => ({ ...current, mobileNumber: event.target.value }))}
                placeholder="9876543210"
                value={form.mobileNumber}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="user-role">
                Role
              </label>
              <select
                className="w-full rounded-[18px] border border-white/10 bg-slate-950/40 px-3.5 py-2.5 text-sm text-slate-100 outline-none backdrop-blur-xl focus:border-sky-400"
                id="user-role"
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as Role }))}
                value={form.role}
              >
                <option value={Role.USER}>User</option>
                <option value={Role.ADMIN}>Admin</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-200" htmlFor="user-password">
                {selectedUser ? "Reset password (optional)" : "Initial password"}
              </label>
              <div className="flex gap-3">
                <Input
                  id="user-password"
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={selectedUser ? "Leave blank to keep current password" : "At least 8 characters"}
                  required={!selectedUser}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                />
                <Button onClick={() => setShowPassword((current) => !current)} type="button" variant="outline">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input
              checked={form.isActive}
              className="h-4 w-4 rounded border-white/20 bg-slate-950/50"
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              type="checkbox"
            />
            Active account
          </label>

          <div className="rounded-[18px] border border-white/10 bg-slate-950/20 p-4 text-sm text-slate-400">
            Admins only set the account basics here. The user completes profile headline, experience, education, skills, and other biodata after signing in.
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={saving} type="submit">
              {saving ? "Saving..." : selectedUser ? "Update user" : "Create user"}
            </Button>
            <Button disabled={saving} onClick={resetForNewUser} type="button" variant="outline">
              Clear form
            </Button>
            {selectedUser ? <p className="text-sm text-slate-400">Editing {selectedUser.email}.</p> : null}
            {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
