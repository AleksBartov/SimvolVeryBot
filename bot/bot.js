// bot/bot.js
const { Telegraf } = require('telegraf');
const ProgressManager = require('../core/ProgressManager');
const Course = require('../data/course');

class TelegramBot {
  constructor(token) {
    this.bot = new Telegraf(token);
    this.progressManager = new ProgressManager();
    this.userMessageHistory = new Map(); // Храним историю сообщений для удаления
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.start((ctx) => this.handleStart(ctx));
    this.bot.on('poll_answer', (ctx) => this.handlePollAnswer(ctx));
    this.bot.action('next', (ctx) => this.handleNext(ctx));
    this.bot.action('back', (ctx) => this.handleBack(ctx));
    this.bot.action('start_final_test', (ctx) => this.handleStartFinalTest(ctx));
    this.bot.action('restart', (ctx) => this.handleRestart(ctx));
  }

  async handleStart(ctx) {
    const userId = ctx.from.id;
    this.progressManager.resetProgress(userId);
    await this.clearUserMessages(ctx, userId); // Очищаем все предыдущие сообщения

    const message = await ctx.reply(Course.presentation.text, {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Начать изучение →', callback_data: 'next' }
        ]]
      }
    });

    this.addUserMessage(userId, message.message_id);
    this.progressManager.startCourse(userId);
  }

  async handleNext(ctx) {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;
      const nextBlock = this.progressManager.goNext(userId);

      if (!nextBlock) {
        await this.sendNewMessage(ctx, userId, 'Курс завершен!');
        return;
      }

      await this.sendBlock(ctx, nextBlock, userId);
    } catch (error) {
      console.error('Error in handleNext:', error);
      await this.sendNewMessage(ctx, userId, 'Ошибка. Попробуйте /start');
    }
  }

  async handleBack(ctx) {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;
      
      if (!this.progressManager.canGoBack(userId)) {
        await ctx.answerCbQuery('Нельзя вернуться назад');
        return;
      }

      // При возврате назад удаляем текущее сообщение
      await this.deleteLastUserMessage(ctx, userId);
      
      const prevBlock = this.progressManager.goBack(userId);
      
      if (prevBlock) {
        await this.sendBlock(ctx, prevBlock, userId);
      }
    } catch (error) {
      console.error('Error in handleBack:', error);
      await ctx.answerCbQuery('Ошибка при возврате');
    }
  }

  async sendBlock(ctx, block, userId) {
    if (!block) {
      await this.sendNewMessage(ctx, userId, 'Блок не найден');
      return;
    }

    // Удаляем предыдущее сообщение при переходе вперед (кроме самого первого перехода)
    const messageHistory = this.userMessageHistory.get(userId) || [];
    if (messageHistory.length > 1) {
      await this.deleteLastUserMessage(ctx, userId);
    }

    const canGoBack = this.progressManager.canGoBack(userId);
    const keyboard = [];

    if (canGoBack) {
      keyboard.push({ text: '← Назад', callback_data: 'back' });
    }

    if (this.shouldShowNextButton(block)) {
      keyboard.push({ text: 'Далее →', callback_data: 'next' });
    }

    if (block.type === 'knowledge') {
      await this.sendNewMessage(ctx, userId, block.content, keyboard);
    } else if (block.type === 'quiz') {
      // Для викторин отправляем новое сообщение
      const quizMessage = await ctx.replyWithQuiz(
        block.question,
        block.options,
        { 
          correct_option_id: block.correct_option_id,
          is_anonymous: false
        }
      );
      
      this.addUserMessage(userId, quizMessage.message_id);
      
      setTimeout(async () => {
        try {
          await this.sendNewMessage(ctx, userId, 'Продолжим изучение?', keyboard);
        } catch (error) {
          console.error('Error showing navigation:', error);
        }
      }, 8000);
    } else if (block.type === 'course_completed') {
      await this.showCourseCompleted(ctx, userId);
    } else if (block.type === 'final_test_start') {
      await this.sendNewMessage(ctx, userId, '📝 Начинаем финальный тест!');
      const firstQuestion = this.progressManager.goNext(userId);
      await this.sendBlock(ctx, firstQuestion, userId);
    } else if (block.type === 'final_test_completed') {
      await this.showFinalTestResults(ctx, userId);
    }
  }

  // Отправляет новое сообщение и сохраняет его в историю
  async sendNewMessage(ctx, userId, text, keyboard = []) {
    const message = await ctx.reply(text, {
      reply_markup: keyboard.length > 0 ? { inline_keyboard: [keyboard] } : undefined
    });
    
    this.addUserMessage(userId, message.message_id);
    return message;
  }

  // Добавляет сообщение в историю пользователя
  addUserMessage(userId, messageId) {
    if (!this.userMessageHistory.has(userId)) {
      this.userMessageHistory.set(userId, []);
    }
    this.userMessageHistory.get(userId).push(messageId);
  }

  // Удаляет последнее сообщение пользователя
  async deleteLastUserMessage(ctx, userId) {
    const messageHistory = this.userMessageHistory.get(userId);
    if (!messageHistory || messageHistory.length === 0) return;

    const lastMessageId = messageHistory.pop();
    
    try {
      await ctx.deleteMessage(lastMessageId);
    } catch (error) {
      console.error('Error deleting message:', error);
      // Игнорируем ошибки удаления (сообщение могло быть уже удалено)
    }
  }

  // Очищает все сообщения пользователя
  async clearUserMessages(ctx, userId) {
    const messageHistory = this.userMessageHistory.get(userId);
    if (!messageHistory) return;

    for (const messageId of messageHistory) {
      try {
        await ctx.deleteMessage(messageId);
      } catch (error) {
        console.error('Error clearing message:', error);
      }
    }
    
    this.userMessageHistory.set(userId, []);
  }

  shouldShowNextButton(block) {
    return (block.type === 'knowledge' && block.next) || 
           (block.type === 'quiz' && block.next) ||
           block.type === 'course_completed' ||
           block.type === 'final_test_completed';
  }

  async handlePollAnswer(ctx) {
    try {
      const pollAnswer = ctx.pollAnswer;
      const userId = pollAnswer.user.id;
      const currentBlock = this.progressManager.getCurrentBlock(userId);

      if (!currentBlock || currentBlock.type !== 'quiz') return;

      const isCorrect = pollAnswer.option_ids[0] === currentBlock.correct_option_id;
      
      const state = this.progressManager.getUserState(userId);
      if (state.isInFinalTest) {
        this.progressManager.handleFinalTestAnswer(userId, isCorrect);
      } else {
        this.progressManager.handleQuizAnswer(userId, isCorrect);
      }
    } catch (error) {
      console.error('Error handling poll answer:', error);
    }
  }

  async showCourseCompleted(ctx, userId) {
    const stats = this.progressManager.getProgressStats(userId);
    
    const messageText = 
      `🎉 Основной курс пройден!\n\n` +
      `Прогресс: ${stats.progress}%\n` +
      `Правильные ответы: ${stats.correctAnswers}/${stats.totalQuizzes}\n\n` +
      `Готовы к финальному тесту?`;

    await this.sendNewMessage(ctx, userId, messageText, [
      { text: 'Начать финальный тест', callback_data: 'start_final_test' }
    ]);
  }

  async handleStartFinalTest(ctx) {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;
      
      const firstQuestion = this.progressManager.startFinalTest(userId);
      if (!firstQuestion) {
        await this.sendNewMessage(ctx, userId, 'Ошибка: не удалось начать финальный тест');
        return;
      }
      
      await this.sendBlock(ctx, firstQuestion, userId);
    } catch (error) {
      console.error('Error starting final test:', error);
      await this.sendNewMessage(ctx, userId, 'Ошибка при запуске финального теста');
    }
  }

  async showFinalTestResults(ctx, userId) {
    const stats = this.progressManager.getProgressStats(userId);
    const percentage = Math.round((stats.finalTestScore / stats.totalFinalQuestions) * 100);
    
    let message = `🏆 Финальный тест завершён!\n\n`;
    message += `Результат: ${stats.finalTestScore}/${stats.totalFinalQuestions} (${percentage}%)\n\n`;
    
    if (percentage >= 80) {
      message += `🎊 Отличный результат!`;
    } else if (percentage >= 60) {
      message += `👍 Хороший результат!`;
    } else {
      message += `📚 Рекомендуем пройти курс еще раз.`;
    }
    
    await this.sendNewMessage(ctx, userId, message, [
      { text: 'Начать заново', callback_data: 'restart' }
    ]);
  }

  async handleRestart(ctx) {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;
      this.progressManager.resetProgress(userId);
      await this.clearUserMessages(ctx, userId);
      await this.handleStart(ctx);
    } catch (error) {
      console.error('Error restarting:', error);
    }
  }

  launch() {
    this.bot.launch();
    console.log('✅ Бот запущен с удалением сообщений!');
    
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

module.exports = TelegramBot;