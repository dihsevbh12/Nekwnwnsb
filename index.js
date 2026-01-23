const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: true});

console.log('Bot started successfully on Scalingo!');

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Bot is working on Scalingo!');
});
