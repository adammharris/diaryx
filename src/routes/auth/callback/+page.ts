// Make this route prerenderable for SSG
export const prerender = false; // Client-side only since it handles OAuth params
export const ssr = false; // Disable SSR for this route