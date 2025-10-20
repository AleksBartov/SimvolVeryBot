import { Telegraf } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';
import startHandler from './handlers/startHandler.js';
import navigationHandler from './handlers/navigationHandler.js';
import NotificationService from './services/notificationService.js';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// Инициализация сервиса напоминаний
const notificationService = new NotificationService(bot);
notificationService.startDailyChecks();

// Обработчики
bot.start((ctx) => startHandler.handleStart(ctx));
bot.action('next_step', (ctx) => navigationHandler.handleNextStep(ctx));
bot.action('prev_step', (ctx) => navigationHandler.handlePrevStep(ctx));
bot.action('restart', (ctx) => startHandler.handleStart(ctx));

// Обработчик ВСЕХ текстовых сообщений (кроме команд)
bot.on('text', async (ctx) => {
  // Показываем alert-сообщение
  await ctx.replyWithMarkdown(
    '⚠️ *Для работы с ботом используйте кнопки навигации "Далее" или "Назад"*',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Начать сначала', callback_data: 'restart' }]
        ]
      }
    }
  );
});

// Обработчик ВСЕХ медиа-файлов
bot.on(['photo', 'video', 'audio', 'document', 'voice', 'sticker'], async (ctx) => {
  await ctx.replyWithMarkdown(
    '⚠️ *Для работы с ботом используйте кнопки навигации "Далее" или "Назад"*',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Начать сначала', callback_data: 'restart' }]
        ]
      }
    }
  );
});

// Обработчик ВСЕХ остальных типов сообщений
bot.on('message', async (ctx) => {
  await ctx.replyWithMarkdown(
    '⚠️ *Для работы с ботом используйте кнопки навигации "Далее" или "Назад"*',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Начать сначала', callback_data: 'restart' }]
        ]
      }
    }
  );
});

// Обработчик ВСЕХ неизвестных callback_data
bot.on('callback_query', async (ctx) => {
  // Отвечаем на callback_query чтобы убрать "часики"
  await ctx.answerCbQuery();
  
  await ctx.replyWithMarkdown(
    '⚠️ *Неизвестная команда. Для работы с ботом используйте кнопки навигации*',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Начать сначала', callback_data: 'restart' }]
        ]
      }
    }
  );
});

// Глобальный обработчик ошибок
bot.catch((err, ctx) => {
  console.error(`❌ Global error for ${ctx.updateType}:`, err);
  
  // Пытаемся отправить сообщение об ошибке пользователю
  ctx.replyWithMarkdown(
    '⚠️ *Произошла непредвиденная ошибка*',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Начать сначала', callback_data: 'restart' }]
        ]
      }
    }
  ).catch(e => {
    console.error('Even error message failed:', e);
  });
});

// Запуск бота
bot.launch().then(() => {
  console.log('🤖 Бот запущен!');
}).catch(err => {
  console.error('❌ Failed to launch bot:', err);
});

// Express для веб-хуков
app.use(express.json());
app.get('/', (req, res) => {
  res.send('Бот для изучения Символа Веры активен!');
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Сервер запущен на порту ${process.env.PORT || 3000}`);
});

// Элегантное завершение работы
process.once('SIGINT', () => {
  console.log('🛑 Bot stopping (SIGINT)');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('🛑 Bot stopping (SIGTERM)');
  bot.stop('SIGTERM');
});

// Обработчик необработанных исключений
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});