require('dotenv').config();
const { chromium } = require('playwright');
const platforms = require('./platforms');
const { logger } = require('./utils/helpers');

const connectDB = require('./config/db');

async function main() {
  await connectDB();

  const platformName = process.argv[2] && process.argv[2].toLowerCase() || 'instahyre';

  logger.info(`Initializing Bot for platform: ${platformName}...`);

  const BotClass = platforms[platformName];
  if (!BotClass) {
    logger.error(`Platform '${platformName}' is not supported.`);
    process.exit(1);
  }


  const headless = process.env.HEADLESS_MODE === 'true';
  const browser = await chromium.launch({ headless });
  

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();


  const emailEnvVar = `${platformName.toUpperCase()}_EMAIL`;
  const passwordEnvVar = `${platformName.toUpperCase()}_PASSWORD`;

  const config = {
    email: process.env[emailEnvVar],
    password: process.env[passwordEnvVar],
    jobRole: process.env.JOB_ROLE,
    location: process.env.LOCATION,
  };

  if (!config.email || !config.password) {
    logger.error(`Missing ${emailEnvVar} or ${passwordEnvVar} in .env`);
    await browser.close();
    process.exit(1);
  }


  const bot = new BotClass(page, config);
  
  try {
    await bot.login();
    await bot.searchJobs();
    logger.success(`${platformName} Bot finished successfully.`);
  } catch (error) {
    logger.error(`${platformName} Bot encountered an error: ${error.message}`);
    console.error(error);
  } finally {

    if (!headless) {
      await new Promise(r => setTimeout(r, 5000));
    }
    await browser.close();
  }
}

main();
