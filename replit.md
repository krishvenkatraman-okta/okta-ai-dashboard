# Okta Enterprise Portal

## Overview

This is a full-stack web application that provides an enterprise portal for Okta identity management with AI-powered assistance capabilities. The application features secure authentication through Okta OIDC, a comprehensive dashboard for managing users and applications, and an AI assistant powered by Model Context Protocol (MCP) for handling governance, privileged access management (PAM), and general Okta-related queries.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a modern full-stack architecture with clear separation between frontend and backend concerns:

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for client-side routing
- **Build Tool**: Vite for development and production builds
- **UI Components**: Comprehensive set of Radix UI primitives with custom styling

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Style**: RESTful API with structured error handling
- **Authentication**: Okta OIDC integration with session management
- **Database**: PostgreSQL with Drizzle ORM
- **AI Integration**: Model Context Protocol (MCP) server for intelligent assistance

## Key Components

### Authentication System
- **Provider**: Okta OIDC with authorization code flow
- **Session Management**: Cookie-based sessions with PostgreSQL storage
- **Authorization**: Role-based access control (super_admin, app_owner, regular_user)
- **Security**: Secure token handling and automatic session refresh

### Database Schema
- **Users**: Stores Okta user information, roles, and group memberships
- **Sessions**: Manages authentication sessions with Okta token storage
- **Chat Messages**: Logs AI assistant conversations for audit and continuity
- **PAM Sessions**: Tracks privileged access management sessions and activities

### AI Assistant (MCP Integration)
- **Intent Analysis**: Natural language processing to categorize user requests
- **Governance Workflows**: Automated compliance and governance task handling
- **PAM Operations**: Privileged access session management and monitoring
- **Okta API Integration**: Direct integration with Okta Management APIs for real-time operations

### Dashboard Features
- **User Management**: View and manage Okta users and groups
- **Application Overview**: Monitor connected applications and their status
- **Analytics**: Real-time statistics and usage metrics
- **Access Requests**: Handle and approve access requests through the AI assistant

## Data Flow

1. **Authentication Flow**: User initiates login → Okta OIDC redirect → Authorization code exchange → Session creation → Dashboard access
2. **AI Assistant Flow**: User query → Intent analysis → Okta API calls or governance workflows → Response generation → Database logging
3. **Dashboard Data Flow**: Authenticated requests → Okta Management API → Data aggregation → Real-time dashboard updates

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection for Neon hosting
- **drizzle-orm**: Type-safe database operations and migrations
- **@tanstack/react-query**: Efficient server state management and caching
- **express**: Web application framework for the backend API

### Authentication
- **Okta OIDC**: Primary authentication provider
- **cookie-parser**: Session cookie management
- **connect-pg-simple**: PostgreSQL session store

### UI Framework
- **@radix-ui/***: Comprehensive set of accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Type-safe variant management for components

### Development Tools
- **tsx**: TypeScript execution for development
- **esbuild**: Fast bundling for production builds
- **vite**: Development server with HMR and optimized builds

## Deployment Strategy

### Build Process
- **Frontend**: Vite builds React application to `dist/public`
- **Backend**: esbuild bundles Express server to `dist/index.js`
- **Database**: Drizzle Kit handles schema migrations

### Environment Configuration
- **Development**: Local development with Vite dev server and tsx for backend
- **Production**: Node.js server serving both API and static files
- **Database**: PostgreSQL with connection via `DATABASE_URL`
- **Okta OIDC Configuration (PKCE Flow)**: 
  - `OKTA_DOMAIN` (e.g., fcxdemo.okta.com)
  - `OKTA_CLIENT_ID` (OIDC application client ID - public client)
  - `OKTA_REDIRECT_URI` (Fixed to production domain: https://okta-identity-portal-krrishjey.replit.app/api/auth/callback)
  - OAuth scopes: `openid profile email` (groups fetched via Management API)
- **Okta API & PAM Configuration**:
  - `OKTA_API_TOKEN` (Management API token for MCP server operations)
  - `OKTA_PAM_DOMAIN` (PAM-specific domain, defaults to OKTA_DOMAIN)
  - `OKTA_PAM_TEAM` (PAM team name for constructing API calls)

### Hosting Considerations
- **Database**: Designed for Neon PostgreSQL (serverless PostgreSQL)
- **Static Assets**: Served directly by Express in production
- **Session Storage**: PostgreSQL-backed session store for scalability
- **Security**: Environment-based configuration for sensitive credentials

The application is architected for scalability and maintainability, with clear separation of concerns, comprehensive error handling, and modern development practices throughout the stack.