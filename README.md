# Okta AI Dashboard

An advanced AI-powered Okta Identity Management Portal that provides intelligent, user-friendly authentication and access governance through cutting-edge security technologies and engaging user experience design.

## Features

- **AI-Powered Chat Assistant**: Natural language processing for access requests and governance operations
- **Okta OIDC Authentication**: Secure authentication with enhanced scope management
- **Access Request Management**: Intelligent access request workflows with duration management
- **Governance Capabilities**: 30-day access reviews, compliance tracking, and audit trails
- **Gamification System**: Points, badges, and leaderboards for security compliance
- **Real-time Analytics**: Dashboard with user and application insights
- **Responsive Design**: Modern UI with Okta-style three-panel layout

## Tech Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS with shadcn/ui components
- TanStack Query for state management
- Wouter for routing
- Vite for development and building

### Backend
- Node.js with Express.js
- TypeScript with ES modules
- In-memory user, session, and chat storage (no database required)
- Okta Management APIs integration
- OpenAI GPT-4o for intelligent assistance

### Key Integrations
- **Okta OIDC**: Primary authentication provider
- **Okta Management APIs**: User management, application overview, governance
- **Okta IGA API**: Governance campaigns, access requests, catalog management
- **OpenAI**: Enhanced natural language processing for user requests

## Quick Start

### Prerequisites
- Node.js 18+
- Okta developer account with appropriate API tokens

### Environment Variables

Create a `.env` file with the following variables:

```env
# Okta Configuration
OKTA_DOMAIN=your-okta-domain.okta.com
OKTA_CLIENT_ID=your-client-id
OKTA_CLIENT_SECRET=your-client-secret
OKTA_API_TOKEN=your-api-token

# Governance/IGA Configuration
OKTA_GOVERNANCE_CLIENT_ID=your-governance-client-id
OKTA_GOVERNANCE_CLIENT_SECRET=your-governance-client-secret

# Admin Configuration
OKTA_ADMIN_CLIENT_ID=your-admin-client-id
OKTA_ADMIN_CLIENT_SECRET=your-admin-client-secret

# AI Configuration
OPENAI_API_KEY=your-openai-api-key

# App Configuration
REDIRECT_URI=https://your-domain.com/api/auth/callback
OKTA_CUSTOM_DOMAIN=your-custom-domain.com
SESSION_SECRET=your-session-secret
```

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd okta-ai-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5000`.
User, session, chat, and gamification data is kept in memory and resets when the server restarts. No database or database URL is needed.

## Deployment

### Hosting

Use a long-running Node.js host and configure the required Okta environment variables. The production build can be created with:

```bash
npm run build
npm start
```

**Important**: This app stores sessions in memory. Serverless hosts such as Vercel can route requests to different instances, so authentication and state are not reliable there. Use a long-running, single-process Node.js host, or add a persistent session store before using a multi-instance/serverless host.

### Environment Variables

Add the Okta and optional AI variables from `.env.example` to your hosting provider. No database URL is needed.

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   └── hooks/          # Custom React hooks
├── server/                 # Backend Express application
│   ├── services/           # Business logic services
│   └── routes.ts           # API routes
├── shared/                 # Shared types and schemas
```

## Key Features

### AI Assistant Capabilities
- Natural language access request processing
- Intelligent application catalog browsing
- 30-day access review automation
- Governance campaign management
- Real-time Okta API integration

### Authentication Flow
- Okta OIDC with PKCE flow
- Role-based access control (super_admin, app_owner, regular_user)
- In-memory session management (cleared when the server restarts)
- Admin session handling for privileged operations

### Gamification System
- Points for security actions and compliance
- Badges for achievements and milestones
- License seat savings tracking
- Leaderboard for organizational engagement

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.