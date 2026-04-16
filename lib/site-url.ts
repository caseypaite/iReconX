export function getSiteUrl(siteUrl = process.env.SITE_URL) {
  if (!siteUrl || siteUrl.trim().length === 0) {
    return null;
  }

  try {
    return new URL(siteUrl);
  } catch {
    throw new Error("SITE_URL must be a valid absolute URL.");
  }
}
