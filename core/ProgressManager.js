// core/ProgressManager.js (предыдущая версия)
const Course = require('../data/course');

class ProgressManager {
  constructor() {
    this.userStates = new Map();
  }

  getUserState(userId) {
    if (!this.userStates.has(userId)) {
      this.userStates.set(userId, {
        userId: userId,
        currentBlockId: null,
        previousBlockId: null,
        correctAnswers: 0,
        totalQuizzes: 0,
        isInFinalTest: false,
        finalTestScore: 0
      });
    }
    return this.userStates.get(userId);
  }

  startCourse(userId) {
    const state = this.getUserState(userId);
    state.currentBlockId = Course.presentation.firstBlockId;
    state.previousBlockId = null;
    state.isInFinalTest = false;
    state.correctAnswers = 0;
    state.totalQuizzes = 0;
    state.finalTestScore = 0;
    return this.getCurrentBlock(userId);
  }

  getCurrentBlock(userId) {
    const state = this.getUserState(userId);
    
    if (!state.currentBlockId) {
      return null;
    }

    if (state.isInFinalTest) {
      return Course.finalTest[state.currentBlockId] || null;
    } else {
      return Course.blocks[state.currentBlockId] || null;
    }
  }

  goNext(userId) {
    const state = this.getUserState(userId);
    const currentBlock = this.getCurrentBlock(userId);
    
    if (!currentBlock || !currentBlock.next) {
      return null;
    }

    state.previousBlockId = state.currentBlockId;
    state.currentBlockId = currentBlock.next;

    return this.getCurrentBlock(userId);
  }

  goBack(userId) {
    const state = this.getUserState(userId);
    
    if (!state.previousBlockId) {
      return null;
    }

    const temp = state.currentBlockId;
    state.currentBlockId = state.previousBlockId;
    state.previousBlockId = temp;

    return this.getCurrentBlock(userId);
  }

  canGoBack(userId) {
    const state = this.getUserState(userId);
    return !!state.previousBlockId;
  }

  handleQuizAnswer(userId, isCorrect) {
    const state = this.getUserState(userId);
    
    if (isCorrect) {
      state.correctAnswers++;
    }
    state.totalQuizzes++;
    
    return isCorrect;
  }

  startFinalTest(userId) {
    const state = this.getUserState(userId);
    state.isInFinalTest = true;
    state.currentBlockId = 'final_test_start';
    state.previousBlockId = null;
    state.finalTestScore = 0;
    return this.getCurrentBlock(userId);
  }

  handleFinalTestAnswer(userId, isCorrect) {
    const state = this.getUserState(userId);
    
    if (isCorrect) {
      state.finalTestScore++;
    }
    
    return state.finalTestScore;
  }

  getProgressStats(userId) {
    const state = this.getUserState(userId);
    const progress = state.isInFinalTest ? 100 : 50;
    
    return {
      correctAnswers: state.correctAnswers,
      totalQuizzes: state.totalQuizzes,
      progress: progress,
      finalTestScore: state.finalTestScore,
      totalFinalQuestions: Object.keys(Course.finalTest).length - 1
    };
  }

  resetProgress(userId) {
    this.userStates.delete(userId);
  }
}

module.exports = ProgressManager;