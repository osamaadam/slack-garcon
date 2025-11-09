import { WebClient } from "@slack/web-api";
import { Message } from "./gemini.service";

export interface SlackFile {
  url: string;
  mimeType: string;
  name: string;
}

export interface SlackMessage {
  text: string;
  user: string;
  userName?: string;
  ts: string;
  files?: SlackFile[];
}

interface SlackMessageItem {
  text?: string;
  user?: string;
  bot_id?: string;
  ts?: string;
  files?: Array<{
    url_private?: string;
    url_private_download?: string;
    mimetype?: string;
    name?: string;
  }>;
}

/**
 * Service for interacting with Slack API
 */
export class SlackService {
  private client: WebClient;
  private botUserId: string | null = null;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  /**
   * Initializes the service by fetching bot user information
   */
  async initialize(): Promise<void> {
    const authResult = await this.client.auth.test();
    this.botUserId = authResult.user_id as string;
  }

  /**
   * Retrieves the bot's user ID
   * @returns Bot user ID
   * @throws {Error} If bot user ID is not initialized
   */
  getBotUserId(): string {
    if (!this.botUserId) {
      throw new Error("Bot user ID not initialized. Call initialize() first.");
    }
    return this.botUserId;
  }

  /**
   * Fetches all members in a channel
   * @param channel - Channel ID
   * @returns Array of user IDs in the channel
   */
  async getChannelMembers(channel: string): Promise<string[]> {
    console.log(`  👥 Fetching members for channel: ${channel}`);

    try {
      const result = await this.client.conversations.members({
        channel,
      });

      const memberIds = (result.members || []) as string[];
      console.log(`  ✓ Found ${memberIds.length} member(s) in channel`);

      return memberIds;
    } catch (error) {
      console.error(`  ✗ Failed to fetch channel members:`, error);
      return [];
    }
  }

  /**
   * Fetches user information for a given user ID
   * @param userId - User ID to fetch information for
   * @returns User information including name and real name
   */
  async getUserInfo(
    userId: string
  ): Promise<{ id: string; name: string; realName: string } | null> {
    try {
      const result = await this.client.users.info({
        user: userId,
      });

      if (result.user) {
        return {
          id: userId,
          name: result.user.name || "unknown",
          realName: result.user.real_name || result.user.name || "Unknown User",
        };
      }
      return null;
    } catch (error) {
      console.error(`  ✗ Failed to fetch user info for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Fetches information for multiple users
   * @param userIds - Array of user IDs
   * @returns Map of user ID to user information
   */
  async getUserInfoBatch(
    userIds: string[]
  ): Promise<Map<string, { name: string; realName: string }>> {
    console.log(`  👤 Fetching info for ${userIds.length} user(s)`);

    const userMap = new Map<string, { name: string; realName: string }>();

    await Promise.all(
      userIds.map(async (userId) => {
        const userInfo = await this.getUserInfo(userId);
        if (userInfo) {
          userMap.set(userId, {
            name: userInfo.name,
            realName: userInfo.realName,
          });
        }
      })
    );

    console.log(`  ✓ Fetched info for ${userMap.size} user(s)`);
    return userMap;
  }

  /**
   * Fetches all members in a channel including the parent message
   * @param channel - Channel ID where the thread exists
   * @param threadTs - Thread timestamp identifier
   * @returns Array of Slack messages in chronological order
   */
  async fetchThreadMessages(
    channel: string,
    threadTs: string
  ): Promise<SlackMessage[]> {
    console.log(`  📥 Fetching thread: ${threadTs} from channel: ${channel}`);

    const result = await this.client.conversations.replies({
      channel,
      ts: threadTs,
    });

    if (!result.messages) {
      console.log(`  ⚠️  No messages found in thread`);
      return [];
    }

    const messages: SlackMessage[] = result.messages.map(
      (msg: SlackMessageItem) => {
        const files: SlackFile[] = [];

        if (msg.files && msg.files.length > 0) {
          msg.files.forEach((file) => {
            const url = file.url_private_download || file.url_private;
            if (url && file.mimetype?.startsWith("image/")) {
              files.push({
                url,
                mimeType: file.mimetype,
                name: file.name || "image",
              });
            }
          });
        }

        return {
          text: msg.text || "",
          user: msg.user || msg.bot_id || "unknown",
          ts: msg.ts || "",
          files: files.length > 0 ? files : undefined,
        };
      }
    );

    const uniqueUserIds = [
      ...new Set(
        messages
          .map((m) => m.user)
          .filter((id) => id !== "unknown" && !id.startsWith("B"))
      ),
    ];
    const userInfoMap = await this.getUserInfoBatch(uniqueUserIds);

    messages.forEach((msg) => {
      const userInfo = userInfoMap.get(msg.user);
      if (userInfo) {
        msg.userName = userInfo.realName || userInfo.name;
      }
    });

    console.log(`  ✓ Fetched ${messages.length} message(s)`);
    messages.forEach((msg, idx) => {
      const userName = msg.userName || msg.user;
      const preview = msg.text.substring(0, 50).replace(/\n/g, " ");
      const fileInfo = msg.files ? ` [${msg.files.length} image(s)]` : "";
      console.log(
        `    ${idx + 1}. ${userName}: "${preview}${
          msg.text.length > 50 ? "..." : ""
        }"${fileInfo}`
      );
    });

    return messages;
  }

  /**
   * Converts Slack messages to a format suitable for AI processing
   * @param messages - Raw Slack messages
   * @param botUserId - Bot's user ID to identify its own messages
   * @returns Formatted messages for AI consumption
   */
  convertToAIMessages(messages: SlackMessage[], botUserId: string): Message[] {
    return messages.map((msg) => {
      const aiMessage: Message = {
        role: msg.user === botUserId ? ("model" as const) : ("user" as const),
        content: this.cleanMessageText(msg.text),
        userName: msg.userName,
      };

      if (msg.files && msg.files.length > 0) {
        aiMessage.images = msg.files.map((file) => ({
          url: file.url,
          mimeType: file.mimeType,
        }));
      }

      return aiMessage;
    });
  }

  /**
   * Posts a message to a Slack channel or thread
   * @param channel - Target channel ID
   * @param text - Message text to send
   * @param threadTs - Optional thread timestamp for threaded replies
   */
  async postMessage(
    channel: string,
    text: string,
    threadTs?: string
  ): Promise<void> {
    await this.client.chat.postMessage({
      channel,
      text,
      thread_ts: threadTs,
    });
  }

  /**
   * Removes Slack-specific formatting from message text
   * @param text - Raw message text with Slack formatting
   * @returns Cleaned message text
   */
  private cleanMessageText(text: string): string {
    return text.replace(/<@[A-Z0-9]+>/g, "").trim();
  }
}
