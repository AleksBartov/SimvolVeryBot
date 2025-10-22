
import userService from '../services/userService.js';
import { Markup } from 'telegraf';

class StartHandler {
  async handleStart(ctx, flowHandler = null) {
    const userId = ctx.from.id;
    const userData = {
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name
    };

    try {
      const user = await userService.getUser(userId, userData);
      
      const lastActivity = new Date(user.last_activity);
      const now = new Date();
      const daysDiff = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
      
      let welcomeMessage = "Добро пожаловать!";
      
      if (daysDiff > 1 && user.current_step > 0) {
        const daysText = daysDiff === 1 ? 'день' : daysDiff <= 4 ? 'дня' : 'дней';
        welcomeMessage = `Рады снова видеть вас! Вы возвращаетесь после ${daysDiff} ${daysText}. Продолжим?`;
      }

      await userService.updateUserStep(userId, 0);

      // Если передан flowHandler, начинаем с первого шага
      if (flowHandler) {
        await flowHandler.handleStep(ctx, 0);
      } else {
        // Стандартное приветствие
        await ctx.replyWithMarkdown(welcomeMessage);
        await ctx.replyWithMarkdown(
          'Используйте кнопки для навигации:',
          Markup.inlineKeyboard([
            Markup.button.callback('➡️ Начать изучение', 'next_step')
          ])
        );
      }

    } catch (error) {
      console.error('Error in start handler:', error);
      await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте еще раз.');
    }
  }
}

export default new StartHandler();
