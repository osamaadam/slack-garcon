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

    this.geminiService = new GeminiService(geminiApiKey, slackBotToken);
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
      console.log(`[${requestId}] 📨 Mention received`);
      console.log(`[${requestId}]   User: ${event.user}`);
      console.log(`[${requestId}]   Channel: ${event.channel}`);
      console.log(`[${requestId}]   Text: "${event.text}"`);

      const { channel, thread_ts, ts } = event;
      const threadTs = thread_ts || ts;

      console.log(`[${requestId}] 👥 Fetching channel members...`);
      const channelMembers = await this.slackService.getChannelMembers(channel);
      console.log(
        `[${requestId}]   Channel has ${channelMembers.length} member(s)`
      );

      console.log(`[${requestId}] 🧵 Fetching thread messages...`);
      const messages = await this.slackService.fetchThreadMessages(
        channel,
        threadTs
      );
      console.log(`[${requestId}]   Retrieved ${messages.length} message(s)`);

      const botUserId = this.slackService.getBotUserId();
      const aiMessages = this.slackService.convertToAIMessages(
        messages,
        botUserId
      );

      console.log(`[${requestId}] 🤖 Sending to Gemini...`);
      console.log(
        `[${requestId}]   Conversation length: ${aiMessages.length} message(s)`
      );

      const response = await this.geminiService.generateResponse(aiMessages);

      console.log(`[${requestId}] ✅ Gemini response received`);
      console.log(
        `[${requestId}]   Response length: ${response.length} characters`
      );

      console.log(`[${requestId}] 💬 Posting response to Slack...`);
      await this.slackService.postMessage(channel, response, threadTs);

      console.log(`[${requestId}] ✨ Request completed successfully`);
    } catch (error) {
      console.error(`[${requestId}] ❌ Error handling app mention:`, error);

      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";

      console.log(`[${requestId}] 🔧 Sending error message to user...`);
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
