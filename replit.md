# Okta AI Dashboard

## Overview

This is a full-stack web application that provides an AI-powered dashboard for Okta identity management with intelligent governance capabilities. The application features secure authentication through Okta OIDC, a comprehensive dashboard for managing users and applications, and an AI assistant powered by local Ollama (Llama 3.1 8B) for handling governance, privileged access management (PAM), and real-time access reviews using System Log API integration.

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
- **Provider**: Okta OIDC with authorization code flow (PKCE)
- **Session Management**: Cookie-based sessions with PostgreSQL storage
- **Authorization**: Role-based access control (super_admin, app_owner, regular_user)
- **Security**: Secure token handling and automatic session refresh
- **Admin Authentication**: Simplified redirect-based admin authentication - users are redirected to fcxdemo-admin.okta.com/admin/dashboard for admin auth and return to confirm session
- **Admin Session Storage**: Simple in-memory flag tracking admin session status with 1-hour expiration

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
  - `OKTA_REDIRECT_URI` (Custom domain: https://atko.kriyahub.com/api/auth/callback)
  - **OAuth scopes**: `openid profile email okta.users.read.self okta.users.manage.self okta.enduser.read okta.enduser.manage okta.enduser.dashboard.read okta.enduser.dashboard.manage okta.myAccount.profile.read okta.myAccount.profile.manage okta.myAccount.sessions.manage`
  - **Admin Authentication**: Simple redirect to admin dashboard (no additional OAuth scopes needed)
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

## Recent Updates (July 19, 2025)

**Current Session Focus (July 22, 2025 - Session 12):**
- ✅ **Enhanced OAuth Scopes**: Updated OIDC scopes to include governance and enduser permissions for proper catalog access
- ✅ **Governance API Compatibility**: Updated to use correct public API scopes: `okta.enduser.read`, `okta.enduser.manage`, `okta.enduser.dashboard.read`, etc.
- ✅ **Admin Session Scopes**: Enhanced admin auth flow with `okta.governance.read` and `okta.governance.manage` permissions
- ✅ **Eliminated Apps API Fallback**: System now properly handles governance permission issues instead of falling back to Apps API
- ✅ **Session Token Governance**: All governance operations (catalog, access requests) now use expanded user session token scopes
- ✅ **Simplified Admin Flow**: Replaced complex OAuth admin flow with simple redirect to admin dashboard + manual confirmation
- ✅ **Admin Dashboard Integration**: Users authenticate at fcxdemo-admin.okta.com/admin/dashboard and return to confirm admin session
- ✅ **No Admin OAuth Scopes**: Removed complex admin OAuth since admin flow is just redirect-based authentication
- ✅ **CRITICAL: User Session Token Authentication**: Implemented exclusive use of user's browser session bearer token for all governance operations
- ✅ **Eliminated "Okta Admin" Requests**: Removed management API fallback that was causing requests to appear as API key owner instead of actual user
- ✅ **User Attribution Fixed**: Access requests now properly submit as the logged-in user (steve.rogers) with correct scoping
- ✅ **Admin Session Button Fixed**: Corrected action field mismatch (admin_auth_required → admin_oauth_flow) between frontend and backend
- ✅ **Governance API User Context**: Catalog requests now use user session token for proper user scoping and permissions
- ✅ **Enhanced Error Logging**: Clear distinction between user session token vs management API usage in logs
- ✅ **Proper Request Attribution**: Added requestedFor.externalId, requestedBy.externalId, and requested.entryId fields per Okta docs
- ✅ **Authentication Strategy**: User session tokens for governance/access requests, management API only for role extraction and 30-day usage

**Previous Session Focus (July 21, 2025 - Session 9):**
- ✅ **Session-Based Authentication Implementation**: Replaced API token authentication with proper session-based authentication for audit logging
- ✅ **Admin Session Management**: Created AdminSessionHandler component for redirecting to admin portal when admin operations are required
- ✅ **End-User vs Admin Operation Distinction**: LLM automation service now differentiates between operations that can use regular session tokens vs requiring admin authentication
- ✅ **Admin Domain Redirect Pattern**: Implements redirect to {domain}-admin.okta.com/admin/dashboard for proper admin audit trail
- ✅ **Frontend Admin Session UI**: Created components to handle admin session establishment with popup authentication flow
- ✅ **Audit Trail Compliance**: End-user operations (30-day reviews, access requests) use session tokens while admin operations require separate admin session
- ✅ **Role Display Fix**: Custom roles now properly display in chat interface instead of defaulting to "REGULAR USER"

**Previous Session Focus (July 20, 2025 - Session 8):**
- ✅ **Complete Custom Role Support**: Implemented full Okta IAM custom role detection with resource set integration
- ✅ **Resource Set API Integration**: Added `/api/v1/iam/resource-sets/{resourceSetId}` endpoint support for custom role permissions
- ✅ **Enhanced Group Management**: Custom roles with group resource sets now fetch all manageable groups via `/api/v1/groups` API
- ✅ **Smart Role Detection**: System detects role.type === "CUSTOM" and processes resource sets to determine access level
- ✅ **Role Display Enhancement**: Updated getAllUserRoles to fetch and format custom role labels (e.g., "sap_group_admins" → "Sap Group Admins")
- ✅ **Duplicate Role Fix**: Removed duplicate getAllUserRoles method and fixed LSP TypeScript errors
- ✅ **API Pattern Upgrade**: Supports both standard role targets and custom role resource sets simultaneously

**Latest Major Enhancement (July 19, 2025 - Session 6):**
- ✅ **Fixed Governance Review Natural Language Mapping**: Added comprehensive governance campaign workflow with proper intent detection
- ✅ **Enhanced MCP Server Workflow Processing**: Added dedicated governance campaign creation and listing functionality
- ✅ **Implemented Complete Access Request Flow**: Fixed duration parsing, field label inference, and end-to-end submission with all required fields
- ✅ **Resolved All Variable Naming Conflicts**: Fixed duplicate variable declarations causing build failures (entitlementName, campaignsData)
- ✅ **Added Intelligent Field Label Processing**: System now infers proper field names when API returns "undefined" labels
- ✅ **Enhanced Duration Field Support**: Natural language duration parsing ("1 hour", "2 days") with proper Okta API format conversion
- ✅ **Complete Governance API Integration**: Added getGovernanceCampaigns() and createGovernanceCampaign() methods to governance service

**Previous Critical Bug Fixes (July 19, 2025 - Session 5):**
- ✅ **Fixed Chat System Fatal Error**: Fixed `this.analyzeRequest is not a function` error by correcting method name to `this.analyzeIntent()`
- ✅ **Fixed 30-Day Review Processing**: Now processes actual System Log data instead of returning generic "AI Request Processed" message
- ✅ **Fixed Service Import Error**: Resolved `Cannot access 'OktaGovernanceService2' before initialization` error in entitlement fields lookup
- ✅ **Enhanced 30-Day Review Analysis**: Now shows detailed breakdown of used vs unused applications from real System Log API data
- ✅ **Improved Error Handling**: Added detailed error logging to identify root causes faster
- ✅ **Fixed MCP Server Method Calls**: Corrected async/await syntax for proper intent analysis

## Recent Updates (July 19, 2025)

**Latest Major Enhancement (July 19, 2025 - Session 4):**
- ✅ **Implemented Comprehensive API Documentation System**: Created structured API workflow documentation based on official Okta IGA API 2024 specs
- ✅ **Enhanced MCP Server with Workflow-Based Processing**: Added intelligent workflow detection and execution for proper API sequence handling
- ✅ **Integrated Complete Access Request Flow**: Proper sequence from app selection → entitlement discovery → field requirements → submission
- ✅ **Added Request-Fields API Integration**: System now fetches and shows actual form fields required for each entitlement before submission
- ✅ **Fixed API Sequence Logic**: MCP server now follows documented workflows instead of random pattern matching
- ✅ **Improved Error Handling with Fallbacks**: Comprehensive error handling with fallback strategies for each API step

**Previous Critical Fixes (Session 3):**
- ✅ **Fixed "url is not defined" Runtime Error**: Resolved MCP server reference error preventing API execution
- ✅ **Fixed Governance Campaign API Error 405**: Updated endpoint from `/governance/api/v2/campaigns` to `/api/v1/governance/campaigns`
- ✅ **Enhanced IGA Catalog API Processing**: Added multi-endpoint fallback strategy for catalog access
- ✅ **Implemented Required Filter Parameter**: Fixed catalog API "filter parameter required" error
- ✅ **Added Apps API Fallback**: When IGA catalog fails, system now falls back to Apps API for catalog simulation
- ✅ **Comprehensive Error Handling**: All API failures now show helpful messages instead of generic errors
- ✅ **Custom Governance Service Integration**: MCP server now uses governance service directly for improved catalog handling

**Previous Fixes (Session 2):**
- ✅ **Fixed OIDC Authentication Error**: Resolved "authService is not defined" reference error in routes
- ✅ **Implemented Official Okta Role Assignment API**: Now uses `/api/v1/users/{userId}/roles` endpoint per Okta documentation
- ✅ **Enhanced Role Detection**: Replaced group-based role detection with proper Okta assigned role types
- ✅ **Multiple Role Display Support**: Added comprehensive role mapping for all Okta admin role types
- ✅ **Fixed MCP Server Errors**: Resolved catalog API "Body already read" error and data processing issues
- ✅ **Updated Role Hierarchy**: Proper priority-based role determination (SUPER_ADMIN > APP_ADMIN > GROUP_ADMIN etc.)

**Continuous Learning & MCP Server Implementation:**
- ✅ **Intelligent MCP Server**: Model Context Protocol server that analyzes natural language and maps to appropriate Okta API calls
- ✅ **Dynamic Request Construction**: System automatically builds proper API requests with authentication based on user intent
- ✅ **Continuous Learning System**: LLM Training Service that learns from user feedback and API response patterns
- ✅ **Pattern Recognition**: AI improves intent detection accuracy over time based on success rates and user corrections
- ✅ **Feedback Integration**: Interactive feedback buttons (👍👎) allow users to train the AI in real-time
- ✅ **Adaptive Confidence**: System adjusts confidence scores based on historical success rates and recent performance
- ✅ **Context-Aware Learning**: Role-based and time-based pattern matching improves API call accuracy
- ✅ **Multi-API Support**: Intelligent routing across IGA Catalog, System Log, User Management, and Governance APIs
- ✅ **Real-Time Training**: Every 5 minutes processing of feedback queue to continuously improve patterns
- ✅ **Training Analytics**: Statistics tracking for interaction success rates and pattern performance

**Previous System Log API Integration:**
- ✅ **System Log API Implementation**: Proper 30-day usage tracking with exact filter format
- ✅ **Real Usage Data**: Fetches actual SSO authentication events instead of generic app assignment dates  
- ✅ **Enhanced Error Handling**: Improved System Log API calls with better fallback values
- ✅ **Auto-Load 30-Day Review**: Chat automatically displays access review on load
- ✅ **Ollama Integration**: Successfully using local Llama 3.1 8B model instead of OpenAI