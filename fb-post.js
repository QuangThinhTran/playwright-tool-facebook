const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Read configuration files
const rawCookies = JSON.parse(fs.readFileSync(path.join('config', 'authen.json'), 'utf-8'));
const config = JSON.parse(fs.readFileSync(path.join('config', 'config.json'), 'utf-8'));
const postContentRaw = fs.readFileSync(path.join('config', 'prompt.md'), 'utf-8');

// Convert Markdown bold to Unicode bold characters
function toBoldUnicode(text) {
  return text.split('').map(char => {
    const code = char.charCodeAt(0);

    // A-Z (Uppercase Latin)
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint(0x1D5D4 + (code - 65));
    }
    // a-z (Lowercase Latin)
    if (code >= 97 && code <= 122) {
      return String.fromCodePoint(0x1D5EE + (code - 97));
    }
    // 0-9 (Digits)
    if (code >= 48 && code <= 57) {
      return String.fromCodePoint(0x1D7EC + (code - 48));
    }

    // Keep other characters (emojis, Vietnamese, symbols, etc.) as-is
    return char;
  }).join('');
}

function convertMarkdownToFacebookFormat(text) {
  // Convert **text** to Unicode bold
  return text.replace(/\*\*([^*]+)\*\*/g, (match, content) => {
    return toBoldUnicode(content);
  });
}

// Apply formatting to post content
const postContent = convertMarkdownToFacebookFormat(postContentRaw);

// Normalize cookies for Playwright compatibility
const cookies = rawCookies.map(cookie => {
  const normalized = { ...cookie };

  // Fix sameSite values: Playwright expects "Strict", "Lax", or "None"
  if (normalized.sameSite === 'lax') normalized.sameSite = 'Lax';
  else if (normalized.sameSite === 'strict') normalized.sameSite = 'Strict';
  else if (normalized.sameSite === 'no_restriction' || normalized.sameSite === null) normalized.sameSite = 'None';

  return normalized;
});

// Find all jpg and mp4 files in specified folder
function getMediaFiles(folderPath) {
  const mediaFiles = [];

  // Normalize path for cross-platform compatibility
  const normalizedPath = path.normalize(folderPath);

  const files = fs.readdirSync(normalizedPath);
  files.forEach(file => {
    const filePath = path.join(normalizedPath, file);
    const stat = fs.statSync(filePath);

    if (!stat.isDirectory() && file.match(/\.(jpg|mp4)$/i)) {
      mediaFiles.push(path.resolve(filePath));
    }
  });

  return mediaFiles;
}

