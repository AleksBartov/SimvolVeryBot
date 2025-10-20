import userService from './userService.js';

class NotificationService {
  constructor(bot) {
    this.bot = bot;
  }

  async checkInactiveUsers() {
    try {
      const inactiveUsers = await userService.getInactiveUsers(3);
      
      for (const user of inactiveUsers) {
        await this.sendReminder(user);
      }
      
      console.log(`Sent reminders to ${inactiveUsers.length} users`);
    } catch (error) {
      console.error('Error sending reminders:', error);
    }
  }

  async sendReminder(user) {
    try {
      await this.bot.telegram.sendMessage(
        user.user_id,
        `Вы давно не заходили в бот для изучения Символа веры. Продолжим с того места, где вы остановились?`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Продолжить изучение', callback_data: 'next_step' }],
              [{ text: 'Начать сначала', callback_data: 'restart' }]
            ]
          }
        }
      );
    } catch (error) {
      if (error.code === 403) {
        console.log(`User ${user.user_id} blocked the bot`);
      }
    }
  }

  startDailyChecks() {
    setInterval(() => {
      this.checkInactiveUsers();
    }, 24 * 60 * 60 * 1000);
    
    setTimeout(() => {
      this.checkInactiveUsers();
    }, 60000);
  }
}

export default NotificationService;