# Okta AI Dashboard

## Overview
This is a full-stack web application providing an AI-powered dashboard for Okta identity management with intelligent governance capabilities. It features secure authentication via Okta OIDC, a comprehensive dashboard for user and application management, and an AI assistant powered by local Ollama (Llama 3.1 8B). The AI assistant handles governance, privileged access management (PAM), and real-time access reviews using Okta's System Log API. The project aims to enhance identity governance, streamline access management, and provide a user-friendly interface for Okta administrators and end-users.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

The application employs a modern full-stack architecture, separating frontend and backend concerns.

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components, built on Radix UI primitives
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Style**: RESTful API
- **Authentication**: Okta OIDC integration with cookie-based session management
- **Data Storage**: In-memory maps; no database is required
- **AI Integration**: Model Context Protocol (MCP) server for intelligent assistance

### Key System Features
- **Authentication System**: Okta OIDC (PKCE flow) with role-based access control (super_admin, app_owner, regular_user). Supports simplified redirect-based admin authentication.
- **In-memory State**: Stores user details, sessions, chat messages, and PAM sessions only while the server process is running.
- **AI Assistant (MCP Integration)**: Performs natural language intent analysis, automates governance workflows, manages PAM operations, and integrates directly with Okta Management APIs for real-time actions. Features dynamic request construction, continuous learning from user feedback, and adaptive confidence for improved accuracy.
- **Dashboard Features**: Includes user management, application overview, analytics, and AI-assisted access request handling. Supports comprehensive gamification with points, badges, license seat savings tracking, and a leaderboard.
- **Data Flow**: Secure authentication, AI-driven query processing (intent analysis, Okta API calls, governance workflows, response generation), and real-time data aggregation for dashboard updates.
- **Security**: Focuses on secure token handling, session refresh, and environment-based configuration for sensitive credentials. Implements Fastpass authenticator adoption checking and gamification for security compliance.
- **Deployment Strategy**: Frontend built with Vite, backend with esbuild, and Express serving static assets. A persistent single-process Node.js host is required for reliable in-memory sessions; state resets on restart.

## External Dependencies

### Core Dependencies
- **@tanstack/react-query**: Server state management
- **express**: Backend web framework

### Authentication
- **Okta OIDC**: Primary authentication provider
- **cookie-parser**: Cookie-based session management
- **In-memory maps**: User and session state, without an external database

### UI Framework
- **@radix-ui/***: Accessible UI primitives
- **tailwindcss**: CSS framework
- **class-variance-authority**: Type-safe variant management

### Development Tools
- **tsx**: TypeScript execution
- **esbuild**: Bundler
- **vite**: Development server

### Okta Specific Integrations
- **Okta Management APIs**: Used by the AI assistant for user management, application overview, governance campaigns, access requests, access reviews (System Log API), and role management.
- **Okta IGA API**: Specifically for governance, access requests, and catalog management.
- **Ollama (Llama 3.1 8B)**: Local large language model for AI assistant processing.