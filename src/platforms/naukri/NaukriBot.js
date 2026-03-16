const Platform = require('../../core/Platform');
const { randomDelay, logger } = require('../../utils/helpers');
const fs = require('fs');
const path = require('path');
const AppliedJob = require('../../models/AppliedJob');

class NaukriBot extends Platform {
  constructor(page, config) {
    super(page, config);
    this.sessionFile = path.join(__dirname, '..', '..', '..', 'data', 'sessions', 'naukri_session.json');
  }

  async login() {
    logger.info("Starting Naukri login process...");

    // Try to load existing session
    if (fs.existsSync(this.sessionFile)) {
      const cookies = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
      await this.page.context().addCookies(cookies);
      logger.info("Loaded previous session cookies.");
      await this.page.goto('https://www.naukri.com/mnjuser/homepage');
      
      // Wait to see if we hit the logged-in homepage
      try {
        await this.page.waitForSelector('.user-name, .nI-gNb-header__usr-photo', { timeout: 10000 });
        logger.success("Successfully logged in using saved session.");
        return;
      } catch (e) {
        logger.warn("Session expired or invalid. Proceeding with manual login.");
        await this.page.context().clearCookies();
      }
    }

    // Manual Login
    await this.page.goto('https://www.naukri.com/nlogin/login');
    
    logger.info("Filling Naukri login form...");
    const emailInput = this.page.locator('input[id="usernameField"]');
    await emailInput.click();
    await randomDelay(500, 1000);
    await emailInput.pressSequentially(this.config.email, { delay: 100 });
    await randomDelay(1000, 2000);
    
    const passwordInput = this.page.locator('input[id="passwordField"]');
    await passwordInput.click();
    await randomDelay(500, 1000);
    await passwordInput.pressSequentially(this.config.password, { delay: 100 });
    await randomDelay(1000, 2000);
    
    await this.page.locator('button.blue-btn[type="submit"]').first().click();
    
    // Check for success or captchas
    try {
      // Wait for it to leave the login page. If we sit on /nlogin/login for 15s it failed.
      await this.page.waitForFunction(() => !window.location.href.includes('/nlogin/login'), { timeout: 15000 });
      logger.success("Login successful (Navigated away from login page).");
      
      // Let the new page settle
      await randomDelay(2000, 3000);
      const cookies = await this.page.context().cookies();
      if (!fs.existsSync(path.dirname(this.sessionFile))) {
        fs.mkdirSync(path.dirname(this.sessionFile), { recursive: true });
      }
      fs.writeFileSync(this.sessionFile, JSON.stringify(cookies));
      logger.info("Session saved for future use.");
    } catch (e) {
      throw new Error("Failed to login to Naukri. Check credentials, OTP, or Captcha.");
    }
  }

