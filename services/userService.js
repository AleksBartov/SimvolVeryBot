
import db from '../database/db.js';

class UserService {
  async getUser(userId, userData = {}) {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE user_id = ?',
        [userId],
        (err, row) => {
          if (err) return reject(err);
          
          if (row) {
            db.run(
              'UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE user_id = ?',
              [userId]
            );
            resolve(row);
          } else {
            const { username, first_name, last_name } = userData;
            db.run(
              `INSERT INTO users (user_id, username, first_name, last_name) 
               VALUES (?, ?, ?, ?)`,
              [userId, username, first_name, last_name],
              function(err) {
                if (err) return reject(err);
                resolve({
                  user_id: userId,
                  username,
                  first_name,
                  last_name,
                  current_step: 0,
                  id: this.lastID
                });
              }
            );
          }
        }
      );
    });
  }

  async updateUserStep(userId, step) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET current_step = ?, last_activity = CURRENT_TIMESTAMP WHERE user_id = ?',
        [step, userId],
        function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });
  }

  async getInactiveUsers(days = 3) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM users 
         WHERE date(last_activity) < date('now', ?) 
         AND current_step > 0`,
        [`-${days} days`],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
  }
}

export default new UserService();