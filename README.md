# Garcon

A delightful TypeScript Slack bot powered by Google's Gemini AI. Just mention @Garcon in any channel or thread, and watch as this charming digital assistant serves up intelligent responses with the full context of your conversation.

## Features

- 🤖 Responds to mentions in channels and threads
- 🧵 Full thread context awareness - fetches entire conversation history
- 🖼️ Image analysis powered by Gemini Pro Vision
- 💰 Smart bill splitting with proportional charge distribution
- 🎭 Fully customizable personality via `system_prompt.txt`
- 🧠 Powered by Google Gemini AI (`gemini-2.5-pro`)
- 🔄 Built-in retry logic with exponential backoff for reliability
- ⚡️ Built with TypeScript for type safety
- 🔌 Two deployment modes: Socket Mode (easy local dev) or AWS Lambda (serverless)

## Prerequisites

- Node.js 18.0.0 or higher
- A Slack workspace where you can install apps
- A Google Gemini API key
- (Optional) AWS account for Lambda deployment

## Setup

### 1. Clone and Install

```bash
npm install
```

### 2. Configure Slack App

**For Socket Mode (Local/Server deployment):**

1. Visit [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under "Socket Mode", enable Socket Mode and generate an App-Level Token with `connections:write` scope
3. Under "OAuth & Permissions", add these Bot Token Scopes:
   - `app_mentions:read` - Read mentions of the bot
   - `chat:write` - Send messages as the bot
   - `channels:history` - Read message history in public channels
   - `channels:read` - View basic information about public channels
   - `groups:history` - Read message history in private channels
   - `groups:read` - View basic information about private channels
   - `im:history` - Read message history in direct messages
   - `mpim:history` - Read message history in group direct messages
   - `files:read` - Read files and images uploaded to Slack (required for receipt analysis)
   - `users:read` - View users in the workspace and channels
4. Under "Event Subscriptions", enable events and subscribe to these bot events:
   - `app_mention` - Listen for mentions of the bot
5. Install the app to your workspace
6. Copy the Bot User OAuth Token (starts with `xoxb-`) from "OAuth & Permissions"
7. Copy the App-Level Token (starts with `xapp-`) from "Basic Information" → "App-Level Tokens"
8. Copy the Signing Secret from "Basic Information"

**For Lambda Mode (AWS deployment):**

1. Visit [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. **DO NOT enable Socket Mode** for Lambda
3. Under "OAuth & Permissions", add the same Bot Token Scopes as listed above
4. Under "Event Subscriptions":
   - Enable events
   - Set Request URL to your Lambda Function URL (you'll get this after deployment)
   - Subscribe to bot event: `app_mention`
5. Install the app to your workspace
6. Copy the Bot User OAuth Token (starts with `xoxb-`) from "OAuth & Permissions"
7. Copy the Signing Secret from "Basic Information"

### 3. Get Gemini API Key

1. Visit [ai.google.dev](https://ai.google.dev)
2. Get your API key

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_APP_TOKEN=xapp-your-app-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
GEMINI_API_KEY=your-gemini-api-key-here
PORT=3000
```

## Running the Bot

### Option 1: Socket Mode (Local Development / Server Deployment)

#### Development Mode

```bash
npm run dev
```

#### Production Build

```bash
npm run build
npm start
```

This mode is great for:

- Local development and testing
- Self-hosted servers (Oracle Free Tier, DigitalOcean, etc.)
- Always-on applications

### Option 2: AWS Lambda (Serverless Deployment)

#### Setup Requirements

1. AWS account with programmatic access
2. AWS CLI installed and configured
3. Serverless Framework installed: `npm install -g serverless`

#### Required AWS Credentials

You need an IAM user with the following permissions:

- `AWSLambdaFullAccess` (or custom policy with Lambda permissions)
- `IAMFullAccess` (or permission to create Lambda execution roles)
- `CloudFormationFullAccess` (Serverless uses CloudFormation)
- `AmazonAPIGatewayAdministrator` (for Function URLs)
- `CloudWatchLogsFullAccess` (for logging)
- `AmazonSQSFullAccess` (for event queue management)

Create an IAM user in AWS Console:

1. Go to IAM → Users → Add Users
2. Enable "Programmatic access"
3. Attach the policies listed above
4. Save the Access Key ID and Secret Access Key

#### Local Deployment

```bash
# Set environment variables
export SLACK_BOT_TOKEN=xoxb-your-token
export SLACK_SIGNING_SECRET=your-secret
export GEMINI_API_KEY=your-key
export GEMINI_MODEL=gemini-2.5-pro

# Deploy using Serverless Framework
npx serverless deploy
```

After deployment, you'll get a Function URL for `slack_receiver`. Copy this URL and:

1. Go to your Slack App settings
2. Under "Event Subscriptions", paste the URL in "Request URL"
3. Slack will verify the endpoint automatically

**How it works:**

- The receiver Lambda validates requests and queues events to SQS (responds in <100ms)
- The processor Lambda handles events from the queue asynchronously (has 5 minutes)
- This prevents Slack retries and ensures reliable message processing

#### Automatic Deployment with GitHub Actions

For automatic deployment on push to `main`:

1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Add these secrets:

   - `AWS_ACCESS_KEY_ID` - Your AWS access key
   - `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
   - `AWS_REGION` - AWS region (e.g., `eu-central-1`)
   - `SLACK_BOT_TOKEN` - Your Slack bot token
   - `SLACK_SIGNING_SECRET` - Your Slack signing secret
   - `GEMINI_API_KEY` - Your Gemini API key
   - `GEMINI_MODEL` - (optional) Gemini model name

3. Push to `main` branch - GitHub Actions will automatically deploy to Lambda!

#### Lambda vs Socket Mode Comparison

| Feature     | Socket Mode                      | AWS Lambda                      |
| ----------- | -------------------------------- | ------------------------------- |
| Cost        | Server cost (can use free tiers) | Pay per request (1M free/month) |
| Setup       | Easier                           | Requires AWS setup              |
| Scaling     | Manual                           | Automatic                       |
| Cold starts | None                             | ~1-2 seconds first request      |
| Always on   | Yes (requires server)            | No (serverless)                 |
| Best for    | Development, small teams         | Production, variable load       |

## Usage

Mention @Garcon in any Slack channel or thread to get a response. The bot will:

1. **Fetch the entire thread context** - All messages from the conversation, including any previous messages in the thread
2. **Process any images** - Analyzes images uploaded in the thread (receipts, screenshots, diagrams, etc.)
3. **Generate contextual responses** - Uses Google Gemini AI to provide intelligent answers based on the full conversation

### Examples

#### General conversation

```text
User: Hey team, what's the best approach for handling errors in async functions?
@garcon can you help?
```

#### Image analysis

```text
[User uploads receipt image]
@garcon can you split this bill based on our orders above?
```

#### Thread context

```text
User 1: I'm having trouble with TypeScript generics
User 2: Have you tried using extends?
User 1: Yeah but I'm getting weird errors
@garcon what am I missing here?
```

The bot sees the entire conversation and provides relevant, contextual responses.

## Customization

### Personalizing Your Bot

You can completely customize the bot's personality and behavior by editing `system_prompt.txt`. This file contains the instructions that tell Gemini AI how to behave.

#### Default behavior

The bot roleplays as جعفر العمدة (a charismatic Egyptian character), aggregates food orders, and splits bills with Egyptian humor.

#### To customize

Simply edit `system_prompt.txt` with your own instructions. For example:

```txt
You are a professional code review assistant. When analyzing code in thread context:
- Point out potential bugs and security issues
- Suggest performance improvements
- Follow team coding standards
- Be constructive and helpful

Use clear formatting with bullet points and code blocks.
```

The bot will use the full Slack thread context with your custom personality to respond to mentions. You can make it:

- A code reviewer that analyzes snippets shared in threads
- A documentation assistant that helps with technical writing
- A project manager that tracks action items in conversations
- A language tutor that helps with translations
- Anything you can imagine!

The system prompt has access to the entire thread history, so you can create context-aware bots tailored to your team's specific needs.

## License

MIT License - Copyright (c) 2025 Osama Adam

See [LICENSE](LICENSE) file for details.

## Author

Osama Adam

- Email: [osamaadamme@gmail.com](mailto:osamaadamme@gmail.com)
- GitHub: [@osamaadam](https://github.com/osamaadam)
