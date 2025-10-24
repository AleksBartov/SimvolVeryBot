// core/ProgressManager.js
const Course = require("../data/course");

class ProgressManager {
  constructor() {
    this.userStates = new Map();
  }

  getUserState(userId) {
    if (!this.userStates.has(userId)) {
      this.userStates.set(userId, {
        userId: userId,
        currentBlockId: null,
        completedBlocks: new Set(),
        correctAnswers: 0,
        totalQuizzes: 0,
        finalTestScore: 0,
        totalFinalQuestions: Course.finalTest.length,
        isFinalTest: false,
      });
    }
    return this.userStates.get(userId);
  }

  startCourse(userId) {
    const state = this.getUserState(userId);
    state.currentBlockId = Course.blocks[0].id;
    state.completedBlocks.clear();
    state.correctAnswers = 0;
    state.totalQuizzes = 0;
    state.finalTestScore = 0;
    state.isFinalTest = false;
    return this.getCurrentBlock(userId);
  }

  goNext(userId) {
    const state = this.getUserState(userId);

    if (!state.currentBlockId) {
      return this.startCourse(userId);
    }

    if (state.isFinalTest) {
      return this.goNextFinalTest(userId);
    }

    const currentIndex = Course.blocks.findIndex(
      (block) => block.id === state.currentBlockId
    );

    if (currentIndex === -1) {
      return null;
    }

    if (currentIndex >= Course.blocks.length - 1) {
      // Курс завершен, показываем завершение
      return {
        type: "course_completed",
        id: "course_completed",
      };
    }

    state.currentBlockId = Course.blocks[currentIndex + 1].id;
    state.completedBlocks.add(state.currentBlockId);

    return this.getCurrentBlock(userId);
  }

  goNextFinalTest(userId) {
    const state = this.getUserState(userId);
    const currentIndex = Course.finalTest.findIndex(
      (block) => block.id === state.currentBlockId
    );

    if (currentIndex === -1) {
      return Course.finalTest[0];
    }

    if (currentIndex >= Course.finalTest.length - 1) {
      // Финальный тест завершен
      return {
        type: "final_test_completed",
        id: "final_test_completed",
      };
    }

    state.currentBlockId = Course.finalTest[currentIndex + 1].id;
    return this.getCurrentBlock(userId);
  }

  getCurrentBlock(userId) {
    const state = this.getUserState(userId);
    if (!state.currentBlockId) return null;

    if (state.isFinalTest) {
      return Course.finalTest.find(
        (block) => block.id === state.currentBlockId
      );
    } else {
      return Course.blocks.find((block) => block.id === state.currentBlockId);
    }
  }

  canGoBack(userId) {
    const state = this.getUserState(userId);
    if (!state.currentBlockId) return false;

    if (state.isFinalTest) {
      const currentIndex = Course.finalTest.findIndex(
        (block) => block.id === state.currentBlockId
      );
      return currentIndex > 0;
    } else {
      const currentIndex = Course.blocks.findIndex(
        (block) => block.id === state.currentBlockId
      );
      return currentIndex > 0;
    }
  }

  goBack(userId) {
    const state = this.getUserState(userId);

    if (!this.canGoBack(userId)) {
      return null;
    }

    if (state.isFinalTest) {
      const currentIndex = Course.finalTest.findIndex(
        (block) => block.id === state.currentBlockId
      );
      state.currentBlockId = Course.finalTest[currentIndex - 1].id;
    } else {
      const currentIndex = Course.blocks.findIndex(
        (block) => block.id === state.currentBlockId
      );
      state.currentBlockId = Course.blocks[currentIndex - 1].id;
    }

    return this.getCurrentBlock(userId);
  }

  startFinalTest(userId) {
    const state = this.getUserState(userId);
    state.isFinalTest = true;
    state.currentBlockId = Course.finalTest[0].id;
    state.finalTestScore = 0;
    return this.getCurrentBlock(userId);
  }

  recordQuizAnswer(userId, isCorrect) {
    const state = this.getUserState(userId);
    state.totalQuizzes++;
    if (isCorrect) {
      state.correctAnswers++;
    }

    if (state.isFinalTest && isCorrect) {
      state.finalTestScore++;
    }
  }

  getProgressStats(userId) {
    const state = this.getUserState(userId);
    const progress = state.completedBlocks.size;
    const totalBlocks = Course.blocks.length;
    const progressPercent = Math.round((progress / totalBlocks) * 100);

    return {
      progress: progressPercent,
      correctAnswers: state.correctAnswers,
      totalQuizzes: state.totalQuizzes,
      finalTestScore: state.finalTestScore,
      totalFinalQuestions: state.totalFinalQuestions,
    };
  }

  resetProgress(userId) {
    this.userStates.delete(userId);
    return this.getUserState(userId);
  }
}

module.exports = ProgressManager;
