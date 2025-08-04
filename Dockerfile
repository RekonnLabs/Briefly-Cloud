# FastAPI Python Backend Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY server/requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire server directory
COPY server/ ./

# Copy the main entry point
COPY main.py ./

# Create logs directory
RUN mkdir -p logs

# Expose port (Railway uses PORT env var)
EXPOSE 8000

# Health check with longer startup time
HEALTHCHECK --interval=30s --timeout=30s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Run the FastAPI application with Railway's PORT
CMD python main.py