import { App } from "@slack/bolt";
import logger from "./logger";
import { GeminiService } from "./services/gemini.service";
import { ImageProcessingService } from "./services/image-processing.service";
import { SlackService } from "./services/slack.service";
import { EventHandlerService } from "./services/event-handler.service";

/**
 * Main bot orchestrator that handles Slack events and AI interactions
 */
export class GarconBot {
  private app: App;
  private eventHandlerService: EventHandlerService;
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

    this.slackService = new SlackService(slackBotToken);
    const imageProcessingService = new ImageProcessingService();
    const geminiService = new GeminiService(geminiApiKey, geminiModel);

    this.eventHandlerService = new EventHandlerService(
      this.slackService,
      geminiService,
      imageProcessingService
    );

    this.registerEventHandlers();
  }

  /**
   * Registers all Slack event handlers
   */
  private registerEventHandlers(): void {
    this.app.event("app_mention", async ({ event }) => {
      await this.eventHandlerService.handleAppMention(event);
    });
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
