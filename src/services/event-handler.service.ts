import { AppMentionEvent } from "@slack/bolt";
import logger from "../logger";
import { Message } from "./gemini.service";
import { LlmService } from "./llm";
import { renderReply } from "./render";
import { ImageProcessingService } from "./image-processing.service";
import { SlackService } from "./slack.service";

/**
 * Reusable event handler service for processing Slack events
 * Can be used by both Socket Mode and Lambda
 */
export class EventHandlerService {
  constructor(
    private slackService: SlackService,
    private llmService: LlmService,
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
      await this.slackService.setLoadingStatus(channel, threadTs);

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
      const llmMessages: Message[] = [];

      for (const msg of slackMessages) {
        const llmMessage: Message = {
          role: msg.user === botUserId ? "model" : "user",
          content: msg.text,
          userName: msg.userName,
        };

        if (msg.images && msg.images.length > 0) {
          const base64Images =
            await this.imageProcessingService.convertBlobsToBase64(msg.images);
          llmMessage.images = base64Images;
        }

        llmMessages.push(llmMessage);
      }

      logger.info("Sending to LLM", {
        requestId,
        conversationLength: llmMessages.length,
      });

      const response = await this.llmService.generateResponse(
        llmMessages
      );

      logger.info("LLM response received", {
        requestId,
        kind: typeof response === "string" ? "text" : response.kind,
      });

      logger.info("Posting response to Slack", {
        requestId,
        channel,
        threadTs,
      });
      if (typeof response === "string") {
        await this.slackService.postMessage(channel, response, threadTs);
      } else {
        const { text, blocks } = renderReply(response);
        await this.slackService.postMessage(channel, text, threadTs, blocks);
      }

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
