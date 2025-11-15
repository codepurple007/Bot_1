// Simple root endpoint to avoid 404
import { kv } from "@vercel/kv";

export default async function handler(req: any, res: any) {
  console.log("[Index] Root endpoint accessed");
  
  // Test KV connectivity
  let kvStatus = "unknown";
  let kvError = null;
  try {
    await kv.get("__test__");
    kvStatus = "connected";
    console.log("[Index] ✅ KV test: connected");
  } catch (err: any) {
    kvStatus = "error";
    kvError = err?.message || String(err);
    console.error("[Index] ❌ KV test failed:", kvError);
  }

  res.status(200).json({
    message: "Telegram Bot API",
    endpoints: {
      webhook: "/api/webhook",
      setWebhook: "/api/set-webhook"
    },
    status: "online",
    kv: {
      status: kvStatus,
      error: kvError,
      hasKvUrl: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
      hasKvToken: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    },
    env: {
      hasToken: !!process.env.BOT_TOKEN,
      hasAdminIds: !!process.env.ADMIN_IDS,
      hasPublicUrl: !!process.env.PUBLIC_URL
    }
  });
}

