# Deployment Guide

This guide will help you deploy the Okta AI Dashboard to Vercel.

## Prerequisites

1. **GitHub Account**: You'll need a GitHub account to host the repository
2. **Vercel Account**: Sign up for a free Vercel account
3. **PostgreSQL Database**: Set up a PostgreSQL database (Neon, Supabase, or Vercel Postgres recommended)
4. **Okta Developer Account**: Configure Okta applications and obtain API tokens

## Step 1: Create GitHub Repository

1. Go to [GitHub](https://github.com) and create a new repository
2. Name it something like `okta-ai-dashboard`
3. Make it public or private (your choice)
4. Don't initialize with README (we already have one)

## Step 2: Push Code to GitHub

Run these commands in your project directory:

```bash
git init
git add .
git commit -m "Initial commit: Okta AI Dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/okta-ai-dashboard.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

## Step 3: Set Up Database

### Option A: Neon (Recommended)
1. Go to [Neon](https://neon.tech)
2. Create a new project
3. Copy the connection string

### Option B: Vercel Postgres
1. In your Vercel dashboard, go to Storage
2. Create a new Postgres database
3. Copy the connection string

## Step 4: Configure Okta Applications

You'll need to create three Okta applications:

### Main Application (OIDC)
1. In Okta Admin Console, go to Applications → Create App Integration
2. Choose OIDC - OpenID Connect
3. Application type: Single-Page Application
4. Grant types: Authorization Code, Refresh Token
5. Sign-in redirect URI: `https://your-app.vercel.app/api/auth/callback`
6. Sign-out redirect URI: `https://your-app.vercel.app`

### Governance Application
1. Create another OIDC app for governance operations
2. Same settings as above
3. Note the Client ID and Secret

### Admin Application
1. Create a third OIDC app for admin operations
2. Same settings as above
3. Note the Client ID and Secret

## Step 5: Deploy to Vercel

1. Go to [Vercel](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Vercel will auto-detect it as a Node.js project

### Important Build Settings
- **Build Command**: `node build.js` (this is already configured in vercel.json)
- **Output Directory**: `dist` (for frontend assets)
- **Install Command**: `npm install`

### Configure Environment Variables

In Vercel project settings, add these environment variables:

```env
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# Okta Configuration
OKTA_DOMAIN=your-domain.okta.com
OKTA_CLIENT_ID=your-main-client-id
OKTA_CLIENT_SECRET=your-main-client-secret
OKTA_API_TOKEN=your-api-token

# Governance Configuration
OKTA_GOVERNANCE_CLIENT_ID=your-governance-client-id
OKTA_GOVERNANCE_CLIENT_SECRET=your-governance-client-secret

# Admin Configuration
OKTA_ADMIN_CLIENT_ID=your-admin-client-id
OKTA_ADMIN_CLIENT_SECRET=your-admin-client-secret

# AI Configuration
OPENAI_API_KEY=your-openai-api-key

# App Configuration
REDIRECT_URI=https://your-app.vercel.app/api/auth/callback
GOVERNANCE_REDIRECT_URI=https://your-app.vercel.app/api/auth/governance/callback
ADMIN_REDIRECT_URI=https://your-app.vercel.app/api/auth/admin/callback
OKTA_CUSTOM_DOMAIN=your-custom-domain.com
SESSION_SECRET=a-random-secret-string
NODE_ENV=production
```

## Step 6: Deploy

1. Click "Deploy" in Vercel
2. Wait for the build to complete
3. Your app will be available at `https://your-app.vercel.app`

## Step 7: Update Okta Redirect URIs

After deployment, update your Okta applications with the actual Vercel URL:

1. Replace `your-app.vercel.app` with your actual Vercel domain
2. Update all three Okta applications with the correct redirect URIs

## Step 8: Initialize Database

After successful deployment, you'll need to initialize the database:

### Option A: Local Setup (Recommended)
1. In your local development environment, update the `DATABASE_URL` in `.env` to point to your production database
2. Run: `npm run db:push`
3. This will create all necessary tables

### Option B: Vercel CLI
1. Install Vercel CLI: `npm i -g vercel`
2. Link your project: `vercel link`
3. Run database setup: `vercel env pull .env.local && npm run db:push`

## Troubleshooting

### Common Issues

1. **404 Not Found Error**: 
   - Ensure the build completed successfully
   - Check that `build.js` runs without errors
   - Verify all environment variables are set correctly

2. **Build Failures**: 
   - Check Vercel build logs for specific errors
   - Ensure all dependencies are properly installed
   - Verify the build command is set to `node build.js`

3. **Database Connection**: 
   - Ensure DATABASE_URL is correct and accessible from Vercel
   - Check that the database allows connections from Vercel's IP ranges
   - Verify database schema is initialized with `npm run db:push`

4. **Okta Authentication**: 
   - Update redirect URIs in Okta apps to match your Vercel domain
   - Ensure all Okta environment variables are set correctly
   - Check that the domain configuration matches your deployment

5. **API Timeouts**: 
   - Functions have a 30-second timeout (configurable in vercel.json)
   - For longer operations, consider implementing background jobs

### Logs and Debugging

1. Check Vercel function logs in the Vercel dashboard
2. Use Vercel CLI for local testing: `vercel dev`
3. Check browser console for frontend errors

## Maintenance

### Updating the Application
1. Push changes to your GitHub repository
2. Vercel will automatically deploy the changes

### Database Migrations
- Use `npm run db:push` for schema changes
- Always backup your database before major updates

## Security Notes

1. Keep all API tokens and secrets secure
2. Use strong session secrets
3. Regularly rotate API keys
4. Monitor access logs
5. Set up proper CORS if needed

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify all environment variables
3. Test Okta configuration
4. Check database connectivity