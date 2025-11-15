# Deployment Guide for Telegram Bot on Vercel

## Prerequisites
1. A GitHub account
2. A Vercel account (sign up at https://vercel.com)
3. Your Telegram bot token and IDs

## Step-by-Step Deployment

### Step 1: Prepare Your Code
1. Make sure all your code is ready
2. Verify `.gitignore` includes:
   - `.env` (your local environment file)
   - `node_modules/`
   - `dist/`
   - Debug files

### Step 2: Initialize Git Repository (if not already done)
```bash
git init
git add .
git commit -m "Initial commit - Telegram bot ready for deployment"
```

### Step 3: Push to GitHub
1. Create a new repository on GitHub (https://github.com/new)
2. **DO NOT** initialize it with README, .gitignore, or license
3. Copy the repository URL
4. Push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### Step 4: Deploy to Vercel

#### Option A: Via Vercel Dashboard (Recommended)
1. Go to https://vercel.com/login
2. Sign in with GitHub
3. Click **"Add New Project"**
4. Import your GitHub repository
5. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: `npm run build`
   - **Output Directory**: Leave empty (Vercel handles this)
   - **Install Command**: `npm install`
6. Click **"Environment Variables"** and add ALL of these:

   ```
   BOT_TOKEN=your_bot_token_here
   ADMIN_IDS=your_admin_telegram_id_here
   PUBLIC_URL=https://your-app-name.vercel.app
   TARGET_CHANNEL_ID=-1001234567890
   DISCUSSION_GROUP_ID=-1001234567890
   BOT_USERNAME=YourBotUsername
   CHANNEL_USERNAME=your_channel_username
   DISCUSSION_GROUP_USERNAME=your_discussion_group_username
   ```

   **Important Notes:**
   - Replace all placeholder values with your actual values
   - `PUBLIC_URL` will be provided by Vercel after first deployment (you can update it later)
   - For `ADMIN_IDS`, separate multiple IDs with commas: `123456789,987654321`
   - Make sure there are NO spaces around the `=` sign
   - Click "Add" for each variable

7. Click **"Deploy"**

#### Option B: Via Vercel CLI
```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# Set environment variables
vercel env add BOT_TOKEN
vercel env add ADMIN_IDS
vercel env add PUBLIC_URL
vercel env add TARGET_CHANNEL_ID
vercel env add DISCUSSION_GROUP_ID
vercel env add BOT_USERNAME
vercel env add CHANNEL_USERNAME
vercel env add DISCUSSION_GROUP_USERNAME

# Deploy to production
vercel --prod
```

### Step 5: Set Up Webhook
After deployment, you need to register the webhook with Telegram:

1. Get your Vercel deployment URL (e.g., `https://your-app-name.vercel.app`)
2. Update `PUBLIC_URL` in Vercel environment variables if needed
3. Visit this URL in your browser:
   ```
   https://your-app-name.vercel.app/api/set-webhook
   ```
4. You should see: `{"ok":true,"webhookUrl":"https://..."}`
5. Your bot is now connected!

### Step 6: Verify Deployment
1. Send a message to your bot
2. Check Vercel logs: Go to your project → **"Deployments"** → Click latest deployment → **"Functions"** → `api/webhook` → **"Logs"**
3. Test all features:
   - Send anonymous message
   - Test "Add comment" button
   - Test "View comments" button
   - Verify admin commands work

## Troubleshooting

### Bot not responding?
1. Check Vercel function logs for errors
2. Verify all environment variables are set correctly
3. Ensure webhook is set: Visit `/api/set-webhook` endpoint
4. Check that `PUBLIC_URL` matches your Vercel deployment URL

### Environment variables not working?
1. Make sure variable names match exactly (case-sensitive)
2. Redeploy after adding/changing environment variables
3. Check Vercel dashboard → Settings → Environment Variables

### Build errors?
1. Ensure `tsconfig.json` is correct
2. Check that all dependencies are in `package.json`
3. Verify TypeScript compiles locally: `npm run build`

## Updating Your Bot
1. Make changes to your code
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Your update message"
   git push
   ```
3. Vercel will automatically redeploy!

## Important Notes
- Your `.env` file is NOT uploaded to GitHub (it's in `.gitignore`)
- Environment variables in Vercel are separate from your local `.env`
- Always update `PUBLIC_URL` in Vercel if your deployment URL changes
- The bot runs 24/7 on Vercel's serverless functions
- You can stop local development bot when deployed

