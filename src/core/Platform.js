
class Platform {
  constructor(page, config) {
    if (this.constructor === Platform) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.page = page;
    this.config = config;
  }


  async login() {
    throw new Error("Method 'login()' must be implemented.");
  }


  async searchJobs() {
    throw new Error("Method 'searchJobs()' must be implemented.");
  }


  async applyToJob() {
    throw new Error("Method 'applyToJob()' must be implemented.");
  }
}

module.exports = Platform;
