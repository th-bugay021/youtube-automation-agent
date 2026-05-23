# YouTube Automation AI Agent

A production-grade semi-autonomous YouTube content management system.

## Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: NestJS, TypeScript
- **Database**: PostgreSQL
- **AI**: OpenAI API
- **Auth**: Google OAuth 2.0 (YouTube Data API v3)
- **Queue**: BullMQ + Redis
- **Deploy**: Vercel (frontend) + Railway (backend)

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### Setup
`ash
# Clone & install
cd backend && npm install
cd ../frontend && npm install

# Configure env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# Run migrations
cd backend && npm run migration:run

# Start dev
cd backend && npm run start:dev
cd frontend && npm run dev
`

## Architecture
See docs/ARCHITECTURE.md for full system design.
