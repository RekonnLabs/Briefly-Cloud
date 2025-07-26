🚀 Briefly Cloud – AI-Powered Productivity Assistant by RekonnLabs
Transform your documents into intelligent conversations with AI — powered by GPT-4o and cutting-edge vector search technology.






📋 Overview
Briefly Cloud is a modern, cloud-native productivity assistant designed to help professionals unlock the full value of their documents. Integrate your cloud storage, upload documents, and start asking questions — instantly receive AI-powered, context-aware answers.

Built with scalability, security, and seamless user experience at its core, Briefly Cloud combines:

GPT-4o for natural, powerful AI conversations

Chroma Cloud for fast, scalable vector search

Supabase for user management, authentication, and database services

Stripe for subscription billing and tier management

Progressive Web App (PWA) for cross-device, installable experiences

✨ Key Features
Multi-format document support: PDF, DOCX, TXT, XLSX, PPTX, and more

Secure OAuth2 login: Google & Microsoft authentication

Subscription tiers: Free, Pro, and Pro (BYOK) with flexible limits

Cloud Storage Connectors: Google Drive (Free & Pro), OneDrive (Pro)

Real-time usage tracking & tier enforcement to keep costs predictable

Mobile-ready PWA: Offline support and responsive design

Extensible architecture for future AI models, team features, and integrations

🔐 Required API Keys
Before starting, you must supply your own API keys by editing the .env files:

Service	Description	Where to Get Keys	Add To
OpenAI	GPT-4o API for AI chat	OpenAI API Keys	server/.env - OPENAI_API_KEY
Chroma Cloud	Vector search backend	Chroma	server/.env - CHROMA_API_KEY
Supabase	Auth and DB backend	Supabase	server/.env - SUPABASE_URL, SUPABASE_KEY
Stripe	Payment processing	Stripe Dashboard	server/.env - STRIPE_SECRET_KEY, client/.env - STRIPE_PUBLISHABLE_KEY
Google OAuth	OAuth2 client for Google login	Google Cloud Console	server/.env
Microsoft OAuth	OAuth2 client for Microsoft login	Azure Portal	server/.env

Important: These keys are not included in the repo for security reasons.

💰 Subscription Pricing & Limits
Tier	Price	Document Limit	AI Chat Messages	API Calls Limit	Storage Limit
Free	$0 / month	10 docs	100 messages	1,000	100 MB
Pro	$30 / month	1,000 docs	1,000 messages	10,000	10 GB
Pro (BYOK)	$15 / month	10,000 docs	5,000 messages	50,000	100 GB

BYOK = Bring Your Own Key for OpenAI API (user supplies their own key to reduce cost burden)

Usage tracking enforces limits and prompts upgrades as users approach capacity.

🚀 Quick Start
Prerequisites
Node.js 18+ & npm

Python 3.11+

Configured .env files with your API keys

Install & Run
bash
Copy
# Install all dependencies (server + client)
npm run install-all

# Start development servers (frontend + backend)
npm run dev
Access the app at: http://localhost:5173
API docs at: http://localhost:8000/docs

📁 Project Structure
bash
Copy
Briefly_Cloud/
├── client/                 # React frontend (Vite + TypeScript)
├── server/                 # FastAPI backend + routes
├── tests/                  # Test suites
├── Docs/                   # Project documentation & specs
├── SETUP_GUIDE.md          # Detailed environment & setup instructions
└── README.md               # This file
🛠 Development Commands
Command	Description
npm run dev	Start frontend & backend dev servers
npm run build	Build production frontend bundle
npm run preview	Preview production build locally
npm run install-all	Install server & client dependencies
npm run test-api	Validate API keys and backend connectivity
npm run test-integration	Run full integration tests

📚 Documentation
Setup Guide: SETUP_GUIDE.md

API & Feature Specs: Docs/PRD.md

Troubleshooting: TROUBLESHOOTING_GUIDE.md

Mobile Deployment: Docs/MOBILE_DEPLOYMENT_GUIDE.md

🆘 Support & Contributions
Report issues or request features on GitHub Issues

Email: support@rekonnlabs.com

Contribute via pull requests (see CONTRIBUTING.md if available)

📜 License
This project is licensed under the MIT License - see the LICENSE file for details.

🙏 Acknowledgments
OpenAI — GPT-4o API

Chroma — Vector DB cloud backend

Supabase — Auth & DB services

Stripe — Payment processing

React & FastAPI communities

Built with ❤️ by RekonnLabs – transforming knowledge work with AI.
