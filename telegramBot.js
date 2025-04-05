// 환경 설정 및 모듈 로딩
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

// 전역 설정
const app = express();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== "production";

// 봇 인스턴스 생성
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: isDev });

// 웹훅 모드일 경우만 Express 서버 실행 및 webhook 등록
if (!isDev) {
    app.use(bodyParser.json());
  
    app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, (req, res) => {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    });
  
    app.listen(PORT, async () => {
      console.log(`🚀 Bot is live on port ${PORT}`);
  
      try {
        const webhookURL = `${WEBHOOK_URL}/webhook/${TELEGRAM_BOT_TOKEN}`;
        const response = await axios.post(`${API_URL}/setWebhook`, { url: webhookURL });
        console.log(`✅ Webhook set to: ${webhookURL}`);
        console.log("🔄 Telegram API response:", response.data);
      } catch (error) {
        console.error("❌ Failed to set webhook:", error.response?.data || error.message);
      }
    });
  } else {
    console.log("🧪 Running in development mode (polling enabled)");
  }
  

let watchlist = new Set(); // Wallets to monitor
let lastPrice = 0;
let priceAlertThreshold = null;
let chatIdForPriceAlert = null;
let chatIdForGasAlert = null;
let lastUpdateId = 0; 


// 📌 Handle incoming messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    console.log(`📩 New message received: ${text}`);

    if (text === "/start") {
        await handleStartCommand(chatId);
    } else if (text.startsWith("/gasalert ")) {
        await handleGasAlertCommand(chatId, parseFloat(text.split(' ')[1]));
    } else if (text.startsWith("/gas")) {
        await handleGasCommand(chatId);
    } else if (text.startsWith("/alert ")) {
        const price = parseFloat(text.split(' ')[1]);
        if (isNaN(price)) {
            await sendMessage(chatId, "⚠️ Please enter a valid price. Example: `/alert 2500`");
        } else {
            await handlePriceAlertCommand(chatId, price);
        }
    } else if (text.startsWith("/newwallet")) {
        await handleNewWalletCommand(chatId);
    } else if (text.startsWith("/balance ")) {
        const walletAddress = text.split(' ')[1];
        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            await sendMessage(chatId, "⚠️ Please enter a valid Ethereum address. Example: `/balance 0x123...abc`");
        } else {
            await handleBalanceCommand(chatId, walletAddress);
        }
    } else if (text.startsWith("/portfolio ")) {
        await handlePortfolioCommand(chatId, text.split(" ")[1]);
    } else if (text.startsWith("/tokens ")) {
        await handleTokensCommand(chatId, text.split(" ")[1]);
    } else if (text.startsWith("/transactions ")) {
        const walletAddress = text.split(" ")[1];
        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            await sendMessage(chatId, "⚠️ Please enter a valid Ethereum address. Example: `/transactions 0x123...abc`");
        } else {
            await handleTransactionsCommand(chatId, walletAddress);
        }
    } else if (text.startsWith("/watch ")) {
        const walletAddress = text.split(" ")[1];
        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            await sendMessage(chatId, "⚠️ Please enter a valid Ethereum address. Example: `/watch 0x123...abc`");
        } else {
            await handleWatchCommand(chatId, walletAddress);
        }  
    } else if (text.startsWith("/price_all")) {
        await handlePriceAllCommand(chatId);
    
    } else if (text.startsWith("/pricemonitor")) {
        await handlePriceMonitorCommand(chatId);
    
    } else if (text.startsWith("/price")) {
        const parts = text.trim().split(" ");
        if (parts.length === 2) {
            const symbol = parts[1];
            await handlePriceSymbolCommand(chatId, symbol);
        }
    }
    
     else {
        await sendMessage(chatId, "⚠️ Unknown command. Type `/start` to see the available commands.");
    }
});
const symbolToIdMap = {
    eth: "ethereum",
    sol: "solana",
    btc: "bitcoin",
    wncg: "wrapped-ncg",
    doge: "dogecoin",
    bonk: "bonk",
    matic: "matic-network",
    usdt: "tether",
    apt: "aptos",
    bnb: "binancecoin"
  };
// 📌 Telegram Webhook 설정 (Render에서 사용)
app.use(express.json());
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// 🔁 간단한 캐시 시스템 (메모리 기반)
const chartCache = new Map();

