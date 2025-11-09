import { WebClient } from "@slack/web-api";
import { Message } from "./gemini.service";

export interface SlackMessage {
  text: string;
  user: string;
  ts: string;
}

interface SlackMessageItem {
  text?: string;
  user?: string;
  bot_id?: string;
  ts?: string;
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
   * Fetches all messages in a thread including the parent message
   * @param channel - Channel ID where the thread exists
   * @param threadTs - Thread timestamp identifier
   * @returns Array of Slack messages in chronological order
   */
  async fetchThreadMessages(
    channel: string,
    threadTs: string
  ): Promise<SlackMessage[]> {
    const result = await this.client.conversations.replies({
      channel,
      ts: threadTs,
    });

    if (!result.messages) {
      return [];
    }

    return result.messages.map((msg: SlackMessageItem) => ({
      text: msg.text || "",
      user: msg.user || msg.bot_id || "unknown",
      ts: msg.ts || "",
    }));
  }

  /**
   * Converts Slack messages to a format suitable for AI processing
   * @param messages - Raw Slack messages
   * @param botUserId - Bot's user ID to identify its own messages
   * @returns Formatted messages for AI consumption
   */
  convertToAIMessages(messages: SlackMessage[], botUserId: string): Message[] {
    return messages.map((msg) => ({
      role: msg.user === botUserId ? ("model" as const) : ("user" as const),
      content: this.cleanMessageText(msg.text),
    }));
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
