import { WebClient } from "@slack/web-api";
import retry from "retry";
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

/**
 * Helper function to wrap async operations with retry logic
 */
async function retryOperation<T>(
  fn: () => Promise<T>,
  options: {
    retries: number;
    onFailedAttempt?: (error: Error, attempt: number) => void;
  }
): Promise<T> {
  const operation = retry.operation({
    retries: options.retries,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 5000,
    randomize: true,
  });

  return new Promise<T>((resolve, reject) => {
    operation.attempt(async (currentAttempt) => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        if (options.onFailedAttempt) {
          options.onFailedAttempt(error as Error, currentAttempt);
        }

        if (!operation.retry(error as Error)) {
          reject(operation.mainError());
        }
      }
    });
  });
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
    const authResult = await retryOperation(() => this.client.auth.test(), {
      retries: 3,
      onFailedAttempt: (error, attempt) => {
        logger.warn("Slack auth.test failed, retrying...", {
          attempt,
          error: error.message,
        });
      },
    });
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
   * Fetches user information for a given user ID
   * @param userId - User ID to fetch information for
   * @returns User information including name and real name
   */
  async getUserInfo(
    userId: string
  ): Promise<{ id: string; name: string; realName: string } | null> {
    try {
      const result = await retryOperation(
        () => this.client.users.info({ user: userId }),
        {
          retries: 3,
          onFailedAttempt: (error, attempt) => {
            logger.warn("Slack users.info failed, retrying...", {
              userId,
              attempt,
              error: error.message,
            });
          },
        }
      );

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

    const result = await retryOperation(
      () => this.client.conversations.replies({ channel, ts: threadTs }),
      {
        retries: 3,
        onFailedAttempt: (error, attempt) => {
          logger.warn("Slack conversations.replies failed, retrying...", {
            channel,
            threadTs,
            attempt,
            error: error.message,
          });
        },
      }
    );

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
    const fetchImage = async (): Promise<Blob> => {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.client.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      return response.blob();
    };

    return await retryOperation(fetchImage, {
      retries: 3,
      onFailedAttempt: (error, attempt) => {
        logger.warn("Slack image fetch failed, retrying...", {
          url: url.substring(0, 50),
          attempt,
          error: error.message,
        });
      },
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
    await retryOperation(
      () =>
        this.client.chat.postMessage({
          channel,
          text,
          thread_ts: threadTs,
        }),
      {
        retries: 3,
        onFailedAttempt: (error, attempt) => {
          logger.warn("Slack chat.postMessage failed, retrying...", {
            channel,
            attempt,
            error: error.message,
          });
        },
      }
    );
  }
}