  async searchJobs() {
    const roles = this.config.jobRole.split(',').map(r => r.trim()).filter(Boolean);
    const locations = this.config.location.split(',').map(l => l.trim()).filter(Boolean);
    
    if (roles.length === 0) roles.push('Software Engineer');
    if (locations.length === 0) locations.push('Bangalore');

    // Naukri performs much better when given a massive list of comma-separated roles and locations
    // rather than iterating through combinations one by one.

    const rawRoles = this.config.jobRole || 'Software Engineer';
    const rawLocations = this.config.location || 'Bangalore';

    logger.info(`\n=== Searching Naukri: Roles '[${rawRoles}]', Locations '[${rawLocations}]' ===\n`);

    // Navigating to the base search page and interacting with the UI
    // is often much more reliable than trying to hack Naukri's SEO-friendly URLs
    await this.page.goto('https://www.naukri.com/jobs-search');
    await randomDelay(3000, 5000);

    try {
        // Fill the Skills/Roles keyword box
        const keywordInput = this.page.locator('input.suggestor-input').first(); // The keyword box is usually the first suggestor
        if (await keywordInput.count() > 0) {
            await keywordInput.click();
            await randomDelay(500, 1000);
            await keywordInput.fill(''); // Clear it
            await keywordInput.pressSequentially(rawRoles, { delay: 50 });
            await randomDelay(1000, 2000);
            await this.page.keyboard.press('Tab'); // Close any suggestion dropdowns
        }

        // Fill the Location box
        const locationInput = this.page.locator('input[placeholder*="location"]').first();
        if (await locationInput.count() > 0) {
            await locationInput.click();
            await randomDelay(500, 1000);
            await locationInput.fill('');
            await locationInput.pressSequentially(rawLocations, { delay: 50 });
            await randomDelay(1000, 2000);
            await this.page.keyboard.press('Tab');
        }

        // Click the big Search button
        const searchBtn = this.page.locator('.qsbSubmit, button:has-text("Search")').first();
        if (await searchBtn.count() > 0) {
            await searchBtn.click();
            await randomDelay(4000, 6000);
        }

        await this.page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 10000 }).catch(() => null);
        await this.applyToJobsOnPage();
    } catch (error) {
        logger.error(`Error during Naukri bulk search: ${error.message}`);
    }
  }

  async applyToJobsOnPage() {
    logger.info("Scanning for jobs on current page...");

    let hasNextPage = true;
    let pagesProcessed = 0;
    const maxPages = 3; 

    while (hasNextPage && pagesProcessed < maxPages) {
       pagesProcessed++;
       logger.info(`Processing page ${pagesProcessed}...`);
       
       await this.page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 10000 }).catch(() => null);
       
       const jobCardsLocator = this.page.locator('.srp-jobtuple-wrapper');
       const count = await jobCardsLocator.count();
       logger.info(`Found ${count} job cards on this page.`);

       for (let i = 0; i < count; i++) {
         const card = jobCardsLocator.nth(i);
         
         await card.scrollIntoViewIfNeeded();
         await randomDelay(1000, 2000);

         // --- Smart Job Filtering ---
         const titleTextNode = card.locator('.title').first();
         let titleText = "Unknown Job";
         if (await titleTextNode.count() > 0) {
             titleText = await titleTextNode.innerText();
         }
         const titleLower = titleText.toLowerCase();

         const excludeKeywords = ['java ', 'java-', ' java', '.net', 'c#', 'php', 'ruby', 'golang', 'python', 'ios', 'android', 'test', 'qa', 'devops', 'data', 'ml', 'ai', 'manager', 'sales'];
         const isExcluded = excludeKeywords.some(keyword => titleLower.includes(keyword) || titleLower === 'java');
         
         if (isExcluded) {
             logger.info(`Skipping '${titleText.replace(/\\n/g, ' ')}' - Excluded keyword in title.`);
             continue;
         }

         const targetRoles = ['full stack', 'fullstack', 'mern', 'mean', 'node', 'react', 'angular', 'next', 'backend', 'front end', 'frontend', 'software engineer', 'sde', 'developer'];
         const isTargetRole = targetRoles.some(role => titleLower.includes(role));

         const skillsList = await card.locator('.dot, .tag-li').allInnerTexts().catch(() => []); // Naukri uses ul > li or tags
         const skillsLower = skillsList.map(s => s.toLowerCase());
         
         const coreTechnologies = ['node', 'react', 'angular', 'next', 'mern', 'mean', 'express', 'javascript', 'typescript'];
         const hasCoreTech = skillsLower.some(skill => coreTechnologies.some(t => skill.includes(t)));
         
         if (!isTargetRole || !hasCoreTech) {
             logger.info(`Skipping '${titleText.replace(/\\n/g, ' ')}' - Doesn't match target tech stack.`);
             continue;
         }
         
         logger.info(`Match found: '${titleText.replace(/\\n/g, ' ')}'`);

         let companyName = "Unknown Company";
         const companyNode = card.locator('.comp-name').first();
         if (await companyNode.count() > 0) {
             companyName = await companyNode.innerText();
         }

         try {
             const newPagePromise = this.page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
             await titleTextNode.click(); // Naukri opens job in new tab usually
             await randomDelay(2000, 3000);
             
             const jobPage = await newPagePromise;
             
             if (jobPage) {
                 await jobPage.waitForLoadState('domcontentloaded');
                 
                 // Check if already applied. Naukri usually changes to "Already Applied"
                 const alreadyApplied = jobPage.locator('button:has-text("Already Applied")');
                 if (await alreadyApplied.count() > 0) {
                     logger.info("Already applied to this job, skipping.");
                     await jobPage.close();
                     continue;
                 }

                 // Check for "Apply on company site" button which means it's an external job
                 const applyOnCompanySite = jobPage.locator('button:has-text("Apply on company site"), a:has-text("Apply on company site")');
                 if (await applyOnCompanySite.count() > 0) {
                     logger.info("External application required (Apply on company site). Skipping.");
                     await jobPage.close();
                     continue;
                 }

                 // Use an exact match or strict class to avoid clicking random matching elements
                 const applyBtn = jobPage.locator('button:has-text("Apply")').first();
                 try {
                     await applyBtn.waitFor({ state: 'visible', timeout: 5000 });
                     logger.info("Found apply button. Clicking...");
                     await applyBtn.click(); 
                     
                     // Handle the questionnaire/chat modal if it arises? 
                     // Or check for "Successfully Applied" text.
                     logger.success(`Simulated clicking apply on Naukri.`);
                     
                     try {
                         const newJob = new AppliedJob({
                             jobTitle: titleText.replace(/\\n/g, ' '),
                             companyName: companyName,
                             platform: 'naukri',
                         });
                         await newJob.save();
                         logger.success(`Saved application for ${titleText.replace(/\\n/g, ' ')} at ${companyName} to Database!`);
                     } catch (dbErr) {
                         if (dbErr.code === 11000) {
                            logger.info(`Job at ${companyName} already exists in Database.`);
                         }
                     }
                 } catch (e) {
                     logger.warn("Apply button not found or not clickable in the new tab.");
                 } finally {
                     await jobPage.close();
                     await randomDelay(1000, 2000);
                 }
             } else {
                 logger.warn("Could not handle new tab for this job.");
             }
         } catch(e) {
             logger.warn(`Could not interact with job card ${i}: ${e.message}`);
         }
       }

       const nextBtn = await this.page.locator('a.styles_btn-secondary__2BqIV:has-text("Next")').first();
       if (await nextBtn.count() > 0) {
           logger.info("Going to next page.");
           await nextBtn.click();
           await randomDelay(4000, 6000);
       } else {
           hasNextPage = false;
           logger.info("No more pages found.");
       }
    }
  }

  async applyToJob() {
    throw new Error("applyToJob(url) not fully implemented for Naukri yet.");
  }
}

module.exports = NaukriBot;
