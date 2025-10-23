import userService from "../services/userService.js";
import { Markup } from "telegraf";

class NavigationHandler {
  constructor(flowHandler) {
    this.flowHandler = flowHandler;
  }

  async handleNextStep(ctx) {
    const userId = ctx.from.id;

    try {
      const user = await userService.getUser(userId);
      const nextStep = user.current_step + 1;

      console.log(
        `🔄 [Navigation] User ${userId}: ${user.current_step} -> ${nextStep}`
      );

      await userService.updateUserStep(userId, nextStep);
      await this.deleteMessage(ctx);

      const handled = await this.flowHandler.handleStep(ctx, nextStep);

      if (!handled) {
        await this.showCompletionMessage(ctx);
      }
    } catch (error) {
      console.error("❌ Error in next step:", error);
      await ctx.reply(
        "❌ Произошла ошибка. Пожалуйста, начните снова с /start"
      );
    }
  }

  async handlePrevStep(ctx) {
    const userId = ctx.from.id;

    try {
      const user = await userService.getUser(userId);
      const prevStep = Math.max(0, user.current_step - 1);

      console.log(
        `🔄 [Navigation] User ${userId}: ${user.current_step} -> ${prevStep}`
      );

      await userService.updateUserStep(userId, prevStep);
      await this.deleteMessage(ctx);

      const handled = await this.flowHandler.handleStep(ctx, prevStep);

      if (!handled) {
        await this.showCompletionMessage(ctx);
      }
    } catch (error) {
      console.error("❌ Error in prev step:", error);
      await ctx.reply(
        "❌ Произошла ошибка. Пожалуйста, начните снова с /start"
      );
    }
  }

  async showCompletionMessage(ctx) {
    await ctx.replyWithMarkdown(
      "🎉 *Обучение завершено!*\n\nВы прошли все доступные на данный момент материалы.\n\n*Следующие шаги:*\n• Повторите пройденный материал\n• Обратитесь к духовному наставнику\n• Приходите на богослужения",
      Markup.inlineKeyboard([
        [Markup.button.callback("🔄 Начать сначала", "restart")],
      ])
    );
  }

  async deleteMessage(ctx) {
    try {
      await ctx.deleteMessage();
    } catch (error) {
      // Игнорируем ошибки удаления
    }
  }
}

export default NavigationHandler;
