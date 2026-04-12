import { v } from "convex/values";
import { action } from "./_generated/server";

// Simple HS256 JWT implementation using Web Crypto API
async function signJWT(payload: any, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(data)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${data}.${encodedSignature}`;
}

export const generateUserToken = action({
  args: {
    userId: v.id("users"),
    email: v.string(),
    role: v.string(),
    permissions: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    // @ts-ignore
    const secret = process.env.JWT_SECRET || "default_secret_change_me_in_prod";
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      userId: args.userId,
      email: args.email,
      role: args.role,
      permissions: args.permissions,
      iat: now,
      exp: now + (24 * 60 * 60), // 24 hours
    };

    return await signJWT(payload, secret);
  },
});
