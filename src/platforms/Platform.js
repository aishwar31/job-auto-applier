/**
 * Abstract Base Class for Job Application Platforms
 */
class Platform {
  constructor(page, config) {
    if (this.constructor === Platform) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.page = page;
    this.config = config;
  }

  /**
   * Authenticate with the platform
   */
  async login() {
    throw new Error("Method 'login()' must be implemented.");
  }

  /**
   * Search for jobs based on given criteria
   */
  async searchJobs() {
    throw new Error("Method 'searchJobs()' must be implemented.");
  }

  /**
   * Apply to a specific job given a link or DOM element
   */
  async applyToJob() {
    throw new Error("Method 'applyToJob()' must be implemented.");
  }
}

module.exports = Platform;
