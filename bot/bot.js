
// bot/bot.js
const { Telegraf } = require('telegraf');
const ProgressManager = require('../core/ProgressManager');
const Course = require('../data/course');

class TelegramBot {
  constructor(token) {
    this.bot = new Telegraf(token);
    this.progressManager = new ProgressManager();
    this.setupHandlers();
  }

  setupHandlers() {
    // Стартовая команда
    this.bot.start((ctx) => this.handleStart(ctx));

    // Обработка ответов в викторинах
    this.bot.on('poll_answer', (ctx) => this.handlePollAnswer(ctx));

    // Кнопка "Далее"
    this.bot.action('next', (ctx) => this.handleNext(ctx));

    // Начать финальный тест
    this.bot.action('start_final_test', (ctx) => this.handleStartFinalTest(ctx));

    // Сброс прогресса (для отладки)
    this.bot.command('reset', (ctx) => this.handleReset(ctx));
  }

  async handleStart(ctx) {
    const userId = ctx.from.id;
    
    // Сбрасываем прогресс при каждом старте
    this.progressManager.resetProgress(userId);
    
    // Показываем презентацию
    await ctx.replyWithMarkdown(Course.presentation.text, {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Начать изучение →', callback_data: 'next' }
        ]]
      }
    });
  }

  async handleNext(ctx) {
    try {
      await ctx.answerCbQuery(); // Подтверждаем нажатие кнопки
      const userId = ctx.from.id;
      const block = this.progressManager.getNextBlock(userId);

      await this.sendBlock(ctx, block, userId);
    } catch (error) {
      console.error('Error in handleNext:', error);
      await ctx.reply('Произошла ошибка. Попробуйте снова /start');
    }
  }

  async sendBlock(ctx, block, userId) {
    if (!block) {
      await ctx.reply('Блок не найден');
      return;
    }

    if (block.type === 'knowledge') {
      await ctx.replyWithMarkdown(block.content, {
        reply_markup: {
          inline_keyboard: [[
            { text: 'Далее →', callback_data: 'next' }
          ]]
        }
      });
    } else if (block.type === 'quiz') {
      await ctx.replyWithQuiz(
        block.question,
        block.options,
        { 
          correct_option_id: block.correct_option_id,
          is_anonymous: false
        }
      );
      
      // После викторины автоматически показываем кнопку "Далее"
      // Ждем немного перед показом кнопки
      setTimeout(async () => {
        try {
          await ctx.reply('Продолжим изучение?', {
            reply_markup: {
              inline_keyboard: [[
                { text: 'Продолжить →', callback_data: 'next' }
              ]]
            }
          });
        } catch (error) {
          console.error('Error showing continue button:', error);
        }
      }, 8000); // Через 8 секунд после начала викторины
    } else if (block.type === 'course_completed') {
      await this.showCourseCompleted(ctx, userId);
    } else if (block.type === 'final_test_completed') {
      await this.showFinalTestResults(ctx, userId);
    }
  }

  async handlePollAnswer(ctx) {
    try {
      const pollAnswer = ctx.pollAnswer;
      const userId = pollAnswer.user.id;
      
      // Получаем текущий блок для пользователя
      const state = this.progressManager.getUserState(userId);
      let currentBlock;
      
      if (state.isInFinalTest) {
        currentBlock = Course.finalTest[state.finalTestIndex - 1]; // -1 потому что индекс уже увеличен
      } else {
        currentBlock = Course.blocks[state.currentBlockIndex];
      }

      if (!currentBlock || currentBlock.type !== 'quiz') {
        return;
      }

      const isCorrect = pollAnswer.option_ids[0] === currentBlock.correct_option_id;
      
      if (state.isInFinalTest) {
        this.progressManager.handleFinalTestAnswer(userId, isCorrect);
      } else {
        this.progressManager.handleQuizAnswer(userId, isCorrect);
        
        // Показываем результат (опционально)
        const resultText = isCorrect ? '✅ Правильно!' : '❌ Неправильно';
        // Можно сохранить это сообщение и отправить пользователю, 
        // но будем осторожны с спамом
      }
    } catch (error) {
      console.error('Error handling poll answer:', error);
    }
  }

  async showCourseCompleted(ctx, userId) {
    const stats = this.progressManager.getProgressStats(userId);
    
    await ctx.replyWithMarkdown(
      `🎉 *Поздравляем! Основной курс пройден!*\n\n` +
      `Ваш прогресс: ${stats.progress}%\n` +
      `Правильных ответов в викторинах: ${stats.correctAnswers}/${stats.totalQuizzes}\n\n` +
      `Готовы к финальному тесту?`
    , {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Начать финальный тест', callback_data: 'start_final_test' }
        ]]
      }
    });
  }

  async handleStartFinalTest(ctx) {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;
      const firstQuestion = this.progressManager.startFinalTest(userId);
      
      await ctx.replyWithMarkdown('📝 *Финальный тест из 5 вопросов*\n\nОтветьте на все вопросы для завершения курса.');
      await this.sendBlock(ctx, firstQuestion, userId);
    } catch (error) {
      console.error('Error starting final test:', error);
    }
  }

  async showFinalTestResults(ctx, userId) {
    const stats = this.progressManager.getProgressStats(userId);
    const percentage = Math.round((stats.finalTestScore / stats.totalFinalQuestions) * 100);
    
    let message = `🏆 *Финальный тест завершён!*\n\n`;
    message += `Ваш результат: ${stats.finalTestScore}/${stats.totalFinalQuestions} (${percentage}%)\n\n`;
    
    if (percentage >= 80) {
      message += `🎊 Отличный результат! Вы хорошо усвоили материал.`;
    } else if (percentage >= 60) {
      message += `👍 Хороший результат! Основные моменты вы запомнили.`;
    } else {
      message += `📚 Рекомендуем пройти курс еще раз для закрепления материала.`;
    }
    
    await ctx.replyWithMarkdown(message, {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Начать заново', callback_data: 'restart' }
        ]]
      }
    });
  }

  async handleReset(ctx) {
    const userId = ctx.from.id;
    this.progressManager.resetProgress(userId);
    await ctx.reply('Прогресс сброшен. Используйте /start для начала.');
  }

  launch() {
    this.bot.launch();
    console.log('Бот запущен!');
    
    // Включим graceful shutdown
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

module.exports = TelegramBot;