---
description: Create Substack draft posts with proper ProseMirror formatting
allowed-tools: ["Bash", "Read", "Grep"]
---

# /cs:substack - Substack Post Publisher

You are helping the user create and publish blog posts to their Substack publication (choppedonions.substack.com).

## Your Task

1. **Gather content** - Ask the user what they want to write about, or use content they provide
2. **Check git history** (optional) - If they want to write about recent work, use `git log` to see commits
3. **Generate the post** - Create compelling title, subtitle, and markdown body
4. **Publish draft** - Use the publish script to create a Substack draft
5. **Return URL** - Give them the draft link to review and publish

## How to Create a Draft

Use the test script which imports the working implementation:

```bash
cd .claude/utils && node -e "
import('./publish-to-substack.js').then(({ createDraft }) => {
  createDraft(
    'Your Title Here',
    'Your subtitle here',
    \`# Your Markdown Content

This is the body of the post with **bold** and *italic* formatting.

## Section heading

- Bullet point 1
- Bullet point 2

1. Numbered item
2. Another item
\`
  ).then(result => {
    console.log('✅ Draft created!');
    console.log('Draft URL:', result.draftUrl);
    console.log('Post ID:', result.postId);
  }).catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  });
});
"
```

## Markdown Formatting Supported

- **Headings**: `# H1`, `## H2`, `### H3`, etc.
- **Bold**: `**text**`
- **Italic**: `*text*` or `_text_`
- **Code**: `` `code` ``
- **Bullet lists**: `- item` or `* item`
- **Numbered lists**: `1. item`
- **Code blocks**: ` ```code``` `
- **Images**: `![alt text](https://url.com/image.jpg)` or `[IMAGE: description]`

## Image Upload Support

Images can be uploaded to Substack CDN and embedded in posts:

```bash
cd .claude/utils && node -e "
import('./publish-to-substack.js').then(({ createDraft }) => {
  createDraft(
    'Post With Images',
    'A visual journey',
    \`# My Post

![header image](header)

Some text here.

[IMAGE: screenshot of feature]

More content.
\`,
    {
      'header': 'C:/path/to/header.png',
      'screenshot_of_feature': 'C:/path/to/screenshot.png'
    }
  ).then(result => {
    console.log('✅ Draft created!');
    console.log('Draft URL:', result.draftUrl);
    console.log('Uploaded images:', result.uploadedImages);
  });
});
"
```

**Image placeholder formats:**
- `![alt](placeholder)` - Use the placeholder name in the images object
- `[IMAGE: description]` - Converts to snake_case key (e.g., "my image" → "my_image")
- Direct URLs: `![alt](https://example.com/image.jpg)` - Used as-is (no upload)

## Example Workflow

```
User: Write a post about the Substack integration we just built
Assistant: Great idea! Let me check git history first...
[Runs: git log --oneline -10]
[Generates title, subtitle, body from commit messages]
[Creates draft using the script above]
✅ Draft created: https://choppedonions.substack.com/publish/posts/183012366
```

## Important Notes

- The converter handles markdown → ProseMirror automatically
- Session credentials are hardcoded (no env vars needed)
- Always use multiline template strings for body content
- Escape backticks and ${ } in template strings
- Return the draft URL so user can review before publishing
