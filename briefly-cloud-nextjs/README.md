# Briefly Cloud

AI-powered document assistant that transforms your documents into intelligent conversations.

## Features

- **Supabase Authentication** - Google and Microsoft OAuth login
- **Document Upload** - Support for PDF, DOCX, TXT, MD, CSV, XLSX, PPTX
- **Cloud Storage Integration** - Connect Google Drive and OneDrive
- **AI Chat** - Chat with your documents using GPT-4 Turbo
- **Vector Search** - Semantic document search with ChromaDB
- **Subscription Management** - Free, Pro, and Pro BYOK tiers
- **Briefly Voice v1** - Consistent AI voice with intelligent routing and response linting

## Quick Start

### 1. Environment Setup

Copy the environment template:
```bash
cp .env.example .env.local
```

Fill in your OAuth credentials and API keys. See [OAuth Setup Guide](./docs/OAUTH_SETUP.md) for detailed instructions.

### 2. Database Setup

Run the Supabase schema:
```sql
-- Run the contents of supabase-schema.sql in your Supabase SQL editor
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Briefly Voice v1

This application uses the Briefly Voice v1 system for consistent, cost-effective AI interactions:

- **Unified Voice**: Consistent persona and style across all LLM calls
- **Smart Routing**: Automatic model selection based on user tier and query complexity
- **Response Linting**: Ensures structured output with "Next steps" sections
- **Budget Management**: Token-aware prompts and context limits
- **Telemetry**: Comprehensive usage tracking and performance metrics

See [Briefly Voice v1 Documentation](./docs/Briefly_Voice_v1.md) for detailed information.

## Authentication Flow

1. **Login**: Users sign in via Google/Microsoft OAuth (Supabase Auth)
2. **Storage**: Separate OAuth flows for Google Drive/OneDrive access
3. **Protection**: Middleware protects `/briefly/app/**` routes
4. **Paywall**: Premium features gated for paid subscribers

## Project Structure

```
src/
├── app/
│   ├── api/                 # API routes
│   │   ├── auth/           # Supabase Auth configuration
│   │   ├── storage/        # Storage OAuth endpoints
│   │   ├── chat/           # AI chat endpoints
│   │   └── upload/         # File upload endpoints
│   ├── briefly/app/        # Main application
│   │   ├── auth/           # Authentication pages
│   │   └── dashboard/      # Main dashboard
│   ├── components/         # React components
│   └── lib/                # Utilities and configurations
├── docs/                   # Documentation
└── database/               # Database schemas
```

## Key Technologies

- **Framework**: Next.js 14 with App Router
- **Authentication**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Vector Storage**: ChromaDB
- **AI**: OpenAI GPT-4 Turbo
- **Payments**: Stripe
- **Deployment**: Vercel

## Documentation

- [OAuth Setup Guide](./docs/OAUTH_SETUP.md) - Configure Google and Microsoft OAuth
- [Deployment Guide](./docs/VERCEL_DEPLOYMENT_GUIDE.md) - Deploy to Vercel
- [API Documentation](./docs/) - API endpoints and usage

## Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run tests
npm run type-check   # TypeScript type checking
```

### Environment Variables

Key environment variables (see `.env.example` for complete list):

- `NEXTAUTH_URL` - Your application URL (legacy variable name)
- `NEXTAUTH_SECRET` - Authentication secret key (legacy variable name)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth
- `AZURE_AD_CLIENT_ID` / `AZURE_AD_CLIENT_SECRET` - Microsoft OAuth
- `OPENAI_API_KEY` - OpenAI API key
- `SUPABASE_*` - Supabase configuration

## Deployment

Deploy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-repo/briefly-cloud)

Or follow the [Deployment Guide](./docs/VERCEL_DEPLOYMENT_GUIDE.md) for detailed instructions.

## License

MIT License - see [LICENSE](./LICENSE) for details.