async function getCachedChartData(coinId, duration = 60 * 1000) {
  const now = Date.now();
  if (chartCache.has(coinId)) {
    const { timestamp, data } = chartCache.get(coinId);
    if (now - timestamp < duration) return data;
  }

  // ✅ 1초 딜레이 (rate limit 피하기 위함)
  await new Promise(resolve => setTimeout(resolve, 1000));

  const res = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`, {
    params: { vs_currency: "usd", days: 7 }
  });
  chartCache.set(coinId, { timestamp: now, data: res.data });
  return res.data;
}

bot.onText(/\/supported_coins/, async (msg) => {
    const chatId = msg.chat.id;
  
    const supportedCoins = [
      { symbol: "eth", name: "Ethereum" },
      { symbol: "btc", name: "Bitcoin" },
      { symbol: "sol", name: "Solana" },
      { symbol: "wncg", name: "WNCG" },
      { symbol: "doge", name: "Dogecoin" },
      { symbol: "bonk", name: "Bonk" },
      { symbol: "matic", name: "Polygon (MATIC)" },
      { symbol: "usdt", name: "Tether (USDT)" },
      { symbol: "apt", name: "Aptos" },
      { symbol: "bnb", name: "BNB" }
    ];
  
    let message = "✅ *Supported Coins:*\n\n";
    message += supportedCoins.map(c => `- \`${c.symbol}\`: ${c.name}`).join("\n");
  
    await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  });
  
bot.onText(/^\/price_chart$/, async (msg) => {
    const chatId = msg.chat.id;
    const supportedSymbols = Object.keys(symbolToIdMap).join(", ");
    await bot.sendMessage(chatId, `📊 Please provide a coin symbol.\nSupported symbols: ${supportedSymbols}\n\nExample: /price_chart eth`);
  });
  
// 📈 /price_chart <symbol>
bot.onText(/\/price_chart (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const symbol = match[1].toLowerCase();
  
    console.log("📩 /price_chart command received:", symbol);
  
    const coinId = symbolToIdMap[symbol];
  
    if (!coinId) {
      await bot.sendMessage(chatId, `❌ Unknown coin symbol: "${symbol}". Please try again.`);
      return;
    }
  
    try {
      const data = await getCachedChartData(coinId);
      const prices = data.prices;
  
      const labels = prices.map(p =>
        new Date(p[0]).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      );
      const values = prices.map(p => p[1]);
  
      const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify({
        type: "line",
        data: {
          labels,
          datasets: [{
            label: `${symbol.toUpperCase()} Price (7D)`,
            data: values,
            fill: true,
            borderColor: "orange",
            backgroundColor: "rgba(255,165,0,0.2)"
          }]
        }
      }))}`;
  
      await bot.sendPhoto(chatId, chartUrl, {
        caption: `📈 ${symbol.toUpperCase()} 7-Day Price Chart`
      });
  
    } catch (err) {
      console.error("❌ Failed to fetch coin price:", err);
      if (err.response?.status === 429) {
        await bot.sendMessage(chatId, "⚠️ Sorry, the chart couldn't be loaded right now. Please try again in a few moments.");
      } else {
        await bot.sendMessage(chatId, "⚠️ Failed to load the chart. Please try again with a different symbol.");
      }
    }
  });
  
// 📌 Handle /newwallet command
async function handleNewWalletCommand(chatId) {
    try {
        // 새로운 이더리움 지갑 생성
        const wallet = ethers.Wallet.createRandom();
        const message = `🔑 **New Ethereum Wallet Created!**\n\n` +
                        `📍 **Address:** \`${wallet.address}\`\n` +
                        `🔐 **Private Key:** \`${wallet.privateKey}\`\n\n` +
                        `⚠️ **Keep your private key safe!** If you lose it, you cannot recover your wallet.`;

        await sendMessage(chatId, message);
    } catch (error) {
        console.error("🚨 Error creating new wallet:", error);
        await sendMessage(chatId, "⚠️ Error creating new wallet. Please try again.");
    }
}

// 📌 Send a message to Telegram chat
async function sendMessage(chatId, text) {
    try {
        await bot.sendMessage(chatId, text);
    } catch (error) {
        console.error('🚨 Error sending message:', error);
    }
}


