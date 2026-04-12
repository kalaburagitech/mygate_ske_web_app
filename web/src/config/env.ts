function missing(name: string): never {
  throw new Error(`Missing required environment variable: ${name}`);
}

// IMPORTANT: Next.js only inlines NEXT_PUBLIC_* when accessed directly.
export const NEXT_PUBLIC_CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? missing("NEXT_PUBLIC_CONVEX_URL");

export const NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? missing("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");

