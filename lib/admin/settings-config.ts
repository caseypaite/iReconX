import { z } from "zod";

export const adminSettingCategories = [
  {
    key: "SECURITY",
    label: "Security",
    description: "Secrets that sign sessions, protect OTP codes, and encrypt governed configuration."
  },
  {
    key: "IDENTITIES",
    label: "Identities",
    description: "Admin seed identity and OTP delivery settings used by sign-in and account recovery flows."
  },
  {
    key: "DATA_SOURCES",
    label: "Data sources",
    description: "Application database connectivity and source-of-record runtime wiring."
  }
] as const;

export type AdminSettingCategory = (typeof adminSettingCategories)[number]["key"];

export const adminSettingDefinitions = [
  {
    key: "JWT_SECRET",
    category: "SECURITY",
    label: "JWT secret",
    description: "Signs session cookies and password reset tokens.",
    helperText: "Required. Restart the app after changing this value to refresh auth consumers like middleware.",
    inputType: "password",
    isSecret: true,
    required: true
  },
  {
    key: "ENCRYPTION_SECRET",
    category: "SECURITY",
    label: "Encryption secret",
    description: "Encrypts governed data source payloads at rest.",
    helperText: "Optional. Leave blank to fall back to JWT_SECRET. Existing data sources are re-encrypted when this changes.",
    inputType: "password",
    isSecret: true,
    required: false
  },
  {
    key: "OTP_SECRET",
    category: "SECURITY",
    label: "OTP signing secret",
    description: "Signs one-time code hashes for login and password reset challenges.",
    helperText: "Optional. Leave blank to fall back to JWT_SECRET.",
    inputType: "password",
    isSecret: true,
    required: false
  },
  {
    key: "SITE_URL",
    category: "IDENTITIES",
    label: "Site URL",
    description: "Canonical public URL used when exposing the app through a domain name.",
    helperText: "Optional. Set this to your deployed HTTPS origin, such as https://app.example.com.",
    inputType: "url",
    isSecret: false,
    required: false
  },
  {
    key: "OTP_MESSAGE_ENDPOINT",
    category: "IDENTITIES",
    label: "OTP message endpoint",
    description: "Provider endpoint that receives outbound verification messages.",
    helperText: "Provide together with OTP_MESSAGE_API_KEY when OTP delivery is enabled.",
    inputType: "url",
    isSecret: false,
    required: false
  },
  {
    key: "OTP_MESSAGE_API_KEY",
    category: "IDENTITIES",
    label: "OTP message API key",
    description: "Credential sent as x-api-key when dispatching OTP messages.",
    helperText: "Keep blank only if OTP delivery is disabled.",
    inputType: "password",
    isSecret: true,
    required: false
  },
  {
    key: "SEED_ADMIN_MOBILE_NUMBER",
    category: "IDENTITIES",
    label: "Seed admin mobile number",
    description: "Optional mobile number attached by the seed script.",
    helperText: "Leave blank to keep the seed admin on password-only login.",
    inputType: "text",
    isSecret: false,
    required: false
  },
  {
    key: "DATABASE_URL",
    category: "DATA_SOURCES",
    label: "Database URL",
    description: "Prisma datasource URL used for the application database.",
    helperText: "Required. Restart the app after changing this value so Prisma reconnects with the new datasource.",
    inputType: "password",
    isSecret: true,
    required: true
  }
] as const;

export type AdminSettingKey = (typeof adminSettingDefinitions)[number]["key"];

export type AdminSettingValueMap = Record<AdminSettingKey, string>;

export type AdminSettingField = (typeof adminSettingDefinitions)[number] & {
  value: string;
  source: "database" | "environment" | "default";
  updatedAt: string | null;
  updatedByEmail: string | null;
};

const mobileNumberPattern = /^\d{10,15}$/;

export const adminSettingsSchema: z.ZodType<AdminSettingValueMap> = z
  .object({
    JWT_SECRET: z.string().min(1, "JWT secret is required."),
    ENCRYPTION_SECRET: z.string(),
    OTP_SECRET: z.string(),
    SITE_URL: z.union([z.literal(""), z.string().url("Site URL must be a valid URL.")]),
    OTP_MESSAGE_ENDPOINT: z.union([z.literal(""), z.string().url("OTP message endpoint must be a valid URL.")]),
    OTP_MESSAGE_API_KEY: z.string(),
    SEED_ADMIN_MOBILE_NUMBER: z.union([
      z.literal(""),
      z.string().regex(mobileNumberPattern, "Seed admin mobile number must be 10 to 15 digits.")
    ]),
    DATABASE_URL: z.string().min(1, "Database URL is required.")
  })
  .superRefine((values, context) => {
    const hasOtpEndpoint = values.OTP_MESSAGE_ENDPOINT.length > 0;
    const hasOtpApiKey = values.OTP_MESSAGE_API_KEY.length > 0;

    if (hasOtpEndpoint !== hasOtpApiKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasOtpEndpoint ? ["OTP_MESSAGE_API_KEY"] : ["OTP_MESSAGE_ENDPOINT"],
        message: "OTP message endpoint and API key must be provided together."
      });
    }
  });

export const adminSettingKeys = adminSettingDefinitions.map((definition) => definition.key) as AdminSettingKey[];
