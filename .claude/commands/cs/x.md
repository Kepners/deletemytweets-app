---
description: Post tweets and threads to X (Twitter) without the official API
allowed-tools: ["Bash", "Read", "Grep"]
---

# /cs:x - X (Twitter) Publisher

You are helping the user post tweets and threads to their X (Twitter) account without the official API.

## Brand Guidelines - ALWAYS FOLLOW

**Every tweet MUST include:**
1. 🧅 **Onion emoji** - Use at least once (beginning or end of tweet)
2. **Link to site** - `choppedonions.xyz` (at end if space permits)
3. **1-2 hashtags** - Keep it minimal

**Hashtag options (pick 1-2):**
- #ChoppedOnions (always good)
- #AINews or #VideoNews (for news content)
- #TechNews (for tech topics)

**Example tweet format:**
```
🧅 [Main message here]

choppedonions.xyz #ChoppedOnions
```

## Your Task

1. **Suggest tweet ideas** - Check git history and suggest 3-5 tweet ideas based on recent work
2. **Gather content** - Ask the user what they want to tweet, or use content they provide
3. **Format for X** - Add 🧅 emoji, site link, and hashtags. Ensure fits in 280 chars
4. **Post tweet/thread** - Use the publish script to post to X
5. **Return URL** - Give them the tweet link

## Step 1: Suggest Tweet Ideas

**ALWAYS start by checking recent work and suggesting ideas:**

```bash
git log --oneline -10
```

Then present 3-5 tweet ideas based on:
- Recent commits and features shipped
- Bug fixes (frame as reliability improvements)
- New integrations or capabilities
- Performance improvements
- User-facing changes

**Example output format:**
```
📝 Here are some tweet ideas based on recent work:

1. 🧅 Just shipped [feature] - [benefit to users]
   choppedonions.xyz #ChoppedOnions

2. 🧅 New: [capability]. [What it does for users]
   choppedonions.xyz #AINews

3. 🧅 [Improvement] is now live. [Impact]
   choppedonions.xyz #ChoppedOnions

Which one would you like to post? Or tell me something else to tweet about.
```

**Tweet idea categories:**
- **Feature launches**: "Just shipped...", "New:", "Introducing..."
- **Improvements**: "Now faster...", "Better...", "Upgraded..."
- **Milestones**: "Hit X users...", "X videos generated...", "X days of..."
- **Behind the scenes**: "Building...", "Working on...", "Debugging..."
- **Industry commentary**: React to news with ChoppedOnions perspective

## First-Time Setup

**IMPORTANT**: Before doing ANYTHING else, check if a session exists:

```bash
cd .claude/utils && node -e "const fs = require('fs'); console.log(fs.existsSync('x_session.json') || fs.existsSync('twitter-config.json') ? 'HAS_SESSION' : 'NO_SESSION');"
```

If `NO_SESSION` is returned, run the browser login:

```bash
cd .claude/utils && node publish-to-twitter.js login
```

This opens a browser window where the user can log in manually. Cookies are saved automatically.

## How to Post a Single Tweet

```bash
cd .claude/utils && node -e "
import('./publish-to-twitter.js').then(({ postTweet }) => {
  postTweet('Your tweet text here (max 280 chars)')
    .then(result => {
      console.log('✅ Tweet posted!');
      console.log('URL:', result.tweetUrl);
    })
    .catch(err => {
      console.error('❌ Failed:', err.message);
      process.exit(1);
    });
});
"
```

## How to Post a Tweet with Image

```bash
cd .claude/utils && node -e "
import('./publish-to-twitter.js').then(({ postTweet }) => {
  postTweet('Your tweet text here', { imagePath: './path/to/image.png' })
    .then(result => {
      console.log('✅ Tweet posted!');
      console.log('URL:', result.tweetUrl);
    })
    .catch(err => {
      console.error('❌ Failed:', err.message);
      process.exit(1);
    });
});
"
```

## How to Post a Thread

```bash
cd .claude/utils && node -e "
import('./publish-to-twitter.js').then(({ postThread }) => {
  postThread([
    '🧅 First tweet in the thread',
    'Second tweet (auto-replies to first)',
    'Final tweet\\n\\nchoppedonions.xyz #ChoppedOnions'
  ]).then(result => {
    console.log('✅ Thread posted!');
    console.log('URL:', result.threadUrl);
  }).catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  });
});
"
```

## Taking Screenshots for Tweets

To capture a screenshot of the homepage or any page:

```bash
cd .claude/utils && node -e "
import('playwright').then(async ({ chromium }) => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('https://choppedonions.xyz', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshot.png', fullPage: false });
  console.log('✅ Screenshot saved');
  await browser.close();
});
"
```

## Session Management

```bash
# Browser login (opens browser, saves cookies automatically)
cd .claude/utils && node publish-to-twitter.js login

# Check if session exists
cd .claude/utils && node -e "
import('./publish-to-twitter.js').then(({ hasSession }) => {
  console.log('Has session:', hasSession());
});
"
```

## Example Workflow

```
User: Tweet about the new feature we just shipped
Assistant: Let me check the recent commits...
[Runs: git log --oneline -5]
[Crafts tweet with 🧅 emoji, site link, and hashtags]
[Posts using the script]
✅ Tweet posted: https://x.com/choppedonionsai/status/1234567890
```

## Character Limits

- Single tweet: 280 characters max (account for emoji, link, hashtags)
- Thread: Up to 25 tweets
- The thread builder automatically handles splitting

## Authentication Methods

1. **Browser Login (Recommended)**: Run `node publish-to-twitter.js login` - opens browser, you log in, cookies saved automatically
2. **Manual Config**: Create `twitter-config.json` with `auth_token` and `ct0` cookies from browser DevTools

## Troubleshooting

**Session expired?**
```bash
cd .claude/utils && node publish-to-twitter.js login
```

**401/403 errors?**
Session likely expired. Run login again.

## Important Notes

- Session files (`x_session.json`, `twitter-config.json`) should be in .gitignore
- Session cookies expire periodically - just run login again
- Don't spam - X still tracks rate limits
- This uses X's internal GraphQL API, not the official API
- ALWAYS include 🧅 emoji, choppedonions.xyz, and 1-2 hashtags
