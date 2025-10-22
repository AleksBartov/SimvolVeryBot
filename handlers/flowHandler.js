
import { Markup } from 'telegraf';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class FlowHandler {
  constructor(flowConfig) {
    this.flow = flowConfig;
    this.stepMap = this.buildStepMap();
    this.userProgress = new Map(); // Для хранения прогресса тестов
  }

  buildStepMap() {
    let globalStep = 0;
    const map = {};
    
    this.flow.sections.forEach(section => {
      if (section.type === 'knowledge') {
        section.steps.forEach(step => {
          map[globalStep] = { 
            section: section.id, 
            step: step.id, 
            type: 'knowledge',
            data: step
          };
          globalStep++;
        });
      } else if (section.type === 'quiz') {
        map[globalStep] = { 
          section: section.id, 
          type: 'quiz',
          data: section
        };
        globalStep++;
      }
    });
    
    console.log(`🗺️ Built step map with ${Object.keys(map).length} steps`);
    return map;
  }

  async handleStep(ctx, stepNumber) {
    const stepInfo = this.stepMap[stepNumber];
    
    if (!stepInfo) {
      console.log(`❌ No step info for step ${stepNumber}`);
      return false;
    }

    console.log(`🎯 Handling step ${stepNumber}: ${stepInfo.type} - ${stepInfo.section}`);

    try {
      if (stepInfo.type === 'knowledge') {
        await this.handleKnowledgeStep(ctx, stepInfo, stepNumber);
      } else if (stepInfo.type === 'quiz') {
        await this.handleQuizStep(ctx, stepInfo, stepNumber);
      }
      
      return true;
    } catch (error) {
      console.error(`Error handling step ${stepNumber}:`, error);
      await ctx.reply('Произошла ошибка при загрузке контента. Пожалуйста, попробуйте снова.');
      return false;
    }
  }

  async handleKnowledgeStep(ctx, stepInfo, stepNumber) {
    const step = stepInfo.data;
    const keyboard = this.buildNavigationKeyboard(stepNumber);

    if (step.type === 'audio') {
      // Сначала отправляем текстовое сообщение
      if (step.message) {
        await ctx.replyWithMarkdown(step.message);
      }
      
      // Затем аудио с подписью
      try {
        const audioPath = join(__dirname, '../data/audio', step.file);
        await ctx.replyWithAudio(
          { source: audioPath },
          {
            caption: step.caption || '🎵 Аудиозапись',
            ...keyboard
          }
        );
      } catch (audioError) {
        console.error('Error sending audio:', audioError);
        await ctx.replyWithMarkdown(
          '❌ Не удалось загрузить аудиозапись.',
          keyboard
        );
      }
    } else {
      // Обычное текстовое сообщение
      await ctx.replyWithMarkdown(step.message, keyboard);
    }
  }

  async handleQuizStep(ctx, stepInfo, stepNumber) {
    const quiz = stepInfo.data;
    const userId = ctx.from.id;

    // Если это начало теста - инициализируем прогресс
    if (!this.userProgress.has(userId)) {
      this.userProgress.set(userId, {
        currentQuestion: 0,
        score: 0,
        quizId: quiz.id
      });

      // Отправляем заголовок теста
      await ctx.replyWithMarkdown(`*${quiz.title}*\n\n${quiz.description}`);
    }

    await this.sendQuizQuestion(ctx, userId, quiz);
  }

  async sendQuizQuestion(ctx, userId, quiz) {
    const progress = this.userProgress.get(userId);
    const question = quiz.questions[progress.currentQuestion];

    if (!question) {
      await this.completeQuiz(ctx, userId, quiz);
      return;
    }

    const keyboard = Markup.inlineKeyboard([
      ...question.options.map((option, index) => [
        Markup.button.callback(option, `quiz_answer_${progress.currentQuestion}_${index}`)
      ]),
      [Markup.button.callback('🔄 Начать заново', 'restart')]
    ]);

    await ctx.replyWithMarkdown(question.question, keyboard);
  }

  async handleQuizAnswer(ctx, questionIndex, answerIndex) {
    const userId = ctx.from.id;
    const progress = this.userProgress.get(userId);
    
    if (!progress) {
      await ctx.reply('Сессия теста устарела. Начните заново.');
      return;
    }

    const quiz = this.flow.sections.find(s => s.id === progress.quizId);
    const question = quiz.questions[questionIndex];

    await ctx.answerCbQuery();
    
    try {
      await ctx.deleteMessage();
    } catch (error) {
      // Игнорируем ошибки удаления
    }

    if (answerIndex === question.correct) {
      progress.score++;
      await ctx.replyWithMarkdown(`✅ *Правильно!*\n\n${question.explanation}`);
    } else {
      await ctx.replyWithMarkdown(`❌ *Не совсем верно*\n\n${question.explanation}`);
    }

    progress.currentQuestion++;
    this.userProgress.set(userId, progress);

    // Пауза перед следующим вопросом
    setTimeout(async () => {
      await this.sendQuizQuestion(ctx, userId, quiz);
    }, 1500);
  }

  async completeQuiz(ctx, userId, quiz) {
    const progress = this.userProgress.get(userId);
    const totalQuestions = quiz.questions.length;
    const score = progress.score;
    
    let resultMessage = '';
    if (score === totalQuestions) {
      resultMessage = `🎉 *Отличный результат!* ${score}/${totalQuestions}\n\nВы прекрасно усвоили материал!`;
    } else if (score >= totalQuestions / 2) {
      resultMessage = `👍 *Хороший результат!* ${score}/${totalQuestions}\n\nОсновные понятия усвоены, можно повторить сложные моменты.`;
    } else {
      resultMessage = `📚 *Есть над чем поработать* ${score}/${totalQuestions}\n\nРекомендуем повторить материал перед продолжением.`;
    }

    await ctx.replyWithMarkdown(resultMessage);
    
    // Кнопка для продолжения после теста
    const nextStep = this.findNextStepAfterQuiz(quiz.id);
    if (nextStep !== null) {
      await ctx.replyWithMarkdown(
        'Продолжим изучение?',
        Markup.inlineKeyboard([
          Markup.button.callback('➡️ Продолжить изучение', 'next_step')
        ])
      );
    }

    this.userProgress.delete(userId);
  }

  findNextStepAfterQuiz(quizId) {
    const steps = Object.entries(this.stepMap);
    const quizIndex = steps.findIndex(([step, info]) => info.section === quizId);
    
    if (quizIndex !== -1 && quizIndex < steps.length - 1) {
      return parseInt(steps[quizIndex + 1][0]);
    }
    
    return null;
  }

  buildNavigationKeyboard(stepNumber) {
    const buttons = [];
    const totalSteps = Object.keys(this.stepMap).length;

    // Кнопка "Назад" для всех шагов кроме первого
    if (stepNumber > 0) {
      buttons.push(Markup.button.callback('◀️ Назад', 'prev_step'));
    }

    // Кнопка "Далее" для всех шагов кроме последнего
    if (stepNumber < totalSteps - 1) {
      buttons.push(Markup.button.callback('➡️ Далее', 'next_step'));
    }

    return Markup.inlineKeyboard(buttons);
  }

  getTotalSteps() {
    return Object.keys(this.stepMap).length;
  }
}

export default FlowHandler;