// 📌 Handle /start command
async function handleStartCommand(chatId) {
    const message = `👋 *Welcome to the Yong's Ethereum Bot!* 🚀\n\n`
    + `🔑 *Wallet Management:*\n`
    + `  - /newwallet → Generate a new Ethereum wallet\n`
    + `  - /balance <ETH_ADDRESS> → Check ETH balance of a wallet\n\n`
    + `📊 *Portfolio & Transactions:*\n`
    + `  - /portfolio <ETH_ADDRESS> → View ETH, USDT, and ERC-20 assets\n`
    + `  - /tokens <ETH_ADDRESS> → View token balances\n`
    + `  - /transactions <ETH_ADDRESS> → Fetch latest transactions\n\n`
    + `🔥 *Price & Gas Monitoring:*\n`
    + `  - /alert <PRICE> → Set an ETH price alert\n`
    + `  - /gas → Get current Ethereum gas fees\n`
    + `  - /gasalert <GAS_PRICE> → Set a gas price alert\n`
    + `  - /watch <ETH_ADDRESS> → Monitor transactions for a wallet\n`
    + `  - /price - Check the current price of Ethereum (ETH) and Solana (SOL) 🪙\n`
    + `  - /price_all - View a list of top tokens including ETH, SOL, BTC, WNCG, DOGE, and more 🪙\n `
    + `  - /supported_coins - View all supported coin symbols and names\n`
    + `  - /price_chart <symbol> - View a 7-day price chart image of a specific coin 📈\n`
    + `  - /pricemonitor → Monitor ETH price changes\n\n`
    + `💡 Type a command to get started!`;

    await sendMessage(chatId, message);
}





// 📌 Handle /balance command
async function handleBalanceCommand(chatId, ethAddress) {
    if (!ethers.isAddress(ethAddress)) {
        await sendMessage(chatId, "⚠️ Invalid Ethereum address.");
        return;
    }

    try {
        const balance = await provider.getBalance(ethAddress);
        await sendMessage(chatId, `💰 Balance of ${ethAddress}: ${ethers.formatEther(balance)} ETH`);
    } catch (error) {
        await sendMessage(chatId, "🚨 Error fetching balance.");
    }
}

async function handlePriceSymbolCommand(chatId, symbol) {
    try {
        const coinId = symbolToIdMap[symbol.toLowerCase()];

        if (!coinId) {
            await bot.sendMessage(chatId, `❌ Unsupported symbol: "${symbol}". Type /supported_coins to see available coins.`);
            return;
        }

        const priceRes = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
        const price = priceRes.data[coinId]?.usd;

        if (price === undefined) {
            await bot.sendMessage(chatId, `⚠️ Price not available for ${symbol.toUpperCase()}.`);
            return;
        }

        await bot.sendMessage(chatId, `💰 ${symbol.toUpperCase()}: $${price}`);
    } catch (error) {
        console.error("❌ Failed to fetch coin price:", error);
        await bot.sendMessage(chatId, "⚠️ Error fetching coin price.");
    }
}


// 📌 Handle /watch command 
async function handleWatchCommand(chatId, walletAddress) {
    if (!ethers.isAddress(walletAddress)) {
        await sendMessage(chatId, "⚠️ Invalid Ethereum address.");
        return;
    }

    watchlist.add(walletAddress);
    await sendMessage(chatId, `👀 Watching transactions for **${walletAddress}**.`);

    console.log(`✅ Added ${walletAddress} to watchlist.`);
}


// 📌 Check watched addresses for new transactions  
async function checkWatchedAddresses() {
    for (let address of watchlist) {
        try {
            const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=latest&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
            const response = await axios.get(url);

            if (response.data.result.length > 0) {
                const latestTx = response.data.result[0]; // Most recent transaction
                const txHash = latestTx.hash;

                if (!recentTransactions.has(txHash)) { 
                    recentTransactions.add(txHash); // Store transaction to prevent duplicate alerts

                    const message = `🔔 **New transaction detected for ${address}**\n\n` +
                                    `📤 **From**: ${latestTx.from}\n` +
                                    `📥 **To**: ${latestTx.to}\n` +
                                    `💰 **Value**: ${ethers.formatEther(latestTx.value)} ETH\n` +
                                    `🔗 [View on Etherscan](https://etherscan.io/tx/${txHash})`;

                    await sendMessage(address, message);
                    console.log(`🔔 New transaction for ${address}: ${txHash}`);
                }
            }
        } catch (error) {
            console.error(`🚨 Error fetching transactions for ${address}:`, error);
        }
    }
}

