import { AppMentionEvent } from "@slack/bolt";
import logger from "../logger";
import { GeminiService, Message } from "./gemini.service";
import { ImageProcessingService } from "./image-processing.service";
import { SlackService } from "./slack.service";

/**
 * Reusable event handler service for processing Slack events
 * Can be used by both Socket Mode and Lambda
 */
export class EventHandlerService {
  constructor(
    private slackService: SlackService,
    private geminiService: GeminiService,
    private imageProcessingService: ImageProcessingService
  ) {}

  /**
   * Handles app mention events
   * @param event - Slack app mention event
   */
  async handleAppMention(event: AppMentionEvent): Promise<void> {
    const requestId = `${event.channel}-${Date.now()}`;

    try {
      logger.info("Mention received", {
        requestId,
        user: event.user,
        channel: event.channel,
        text: event.text,
      });

      const { channel, thread_ts, ts } = event;
      const threadTs = thread_ts || ts;

      logger.info("Fetching thread messages", { requestId, channel, threadTs });
      const slackMessages = await this.slackService.fetchThreadMessages(
        channel,
        threadTs
      );

      logger.info("Thread messages fetched", {
        requestId,
        messageCount: slackMessages.length,
      });

      const botUserId = this.slackService.getBotUserId();
      const geminiMessages: Message[] = [];

      for (const msg of slackMessages) {
        const geminiMessage: Message = {
          role: msg.user === botUserId ? "model" : "user",
          content: msg.text,
          userName: msg.userName,
        };

        if (msg.images && msg.images.length > 0) {
          const base64Images =
            await this.imageProcessingService.convertBlobsToBase64(msg.images);
          geminiMessage.images = base64Images;
        }

        geminiMessages.push(geminiMessage);
      }

      logger.info("Sending to Gemini", {
        requestId,
        conversationLength: geminiMessages.length,
      });

      const response = await this.geminiService.generateResponse(
        geminiMessages
      );

      logger.info("Gemini response received", {
        requestId,
        responseLength: response.length,
      });

      logger.info("Posting response to Slack", {
        requestId,
        channel,
        threadTs,
      });
      await this.slackService.postMessage(channel, response, threadTs);

      logger.info("Request completed successfully", { requestId });
    } catch (error) {
      logger.error("Error handling app mention", { requestId, error });

      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";

      try {
        logger.info("Sending error message to user", { requestId });
        await this.slackService.postMessage(
          event.channel,
          `Sorry, something went wrong! يا عم الحاج في مشكلة حصلت 😅\n\nError: ${errorMessage}`,
          event.thread_ts || event.ts
        );
      } catch (postError) {
        logger.error("Failed to post error message to Slack", {
          requestId,
          postError,
        });
      }
      throw error;
    }
  }
}
