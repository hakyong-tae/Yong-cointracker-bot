import express from 'express';
import telegramBot from './telegramBot.js'; // Import your bot logic

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 🔹 Forward Webhook Updates to `telegramBot.js`
app.post('/webhook', async (req, res) => {
    console.log('📩 Received Webhook:', JSON.stringify(req.body, null, 2));

    if (req.body.message) {
        await telegramBot.handleMessage(req.body.message); // Call function from telegramBot.js
    }

    res.sendStatus(200); // Acknowledge Telegram
});

// 🔹 Start Server
app.listen(PORT, () => {
    console.log(`🚀 Express server running on port ${PORT}`);
});
