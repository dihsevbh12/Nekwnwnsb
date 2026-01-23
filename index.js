const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Инициализация бота
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
});

console.log('🤖 Bot started on Scalingo');

// Проверяем переменные окружения
console.log('Environment check:', {
  tokenExists: !!process.env.TELEGRAM_BOT_TOKEN,
  supabaseUrlExists: !!process.env.SUPABASE_URL,
  supabaseKeyExists: !!process.env.SUPABASE_SERVICE_KEY,
  nodeVersion: process.version
});

// Простая команда для теста
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '✅ Bot is working on Scalingo!');
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  bot.stopPolling();
  process.exit(0);
});
