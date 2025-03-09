import 'dotenv/config'; // dotenv 설정 추가
import fetch from 'node-fetch';
import axios from 'axios';
import { ethers } from "ethers";
import express from 'express';
import bodyParser from 'body-parser';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const INFURA_API_KEY = process.env.INFURA_API_KEY;
const API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${INFURA_API_KEY}`);
const WEBHOOK_URL = process.env.WEBHOOK_URL;  // Render에서 환경 변수로 설정할 예정



let watchlist = new Set(); // Wallets to monitor
let lastPrice = 0;
let priceAlertThreshold = null;
let chatIdForPriceAlert = null;
let chatIdForGasAlert = null;
let lastUpdateId = 0; 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Telegram Webhook 설정
app.post(`/webhook/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
    const { message } = req.body;
    if (message) {
        const chatId = message.chat.id;
        const text = message.text;

        await axios.post(`${API_URL}/sendMessage`, {
            chat_id: chatId,
            text: `You said: ${text}`,
        });
    }
    res.sendStatus(200);
});

// 📌 Set webhook when server starts
app.listen(PORT, async () => {
    console.log(`🚀 Telegram bot is running on port ${PORT}`);

    try {
        await axios.post(`${API_URL}/setWebhook`, { url: `${WEBHOOK_URL}/webhook/${TELEGRAM_BOT_TOKEN}` });
        console.log(`✅ Webhook set to: ${WEBHOOK_URL}/webhook/${TELEGRAM_BOT_TOKEN}`);
    } catch (error) {
        console.error("❌ Failed to set webhook:", error.response ? error.response.data : error.message);
    }
});

// 📌 Handle incoming webhook messages
app.post('/webhook', async (req, res) => {
    console.log('📩 Webhook received:', req.body);

    if (req.body.message) {
        await handleIncomingMessage(req.body);
    }

    res.sendStatus(200); // ✅ Respond OK to Telegram
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
        await fetch(`${API_URL}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text })
        });
    } catch (error) {
        console.error('🚨 Error sending message:', error);
    }
}

// 📌 Handle /start command
async function handleStartCommand(chatId) {
    const message = `👋 Welcome to the Ethereum Bot! 🚀

🔑 **/newwallet** → Generate a new Ethereum wallet  
💰 **/balance <ETH_ADDRESS>** → Check ETH balance of a wallet  
📊 **/portfolio <ETH_ADDRESS>** → View ETH, USDT, and ERC-20 assets  
🔍 **/tokens <ETH_ADDRESS>** → View token balances  
📝 **/transactions <ETH_ADDRESS>** → Fetch latest transactions  
🔥 **/alert <PRICE>** → Set an ETH price alert  
⛽ **/gas** → Get current Ethereum gas fees  
🚨 **/gasalert <GAS_PRICE>** → Set a gas price alert  
👀 **/watch <ETH_ADDRESS>** → Monitor transactions for a wallet  
📈 **/pricemonitor** → Monitor ETH price changes  

💡 Type a command to get started!`;

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

// 📌 Handle messages
async function handleIncomingMessage(update) {
    if (!update.message) return;
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    console.log(`📩 New message received: ${text}`);

    if (text.startsWith('/start')) {
        await handleStartCommand(chatId);
    } else if (text.startsWith('/gasalert ')) {
        await handleGasAlertCommand(chatId, parseFloat(text.split(' ')[1]));
    } else if (text === '/gasalert') {
        await sendMessage(chatId, "⚠️ Please provide a gas price for alert. Example: `/gasalert 30`");
    } else if (text.startsWith('/gas')) {
        await handleGasCommand(chatId);
    } else if (text.startsWith('/alert ')) {
        const price = parseFloat(text.split(' ')[1]);
        if (isNaN(price)) {
            await sendMessage(chatId, "⚠️ Please enter a valid price. Example: `/alert 2500`");
        } else {
            await handlePriceAlertCommand(chatId, price);
        }
    } else if (text.startsWith('/newwallet')) {
        await handleNewWalletCommand(chatId);
    } else if (text.startsWith('/portfolio ')) {
        await handlePortfolioCommand(chatId, text.split(' ')[1]);
    } else if (text.startsWith('/transactions ')) {
        const walletAddress = text.split(' ')[1];
        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            await sendMessage(chatId, "⚠️ Please enter a valid Ethereum address. Example: `/transactions 0x123...abc`");
        } else {
            await handleTransactionsCommand(chatId, walletAddress);
        }
    }     else if (text.startsWith('/watch ')) {
        const walletAddress = text.split(' ')[1];
        await handleWatchCommand(chatId, walletAddress);
    } else if (text.startsWith('/tokens ')) {
        const walletAddress = text.split(' ')[1];
        await handleTokensCommand(chatId, walletAddress);
    } else if (text.startsWith('/pricemonitor')) {
        await handlePriceMonitorCommand(chatId);
    } else if (text.startsWith('/balance ')) {
        const walletAddress = text.split(' ')[1];
        if (!walletAddress || !ethers.isAddress(walletAddress)) {
            await sendMessage(chatId, "⚠️ Please enter a valid Ethereum address. Example: `/balance 0x123...abc`");
        } else {
            await handleBalanceCommand(chatId, walletAddress);
        }
    } else {
        await sendMessage(chatId, "⚠️ Invalid command.");
    }
}


// 📌 Start bot & schedule checks
setInterval(checkGasAlert, 60000);
setInterval(checkPriceAlert, 60000);
