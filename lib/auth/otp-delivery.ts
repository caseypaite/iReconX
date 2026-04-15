type ProviderSuccessResponse = {
  success?: boolean;
  messageId?: string;
};

function getProviderConfig() {
  const endpoint = process.env.OTP_MESSAGE_ENDPOINT;
  const apiKey = process.env.OTP_MESSAGE_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error("OTP_MESSAGE_ENDPOINT and OTP_MESSAGE_API_KEY must be set.");
  }

  return { endpoint, apiKey };
}

function buildOtpMessage(code: string) {
  return `Your iReconX verification code is ${code}. It expires in 5 minutes.`;
}

export async function sendOtpMessage(number: string, code: string) {
  const { endpoint, apiKey } = getProviderConfig();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({
      number,
      message: buildOtpMessage(code)
    }),
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as ProviderSuccessResponse | { error?: string } | null;

  if (!response.ok || (payload && "success" in payload && payload.success === false)) {
    const errorMessage =
      (payload && "error" in payload && typeof payload.error === "string" ? payload.error : null) ??
      "OTP provider request failed.";
    throw new Error(errorMessage);
  }

  return payload;
}
