# Garçon 🎩

A delightful TypeScript Slack bot powered by Google's Gemini AI. Just mention @garçon in any channel or thread, and watch as this charming digital waiter serves up intelligent responses with professional flair.

## Features

- 🤖 Responds to mentions in channels and threads
- 🧵 Full thread context awareness
- 🧠 Powered by Google Gemini AI
- ⚡️ Built with TypeScript for type safety
- 🔌 Socket Mode for easy local development

## Prerequisites

- Node.js 18.0.0 or higher
- A Slack workspace where you can install apps
- A Google Gemini API key

## Setup

### 1. Clone and Install

```bash
npm install
```

### 2. Configure Slack App

1. Visit [api.slack.com/apps](https://api.slack.com/apps) and create a new app
2. Under "Socket Mode", enable Socket Mode
3. Under "OAuth & Permissions", add these Bot Token Scopes:
   - `app_mentions:read` - Read mentions
   - `chat:write` - Send messages
   - `channels:history` - Read channel messages
   - `groups:history` - Read private channel messages
   - `im:history` - Read direct messages
   - `mpim:history` - Read group direct messages
4. Under "Event Subscriptions", subscribe to `app_mention` bot event
5. Install the app to your workspace
6. Copy the Bot User OAuth Token (starts with `xoxb-`)
7. Copy the App-Level Token (starts with `xapp-`) from Socket Mode settings
8. Copy the Signing Secret from "Basic Information"

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

### Development Mode

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

## Usage

Simply mention the bot in any Slack channel or thread:

```
@garcon what's the best way to handle async errors in TypeScript?
```

Garcon will fetch the entire thread context and provide an intelligent, contextual response.

## Project Structure

```
garcon/
├── src/
│   ├── services/
│   │   ├── gemini.service.ts    # Gemini AI integration
│   │   └── slack.service.ts     # Slack API wrapper
│   ├── bot.ts                   # Main bot orchestrator
│   ├── config.ts                # Environment configuration
│   └── index.ts                 # Application entry point
├── .env.example                 # Environment template
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