// 📌 Handle /gas command
async function handleGasCommand(chatId) {
    const url = `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${ETHERSCAN_API_KEY}`;
    try {
        const response = await axios.get(url);
        const gas = response.data.result;

        const message = `⛽ **Ethereum Gas Prices**:\n\n🚀 **Fast**: ${gas.FastGasPrice} Gwei\n🚶 **Standard**: ${gas.ProposeGasPrice} Gwei\n🐢 **Slow**: ${gas.SafeGasPrice} Gwei\n📊 **Base Fee**: ${gas.suggestBaseFee} Gwei`;

        await sendMessage(chatId, message);
    } catch (error) {
        console.error("🚨 Error fetching gas prices:", error);
        await sendMessage(chatId, "⚠️ Failed to fetch gas prices.");
    }
}
// 📌 Handle /price_all command
async function handlePriceAllCommand(chatId) {
    try {
        const url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana,bitcoin,wrapped-ncg,dogecoin,bonk,matic-network,tether,aptos,binancecoin&vs_currencies=usd';
        const response = await axios.get(url);
        const prices = response.data;

        const getPrice = (id) => prices[id]?.usd ?? "N/A";

const formatted = `
📊 Current Crypto Prices:
🔹 Ethereum (ETH): $${getPrice("ethereum")}
🔹 Solana (SOL): $${getPrice("solana")}
🔹 Bitcoin (BTC): $${getPrice("bitcoin")}
🔹 WNCG: $${getPrice("wrapped-ncg")}
🔹 Dogecoin (DOGE): $${getPrice("dogecoin")}
🔹 Bonk (BONK): $${getPrice("bonk")}
🔹 Polygon (pol-ex-matic): $${getPrice("matic-network")}
🔹 Tether (USDT): $${getPrice("tether")}
🔹 Aptos (APT): $${getPrice("aptos")}
🔹 Binance Coin (BNB): $${getPrice("binancecoin")}
`;

        await bot.sendMessage(chatId, formatted);
    } catch (error) {
        console.error("❌ Failed to fetch all prices:", error);
        await bot.sendMessage(chatId, "⚠️ Failed to fetch full price list.");
    }
}


