import { Bot, Context, InlineKeyboard } from "grammy";
import { kv } from "@vercel/kv";

export type EnvConfig = {
	BOT_TOKEN: string;
	ADMIN_IDS: number[]; // parsed list of admin Telegram user IDs
	TARGET_GROUP_ID?: number; // optional: where to post anonymous messages (group mode)
	TARGET_CHANNEL_ID?: number; // optional: channel id for posting anon submissions
	BOT_USERNAME?: string; // without @
	CHANNEL_USERNAME?: string; // without @, for channel link
};

// Comment structure stored in KV
type Comment = {
	id: number;
	text: string;
	timestamp: number;
	userId: number; // stored but not shown to users (for moderation)
};

// Temporary in-memory state (only for current request flow)
const userIdToPendingChannelMsg = new Map<number, number>(); // userId -> channelMsgId (when adding comment)

// KV helper functions
async function getComments(channelMsgId: number): Promise<Comment[]> {
	try {
		const comments = await kv.get<Comment[]>(`comments:${channelMsgId}`);
		console.log(`[KV] ✅ Retrieved ${comments?.length || 0} comments for message ${channelMsgId}`);
		return comments || [];
	} catch (err: any) {
		console.error(`[KV] ❌ Error getting comments for ${channelMsgId}:`, err?.message || err);
		console.error(`[KV] ❌ Error details:`, JSON.stringify(err, null, 2));
		return [];
	}
}

async function setComments(channelMsgId: number, comments: Comment[]): Promise<void> {
	try {
		await kv.set(`comments:${channelMsgId}`, comments);
		console.log(`[KV] ✅ Saved ${comments.length} comments to KV for message ${channelMsgId}`);
	} catch (err: any) {
		console.error(`[KV] ❌ Error setting comments for ${channelMsgId}:`, err?.message || err);
		console.error(`[KV] ❌ Error details:`, JSON.stringify(err, null, 2));
	}
}

async function getVentCounter(): Promise<number> {
	try {
		const counter = await kv.get<number>("ventCounter");
		console.log(`[KV] ✅ Retrieved ventCounter: ${counter || 0}`);
		return counter || 0;
	} catch (err: any) {
		console.error(`[KV] ❌ Error getting ventCounter:`, err?.message || err);
		console.error(`[KV] ❌ Error details:`, JSON.stringify(err, null, 2));
		return 0;
	}
}

async function incrementVentCounter(): Promise<number> {
	try {
		const newValue = await kv.incr("ventCounter");
		console.log(`[KV] ✅ Incremented ventCounter to: ${newValue}`);
		return newValue;
	} catch (err: any) {
		console.error(`[KV] ❌ Error incrementing ventCounter:`, err?.message || err);
		console.error(`[KV] ❌ Error details:`, JSON.stringify(err, null, 2));
		// Fallback: try to get and set manually
		try {
			const current = await getVentCounter();
			const newValue = current + 1;
			await kv.set("ventCounter", newValue);
			console.log(`[KV] ✅ Fallback: Set ventCounter to: ${newValue}`);
			return newValue;
		} catch (err2: any) {
			console.error(`[KV] ❌ Fallback also failed:`, err2?.message || err2);
			return 1; // Return 1 as fallback
		}
	}
}

async function getCommentIdCounter(): Promise<number> {
	try {
		const counter = await kv.get<number>("commentIdCounter");
		return counter || 0;
	} catch (err) {
		console.error(`[KV] Error getting commentIdCounter:`, err);
		return 0;
	}
}

async function incrementCommentIdCounter(): Promise<number> {
	try {
		const newValue = await kv.incr("commentIdCounter");
		return newValue;
	} catch (err) {
		console.error(`[KV] Error incrementing commentIdCounter:`, err);
		// Fallback: try to get and set manually
		try {
			const current = await getCommentIdCounter();
			const newValue = current + 1;
			await kv.set("commentIdCounter", newValue);
			return newValue;
		} catch (err2) {
			console.error(`[KV] Fallback also failed:`, err2);
			return 1; // Return 1 as fallback
		}
	}
}

