import { config } from "dotenv";
import { createBot } from "./src/bot.js";

// Load .env and override any system environment variables
config({ override: true });

async function main() {
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

  if (!token || adminIds.length === 0) {
    console.error("Missing BOT_TOKEN or ADMIN_IDS");
    console.error(`Token found: ${token ? token.substring(0, 20) + '...' : 'undefined'}`);
    console.error(`Admin IDs: ${adminIds.length}`);
    process.exit(1);
  }

  console.log("Starting long polling bot (local dev)...");
  console.log(`Token loaded: ${token.substring(0, 20)}... (length: ${token.length})`);
  console.log(`Channel ID: ${channelId}, Bot: @${botUsername}`);
  
  const bot = await createBot({ BOT_TOKEN: token, ADMIN_IDS: adminIds, TARGET_GROUP_ID: groupId, TARGET_CHANNEL_ID: channelId, BOT_USERNAME: botUsername, CHANNEL_USERNAME: channelUsername });
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true });
  } catch (e: any) {
    if (e.error_code !== 404) throw e;
    // 404 is fine - no webhook to delete
  }
  await bot.start();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


