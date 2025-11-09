import { App, AppMentionEvent } from "@slack/bolt";
import { GeminiService } from "./services/gemini.service";
import { SlackService } from "./services/slack.service";

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
    geminiApiKey: string
  ) {
    this.app = new App({
      token: slackBotToken,
      appToken: slackAppToken,
      signingSecret: slackSigningSecret,
      socketMode: true,
    });

    this.geminiService = new GeminiService(geminiApiKey);
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
    try {
      const { channel, thread_ts, ts } = event;
      const threadTs = thread_ts || ts;

      const messages = await this.slackService.fetchThreadMessages(
        channel,
        threadTs
      );

      const botUserId = this.slackService.getBotUserId();
      const aiMessages = this.slackService.convertToAIMessages(
        messages,
        botUserId
      );

      const response = await this.geminiService.generateResponse(aiMessages);

      await this.slackService.postMessage(channel, response, threadTs);
    } catch (error) {
      console.error("Error handling app mention:", error);

      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";

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
    console.log(`⚡️ Garcon is ready to serve on port ${port}!`);
  }

  /**
   * Gracefully stops the bot
   */
  async stop(): Promise<void> {
    await this.app.stop();
    console.log("👋 Garcon has left the building");
  }
}
