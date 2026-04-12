// Shared memory for OTPs. 
// Note: In serverless production environments, this should be replaced with Redis or a database.
const globalForOtps = global as unknown as { otps: Map<string, { otp: string, expiry: number }> };

export const otps = globalForOtps.otps || new Map<string, { otp: string, expiry: number }>();

if (process.env.NODE_ENV !== "production") globalForOtps.otps = otps;
