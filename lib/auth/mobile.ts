const PHONE_DIGITS_PATTERN = /^\d{10,15}$/;

export function normalizeMobileNumber(value?: string | null) {
  if (!value) {
    return null;
  }

  const digitsOnly = value.replace(/\D/g, "");
  const normalized = digitsOnly.length === 10 ? `91${digitsOnly}` : digitsOnly;

  if (!PHONE_DIGITS_PATTERN.test(normalized)) {
    throw new Error(
      "Mobile number must contain 10 to 15 digits. Ten-digit numbers are treated as Indian mobile numbers and prefixed with 91."
    );
  }

  return normalized;
}

export function maskMobileNumber(value: string) {
  if (value.length <= 4) {
    return value;
  }

  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}
