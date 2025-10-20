import userService from '../services/userService.js';
import messages from '../data/messages.js';
import { Markup } from 'telegraf';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class NavigationHandler {
  async handleNextStep(ctx) {
    const userId = ctx.from.id;
    
    try {
      const user = await userService.getUser(userId);
      const nextStep = user.current_step + 1;
      
      await userService.updateUserStep(userId, nextStep);
      await this.deleteMessage(ctx);
      
      await this.sendStepContent(ctx, nextStep);
      
    } catch (error) {
      console.error('Error in next step:', error);
      await ctx.reply('Произошла ошибка. Пожалуйста, начните снова с /start');
    }
  }

  async handlePrevStep(ctx) {
    const userId = ctx.from.id;
    
    try {
      const user = await userService.getUser(userId);
      const prevStep = Math.max(0, user.current_step - 1);
      
      await userService.updateUserStep(userId, prevStep);
      await this.deleteMessage(ctx);
      
      await this.sendStepContent(ctx, prevStep);
      
    } catch (error) {
      console.error('Error in prev step:', error);
      await ctx.reply('Произошла ошибка. Пожалуйста, начните снова с /start');
    }
  }

  async sendStepContent(ctx, step) {
    switch (step) {
      case 0:
        await ctx.replyWithMarkdown(messages.welcome);
        await ctx.replyWithMarkdown(
          messages.readyPrompt,
          this.getNavigationKeyboard(0)
        );
        break;
        
      case 1:
        await ctx.replyWithMarkdown(messages.creedPresentation);
        
        // Отправляем аудиозапись
        await ctx.replyWithMarkdown(messages.audioReady);
        
        try {
          const audioPath = join(__dirname, '../data/audio/SimvolVery.ogg');
          await ctx.replyWithAudio(
            { source: audioPath },
            {
              caption: '🎵 Символ веры',
              ...this.getNavigationKeyboard(1)
            }
          );
        } catch (audioError) {
          console.error('Error sending audio:', audioError);
          await ctx.replyWithMarkdown(
            '❌ Не удалось загрузить аудиозапись. Продолжаем с текстовой версии.',
            this.getNavigationKeyboard(1)
          );
        }
        break;
        
      case 2:
        await ctx.replyWithMarkdown(messages.afterCreedText);
        await ctx.replyWithMarkdown(
          messages.studyInvitation,
          this.getNavigationKeyboard(2)
        );
        break;
        
      default:
        await ctx.replyWithMarkdown(
          '🎉 *Отлично!* На этом этапе мы можем начать углубленное изучение Символа Веры.\n\n*Разработка продолжается...*',
          Markup.inlineKeyboard([
            Markup.button.callback('🔄 Начать сначала', 'restart')
          ])
        );
    }
  }

  getNavigationKeyboard(step) {
    const buttons = [];
    
    if (step > 0) {
      buttons.push(Markup.button.callback('◀️ Назад', 'prev_step'));
    }
    
    if (step < 3) {
      buttons.push(Markup.button.callback('➡️ Далее', 'next_step'));
    }
    
    return Markup.inlineKeyboard(buttons);
  }

  async deleteMessage(ctx) {
    try {
      await ctx.deleteMessage();
    } catch (error) {
      // Игнорируем ошибки удаления сообщения
    }
  }
}

export default new NavigationHandler();