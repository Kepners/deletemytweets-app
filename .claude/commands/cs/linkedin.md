---
description: Post updates to LinkedIn without the official API
allowed-tools: ["Bash", "Read", "Grep"]
---

# /cs:linkedin - LinkedIn Publisher

You are helping the user post updates to their LinkedIn account without the official API.

## Brand Guidelines - ALWAYS FOLLOW

**Every LinkedIn post SHOULD include:**
1. **Professional tone** - LinkedIn is professional, keep it business-appropriate
2. **Link to site** - `choppedonions.xyz` (when relevant)
3. **1-2 hashtags** - Keep it minimal and professional
4. **Call to action** - Encourage engagement when appropriate

**Hashtag options (pick 1-2):**
- #ChoppedOnions (always good for brand)
- #AINews or #TechNews (for tech content)
- #StartupLife (for behind-the-scenes)
- #BuildingInPublic (for dev updates)

**Example post format:**
```
[Main message - professional and engaging]

[Optional: Link or call to action]

choppedonions.xyz

#ChoppedOnions #AINews
```

## Your Task

1. **Suggest post ideas** - Check git history and suggest 3-5 post ideas based on recent work
2. **Gather content** - Ask the user what they want to post, or use content they provide
3. **Format for LinkedIn** - Professional tone, site link, and hashtags
4. **Post update** - Use the publish script to post to LinkedIn
5. **Return URL** - Give them the post link

## Step 1: Suggest Post Ideas

**ALWAYS start by checking recent work and suggesting ideas:**

```bash
git log --oneline -10
```

Then present 3-5 post ideas based on:
- Recent commits and features shipped
- Technical achievements (frame professionally)
- New integrations or capabilities
- Milestones and wins
- Industry insights

**Example output format:**
```
Here are some LinkedIn post ideas based on recent work:

1. Excited to announce [feature] - [professional description of value]

   choppedonions.xyz #ChoppedOnions #TechNews

2. Just shipped: [capability]. Here's what it means for [users/industry]

   choppedonions.xyz #AINews

3. Behind the scenes: [technical achievement]. [Insight or lesson learned]

   #BuildingInPublic #ChoppedOnions

Which one would you like to post? Or tell me something else to share.
```

**Post idea categories:**
- **Announcements**: "Excited to announce...", "Just shipped...", "Introducing..."
- **Insights**: "Here's what we learned...", "Key insight from...", "The surprising thing about..."
- **Milestones**: "Proud moment...", "Milestone reached...", "Celebrating..."
- **Behind the scenes**: "Building [X] taught us...", "The technical challenge of..."
- **Industry commentary**: Professional takes on AI/tech news

## First-Time Setup

**IMPORTANT**: Before doing ANYTHING else, check if a session exists:

```bash
cd .claude/utils && node -e "const fs = require('fs'); console.log(fs.existsSync('linkedin_session.json') ? 'HAS_SESSION' : 'NO_SESSION');"
```

If `NO_SESSION` is returned, run the browser login:

```bash
cd .claude/utils && node publish-to-linkedin.js login
```

This opens a browser window where the user can log in manually. Cookies are saved automatically.

## How to Post an Update (Text Only)

```bash
cd .claude/utils && node -e "
import('./publish-to-linkedin.js').then(({ postUpdate }) => {
  postUpdate('Your LinkedIn post text here')
    .then(result => {
      console.log('✅ Posted to LinkedIn!');
      console.log('URL:', result.postUrl);
    })
    .catch(err => {
      console.error('❌ Failed:', err.message);
      process.exit(1);
    });
});
"
```

## How to Post with an Image

```bash
cd .claude/utils && node -e "
import('./publish-to-linkedin.js').then(({ postUpdate }) => {
  postUpdate('Check out this screenshot!', { imagePath: './screenshot.png' })
    .then(result => {
      console.log('✅ Posted to LinkedIn!');
      console.log('URL:', result.postUrl);
    })
    .catch(err => {
      console.error('❌ Failed:', err.message);
      process.exit(1);
    });
});
"
```

## How to Post with a Video

```bash
cd .claude/utils && node -e "
import('./publish-to-linkedin.js').then(({ postUpdate }) => {
  postUpdate('Watch our latest demo!', { videoPath: './demo.mp4' })
    .then(result => {
      console.log('✅ Posted to LinkedIn!');
      console.log('URL:', result.postUrl);
    })
    .catch(err => {
      console.error('❌ Failed:', err.message);
      process.exit(1);
    });
});
"
```

**Note:** Video uploads can take 1-2 minutes to process. The script will wait automatically.

## How to Delete a Post

```bash
cd .claude/utils && node -e "
import('./publish-to-linkedin.js').then(({ deletePost }) => {
  deletePost('https://www.linkedin.com/feed/update/urn:li:activity:123456789')
    .then(() => {
      console.log('✅ Post deleted!');
    })
    .catch(err => {
      console.error('❌ Failed:', err.message);
      process.exit(1);
    });
});
"
```

## Session Management

```bash
# Browser login (opens browser, saves cookies automatically)
cd .claude/utils && node publish-to-linkedin.js login

# Check if session exists
cd .claude/utils && node -e "
import('./publish-to-linkedin.js').then(({ hasSession }) => {
  console.log('Has session:', hasSession());
});
"

# Clear session
cd .claude/utils && node publish-to-linkedin.js clear
```

## Example Workflow

```
User: Post about the Twitter integration we just built
Assistant: Let me check the recent commits...
[Runs: git log --oneline -5]
[Crafts a professional LinkedIn post]
[Posts using the script]
✅ Posted to LinkedIn: https://www.linkedin.com/feed/update/urn:li:share:123456
```

## Character Limits

- LinkedIn posts: 3,000 characters max
- First ~140 characters show in preview - make them count!
- No threading like Twitter - keep it in one post

## Key Differences from Twitter

| Twitter | LinkedIn |
|---------|----------|
| 280 chars | 3,000 chars |
| Casual tone | Professional tone |
| Threads for long content | Single comprehensive post |
| Many hashtags OK | 1-3 hashtags max |

## Troubleshooting

**Session expired?**
```bash
cd .claude/utils && node publish-to-linkedin.js login
```

**401/403 errors?**
Session likely expired. Run login again.

**Rate limited?**
LinkedIn is stricter than Twitter. Wait a few minutes between posts.

## Important Notes

- Session file (`linkedin_session.json`) is in .gitignore
- Session cookies expire periodically - just run login again
- LinkedIn is stricter about automation - don't spam
- This uses LinkedIn's internal Voyager API, not the official API
- Keep posts professional - LinkedIn audience expects quality content
