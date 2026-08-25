// Linear access token provider.
//
// The previous implementation fetched short-lived tokens from Replit's
// connector credential proxy, which only exists on Replit. Off-platform,
// Linear auth uses a personal API key via the LINEAR_API_KEY env var
// (create one at linear.app → Settings → API → Personal API keys).

/**
 * Returns a Linear API token. Throws a clear error if Linear is not
 * configured for this deployment.
 */
export async function getLinearAccessToken(): Promise<string> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Linear is not configured. Set LINEAR_API_KEY to a Linear personal API key.",
    );
  }
  return apiKey;
}

/**
 * Lightweight check: is Linear configured right now?
 */
export async function isLinearConnectorAvailable(): Promise<boolean> {
  return !!process.env.LINEAR_API_KEY;
}
