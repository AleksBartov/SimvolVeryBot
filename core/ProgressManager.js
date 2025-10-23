
// core/ProgressManager.js
const Course = require('../data/course');

class ProgressManager {
  constructor() {
    this.userStates = new Map(); // user_id -> UserState
  }

  getUserState(userId) {
    if (!this.userStates.has(userId)) {
      this.userStates.set(userId, {
        userId: userId,
        currentBlockIndex: -1, // Начинаем с -1, чтобы первый next дал блок 0
        correctAnswers: 0,
        totalQuizzes: 0,
        isInFinalTest: false,
        finalTestScore: 0,
        finalTestIndex: 0
      });
    }
    return this.userStates.get(userId);
  }

  getNextBlock(userId) {
    const state = this.getUserState(userId);
    
    if (state.isInFinalTest) {
      // Финальный тест
      if (state.finalTestIndex >= Course.finalTest.length) {
        return { type: 'final_test_completed' };
      }
      const block = Course.finalTest[state.finalTestIndex];
      state.finalTestIndex++;
      return block;
    }

    // Основной курс
    state.currentBlockIndex++;
    
    if (state.currentBlockIndex >= Course.blocks.length) {
      return { type: 'course_completed' };
    }

    return Course.blocks[state.currentBlockIndex];
  }

  handleQuizAnswer(userId, isCorrect) {
    const state = this.getUserState(userId);
    
    if (isCorrect) {
      state.correctAnswers++;
    }
    state.totalQuizzes++;
    
    return isCorrect;
  }

  handleFinalTestAnswer(userId, isCorrect) {
    const state = this.getUserState(userId);
    
    if (isCorrect) {
      state.finalTestScore++;
    }
    
    return state.finalTestScore;
  }

  startFinalTest(userId) {
    const state = this.getUserState(userId);
    state.isInFinalTest = true;
    state.finalTestIndex = 0;
    return this.getNextBlock(userId);
  }

  getProgressStats(userId) {
    const state = this.getUserState(userId);
    const progress = state.isInFinalTest ? 100 : Math.round((state.currentBlockIndex / Course.blocks.length) * 100);
    
    return {
      correctAnswers: state.correctAnswers,
      totalQuizzes: state.totalQuizzes,
      progress: progress,
      finalTestScore: state.finalTestScore,
      totalFinalQuestions: Course.finalTest.length
    };
  }

  // Сброс прогресса (для тестирования)
  resetProgress(userId) {
    this.userStates.delete(userId);
  }
}

module.exports = ProgressManager;
