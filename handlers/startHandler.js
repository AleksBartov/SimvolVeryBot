import userService from '../services/userService.js';
import messages from '../data/messages.js';
import { Markup } from 'telegraf';

class StartHandler {
  async handleStart(ctx) {
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
      
      let welcomeMessage = messages.welcome;
      
      if (daysDiff > 1 && user.current_step > 0) {
        welcomeMessage = messages.welcomeBack(daysDiff) + '\n\n' + messages.welcome;
      }

      await userService.updateUserStep(userId, 0);

      await ctx.replyWithMarkdown(welcomeMessage);
      
      await ctx.replyWithMarkdown(
        messages.readyPrompt,
        this.getNavigationKeyboard(0)
      );

    } catch (error) {
      console.error('Error in start handler:', error);
      await ctx.reply('Произошла ошибка. Пожалуйста, попробуйте еще раз.');
    }
  }

  getNavigationKeyboard(step) {
    const buttons = [];
    
    if (step > 0) {
      buttons.push(Markup.button.callback('◀️ Назад', 'prev_step'));
    }
    
    buttons.push(Markup.button.callback('➡️ Далее', 'next_step'));
    
    return Markup.inlineKeyboard(buttons);
  }
}

export default new StartHandler();