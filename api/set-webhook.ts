import { createBot } from "../src/bot.js";

// Call this endpoint once after deployment to register Telegram webhook
export default async function handler(req: any, res: any) {
  console.log("[SetWebhook] Request received:", {
    method: req.method,
    url: req.url,
    hasToken: !!process.env.BOT_TOKEN,
    hasAdminIds: !!process.env.ADMIN_IDS,
    hasPublicUrl: !!process.env.PUBLIC_URL
  });

  const token = process.env.BOT_TOKEN;
  const adminIds = (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s));
  
  // Auto-detect production URL from request if PUBLIC_URL is not set or is a git deployment URL
  let publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl || publicUrl.includes('git-') || publicUrl.includes('.git.')) {
    // Extract production URL from request headers
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    // Default to http for localhost, https for production
    const isLocalhost = host && (host.includes('localhost') || host.includes('127.0.0.1'));
    const protocol = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
    if (host && !host.includes('git-') && !host.includes('.git.')) {
      publicUrl = `${protocol}://${host}`;
      console.log("[SetWebhook] Auto-detected production URL from request:", publicUrl);
    }
  }
  
  const groupId = process.env.TARGET_GROUP_ID ? Number(process.env.TARGET_GROUP_ID) : undefined;
  const channelId = process.env.TARGET_CHANNEL_ID ? Number(process.env.TARGET_CHANNEL_ID) : undefined;
  const botUsername = process.env.BOT_USERNAME || undefined;
  const channelUsername = process.env.CHANNEL_USERNAME || undefined;

  console.log("[SetWebhook] Environment check:", {
    hasToken: !!token,
    adminIdsCount: adminIds.length,
    publicUrl: publicUrl,
    requestHost: req.headers.host,
    forwardedHost: req.headers['x-forwarded-host']
  });

  if (!token || adminIds.length === 0 || !publicUrl) {
    console.error("[SetWebhook] Missing env vars:", {
      token: !!token,
      adminIdsLength: adminIds.length,
      publicUrl: !!publicUrl
    });
    res.status(500).send("Missing BOT_TOKEN, ADMIN_IDS or PUBLIC_URL");
    return;
  }

  try {
    console.log("[SetWebhook] Creating bot instance...");
    const bot = await createBot({ BOT_TOKEN: token, ADMIN_IDS: adminIds, TARGET_GROUP_ID: groupId, TARGET_CHANNEL_ID: channelId, BOT_USERNAME: botUsername, CHANNEL_USERNAME: channelUsername });
    console.log("[SetWebhook] Bot instance created");
    
    // Initialize bot
    await bot.init();
    console.log("[SetWebhook] Bot initialized");
    
    // Remove trailing slash from publicUrl if present
    const baseUrl = publicUrl.replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/api/webhook`;
    console.log("[SetWebhook] Setting webhook to:", webhookUrl);
    
    // Set webhook and verify it
    const setResult = await bot.api.setWebhook(webhookUrl);
    console.log("[SetWebhook] setWebhook result:", setResult);
    
    // Get webhook info to verify
    const webhookInfo = await bot.api.getWebhookInfo();
    console.log("[SetWebhook] Webhook info:", JSON.stringify(webhookInfo, null, 2));
    
    if (webhookInfo.url !== webhookUrl) {
      console.error("[SetWebhook] ⚠️ Warning: Webhook URL mismatch!");
      console.error("[SetWebhook] Expected:", webhookUrl);
      console.error("[SetWebhook] Got:", webhookInfo.url);
    }
    
    console.log("[SetWebhook] ✅ Webhook set successfully");
    res.status(200).json({ 
      ok: true, 
      webhookUrl,
      webhookInfo: webhookInfo
    });
  } catch (err: any) {
    console.error("[SetWebhook] ❌ Error:", err);
    console.error("[SetWebhook] ❌ Error message:", err?.message);
    console.error("[SetWebhook] ❌ Error stack:", err?.stack);
    res.status(500).json({ ok: false, error: err?.message || "setWebhook failed" });
  }
}


