# Garcon 🎩

A delightful TypeScript Slack bot powered by Google's Gemini AI. Just mention @Garcon in any channel or thread, and watch as this charming digital waiter serves up intelligent responses with professional flair.

## Features

- 🤖 Responds to mentions in channels and threads
- 🧵 Full thread context awareness
- 🖼️ Image and receipt analysis powered by Gemini Pro Vision
- 📊 Aggregates food orders from conversation threads
- 💰 Automatically calculates bill splits from receipt images
- 🌐 Multi-language support (English, Arabic, Franko/Arabizi)
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

### Food Order Aggregation

When team members are placing food orders in a thread, mention Garçon to aggregate the orders:

```
User 1: I want a burger with extra cheese
User 2: Pizza margherita for me
User 3: Burger too, no pickles
@garcon summarize the orders
```

Garçon will respond with organized bullet lists showing orders by user and summary by item.

### Receipt Bill Splitting

After someone uploads a receipt image, mention Garçon to calculate the bill split:

```
[User uploads receipt image]
@garcon split the bill
```

Garçon will analyze the receipt, match items to users' orders, and calculate how much each person owes including their share of delivery, service charges, and VAT.

### General Assistance

Simply mention the bot for any questions:

```
@garcon what's the best way to handle async errors in TypeScript?
```

Garçon will fetch the entire thread context and provide an intelligent, contextual response.

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
