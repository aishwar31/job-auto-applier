const Platform = require('../Platform');
const { randomDelay, logger } = require('../../utils/helpers');
const fs = require('fs');
const path = require('path');

class InstahyreBot extends Platform {
  constructor(page, config) {
    super(page, config);
    this.sessionFile = path.join(__dirname, '..', '..', '..', 'instahyre_session.json');
  }

  async login() {
    logger.info("Starting Instahyre login process...");

    // Try to load existing session
    if (fs.existsSync(this.sessionFile)) {
      const cookies = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
      await this.page.context().addCookies(cookies);
      logger.info("Loaded previous session cookies.");
      await this.page.goto('https://www.instahyre.com/candidate/opportunities');
      
      // Check if actually logged in by looking for an element unique to logged-in users
      // For Instahyre, the profile dropdown or logout button usually works. Wait briefly.
      try {
        await this.page.waitForSelector('.profile-dropdown', { timeout: 5000 });
        logger.success("Successfully logged in using saved session.");
        return;
      } catch (e) {
        logger.warn("Session expired or invalid. Proceeding with manual login.");
        // Clear cookies to be safe
        await this.page.context().clearCookies();
      }
    }

    // Manual Login
    await this.page.goto('https://www.instahyre.com/login/');
    
    logger.info("Filling login form...");
    await this.page.click('input[id="email"]');
    await randomDelay(500, 1000); // Give Angular/browser time to focus the input purely
    await this.page.locator('input[id="email"]').pressSequentially(this.config.email, { delay: 100 });
    await randomDelay(1000, 2000);
    
    await this.page.click('input[id="password"]');
    await randomDelay(500, 1000);
    await this.page.locator('input[id="password"]').pressSequentially(this.config.password, { delay: 100 });
    await randomDelay(1000, 2000);
    
    await this.page.click('button[type="submit"]');
    
    // Wait for successful login indicator (e.g. navigation to opportunities or a profile dropdown)
    try {
      // Instahyre uses AJAX for login, so instead of waitForNavigation, we wait for the URL to change 
      // or for a logged-in element to appear.
      await this.page.waitForURL('**/candidate/**', { timeout: 15000 }).catch(() => null);
      await this.page.waitForSelector('.candidate-opportunities, .employer-row', { timeout: 15000 });
      logger.success("Login successful via form submission.");
      
      // Save session
      const cookies = await this.page.context().cookies();
      fs.writeFileSync(this.sessionFile, JSON.stringify(cookies));
      logger.info("Session saved for future use.");
    } catch (e) {
      throw new Error("Failed to login. Please check credentials or if there's a captcha.");
    }
  }

  async searchJobs() {
    logger.info(`Searching for jobs on Instahyre matching: Role '${this.config.jobRole}', Location '${this.config.location}'`);
    
    // Instahyre's URL structure for search
    // We can navigate directly or use the UI search bar
    await this.page.goto('https://www.instahyre.com/candidate/opportunities');
    await randomDelay(2000, 4000);

    // Filter by role and location (simulating UI interaction)
    // Instahyre uses angular, so we need to be careful with inputs
    try {
      // Note: Instahyre's domestic search specific logic.
      // Easiest way in Instahyre is to just apply to the "Recommended" jobs which default load.
      // But let's try to add the location and role if the input exists.
      const searchRoleSel = 'input[placeholder*="Skills, designation"]';
      const searchLocSel = 'input[placeholder*="Location"]';
      
      if (await this.page.$(searchRoleSel)) {
         await this.page.fill(searchRoleSel, this.config.jobRole);
         await randomDelay(1000, 2000);
      }
      
      if (await this.page.$(searchLocSel)) {
         await this.page.fill(searchLocSel, this.config.location);
         await randomDelay(1000, 2000);
      }
      
      // Click update/search button if exists (often it auto-updates)
      const btnSel = 'button:has-text("Update")';
      if (await this.page.$(btnSel)) {
          await this.page.click(btnSel);
          await randomDelay(3000, 5000);
      }

      await this.applyToJobsOnPage();
    } catch (error) {
       logger.error(`Error during search: ${error.message}`);
    }
  }

  async applyToJobsOnPage() {
    logger.info("Scanning for jobs on current page...");

    // Find all 'Apply' or 'Show Interest' buttons
    // The exact selector depends on Instahyre's current DOM
    // Typically it's a button with class like 'button-download' or angular classes
    
    let hasNextPage = true;
    let pagesProcessed = 0;
    const maxPages = 3; // Limit for testing

    while (hasNextPage && pagesProcessed < maxPages) {
       pagesProcessed++;
       logger.info(`Processing page ${pagesProcessed}...`);
       
       await this.page.waitForSelector('.employer-row', { timeout: 10000 }).catch(() => null);
       
       // Get all buttons that say "View" or "Apply"
       // Usually on the list page, Instahyre has "View" which expands the details, then "Apply"
       const jobCardsLocator = this.page.locator('.employer-row');
       const count = await jobCardsLocator.count();
       logger.info(`Found ${count} job cards on this page.`);

       for (let i = 0; i < count; i++) {
         const card = jobCardsLocator.nth(i);
         
         // Scroll to card
         await card.scrollIntoViewIfNeeded();
         await randomDelay(1000, 2000);

         // Check if already applied
         const appliedBadgeCount = await card.locator('.applied-badge').count(); // Example selector
         if (appliedBadgeCount > 0) {
             logger.info("Already applied to this job, skipping.");
             continue;
         }

         // Click card to open modal/details
         try {
             // The button is usually .button-interested or #interested-btn
             const viewBtn = card.locator('.button-interested, #interested-btn');
             if (await viewBtn.count() > 0) {
                 await viewBtn.click();
             } else {
                 await card.click(); // Fallback to clicking the card
             }
             await randomDelay(2000, 3000);

             // Look for Apply button in the modal
             const applyBtn = this.page.locator('button.btn-lg.btn-primary:has-text("Apply")').first();
             try {
                 await applyBtn.waitFor({ state: 'visible', timeout: 5000 });
                 logger.info("Found apply button. Clicking...");
                 await applyBtn.click(); 
                 logger.success("Simulated clicking apply.");
                 await randomDelay(2000, 3000);
             } catch (e) {
                 logger.warn("Apply button not found for this job.");
             } finally {
                 // Close the modal by clicking the backdrop or 'x' button
                 await this.page.evaluate(() => {
                     const closeBackdrop = document.querySelector('.application-modal-backdrop, .modal-backdrop');
                     if (closeBackdrop) closeBackdrop.click();
                     
                     const closeBtn = document.querySelector('.close, .close-modal');
                     if (closeBtn) closeBtn.click();
                 });
                 await randomDelay(1500, 2000);
             }
         } catch(e) {
             logger.warn(`Could not interact with job card ${i}: ${e.message}`);
         }
       }

       // Go to next page
       const nextBtn = await this.page.$('li.pagination-next a');
       if (nextBtn) {
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
    // This is useful if we have a direct url to a job
    throw new Error("applyToJob(url) not fully implemented for Instahyre yet as it primarily uses single page app modals.");
  }
}

module.exports = InstahyreBot;
