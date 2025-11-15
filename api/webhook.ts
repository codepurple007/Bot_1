import { createBot } from "../src/bot.js";

// Vercel serverless handler for Telegram webhook
export default async function handler(req: any, res: any) {
  console.log("[Webhook] Request received:", {
    method: req.method,
    hasBody: !!req.body,
    bodyType: typeof req.body,
    envVars: {
      hasToken: !!process.env.BOT_TOKEN,
      hasAdminIds: !!process.env.ADMIN_IDS,
      adminIdsValue: process.env.ADMIN_IDS,
      hasKvUrl: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
      hasKvToken: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
    }
  });

  if (req.method !== "POST") {
    // Allow GET for testing/debugging
    if (req.method === "GET") {
      res.status(200).json({ 
        message: "Webhook endpoint is active. Telegram sends POST requests here.",
        method: req.method,
        expectedMethod: "POST"
      });
      return;
    }
    res.status(405).send("Method Not Allowed");
    return;
  }

  const token = process.env.BOT_TOKEN;
  const adminIds = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s));
  const groupId = process.env.TARGET_GROUP_ID ? Number(process.env.TARGET_GROUP_ID) : undefined;
  const channelId = process.env.TARGET_CHANNEL_ID ? Number(process.env.TARGET_CHANNEL_ID) : undefined;
  const botUsername = process.env.BOT_USERNAME || undefined;
  const channelUsername = process.env.CHANNEL_USERNAME || undefined;

  console.log("[Webhook] Environment check:", {
    hasToken: !!token,
    adminIdsCount: adminIds.length,
    adminIds: adminIds,
    hasInvalidAdminIds: adminIds.some((n) => Number.isNaN(n)),
    kvConfig: {
      hasKvUrl: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
      hasKvToken: !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
      kvUrlSource: process.env.KV_REST_API_URL ? "KV_REST_API_URL" : process.env.UPSTASH_REDIS_REST_URL ? "UPSTASH_REDIS_REST_URL" : "none"
    }
  });

  if (!token || adminIds.length === 0 || adminIds.some((n) => Number.isNaN(n))) {
    console.error("[Webhook] Missing env vars:", {
      token: !!token,
      adminIdsLength: adminIds.length,
      adminIdsHasNaN: adminIds.some((n) => Number.isNaN(n))
    });
    res.status(500).send("Missing BOT_TOKEN or ADMIN_IDS env vars");
    return;
  }

  try {
    console.log("[Webhook] ====== STARTING WEBHOOK HANDLER ======");
    console.log("[Webhook] Creating bot instance...");
    console.log("[Webhook] Request body:", JSON.stringify(req.body, null, 2));
    
    const bot = await createBot({ BOT_TOKEN: token, ADMIN_IDS: adminIds, TARGET_GROUP_ID: groupId, TARGET_CHANNEL_ID: channelId, BOT_USERNAME: botUsername, CHANNEL_USERNAME: channelUsername });
    console.log("[Webhook] Bot instance created");
    
    // Initialize bot before handling updates
    console.log("[Webhook] Initializing bot...");
    await bot.init();
    console.log("[Webhook] Bot initialized successfully");
    
    console.log("[Webhook] Handling update...");
    console.log("[Webhook] Update type:", req.body?.message ? "message" : req.body?.callback_query ? "callback_query" : "unknown");
    
    // Process update and respond
    await bot.handleUpdate(req.body);
    console.log("[Webhook] ✅ Update handled successfully");
    console.log("[Webhook] ====== WEBHOOK HANDLER COMPLETE ======");
    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[Webhook] ❌ Error handling update:", err);
    console.error("[Webhook] ❌ Error message:", err?.message);
    console.error("[Webhook] ❌ Error stack:", err?.stack);
    console.error("[Webhook] ❌ Full error:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
    res.status(200).json({ ok: true }); // Always 200 to satisfy Telegram retries
  }
}