async function main() {
  console.log('Starting Facebook Auto-Post Bot...\n');

  // Create log directory
  const logDir = path.join(__dirname, 'log');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Load media files
  const mediaFiles = getMediaFiles(config.mediaFolder);
  console.log(`Found ${mediaFiles.length} media files\n`);

  // Launch browser
  let browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });

  let context = await browser.newContext();
  await context.addCookies(cookies);
  let page = await context.newPage();

  // Navigate to Facebook
  try {
    await page.goto('https://www.facebook.com', { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  } catch (error) {
    console.error('Error loading Facebook:', error.message);
    await page.screenshot({ path: path.join('log', 'error-facebook-load.png') });
    throw error;
  }

  // Process each group
  for (let i = 0; i < config.groups.length; i++) {
    const groupId = config.groups[i];
    console.log(`\nProcessing group ${i + 1}/${config.groups.length}: ${groupId}`);

    // Retry logic: 3 attempts with delays 3s, 5s, 7s
    const maxRetries = 3;
    const retryDelays = [3000, 5000, 7000]; // ms
    let success = false;

    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        if (retry > 0) {
          console.log(`  Retry ${retry + 1}/${maxRetries}...`);

          // Close and reopen browser
          await browser.close();
          const delay = retryDelays[retry - 1];
          await new Promise(resolve => setTimeout(resolve, delay));

          browser = await chromium.launch({
            headless: false,
            slowMo: 100
          });

          context = await browser.newContext();
          await context.addCookies(cookies);
          page = await context.newPage();

          await page.goto('https://www.facebook.com', { timeout: 30000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
          await page.waitForTimeout(2000);
        }

        // Navigate to group
        const groupUrl = `https://www.facebook.com/groups/${groupId}`;
        console.log(`  Opening group: ${groupUrl}`);
        await page.goto(groupUrl, { timeout: 30000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        await page.waitForTimeout(2000);

      // Open post composer
      const writeButton = page.locator('div[role="button"]').filter({
        hasText: /Write something/i
      }).first();
      await writeButton.click();
      await page.waitForTimeout(2000);

      // Find Create post modal
      const dialogs = page.locator('div[role="dialog"]');
      const dialogCount = await dialogs.count();
      let modal = null;
      for (let i = 0; i < dialogCount; i++) {
        const dialog = dialogs.nth(i);
        const ariaLabel = await dialog.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.includes('Messenger')) {
          continue;
        }
        modal = dialog;
        break;
      }

      if (!modal) {
        throw new Error('Create post modal not found');
      }

      await page.waitForTimeout(3000);

      // Type post content
      console.log('  Typing content...');

      let editor = null;
      const editorSelectors = [
        { selector: 'div[data-lexical-editor="true"]', type: 'lexical' },
        { selector: 'div[contenteditable="true"]', type: 'contenteditable' },
        { selector: 'div[role="textbox"]', type: 'textbox' },
        { selector: 'div[aria-label*="Write"]', type: 'aria-write' },
        { selector: 'div[aria-placeholder*="Write"]', type: 'aria-placeholder' },
        { selector: 'textarea', type: 'textarea' },
        { selector: '[contenteditable="true"]', type: 'any-contenteditable' }
      ];

      let editorType = null;
      for (const { selector, type } of editorSelectors) {
        const element = modal.locator(selector).first();
        if (await element.count() > 0) {
          try {
            await element.waitFor({ state: 'attached', timeout: 2000 });
            editor = element;
            editorType = type;
            break;
          } catch (e) {
            // Try next selector
          }
        }
      }

      if (!editor) {
        await page.screenshot({ path: path.join('log', `error-no-editor-${groupId}.png`) });
        throw new Error('No editor found in modal');
      }

      // Focus and type
      if (editorType === 'lexical') {
        const paragraph = editor.locator('p').first();
        if (await paragraph.count() > 0) {
          await paragraph.click({ timeout: 5000 });
        } else {
          await editor.click();
        }
      } else {
        await editor.click();
      }
      await page.waitForTimeout(500);

      await page.keyboard.type(postContent, { delay: 30 });
      await page.waitForTimeout(1000);

      // Upload media files
      if (mediaFiles.length > 0) {
        console.log(`  Uploading ${mediaFiles.length} media files...`);

        // Find file input with multiple attribute for uploading multiple files
        const selectors = [
          'input[type="file"][multiple][accept*="image"]',
          'input[type="file"][multiple][accept*="video"]',
          'input[type="file"][multiple]'
        ];

        let fileInput = null;
        for (const selector of selectors) {
          const inputs = await page.locator(selector).all();
          if (inputs.length > 0) {
            fileInput = inputs[0];
            break;
          }
        }

        if (!fileInput) {
          console.log('  ERROR: File input not found!');
          await page.screenshot({ path: path.join('log', `error-no-file-input-${groupId}.png`) });
          return;
        }

        // Upload files
        await fileInput.setInputFiles(mediaFiles);
        console.log(`  Files uploaded: ${mediaFiles.map(f => path.basename(f)).join(', ')}`);

        // Wait for upload to complete
        await page.waitForTimeout(8000);
        console.log('  Upload completed');
      }

      // Click Post button
      console.log('  Clicking Post button...');

      const strategies = [
        async () => {
          const btn = modal.locator('div[aria-label="Post"][role="button"]').first();
          if (await btn.count() > 0) {
            await page.waitForTimeout(2000);
            await btn.click();
            return true;
          }
          return false;
        },
        async () => {
          const btn = modal.locator('div[role="button"]:has-text("Post")').first();
          if (await btn.count() > 0) {
            await page.waitForTimeout(2000);
            await btn.click();
            return true;
          }
          return false;
        },
        async () => {
          const btn = modal.getByRole('button', { name: 'Post', exact: true }).first();
          if (await btn.count() > 0) {
            await page.waitForTimeout(2000);
            await btn.click();
            return true;
          }
          return false;
        },
        async () => {
          const elements = await modal.locator('text=Post').all();
          for (const element of elements) {
            try {
              const isClickable = await element.evaluate(el => {
                const style = window.getComputedStyle(el);
                return style.cursor === 'pointer' || el.onclick !== null;
              });
              if (isClickable) {
                await page.waitForTimeout(2000);
                await element.click();
                return true;
              }
            } catch (e) {
              // Try next
            }
          }
          return false;
        }
      ];

      let clicked = false;
      for (const strategy of strategies) {
        try {
          clicked = await strategy();
          if (clicked) break;
        } catch (error) {
          // Try next
        }
      }

      if (!clicked) {
        throw new Error('Could not click Post button');
      }

      // Wait for post to publish
      await page.waitForTimeout(8000);

      // Take evidence screenshot
      const screenshotPath = path.join('log', `evidence-group-${groupId}-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      success = true;
      console.log(`  ✓ Posted successfully\n`);
      break;

      } catch (error) {
        if (retry === maxRetries - 1) {
          console.error(`  ✗ Failed after ${maxRetries} attempts: ${error.message}`);
          try {
            const errorScreenshot = path.join('log', `error-group-${groupId}-${Date.now()}.png`);
            await page.screenshot({ path: errorScreenshot, fullPage: true });
          } catch (e) {
            // Ignore screenshot error
          }
        } else {
          console.error(`  Attempt ${retry + 1} failed: ${error.message}`);
        }
      }
    } // End retry loop

    // Wait before processing next group
    await page.waitForTimeout(3000);
  }

  console.log('\n✓ All groups processed!');
  console.log('Closing browser in 5 seconds...\n');

  await page.waitForTimeout(5000);
  await browser.close();
  console.log('Process completed.');
}

// Run the bot
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
