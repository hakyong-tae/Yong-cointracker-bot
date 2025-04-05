# 🧠 Yong CoinTracker Bot

A feature-rich Telegram bot for crypto wallet monitoring, gas fee tracking, coin price alerts, and chart visualizations.  
Built on top of Eliza Starter and customized for the **Yong AI** ecosystem.

---

## 🚀 Features

| Category | Command | Description |
|---------|---------|-------------|
| 🧾 Wallet Tools | `/newwallet` | Generates a new Ethereum wallet |
| 💰 Balances | `/balance <address>` | Shows ETH balance |
| 💼 Portfolio | `/portfolio <address>` | Displays ETH, USDT, and ERC-20 holdings |
| 📦 Tokens | `/tokens <address>` | Lists all tokens |
| 🔍 TX Monitor | `/transactions <address>` | Recent transactions |
| 🔔 Alert | `/watch <address>` | Real-time alerts on transactions |
| 📈 Prices | `/price <symbol>` | Shows current coin price |
| 📊 Charts | `/price_chart <symbol>` | 7-day line chart of coin price |
| 💹 Bulk Prices | `/price_all` | Shows prices of 10 supported coins |
| 🪙 Coin List | `/supported_coins` | Lists all supported coin symbols |
| ⛽ Gas | `/gas`, `/gasalert <GWEI>` | Tracks and alerts Ethereum gas fees |
| 📡 ETH Alerts | `/alert <price>` | ETH price alerts |
| 🤖 Start | `/start` | Shows command overview |

---

## ✅ Supported Coins

eth, btc, sol, matic, doge, bonk, wncg, usdt, apt, bnb

yaml
복사
편집

> Full names are mapped internally via `symbolToIdMap` using CoinGecko IDs.

---

## 📦 Stack

- Node.js (ESM)
- Telegram Bot API (`node-telegram-bot-api`)
- CoinGecko API
- Axios
- Chart.js (via `canvas`)
- Express (for webhook)
- Render.com (deployment)

---

## 🛠️ Local Development

```bash
git clone https://github.com/hakyong-tae/yong-cointracker-bot.git
cd yong-cointracker-bot
npm install
node telegramBot.js
Use .env to store TELEGRAM_BOT_TOKEN and WEBHOOK_URL.

🧪 Environment Switch
js
복사
편집
const isDev = process.env.NODE_ENV !== "production";
const bot = new TelegramBot(TOKEN, { polling: isDev });
Automatically switches between polling (dev) and webhook (prod).

🧊 License
MIT


# Eliza
ㅁ
## Edit the character files

Open `src/character.ts` to modify the default character. Uncomment and edit.

### Custom characters

To load custom characters instead:
- Use `pnpm start --characters="path/to/your/character.json"`
- Multiple character files can be loaded simultaneously

### Add clients
```
# in character.ts
clients: [Clients.TWITTER, Clients.DISCORD],

# in character.json
clients: ["twitter", "discord"]
```

## Duplicate the .env.example template

```bash
cp .env.example .env
```

\* Fill out the .env file with your own values.

### Add login credentials and keys to .env
```
DISCORD_APPLICATION_ID="discord-application-id"
DISCORD_API_TOKEN="discord-api-token"
...
OPENROUTER_API_KEY="sk-xx-xx-xxx"
...
TWITTER_USERNAME="username"
TWITTER_PASSWORD="password"
TWITTER_EMAIL="your@email.com"
```

## Install dependencies and start your agent

```bash
pnpm i && pnpm start
```
Note: this requires node to be at least version 22 when you install packages and run the agent.

## Run with Docker

### Build and run Docker Compose (For x86_64 architecture)

#### Edit the docker-compose.yaml file with your environment variables

```yaml
services:
    eliza:
        environment:
            - OPENROUTER_API_KEY=blahdeeblahblahblah
```

#### Run the image

```bash
docker compose up
```

### Build the image with Mac M-Series or aarch64

Make sure docker is running.

```bash
# The --load flag ensures the built image is available locally
docker buildx build --platform linux/amd64 -t eliza-starter:v1 --load .
```

#### Edit the docker-compose-image.yaml file with your environment variables

```yaml
services:
    eliza:
        environment:
            - OPENROUTER_API_KEY=blahdeeblahblahblah
```

#### Run the image

```bash
docker compose -f docker-compose-image.yaml up
```

# Deploy with Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/aW47_j)