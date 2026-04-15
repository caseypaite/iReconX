export type AppRole = "ADMIN" | "USER";

export type SessionToken = {
  sub: string;
  email: string;
  role: AppRole;
  sessionVersion: number;
  name?: string | null;
};

export type AuthenticatedUser = SessionToken & {
  isActive: boolean;
};