// 📌 Handle /portfolio command 
async function handlePortfolioCommand(chatId, walletAddress) {
    if (!ethers.isAddress(walletAddress)) {
        await sendMessage(chatId, "⚠️ Invalid Ethereum address.");
        return;
    }

    try {
        let message = `📊 **Portfolio for ${walletAddress}**\n\n`;

        // ✅ 1. ETH 잔액 가져오기
        const ethBalance = await provider.getBalance(walletAddress);
        message += `💰 **ETH Balance**: ${ethers.formatEther(ethBalance)} ETH\n`;

        // ✅ 2. USDT 잔액 가져오기
        const usdtContractAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // USDT 컨트랙트 주소
        const usdtUrl = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${usdtContractAddress}&address=${walletAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
        const usdtResponse = await axios.get(usdtUrl);
        const usdtBalance = parseFloat(usdtResponse.data.result) / 1e6; // USDT는 소수점 6자리

        message += `💵 **USDT Balance**: ${usdtBalance.toFixed(2)} USDT\n`;

        // ✅ 3. ERC-20 토큰 조회
        const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${walletAddress}&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
        const response = await axios.get(url);
        let tokens = {};

        response.data.result.forEach(tx => {
            let tokenName = tx.tokenName || "Unknown";
            let decimals = parseInt(tx.tokenDecimal || "18", 10); // `tokenDecimal`이 없을 경우 기본값 18 사용
            let formattedValue = ethers.formatUnits(tx.value, decimals);

            tokens[tokenName] = (tokens[tokenName] || 0) + parseFloat(formattedValue);
        });

        message += `\n🪙 **ERC-20 Tokens:**\n`;
        if (Object.keys(tokens).length === 0) {
            message += "No tokens found.\n";
        } else {
            for (const [token, amount] of Object.entries(tokens)) {
                message += `- ${token}: ${amount.toFixed(4)}\n`;
            }
        }

        await sendMessage(chatId, message);
    } catch (error) {
        console.error("🚨 Error fetching portfolio data:", error);
        await sendMessage(chatId, "⚠️ Error fetching portfolio data. Please try again later.");
    }
}



// 🔥 `/gasalert` 명령어 처리 함수
let gasAlertThreshold = null;
let gasAlertChatId = null;

async function handleGasAlertCommand(chatId, gasPrice) {
    if (isNaN(gasPrice) || gasPrice <= 0) {
        await sendMessage(chatId, "⚠️ Please enter a valid gas price (Gwei). Example: `/gasalert 30`");
        return;
    }

    gasAlertThreshold = gasPrice;
    gasAlertChatId = chatId;

    await sendMessage(chatId, `🚨 **Gas price alert set at ${gasPrice} Gwei**. You will be notified when gas price drops below this level.`);
}


// 📌 Handle /price command
async function handlePriceCommand(chatId) {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=usd';

    try {
        const response = await axios.get(url);
        const eth = response.data.ethereum.usd;
        const sol = response.data.solana.usd;

        const message = `📊 현재 암호화폐 시세:\n` +
                        `🔹 Ethereum (ETH): $${eth}\n` +
                        `🔹 Solana (SOL): $${sol}`;

        await sendMessage(chatId, message);
    } catch (error) {
        console.error("🚨 Error fetching ETH/SOL prices:", error);
        await sendMessage(chatId, "⚠️ 가격 정보를 가져오는 데 실패했습니다.");
    }
}

async function checkGasPrice() {
    try {
        const url = `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${ETHERSCAN_API_KEY}`;
        const response = await axios.get(url);
        const gasData = response.data.result;

        const safeGasPrice = parseFloat(gasData.SafeGasPrice);
        const proposeGasPrice = parseFloat(gasData.ProposeGasPrice);
        const fastGasPrice = parseFloat(gasData.FastGasPrice);

        return `⛽ **Ethereum Gas Prices**:\n🚀 **Fast**: ${fastGasPrice} Gwei\n🚶‍♂️ **Standard**: ${proposeGasPrice} Gwei\n🐢 **Safe**: ${safeGasPrice} Gwei`;

    } catch (error) {
        console.error("🚨 Error fetching gas prices:", error);
        return "⚠️ Error fetching gas prices.";
    }
}


// ⏳ 가스 가격 모니터링 자동 실행 (1분마다)
setInterval(checkGasAlert, 60000);

// 📌 Monitor gas price
async function checkGasAlert() {
    if (gasAlertThreshold === null || gasAlertChatId === null) return; // 알람 설정이 없으면 실행 안 함.

    try {
        const url = `https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${ETHERSCAN_API_KEY}`;
        const response = await axios.get(url);
        const gasData = response.data.result;
        const proposeGasPrice = parseFloat(gasData.ProposeGasPrice);  // Standard gas price

        console.log(`⛽ Checking gas price... Current: ${proposeGasPrice} Gwei, Alert Threshold: ${gasAlertThreshold} Gwei`);

        if (proposeGasPrice <= gasAlertThreshold) {
            await sendMessage(gasAlertChatId, `🚨 **Gas Price Alert!**\nCurrent Gas Price: **${proposeGasPrice} Gwei**\n(Your alert was set at **${gasAlertThreshold} Gwei**)`);
            
            // ✅ **한 번 알림이 울린 후 초기화 (중복 알람 방지)**
            gasAlertThreshold = null;
            gasAlertChatId = null;
        }
    } catch (error) {
        console.error("🚨 Error checking gas alert:", error);
    }
}
// 📌 Handle /pricemonitor command
async function handlePriceMonitorCommand(chatId) {
    await sendMessage(chatId, "📈 Price monitoring started! I will notify you when ETH price changes significantly.");
    priceMonitorChatId = chatId;
}
let lastCheckedPrice = 0;
let priceMonitorChatId = null;

async function checkPriceMonitor() {
    if (!priceMonitorChatId) return; // 감시할 채팅이 없으면 실행하지 않음.

    try {
        const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
        const response = await axios.get(url);
        const currentPrice = response.data.ethereum.usd;

        if (lastCheckedPrice !== 0 && Math.abs((currentPrice - lastCheckedPrice) / lastCheckedPrice) >= 0.05) {
            await sendMessage(priceMonitorChatId, `🚀 ETH Price Alert! Price changed by more than 5%!\n💰 Current Price: $${currentPrice}`);
        }

        lastCheckedPrice = currentPrice;
    } catch (error) {
        console.error('🚨 Error checking ETH price:', error);
    }
}

// 🔄 주기적으로 가격 변동 체크 (1분마다 실행)
setInterval(checkPriceMonitor, 60000);


// 📌 Handle /alert command
async function handlePriceAlertCommand(chatId, price) {
    if (isNaN(price) || price <= 0) {
        await sendMessage(chatId, "⚠️ Invalid price. Enter a valid number.");
        return;
    }
    priceAlertThreshold = price;
    chatIdForPriceAlert = chatId;
    await sendMessage(chatId, `🚨 Price alert set at $${price}.`);
}

// 📌 Handle /tokens command
async function handleTokensCommand(chatId, walletAddress) {
    if (!ethers.isAddress(walletAddress)) {
        await sendMessage(chatId, "⚠️ Invalid Ethereum address. Please enter a valid address.");
        return;
    }

    const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${walletAddress}&sort=desc&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);

        if (!response.data || response.data.status !== "1" || !response.data.result || response.data.result.length === 0) {
            await sendMessage(chatId, `🪙 No ERC-20 tokens found for address: ${walletAddress}`);
            return;
        }

        let tokenBalances = {};
        let tokenContracts = new Set();

        response.data.result.forEach(tx => {
            const tokenName = tx.tokenName || "Unknown Token";
            const tokenSymbol = tx.tokenSymbol || "???";
            const contractAddress = tx.contractAddress;
            
            // 🔥 **여기서 tokenDecimal을 숫자로 변환**
            const tokenDecimal = parseInt(tx.tokenDecimal, 10);  // 문자열 → 숫자 변환
            const tokenAmount = parseFloat(ethers.formatUnits(tx.value, tokenDecimal));

            if (!tokenBalances[contractAddress]) {
                tokenBalances[contractAddress] = { 
                    name: tokenName, 
                    symbol: tokenSymbol, 
                    quantity: 0 
                };
                tokenContracts.add(contractAddress);
            }

            tokenBalances[contractAddress].quantity += tokenAmount;
        });

        // ✅ 가격 정보를 가져오기 위해 CoinGecko API 호출
        const tokenPriceUrl = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${Array.from(tokenContracts).join(',')}&vs_currencies=usd`;
        let priceData = {};

        try {
            const priceResponse = await axios.get(tokenPriceUrl);
            priceData = priceResponse.data;
        } catch (error) {
            console.warn("⚠️ Failed to fetch token prices, but proceeding...");
        }

        let message = `📊 **ERC-20 Token Balances for ${walletAddress}:**\n\n`;
        for (const [contract, info] of Object.entries(tokenBalances)) {
            const price = priceData[contract]?.usd ? `$${priceData[contract].usd.toFixed(2)}` : "-";
            const value = priceData[contract]?.usd ? `$${(priceData[contract].usd * info.quantity).toFixed(2)}` : "-";

            message += `🪙 **${info.name} (${info.symbol})**\n`;
            message += `   🔹 Quantity: ${info.quantity.toFixed(4)}\n`;
            message += `   💲 Price: ${price}\n`;
            message += `   📊 Value: ${value}\n\n`;
        }

        await sendMessage(chatId, message);
    } catch (error) {
        console.error("🚨 Error fetching token balances:", error);
        await sendMessage(chatId, "⚠️ Unable to retrieve token balances. Please check the address or try again later.");
    }
}


// 📌 Monitor ETH price
async function checkPriceAlert() {
    if (!priceAlertThreshold) return;

    try {
        const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
        const response = await axios.get(url);
        const price = response.data.ethereum.usd;

        if (price >= priceAlertThreshold) {
            await sendMessage(chatIdForPriceAlert, `🚨 Price Alert! ETH hit $${priceAlertThreshold}.`);
            priceAlertThreshold = null;
        }
    } catch (error) {
        console.error('🚨 Error fetching ETH price:', error);
    }
}

// 📌 Handle /transactions command
async function handleTransactionsCommand(chatId, walletAddress) {
    if (!ethers.isAddress(walletAddress)) {
        await sendMessage(chatId, "⚠️ Invalid Ethereum address.");
        return;
    }
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${walletAddress}&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    try {
        const response = await axios.get(url);
        const txs = response.data.result.slice(0, 5);
        let message = "📝 Recent Transactions:\n";
        for (const tx of txs) {
            message += `🔗 ${tx.hash}\n📤 From: ${tx.from}\n📥 To: ${tx.to}\n💰 Value: ${ethers.formatEther(tx.value)} ETH\n\n`;
        }
        await sendMessage(chatId, message);
    } catch (error) {
        console.error('🚨 Error fetching transactions:', error);
        await sendMessage(chatId, "⚠️ Error fetching transactions.");
    }
}



// 📌 Start bot & schedule checks
setInterval(checkGasAlert, 60000);
setInterval(checkPriceAlert, 60000);
