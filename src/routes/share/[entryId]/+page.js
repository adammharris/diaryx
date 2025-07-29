// For static adapter: prerender a fallback that works for any entry ID
export const prerender = true;

// Enable client-side rendering to handle dynamic content and URL fragments
export const csr = true;

// Disable SSR since we need client-side routing for unknown entry IDs
export const ssr = false;

// Provide a fallback entry for prerendering - this creates a generic page
// that will work for any entry ID through client-side routing
export async function entries() {
  // Return a placeholder entry that will be replaced client-side
  return [
    { entryId: '_fallback' }
  ];
}