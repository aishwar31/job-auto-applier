/**
 * Generates a random delay to simulate human behavior
 * @param {number} min Delay in milliseconds
 * @param {number} max Delay in milliseconds
 * @returns {Promise<void>}
 */
const randomDelay = (min = 2000, max = 5000) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

/**
 * Simple logger
 */
const logger = {
  info: (msg) => console.log(`[\x1b[36mINFO\x1b[0m] ${msg}`),
  success: (msg) => console.log(`[\x1b[32mSUCCESS\x1b[0m] ${msg}`),
  warn: (msg) => console.log(`[\x1b[33mWARN\x1b[0m] ${msg}`),
  error: (msg) => console.error(`[\x1b[31mERROR\x1b[0m] ${msg}`),
};

module.exports = {
  randomDelay,
  logger
};
