# FastAPI Python Backend Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy optimized requirements first for better caching
COPY server/requirements.txt .

# Install Python dependencies (optimized for size)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the server code
COPY server/ .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the FastAPI application
CMD ["sh", "-c", "cd server && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]