/**
 * Simple Plain Text Password Helpers
 */
const hashPassword = async (password) => {
  // Plain text (no hashing)
  return password;
};

const comparePassword = async (password, storedPassword) => {
  // Simple string comparison
  return password === storedPassword;
};

module.exports = {
  hashPassword,
  comparePassword,
};
