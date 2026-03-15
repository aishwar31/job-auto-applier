const Platform = require('../../core/Platform');
const { randomDelay, logger } = require('../../utils/helpers');
const fs = require('fs');
const path = require('path');
const AppliedJob = require('../../models/AppliedJob');

class InstahyreBot extends Platform {
  constructor(page, config) {
    super(page, config);

    this.sessionFile = path.join(__dirname, '..', '..', '..', 'data', 'sessions', 'instahyre_session.json');
  }

  async login() {
    logger.info("Starting Instahyre login process...");

    if (fs.existsSync(this.sessionFile)) {
      const cookies = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
      await this.page.context().addCookies(cookies);
      logger.info("Loaded previous session cookies.");
      await this.page.goto('https://www.instahyre.com/candidate/opportunities');


      try {
        await this.page.waitForSelector('.profile-dropdown', { timeout: 5000 });
        logger.success("Successfully logged in using saved session.");
        return;
      } catch (e) {
        logger.warn("Session expired or invalid. Proceeding with manual login.");

        await this.page.context().clearCookies();
      }
    }

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

    try {


      await this.page.waitForURL('**/candidate/**', { timeout: 15000 }).catch(() => null);
      await this.page.waitForSelector('.candidate-opportunities, .employer-row', { timeout: 15000 });
      logger.success("Login successful via form submission.");

      const cookies = await this.page.context().cookies();
      fs.writeFileSync(this.sessionFile, JSON.stringify(cookies));
      logger.info("Session saved for future use.");
    } catch (e) {
      throw new Error("Failed to login. Please check credentials or if there's a captcha.");
    }
  }

  async searchJobs() {

    const roles = this.config.jobRole.split(',').map(r => r.trim()).filter(Boolean);
    const locations = this.config.location.split(',').map(l => l.trim()).filter(Boolean);

    if (roles.length === 0) roles.push('Software Engineer');
    if (locations.length === 0) locations.push('Bangalore');

    for (const role of roles) {
        for (const location of locations) {
            logger.info(`\n=== Searching for jobs: Role '${role}', Location '${location}' ===\n`);

            await this.page.goto('https://www.instahyre.com/candidate/opportunities');
            await randomDelay(2000, 4000);

            try {
              const searchRoleSel = 'input[placeholder*="Skills, designation"]';
              const searchLocSel = 'input[placeholder*="Location"]';
              
              if (await this.page.$(searchRoleSel)) {
                 await this.page.fill(searchRoleSel, role);
                 await randomDelay(1000, 2000);
              }
              
              if (await this.page.$(searchLocSel)) {
                 await this.page.fill(searchLocSel, location);
                 await randomDelay(1000, 2000);
              }
              
              const btnSel = 'button:has-text("Update")';
              if (await this.page.$(btnSel)) {
                  await this.page.click(btnSel);
                  await randomDelay(4000, 6000); // Give it time to load the results
              }

              await this.applyToJobsOnPage(); // Processes standard pages for this combination
            } catch (error) {
               logger.error(`Error during search for ${role} in ${location}: ${error.message}`);
            }
        }
    }
  }

