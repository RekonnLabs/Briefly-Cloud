# Briefly Cloud - Railway Deployment

This is a clean, minimal Railway deployment for the Briefly Cloud backend.

## Files:
- `main.py` - FastAPI application with health endpoints
- `requirements.txt` - Python dependencies (FastAPI + Uvicorn only)
- `Procfile` - Railway startup command

## Endpoints:
- `GET /` - Root endpoint
- `GET /health` - Health check
- `GET /api/diagnostics` - Diagnostic information

## Railway Deployment:
1. Create new Railway project
2. Connect this `railway_app` directory as the root
3. Railway will automatically detect Python and deploy

## Testing:
```bash
curl https://your-app.railway.app/health
curl https://your-app.railway.app/api/diagnostics
```

This deployment is completely isolated from the Node.js development environment.