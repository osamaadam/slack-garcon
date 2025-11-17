import { WebClient } from "@slack/web-api";
import logger from "../logger";

export interface SlackImageBlob {
  blob: Blob;
  mimeType: string;
  name: string;
}

export interface SlackMessage {
  text: string;
  user: string;
  userName?: string;
  ts: string;
  images?: SlackImageBlob[];
}

// No in-process retry logic: rely on SQS redelivery instead. Keep calls simple and
// let errors bubble so the processor Lambda can fail fast and SQS will retry.

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
    try {
      const authResult = await this.client.auth.test();
      this.botUserId = authResult.user_id as string;
    } catch (error) {
      logger.error("Slack auth.test failed", { error });
      throw error;
    }
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
   * Fetches user information for a given user ID
   * @param userId - User ID to fetch information for
   * @returns User information including name and real name
   */
  async getUserInfo(
    userId: string
  ): Promise<{ id: string; name: string; realName: string } | null> {
    try {
      const result = await this.client.users.info({ user: userId });

      if (result.user) {
        return {
          id: userId,
          name: result.user.name || "unknown",
          realName: result.user.real_name || result.user.name || "Unknown User",
        };
      }
      return null;
    } catch (error) {
      logger.error("Failed to fetch user info", { userId, error });
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
    logger.info("Fetching user information batch", {
      userCount: userIds.length,
    });

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

    logger.info("User information batch fetched", {
      fetchedCount: userMap.size,
    });
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
    logger.info("Fetching thread messages", { channel, threadTs });

    const result = await this.client.conversations.replies({
      channel,
      ts: threadTs,
    });

    if (!result.messages) {
      logger.warn("No messages found in thread", { channel, threadTs });
      return [];
    }

    const messages: SlackMessage[] = [];

    for (const msg of result.messages) {
      const slackMessage: SlackMessage = {
        text: msg.text || "",
        user: msg.user || msg.bot_id || "unknown",
        ts: msg.ts || "",
      };

      if (msg.files && msg.files.length > 0) {
        const imageBlobs: SlackImageBlob[] = [];

        for (const file of msg.files) {
          const url = file.url_private_download || file.url_private;
          if (url && file.mimetype?.startsWith("image/")) {
            try {
              const blob = await this.fetchImageAsBlob(url);
              imageBlobs.push({
                blob,
                mimeType: file.mimetype,
                name: file.name || "image",
              });
            } catch (error) {
              logger.error("Failed to fetch image blob", { url, error });
            }
          }
        }

        if (imageBlobs.length > 0) {
          slackMessage.images = imageBlobs;
        }
      }

      messages.push(slackMessage);
    }

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

    logger.info("Thread messages fetched", {
      channel,
      threadTs,
      messageCount: messages.length,
      messages: messages.map((msg, idx) => ({
        index: idx + 1,
        user: msg.userName || msg.user,
        textPreview: msg.text.substring(0, 50).replace(/\n/g, " "),
        hasMoreText: msg.text.length > 50,
        imageCount: msg.images?.length || 0,
      })),
    });

    return messages;
  }

  /**
   * Fetches an image from Slack as a Blob
   * @param url - Slack image URL
   * @returns Blob containing the image data
   */
  private async fetchImageAsBlob(url: string): Promise<Blob> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.client.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    return response.blob();
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
}