export async function createBot(env: EnvConfig) {
	const bot = new Bot<Context>(env.BOT_TOKEN);
	
	// Test KV connectivity on bot creation
	try {
		// Try a simple get operation to test KV connectivity
		const testResult = await kv.get("__kv_test__");
		console.log(`[KV] ✅ KV connection test successful (test key returned: ${testResult})`);
	} catch (err: any) {
		console.error(`[KV] ❌ KV connection test failed:`, err?.message || err);
		console.error(`[KV] ❌ Error details:`, JSON.stringify(err, null, 2));
		console.error(`[KV] ❌ Check if Vercel KV is added to your project via Marketplace`);
		console.error(`[KV] ❌ Required env vars: KV_REST_API_URL, KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN)`);
	}

  // Helper function to update channel post buttons
  const updateChannelButtons = async (channelMsgId: number) => {
    if (!env.TARGET_CHANNEL_ID || !env.BOT_USERNAME) {
      console.log(`[Channel] Cannot update buttons: missing TARGET_CHANNEL_ID or BOT_USERNAME`);
      return;
    }
    
    const commentUrl = `https://t.me/${env.BOT_USERNAME}?start=comment_direct`;
    const viewUrl = `https://t.me/${env.BOT_USERNAME}?start=view_${channelMsgId}`;
    
    // Get comment count for this channel message from KV
    const comments = await getComments(channelMsgId);
    const commentCount = comments.length;
    // Always show count in parentheses, even if 0
    const viewButtonText = `View comments (${commentCount})`;
    
    console.log(`[Channel] Updating buttons for message ${channelMsgId}:`);
    console.log(`[Channel] - Comment count: ${commentCount}`);
    console.log(`[Channel] - Comments array:`, comments);
    console.log(`[Channel] - Button text will be: "${viewButtonText}"`);
    
    const kb = new InlineKeyboard();
    kb.url("Comment", commentUrl);
    kb.url(viewButtonText, viewUrl);
    
    try {
      const result = await bot.api.editMessageReplyMarkup(env.TARGET_CHANNEL_ID, channelMsgId, { reply_markup: kb });
      console.log(`[Channel] ✅ Successfully updated buttons for message ${channelMsgId} (${commentCount} comments)`);
      console.log(`[Channel] ✅ Button text: "${viewButtonText}"`);
      console.log(`[Channel] ✅ API result:`, result);
    } catch (e: any) {
      // Ignore "message is not modified" error - buttons are already correct
      if (e.description?.includes("message is not modified") || e.description?.includes("not modified")) {
        console.log(`[Channel] ℹ️ Buttons already up-to-date for message ${channelMsgId} (${commentCount} comments)`);
        return;
      }
      console.error(`[Channel] ❌ Failed to update buttons for message ${channelMsgId}:`, e.description || e.message);
      console.error(`[Channel] ❌ Error code:`, e.error_code);
      console.error(`[Channel] ❌ Full error:`, JSON.stringify(e, null, 2));
      // Don't throw - button update failure shouldn't break the flow
    }
  };

  // Helper function to format comments for display
  const formatComments = (comments: Comment[]): string => {
    if (comments.length === 0) {
      return "No comments yet. Be the first to comment!";
    }
    
    return comments.map((comment, index) => {
      const date = new Date(comment.timestamp).toLocaleString();
      return `${index + 1}. ${comment.text}\n   <i>${date}</i>`;
    }).join("\n\n");
  };

	// Helpers
	const isAdmin = (userId: number | undefined) =>
		userId !== undefined && env.ADMIN_IDS.includes(userId);

	// Commands
	bot.command("start", async (ctx) => {
		const payload = ctx.match as unknown as string | undefined;
		const startParam = typeof payload === "string" ? payload.trim() : "";
		
		// Handle "Comment" button click (posts directly to channel)
		if (startParam === "comment_direct") {
			console.log(`[CommentDirect] User ${ctx.from?.id} wants to post directly to channel`);
			// Set a special marker to indicate direct channel post
			userIdToPendingChannelMsg.set(ctx.from!.id, -1); // -1 means direct post, not a comment
			await ctx.reply(
				"💬 Send your message now. It will be posted directly to the channel.",
				{ link_preview_options: { is_disabled: true }, parse_mode: "HTML" }
			);
			return;
		}
		
		// Handle "Add a comment" button click (adds comment to specific post)
		const commentMatch = startParam.match(/^comment_(\d+)$/);
		if (commentMatch) {
			const channelMsgId = Number(commentMatch[1]);
			if (Number.isFinite(channelMsgId)) {
				console.log(`[AddComment] User ${ctx.from?.id} wants to add comment to channel message ${channelMsgId}`);
				userIdToPendingChannelMsg.set(ctx.from!.id, channelMsgId);
				await ctx.reply(
					"💬 Send your anonymous comment now. It will be added to the post.",
					{ link_preview_options: { is_disabled: true }, parse_mode: "HTML" }
				);
				return;
			}
		}
		
		// Handle "View comments" button click
		const viewMatch = startParam.match(/^view_(\d+)$/);
		if (viewMatch) {
			const channelMsgId = Number(viewMatch[1]);
			if (Number.isFinite(channelMsgId)) {
				console.log(`[ViewComments] User ${ctx.from?.id} viewing comments for channel message ${channelMsgId}`);
				const comments = await getComments(channelMsgId);
				const commentsText = formatComments(comments);
				
				console.log(`[ViewComments] Found ${comments.length} comments for message ${channelMsgId}`);
				
				// Update button to ensure count is current
				await updateChannelButtons(channelMsgId);
				
				await ctx.reply(
					`📝 <b>Comments for this post:</b>\n\n${commentsText}`,
					{ 
						link_preview_options: { is_disabled: true },
						parse_mode: "HTML"
					}
				);
				
				// Add button to add a comment
				if (env.BOT_USERNAME) {
					const kb = new InlineKeyboard();
					kb.url("Add a comment", `https://t.me/${env.BOT_USERNAME}?start=comment_${channelMsgId}`);
					await ctx.reply("💬 Want to add your own comment?", { reply_markup: kb });
				}
				return;
			}
		}

		// Default start message
		await ctx.reply(
			"This is an anonymous bot. Send whatever you feel—your message will be delivered without revealing your identity to others.",
			{ link_preview_options: { is_disabled: true } }
		);
  });

	bot.command("whoami", async (ctx) => {
    const id = ctx.from?.id;
    const username = ctx.from?.username ? `@${ctx.from.username}` : "<no username>";
    await ctx.reply(`Your user ID: ${id}\nUsername: ${username}`);
  });

  // Get group chat ID (run inside the group)
  bot.command("groupid", async (ctx) => {
    const chat = ctx.chat;
    if (!chat) return;
    if (chat.type === "group" || chat.type === "supergroup") {
      await ctx.reply(`Group chat ID: ${chat.id}`);
    } else {
      await ctx.reply("Run this inside the group to get its chat ID.");
    }
  });

  // Get message ID (reply to a message to get its ID)
  bot.command("msgid", async (ctx) => {
    if (!ctx.message) return;
    if (ctx.message.reply_to_message) {
      const replied = ctx.message.reply_to_message;
      await ctx.reply(`Message ID: ${replied.message_id}\nChat ID: ${ctx.chat?.id}`);
    } else {
      await ctx.reply("Reply to a message to get its ID.");
    }
  });

  // Admin command to test channel access
  bot.command("testchannel", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply("Admin only command.");
      return;
    }
    if (!env.TARGET_CHANNEL_ID) {
      await ctx.reply("TARGET_CHANNEL_ID not configured.");
      return;
    }
    try {
      const info = await ctx.api.getChat(env.TARGET_CHANNEL_ID);
      await ctx.reply(`✅ Channel accessible!\nTitle: ${info.title || 'N/A'}\nType: ${info.type}\nID: ${info.id}`);
      
      // Try sending a test message
      const testMsg = await ctx.api.sendMessage(env.TARGET_CHANNEL_ID, "🤖 Bot test message - you can delete this");
      await ctx.reply(`✅ Successfully posted test message (ID: ${testMsg.message_id})`);
    } catch (error: any) {
      await ctx.reply(`❌ Channel access failed:\n${error.description || error.message}\n\nMake sure:\n1. Bot is added to channel\n2. Bot is admin with post permission\n3. Channel ID is correct`);
    }
  });

  // Admin command to update buttons for a specific channel post
  bot.command("updatebuttons", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply("Admin only command.");
      return;
    }
    const args = (ctx.match as string || "").trim().split(/\s+/);
    if (args.length < 1) {
      await ctx.reply("Usage: /updatebuttons <channel_msg_id>\nExample: /updatebuttons 6");
      return;
    }
    const channelMsgId = Number(args[0]);
    
    if (!Number.isFinite(channelMsgId)) {
      await ctx.reply("Channel message ID must be a number.");
      return;
    }
    
    const comments = await getComments(channelMsgId);
    const commentCount = comments.length;
    
    try {
      await updateChannelButtons(channelMsgId);
      await ctx.reply(`✅ Updated buttons for channel message ${channelMsgId}\n📊 Comments found: ${commentCount}\nExpected button text: "View comments${commentCount > 0 ? ` (${commentCount})` : ''}"`);
    } catch (error: any) {
      await ctx.reply(`❌ Failed to update buttons: ${error.description || error.message}`);
    }
  });

  // Admin command to check comments for a channel post
  bot.command("checkcomments", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply("Admin only command.");
      return;
    }
    const args = (ctx.match as string || "").trim().split(/\s+/);
    if (args.length < 1) {
      await ctx.reply("Usage: /checkcomments <channel_msg_id>\nExample: /checkcomments 6");
      return;
    }
    const channelMsgId = Number(args[0]);
    
    if (!Number.isFinite(channelMsgId)) {
      await ctx.reply("Channel message ID must be a number.");
      return;
    }
    
    const comments = await getComments(channelMsgId);
    const commentCount = comments.length;
    
    if (commentCount === 0) {
      await ctx.reply(`📊 Channel message ${channelMsgId} has no comments stored.`);
    } else {
      const commentList = comments.map((c, i) => `${i + 1}. ${c.text.substring(0, 50)}${c.text.length > 50 ? '...' : ''}`).join('\n');
      await ctx.reply(`📊 Channel message ${channelMsgId} has ${commentCount} comment(s):\n\n${commentList}`);
    }
  });

  // Admin-only helpers (stateless; minimal)
  bot.command("help", async (ctx) => {
    if (isAdmin(ctx.from?.id)) {
      await ctx.reply(
        "Admin help: Reply to a forwarded message to respond anonymously to the user."
      );
    }
  });

  // Core routing
  bot.on("message", async (ctx) => {
    const fromId = ctx.from?.id;
    if (!fromId) return;
    
    const isUserAdmin = isAdmin(fromId);
    console.log(`[Message] Received from user ${fromId} (admin: ${isUserAdmin}), chat type: ${ctx.chat?.type}`);

    // If message is in a group, delete to preserve anonymity and instruct users
    if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
      if (!ctx.from?.is_bot) {
        try { await ctx.deleteMessage(); } catch {}
        await ctx.reply(
          "To post anonymously here, DM your message to me and I'll share it in this group."
        );
      }
      return;
    }

    // If admin replies to a forwarded message, route to original user
    if (isAdmin(fromId) && ctx.message.reply_to_message) {
      const original = ctx.message.reply_to_message;
      const text = (original.text || original.caption || "").toString();

      // Parse embedded user ID from forwarded message heading
      // Format used: [anon] From <username> (ID <id>)
      const match = text.match(/\(ID\s+(\d+)\)/);
      const targetUserId = match ? Number(match[1]) : undefined;
      if (!targetUserId) {
        await ctx.reply("Could not find original user ID in the replied message.");
        return;
      }

      // Forward admin's reply anonymously to target user
      if (ctx.message.text) {
        await ctx.api.sendMessage(
          targetUserId,
          ctx.message.text
        );
      } else if (ctx.message.photo) {
        const largest = ctx.message.photo[ctx.message.photo.length - 1];
        await ctx.api.sendPhoto(targetUserId, largest.file_id, {
          caption: ctx.message.caption,
        });
      } else if (ctx.message.document) {
        await ctx.api.sendDocument(targetUserId, ctx.message.document.file_id, {
          caption: ctx.message.caption,
        });
      } else if (ctx.message.audio) {
        await ctx.api.sendAudio(targetUserId, ctx.message.audio.file_id, {
          caption: ctx.message.caption,
        });
      } else if (ctx.message.voice) {
        await ctx.api.sendVoice(targetUserId, ctx.message.voice.file_id, {
          caption: ctx.message.caption,
        });
      } else if (ctx.message.video) {
        await ctx.api.sendVideo(targetUserId, ctx.message.video.file_id, {
          caption: ctx.message.caption,
        });
      } else if (ctx.message.sticker) {
        await ctx.api.sendSticker(targetUserId, ctx.message.sticker.file_id);
      } else {
        await ctx.reply("Unsupported message type for reply.");
      }

      return;
    }

    // Channel comments flow: if user previously clicked Comment or Add comment
    console.log(`[Comment] Checking if user ${fromId} has pending action. Map has ${userIdToPendingChannelMsg.size} entries.`);
    console.log(`[Comment] Map contents:`, Array.from(userIdToPendingChannelMsg.entries()));
    
    if (ctx.chat?.type === "private" && userIdToPendingChannelMsg.has(fromId)) {
      const channelMsgId = userIdToPendingChannelMsg.get(fromId)!;
      userIdToPendingChannelMsg.delete(fromId);

      // If channelMsgId is -1, this is a direct channel post (Comment button) - let it proceed
      if (channelMsgId === -1) {
        console.log(`[CommentDirect] ✅ User ${fromId} wants to post directly to channel - proceeding to channel posting`);
        // Don't return - let it fall through to channel posting logic below
      } else {
        // This is adding a comment to a specific post
        console.log(`[Comment] ✅ User ${fromId} wants to add comment to channel message ${channelMsgId}`);
        console.log(`[Comment] ⚠️ IMPORTANT: This message will NOT be posted to channel, only stored as comment`);
        
        // Extract comment text
        let commentText: string;
        if (ctx.message.text) {
          commentText = ctx.message.text;
        } else if (ctx.message.caption) {
          commentText = ctx.message.caption;
        } else if (ctx.message.photo) {
          commentText = "[Photo]";
        } else if (ctx.message.document) {
          commentText = `[Document: ${ctx.message.document.file_name || "file"}]`;
        } else if (ctx.message.audio) {
          commentText = `[Audio: ${ctx.message.audio.title || "audio"}]`;
        } else if (ctx.message.voice) {
          commentText = "[Voice message]";
        } else if (ctx.message.video) {
          commentText = "[Video]";
        } else if (ctx.message.sticker) {
          commentText = "[Sticker]";
        } else {
          await ctx.reply("❌ Unsupported message type for comment. Please send text, photo, or media with caption.");
          return;
        }

        // Store comment in KV
        const commentId = await incrementCommentIdCounter();
        const comment: Comment = {
          id: commentId,
          text: commentText,
          timestamp: Date.now(),
          userId: fromId
        };

        // Get existing comments, add new one, and save back to KV
        const existingComments = await getComments(channelMsgId);
        existingComments.push(comment);
        await setComments(channelMsgId, existingComments);

        const totalComments = existingComments.length;
        console.log(`[Comment] ✅ Comment stored in KV for channel message ${channelMsgId}. Total comments: ${totalComments}`);
        console.log(`[Comment] All comments for ${channelMsgId}:`, existingComments);
        
        // Update the channel buttons to show new comment count
        console.log(`[Comment] Updating buttons for channel message ${channelMsgId}...`);
        await updateChannelButtons(channelMsgId);
        console.log(`[Comment] Button update completed for channel message ${channelMsgId}`);
        
        await ctx.reply(
          "✅ Your anonymous comment was added! Others can view it by clicking 'View comments' on the channel post.",
          { link_preview_options: { is_disabled: true } }
        );
        console.log(`[Comment] ✅ Comment flow completed - returning early to prevent channel posting`);
        return; // CRITICAL: Return early to prevent this message from being posted to channel
      }
    } else {
      console.log(`[Comment] User ${fromId} does NOT have pending action - message will proceed to channel posting`);
    }

    // From normal user → forward to admin with embedded ID
    const username = ctx.from?.username ? `@${ctx.from.username}` : "<no username>";
    const header = `[anon] From ${username} (ID ${fromId})`;

    for (const adminId of env.ADMIN_IDS) {
      if (ctx.message.text) {
        await ctx.api.sendMessage(adminId, `${header}\n\n${ctx.message.text}`);
      } else if (ctx.message.photo) {
        const largest = ctx.message.photo[ctx.message.photo.length - 1];
        await ctx.api.sendPhoto(adminId, largest.file_id, {
          caption: ctx.message.caption ? `${header}\n\n${ctx.message.caption}` : header,
        });
      } else if (ctx.message.document) {
        await ctx.api.sendDocument(adminId, ctx.message.document.file_id, {
          caption: ctx.message.caption ? `${header}\n\n${ctx.message.caption}` : header,
        });
      } else if (ctx.message.audio) {
        await ctx.api.sendAudio(adminId, ctx.message.audio.file_id, {
          caption: ctx.message.caption ? `${header}\n\n${ctx.message.caption}` : header,
        });
      } else if (ctx.message.voice) {
        await ctx.api.sendVoice(adminId, ctx.message.voice.file_id, {
          caption: ctx.message.caption ? `${header}\n\n${ctx.message.caption}` : header,
        });
      } else if (ctx.message.video) {
        await ctx.api.sendVideo(adminId, ctx.message.video.file_id, {
          caption: ctx.message.caption ? `${header}\n\n${ctx.message.caption}` : header,
        });
      } else if (ctx.message.sticker) {
        await ctx.api.sendMessage(adminId, `${header}\n\n[sticker]`);
        await ctx.api.sendSticker(adminId, ctx.message.sticker.file_id);
      } else {
        await ctx.reply("Unsupported message type. Try sending text or media.");
      }
    }

    // Also post to target group anonymously, if configured
    if (env.TARGET_GROUP_ID) {
      const gid = env.TARGET_GROUP_ID;
      if (ctx.message.text) {
        await ctx.api.sendMessage(gid, ctx.message.text);
      } else if (ctx.message.photo) {
        const largest = ctx.message.photo[ctx.message.photo.length - 1];
        await ctx.api.sendPhoto(gid, largest.file_id, { caption: ctx.message.caption || undefined });
      } else if (ctx.message.document) {
        await ctx.api.sendDocument(gid, ctx.message.document.file_id, { caption: ctx.message.caption || undefined });
      } else if (ctx.message.audio) {
        await ctx.api.sendAudio(gid, ctx.message.audio.file_id, { caption: ctx.message.caption || undefined });
      } else if (ctx.message.voice) {
        await ctx.api.sendVoice(gid, ctx.message.voice.file_id, { caption: ctx.message.caption || undefined });
      } else if (ctx.message.video) {
        await ctx.api.sendVideo(gid, ctx.message.video.file_id, { caption: ctx.message.caption || undefined });
      } else if (ctx.message.sticker) {
        await ctx.api.sendSticker(gid, ctx.message.sticker.file_id);
      }
    }

    // Or post to channel with comments buttons, if configured
    // Note: Admin messages posted via bot won't show admin badge - admin must post directly to channel for badge
    if (env.TARGET_CHANNEL_ID) {
      const cid = env.TARGET_CHANNEL_ID;
      const isUserAdmin = isAdmin(fromId);
      console.log(`[Channel] Attempting to post to channel ${cid} from user ${fromId}`);
      console.log(`[Channel] Admin check: userId=${fromId}, ADMIN_IDS=${JSON.stringify(env.ADMIN_IDS)}, isAdmin=${isUserAdmin}`);
      try {
        // Add "UnKnown vent (N)" prefix for non-admin users
        let ventPrefix = "";
        if (!isUserAdmin) {
          const previousCounter = await getVentCounter();
          const newCounter = await incrementVentCounter();
          ventPrefix = `UnKnown vent (${newCounter})\n\n`;
          console.log(`[Channel] ✅ Vent counter incremented in KV: ${previousCounter} → ${newCounter}`);
          console.log(`[Channel] ✅ Adding vent prefix: "UnKnown vent (${newCounter})" for user ${fromId}`);
          console.log(`[Channel] Current ventCounter value: ${newCounter}`);
        } else {
          const currentCounter = await getVentCounter();
          console.log(`[Channel] ⚠️ User ${fromId} is admin - skipping vent prefix`);
          console.log(`[Channel] Current ventCounter value (not incremented): ${currentCounter}`);
        }
        
        // Send to channel as the bot
        // Note: To show bot name instead of channel name, ensure channel settings allow bot signatures
        const sent = await (async () => {
          if (ctx.message.text) {
            const messageText = ventPrefix + ctx.message.text;
            return await ctx.api.sendMessage(cid, messageText, {
              // Ensure message is sent as bot (this is default when bot is admin)
            });
          } else if (ctx.message.photo) {
            const largest = ctx.message.photo[ctx.message.photo.length - 1];
            const caption = ctx.message.caption ? ventPrefix + ctx.message.caption : (ventPrefix ? ventPrefix.trim() : undefined);
            return await ctx.api.sendPhoto(cid, largest.file_id, { 
              caption: caption
            });
          } else if (ctx.message.document) {
            const caption = ctx.message.caption ? ventPrefix + ctx.message.caption : (ventPrefix ? ventPrefix.trim() : undefined);
            return await ctx.api.sendDocument(cid, ctx.message.document.file_id, { 
              caption: caption
            });
          } else if (ctx.message.audio) {
            const caption = ctx.message.caption ? ventPrefix + ctx.message.caption : (ventPrefix ? ventPrefix.trim() : undefined);
            return await ctx.api.sendAudio(cid, ctx.message.audio.file_id, { 
              caption: caption
            });
          } else if (ctx.message.voice) {
            const caption = ctx.message.caption ? ventPrefix + ctx.message.caption : (ventPrefix ? ventPrefix.trim() : undefined);
            return await ctx.api.sendVoice(cid, ctx.message.voice.file_id, { 
              caption: caption
            });
          } else if (ctx.message.video) {
            const caption = ctx.message.caption ? ventPrefix + ctx.message.caption : (ventPrefix ? ventPrefix.trim() : undefined);
            return await ctx.api.sendVideo(cid, ctx.message.video.file_id, { 
              caption: caption
            });
          } else if (ctx.message.sticker) {
            // For stickers, send vent prefix as separate message first, then sticker
            if (ventPrefix) {
              await ctx.api.sendMessage(cid, ventPrefix.trim());
            }
            return await ctx.api.sendSticker(cid, ctx.message.sticker.file_id);
          }
          return undefined;
        })();

        if (sent) {
          console.log(`[Channel] ✅ Successfully posted message ${sent.message_id} to channel${ventPrefix ? ` with prefix: "${ventPrefix.trim()}"` : ''}`);
          
          // Add buttons: Add comment, View comments
          await updateChannelButtons(sent.message_id);
        } else {
          console.log(`[Channel] ⚠️ No message sent (unsupported type)`);
        }
      } catch (error: any) {
        console.error(`[Channel] ❌ Failed to post to channel ${cid}:`, error.description || error.message);
        console.error(`[Channel] Error code: ${error.error_code}, Full error:`, error);
        // Don't crash - just log the error
        // Common causes: bot not added to channel, wrong channel ID, no permission
      }
    }

    // Acknowledge to user (optional, to avoid clutter we keep it minimal)
    if (!isAdmin(fromId)) {
      await ctx.reply("Your message was delivered anonymously.");
    } else if (env.TARGET_CHANNEL_ID) {
      // Admin messages also posted to channel
      await ctx.reply("✅ Your message was posted to the channel.");
    }
  });



  // Global error handler
  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error handling update ${ctx.update.update_id}:`, err.error);
    // Don't crash - just log
  });

  return bot;
}


