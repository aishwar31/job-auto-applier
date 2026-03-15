# Job Auto Applier

A Node.js bot leveraging [Playwright](https://playwright.dev/) to automatically apply for jobs on multiple platforms.

## Prerequisites

- Node.js 16+
- Chromium (installed automatically by Playwright, or run `npx playwright install` if needed)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create or update your `.env` file based on the platforms you intend to use.

### Example `.env`

```env
HEADLESS_MODE=false
JOB_ROLE=Software Engineer
LOCATION=Bangalore

# For Instahyre
INSTAHYRE_EMAIL=your_email@example.com
INSTAHYRE_PASSWORD=your_password
```

## Running the Bot

Run the bot by specifying the target platform. By default, it will fall back to `instahyre` if no platform is provided.

```bash
# Run Instahyre bot
npm start instahyre

# Or run it directly with Node
node index.js instahyre
```

## Supported Platforms

Currently supported platforms can be found in `src/platforms/index.js`.
- **instahyre**

### Adding a new Platform

1. Create a new directory and bot class in `src/platforms/<platform_name>/`.
2. Extend the `src/platforms/Platform.js` base class.
3. Export the new bot via `src/platforms/index.js`.
4. Run it using `npm start <platform_name>`.
