// bot/bot.js
const { Telegraf } = require("telegraf");
const ProgressManager = require("../core/ProgressManager");
const Course = require("../data/course");

class TelegramBot {
  constructor(token) {
    this.bot = new Telegraf(token);
    this.progressManager = new ProgressManager();
    this.userMessageHistory = new Map(); // Храним историю сообщений для удаления
    this.setupHandlers();
  }

  setupHandlers() {
    this.bot.start((ctx) => this.handleStart(ctx));
    this.bot.on("poll_answer", (ctx) => this.handlePollAnswer(ctx));
    this.bot.action("next", (ctx) => this.handleNext(ctx));
    this.bot.action("back", (ctx) => this.handleBack(ctx));
    this.bot.action("start_final_test", (ctx) =>
      this.handleStartFinalTest(ctx)
    );
    this.bot.action("restart", (ctx) => this.handleRestart(ctx));
  }

  async handleStart(ctx) {
    const userId = ctx.from.id;
    await this.clearUserMessages(ctx, userId);

    this.progressManager.resetProgress(userId);

    const message = await ctx.reply(Course.presentation.text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Начать изучение >", callback_data: "next" }],
        ],
      },
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
        await this.sendNewMessage(ctx, userId, "Курс завершен!");
        return;
      }

      await this.sendBlock(ctx, nextBlock, userId);
    } catch (error) {
      console.error("Error in handleNext:", error);
      await this.sendNewMessage(ctx, userId, "Ошибка. Попробуйте /start");
    }
  }

  async handleBack(ctx) {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;

      if (!this.progressManager.canGoBack(userId)) {
        await ctx.answerCbQuery("Нельзя вернуться назад");
        return;
      }

      // При возврате назад удаляем текущее сообщение
      await this.deleteLastUserMessage(ctx, userId);

      const prevBlock = this.progressManager.goBack(userId);

      if (prevBlock) {
        await this.sendBlock(ctx, prevBlock, userId);
      }
    } catch (error) {
      console.error("Error in handleBack:", error);
      await ctx.answerCbQuery("Ошибка при возврате");
    }
  }

  async sendBlock(ctx, block, userId) {
    if (!block) {
      await this.sendNewMessage(ctx, userId, "Блок не найден");
      return;
    }

    // Удаляем предыдущее сообщение (кроме самого первого перехода)
    const messageHistory = this.userMessageHistory.get(userId) || [];
    if (messageHistory.length > 1) {
      await this.deleteLastUserMessage(ctx, userId);
    }

    const canGoBack = this.progressManager.canGoBack(userId);
    const keyboard = [];

    if (canGoBack) {
      keyboard.push({ text: "◀ Назад", callback_data: "back" });
    }

    // Всегда показываем кнопку "Дальше" для блоков знаний и квизов
    if (this.shouldShowNextButton(block)) {
      keyboard.push({ text: "Дальше >", callback_data: "next" });
    }

    if (block.type === "knowledge") {
      await this.sendNewMessage(ctx, userId, block.content, keyboard);
    } else if (block.type === "quiz") {
      // Для викторин отправляем новое сообщение
      const quizMessage = await ctx.replyWithQuiz(
        block.question,
        block.options,
        {
          correct_option_id: block.correct_option_id,
          is_anonymous: false,
        }
      );

      this.addUserMessage(userId, quizMessage.message_id);

      setTimeout(async () => {
        try {
          await this.sendNewMessage(
            ctx,
            userId,
            "Продолжить изучение?",
            keyboard
          );
        } catch (error) {
          console.error("Error showing navigation:", error);
        }
      }, 8000);
    } else if (block.type === "course_completed") {
      await this.showCourseCompleted(ctx, userId);
    } else if (block.type === "final_test_start") {
      await this.sendNewMessage(ctx, userId, "Начинаем финальный тест!");
      const firstQuestion = this.progressManager.goNext(userId);
      await this.sendBlock(ctx, firstQuestion, userId);
    } else if (block.type === "final_test_completed") {
      await this.showFinalTestResults(ctx, userId);
    }
  }

  shouldShowNextButton(block) {
    if (
      block.type === "course_completed" ||
      block.type === "final_test_completed" ||
      block.type === "final_test_start"
    ) {
      return false;
    }
    return true;
  }

  async showCourseCompleted(ctx, userId) {
    const stats = this.progressManager.getProgressStats(userId);

    const messageText =
      "Основной курс пройден!\n\n" +
      `Прогресс: ${stats.progress}%\n` +
      `Правильные ответы: ${stats.correctAnswers}/${stats.totalQuizzes}\n\n` +
      "Готовы к финальному тесту?";

    await this.sendNewMessage(ctx, userId, messageText, [
      { text: "Начать финальный тест", callback_data: "start_final_test" },
    ]);
  }

  async handleStartFinalTest(ctx) {
    try {
      await ctx.answerCbQuery();
      const userId = ctx.from.id;

      const firstQuestion = this.progressManager.startFinalTest(userId);
      if (!firstQuestion) {
        await this.sendNewMessage(
          ctx,
          userId,
          "Ошибка: Не удалось начать финальный тест"
        );
        return;
      }

      await this.sendBlock(ctx, firstQuestion, userId);
    } catch (error) {
      console.error("Error starting final test:", error);
      await this.sendNewMessage(
        ctx,
        userId,
        "Ошибка при запуске финального теста"
      );
    }
  }

  async showFinalTestResults(ctx, userId) {
    const stats = this.progressManager.getProgressStats(userId);
    const percentage = Math.round(
      (stats.finalTestScore / stats.totalFinalQuestions) * 100
    );

    let message = "Финальный тест завершен!\n\n";
    message += `Результат: ${stats.finalTestScore}/${stats.totalFinalQuestions} (${percentage}%)\n\n`;

    if (percentage >= 80) {
      message += "Отличный результат!";
    } else if (percentage >= 60) {
      message += "Хороший результат!";
    } else {
      message += "Рекомендуем пройти курс еще раз.";
    }

    await this.sendNewMessage(ctx, userId, message, [
      { text: "Начать заново", callback_data: "restart" },
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
      console.error("Error restarting:", error);
    }
  }

  async handlePollAnswer(ctx) {
    try {
      const userId = ctx.pollAnswer.user.id;
      const pollId = ctx.pollAnswer.poll_id;
      const selectedOption = ctx.pollAnswer.option_ids[0];

      // Здесь можно добавить логику проверки правильности ответа
      console.log(
        `User ${userId} answered option ${selectedOption} for poll ${pollId}`
      );
    } catch (error) {
      console.error("Error handling poll answer:", error);
    }
  }

  // Вспомогательные методы для управления сообщениями
  addUserMessage(userId, messageId) {
    if (!this.userMessageHistory.has(userId)) {
      this.userMessageHistory.set(userId, []);
    }
    this.userMessageHistory.get(userId).push(messageId);
  }

  async deleteLastUserMessage(ctx, userId) {
    const messageHistory = this.userMessageHistory.get(userId);
    if (messageHistory && messageHistory.length > 0) {
      const lastMessageId = messageHistory.pop();
      try {
        await ctx.deleteMessage(lastMessageId);
      } catch (error) {
        console.error("Error deleting message:", error);
      }
    }
  }

  async clearUserMessages(ctx, userId) {
    const messageHistory = this.userMessageHistory.get(userId);
    if (messageHistory) {
      for (const messageId of messageHistory) {
        try {
          await ctx.deleteMessage(messageId);
        } catch (error) {
          console.error("Error clearing messages:", error);
        }
      }
      this.userMessageHistory.set(userId, []);
    }
  }

  async sendNewMessage(ctx, userId, text, buttons = []) {
    const keyboard =
      buttons.length > 0 ? { inline_keyboard: [buttons] } : undefined;

    const message = await ctx.reply(text, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });

    this.addUserMessage(userId, message.message_id);
    return message;
  }

  launch() {
    this.bot.launch();
    console.log("✅ Бот запущен с исправленной логикой!");

    process.once("SIGINT", () => this.bot.stop("SIGINT"));
    process.once("SIGTERM", () => this.bot.stop("SIGTERM"));
  }
}

module.exports = TelegramBot;
