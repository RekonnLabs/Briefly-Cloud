# Project Structure

## Root Directory Organization
```
Briefly_Cloud/
├── client/                 # React frontend application
├── server/                 # FastAPI backend application
├── tests/                  # Test suite and sample files
├── Docs/                   # Project documentation
├── data/                   # Application data files
├── test_files/             # Test documents for development
├── .kiro/                  # Kiro AI assistant configuration
├── package.json            # Root npm configuration
└── *.bat                   # Windows batch scripts for setup/startup
```

## Frontend Structure (client/)
```
client/
├── src/
│   ├── components/         # React components
│   │   ├── ui/            # Reusable UI components (Radix-based)
│   │   ├── App.tsx        # Main application component
│   │   ├── ChatWindow.tsx # Chat interface component
│   │   ├── CloudSettings.tsx # Cloud storage settings
│   │   └── OnboardingFlow.tsx # User onboarding
│   ├── hooks/             # Custom React hooks
│   │   ├── useChat.js     # Chat functionality hook
│   │   └── useSettings.ts # Settings management hook
│   ├── lib/               # Frontend utilities
│   │   ├── api.ts         # API client configuration
│   │   └── utils.ts       # Helper functions
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Additional utilities
├── public/                # Static assets and PWA files
├── .env.example           # Environment variables template
├── package.json           # Frontend dependencies
├── vite.config.ts         # Vite build configuration
├── tailwind.config.js     # Tailwind CSS configuration
└── tsconfig.json          # TypeScript configuration
```

## Backend Structure (server/)
```
server/
├── routes/                # API route handlers
│   ├── auth.py           # Authentication endpoints
│   ├── chat.py           # Chat/conversation endpoints
│   ├── embed.py          # Document embedding endpoints
│   └── storage.py        # Cloud storage endpoints
├── services/             # Business logic services
├── utils/                # Backend utilities
├── db/                   # Database configuration
├── venv/                 # Python virtual environment
├── main.py               # FastAPI application entry point
├── vector_store.py       # Vector database operations
├── requirements.txt      # Python dependencies
├── .env.example          # Environment variables template
└── __init__.py           # Python package marker
```

## Documentation Structure (Docs/)
```
Docs/
├── PRD.md                # Product Requirements Document
├── implementation_plan.md # Development roadmap
├── deployment_guide.md   # Deployment instructions
├── project_structure.md  # This file
├── dev_notes.md          # Development notes
├── bug_tracker.md        # Known issues tracking
└── qa_testing_guide.md   # Quality assurance guide
```

## Configuration Files
- **Environment**: `.env` files in client/ and server/ directories
- **Package Management**: package.json files for npm dependencies
- **Python Dependencies**: requirements.txt with pinned versions
- **Build Configuration**: vite.config.ts, tailwind.config.js, tsconfig.json
- **Batch Scripts**: Windows .bat files for automated setup and startup

## Key Conventions

### File Naming
- **React Components**: PascalCase (e.g., ChatWindow.tsx)
- **Hooks**: camelCase with 'use' prefix (e.g., useSettings.ts)
- **Utilities**: camelCase (e.g., api.ts, utils.ts)
- **Python Files**: snake_case (e.g., vector_store.py)
- **Routes**: snake_case modules (e.g., auth.py, storage.py)

### Directory Structure Rules
- **Components**: Organized by feature, with shared UI components in ui/ subdirectory
- **Routes**: Modular FastAPI routers in separate files by domain
- **Services**: Business logic separated from route handlers
- **Tests**: Mirror the source structure for easy navigation
- **Documentation**: Centralized in Docs/ directory with clear naming

### Import Patterns
- **Frontend**: Use @ alias for src/ directory imports
- **Backend**: Relative imports within modules, absolute for cross-module
- **Environment Variables**: Loaded via python-dotenv in backend, Vite in frontend

### API Structure
- **Endpoints**: RESTful design with /api prefix
- **Authentication**: JWT tokens via Supabase integration
- **Error Handling**: Consistent HTTP status codes and error messages
- **Documentation**: Auto-generated via FastAPI at /docs endpoint