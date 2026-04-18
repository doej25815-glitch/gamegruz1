const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * Placeholder Farcaster config for a new app.
 * Replace all values before production deployment.
 */
export const farcasterConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: "",
  },
  miniapp: {
    version: "1",
    name: "New Base App",
    subtitle: "App subtitle",
    description: "Describe your app.",
    imageUrl: `${ROOT_URL}/hero.png`,
    buttonTitle: "Open App",
    screenshotUrls: [`${ROOT_URL}/screenshot.png`],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#111111",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "utility",
    tags: ["base", "miniapp"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Build on Base.",
    ogTitle: "New Base App",
    ogDescription: "New mini app scaffold.",
    ogImageUrl: `${ROOT_URL}/hero.png`,
    castShareUrl: ROOT_URL,
  },
} as const;
