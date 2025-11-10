import { App, AppMentionEvent } from "@slack/bolt";
import { GeminiService } from "./services/gemini.service";
import { SlackService } from "./services/slack.service";
import logger from "./logger";

/**
 * Main bot orchestrator that handles Slack events and AI interactions
 */
export class GarconBot {
  private app: App;
  private geminiService: GeminiService;
  private slackService: SlackService;

  constructor(
    slackBotToken: string,
    slackAppToken: string,
    slackSigningSecret: string,
    geminiApiKey: string,
    geminiModel: string
  ) {
    this.app = new App({
      token: slackBotToken,
      appToken: slackAppToken,
      signingSecret: slackSigningSecret,
      socketMode: true,
    });

    this.geminiService = new GeminiService(
      geminiApiKey,
      slackBotToken,
      geminiModel
    );
    this.slackService = new SlackService(slackBotToken);

    this.registerEventHandlers();
  }

  /**
   * Registers all Slack event handlers
   */
  private registerEventHandlers(): void {
    this.app.event("app_mention", async ({ event }) => {
      await this.handleAppMention(event);
    });
  }

  /**
   * Handles mentions of the bot in Slack
   * @param event - Slack app mention event
   */
  private async handleAppMention(event: AppMentionEvent): Promise<void> {
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
      const messages = await this.slackService.fetchThreadMessages(
        channel,
        threadTs
      );

      logger.info("Thread messages fetched", {
        requestId,
        messageCount: messages.length,
      });

      const botUserId = this.slackService.getBotUserId();
      const aiMessages = this.slackService.convertToAIMessages(
        messages,
        botUserId
      );

      logger.info("Sending to Gemini", {
        requestId,
        conversationLength: aiMessages.length,
      });

      const response = await this.geminiService.generateResponse(aiMessages);

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

      logger.info("Sending error message to user", { requestId });
      await this.slackService.postMessage(
        event.channel,
        `Pardon! I encountered an issue: ${errorMessage}`,
        event.thread_ts || event.ts
      );
    }
  }

  /**
   * Starts the bot and initializes services
   */
  async start(port: number): Promise<void> {
    await this.slackService.initialize();
    await this.app.start(port);
    logger.info("Garcon is ready to serve", { port });
  }

  /**
   * Gracefully stops the bot
   */
  async stop(): Promise<void> {
    await this.app.stop();
    logger.info("Garcon has left the building");
  }
}
