
import { Telegraf } from 'telegraf';
import express from 'express';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import FlowHandler from './handlers/flowHandler.js';
import NavigationHandler from './handlers/navigationHandler.js';
import startHandler from './handlers/startHandler.js';
import NotificationService from './services/notificationService.js';
import userService from './services/userService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Загрузка конфигурации потока
const flowConfig = JSON.parse(
  readFileSync(join(__dirname, 'data', 'flow.json'), 'utf-8')
);

// Инициализация обработчиков
const flowHandler = new FlowHandler(flowConfig);
const navigationHandler = new NavigationHandler(flowHandler);

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// Инициализация сервиса напоминаний
const notificationService = new NotificationService(bot);
notificationService.startDailyChecks();

// Обработчики
bot.start((ctx) => startHandler.handleStart(ctx, flowHandler));
bot.action('next_step', (ctx) => navigationHandler.handleNextStep(ctx));
bot.action('prev_step', (ctx) => navigationHandler.handlePrevStep(ctx));
bot.action('restart', (ctx) => startHandler.handleStart(ctx, flowHandler));

// Обработка ответов на тесты
bot.action(/quiz_answer_(\d+)_(\d+)/, async (ctx) => {
  const questionIndex = parseInt(ctx.match[1]);
  const answerIndex = parseInt(ctx.match[2]);
  await flowHandler.handleQuizAnswer(ctx, questionIndex, answerIndex);
});

// Обработчик всех текстовых сообщений
bot.on('text', async (ctx) => {
  await ctx.replyWithMarkdown(
    '⚠️ *Для работы с ботом используйте кнопки навигации*',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Начать сначала', callback_data: 'restart' }]
        ]
      }
    }
  );
});

// Обработчик медиа-файлов
bot.on(['photo', 'video', 'audio', 'document', 'voice', 'sticker'], async (ctx) => {
  await ctx.replyWithMarkdown(
    '⚠️ *Для работы с ботом используйте кнопки навигации*',
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
  console.error(`❌ Global error:`, err);
  ctx.replyWithMarkdown(
    '⚠️ *Произошла непредвиденная ошибка*',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Начать сначала', callback_data: 'restart' }]
        ]
      }
    }
  );
});

// Запуск бота
bot.launch().then(() => {
  console.log('🤖 Бот запущен!');
  console.log(`📊 Загружено ${flowHandler.getTotalSteps()} шагов обучения`);
}).catch(err => {
  console.error('❌ Failed to launch bot:', err);
});

// Express сервер
app.use(express.json());
app.get('/', (req, res) => {
  res.send('Бот для изучения Символа Веры активен!');
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Сервер запущен на порту ${process.env.PORT || 3000}`);
});

// Элегантное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
