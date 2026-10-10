# GitHub Repository Setup

Follow these steps to push this project to GitHub. The app does not require a database.

## Quick Setup Commands

1. **Initialize Git repository:**
```bash
git init
git add .
git commit -m "Initial commit: Okta AI Dashboard with enhanced NLP"
```

2. **Create or choose a GitHub repository:**
   - Go to [GitHub.com](https://github.com/new)
   - Repository name: `okta-ai-dashboard`
   - Description: `AI-powered Okta Identity Management Portal with intelligent access governance`
   - Choose Public or Private
   - Don't initialize with README, .gitignore, or license (we already have them)
   - Click "Create repository"

3. **Connect and push to GitHub:**
```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/okta-ai-dashboard.git
git push -u origin main
```

## Repository Features

Your repository will include:

✅ **Complete codebase** with AI-powered chat and governance features
✅ **Vercel deployment configuration** (`vercel.json`)
✅ **Comprehensive README** with setup instructions
✅ **Environment template** (`.env.example`)
✅ **Deployment guide** (`DEPLOYMENT.md`)
✅ **Git ignore file** with appropriate exclusions

## Next Steps After GitHub Setup

1. **Deploy the app (optional):**
   - Choose a long-running, single-process Node.js host
   - Configure the Okta environment variables from `.env.example`
   - Do not configure a database

2. **Configure Okta:**
   - Create OIDC applications
   - Set redirect URIs to your Vercel domain
   - Generate API tokens

## Project Structure

```
okta-ai-dashboard/
├── client/                 # React frontend
├── server/                 # Express backend
├── shared/                 # Shared types and schemas
├── api/                    # Vercel serverless functions
├── vercel.json            # Vercel deployment config
├── README.md              # Project documentation
├── DEPLOYMENT.md          # Deployment guide
├── .env.example           # Environment template
└── .gitignore             # Git exclusions
```

## Key Features Included

- **Enhanced Natural Language Processing** for access requests
- **Org-specific branding** with logo integration
- **Comprehensive pattern matching** for 25+ access request variations
- **Three-panel Okta-style layout** (Left Nav → Apps Grid → Right Chat)
- **AI-powered governance** with OpenAI GPT-4o integration
- **Gamification system** with points and badges
- **Real-time analytics** and usage tracking

## Environment Variables Required

See `.env.example` for the environment variables, including:
- Okta configuration (domain, client IDs, API tokens)
- OpenAI API key
- Redirect URIs for your domain

Users, sessions, chat, and gamification state are stored in server memory only. They reset when the server restarts, so use a long-running single-process Node.js host rather than a serverless host unless you add external session storage.

## Support

- Check `DEPLOYMENT.md` for detailed deployment instructions
- Review `README.md` for technical documentation
- See your hosting provider's logs for troubleshooting