  async applyToJobsOnPage() {
    logger.info("Scanning for jobs on current page...");



    
    let hasNextPage = true;
    let pagesProcessed = 0;
    const maxPages = 3; // Limit for testing

    while (hasNextPage && pagesProcessed < maxPages) {
       pagesProcessed++;
       logger.info(`Processing page ${pagesProcessed}...`);
       
       await this.page.waitForSelector('.employer-row', { timeout: 10000 }).catch(() => null);


       const jobCardsLocator = this.page.locator('.employer-row');
       const count = await jobCardsLocator.count();
       logger.info(`Found ${count} job cards on this page.`);

       for (let i = 0; i < count; i++) {
         const card = jobCardsLocator.nth(i);

         await card.scrollIntoViewIfNeeded();
         await randomDelay(1000, 2000);

         const appliedBadgeCount = await card.locator('.applied-badge').count(); // Example selector
         if (appliedBadgeCount > 0) {
             logger.info("Already applied to this job, skipping.");
             continue;
         }

         const titleTextNode = card.locator('.employer-job-name').first();
         let titleText = "Unknown Job";
         if (await titleTextNode.count() > 0) {
             titleText = await titleTextNode.innerText();
         }
         const titleLower = titleText.toLowerCase();

         const excludeKeywords = ['java ', 'java-', ' java', '.net', 'c#', 'php', 'ruby', 'golang', 'python', 'ios', 'android', 'test', 'qa', 'devops', 'data', 'ml', 'ai', 'manager', 'sales'];
         const isExcluded = excludeKeywords.some(keyword => titleLower.includes(keyword) || titleLower === 'java');
         
         if (isExcluded) {
             logger.info(`Skipping '${titleText.replace(/\n/g, ' ')}' - Excluded keyword in title.`);
             continue;
         }

         const targetRoles = ['full stack', 'fullstack', 'mern', 'mean', 'node', 'react', 'angular', 'next', 'backend', 'front end', 'frontend', 'software engineer', 'sde', 'developer'];
         const isTargetRole = targetRoles.some(role => titleLower.includes(role));

         const skillsList = await card.locator('.job-skills .tags li').allInnerTexts().catch(() => []);
         const skillsLower = skillsList.map(s => s.toLowerCase());
         
         const coreTechnologies = ['node', 'react', 'angular', 'next', 'mern', 'mean', 'express', 'javascript', 'typescript'];
         
         const hasCoreTech = skillsLower.some(skill => coreTechnologies.some(t => skill.includes(t)));


         if (!isTargetRole || !hasCoreTech) {
             logger.info(`Skipping '${titleText.replace(/\n/g, ' ')}' - Doesn't match target tech stack.`);
             continue;
         }
         
         logger.info(`Match found: '${titleText.replace(/\n/g, ' ')}'`);

         try {

             const viewBtn = card.locator('.button-interested, #interested-btn');
             if (await viewBtn.count() > 0) {
                 await viewBtn.click();
             } else {
                 await card.click(); // Fallback to clicking the card
             }
             await randomDelay(2000, 3000);

             const applyBtn = this.page.locator('button.btn-lg.btn-primary:has-text("Apply")').first();
             try {
                 await applyBtn.waitFor({ state: 'visible', timeout: 5000 });
                 logger.info("Found apply button. Clicking...");
                 await applyBtn.click(); 
                 
                 // Instahyre's .employer-job-name often formats as "Company - Job Role"
                 let companyName = "Unknown Company";
                 let finalJobTitle = titleText.replace(/\n/g, ' ');
                 
                 if (finalJobTitle.includes(' - ')) {
                     const parts = finalJobTitle.split(' - ');
                     companyName = parts[0].trim();
                     finalJobTitle = parts.slice(1).join(' - ').trim();
                 }

                 try {
                     const newJob = new AppliedJob({
                         jobTitle: finalJobTitle,
                         companyName: companyName,
                         platform: 'instahyre',
                     });
                     await newJob.save();
                     logger.success(`Saved application for ${titleText.replace(/\n/g, ' ')} at ${companyName} to Database!`);
                 } catch (dbErr) {
                     // Usually a duplicate key error if we already applied
                     if (dbErr.code === 11000) {
                        logger.info(`Job at ${companyName} already exists in Database.`);
                     } else {
                        logger.error(`Database Error: ${dbErr.message}`);
                     }
                 }
                 
                 await randomDelay(2000, 3000);
             } catch (e) {
                 logger.warn("Apply button not found for this job.");
             } finally {

                 await this.page.evaluate(() => {
                     const closeBackdrop = document.querySelector('.application-modal-backdrop, .modal-backdrop');
                     if (closeBackdrop) closeBackdrop.click();
                     
                     const closeBtn = document.querySelector('.close, .close-modal');
                     if (closeBtn) closeBtn.click();
                 });
                 await randomDelay(1500, 2000);

                 try {
                     const similarJobsModal = this.page.locator('.modal-dialog-similar-jobs, .similar-jobs-modal'); // Guessing class names for now
                     if (await similarJobsModal.count() > 0) {
                         logger.info("Found similar jobs popup. Clicking Done/Close...");
                         const closeSimilarBtn = similarJobsModal.locator('button.close, .btn-primary:has-text("Done"), button:has-text("No")').first();
                         if (await closeSimilarBtn.count() > 0) {
                             await closeSimilarBtn.click();
                         } else {

                             await this.page.evaluate(() => {
                                 const backdrops = document.querySelectorAll('.modal-backdrop');
                                 if (backdrops.length > 0) backdrops[backdrops.length - 1].click();
                             });
                         }
                         await randomDelay(1000, 1500);
                     }
                 } catch (e) {
                     logger.debug("No similar jobs popup found or error handling it.");
                 }
             }
         } catch(e) {
             logger.warn(`Could not interact with job card ${i}: ${e.message}`);
         }
       }

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

    throw new Error("applyToJob(url) not fully implemented for Instahyre yet as it primarily uses single page app modals.");
  }
}

module.exports = InstahyreBot;
