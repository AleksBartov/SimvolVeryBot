// index.js
const TelegramBot = require('./bot/bot');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN);
bot.launch();
