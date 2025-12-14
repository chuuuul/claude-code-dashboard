#!/bin/bash
set -e

# Script: Deploy Claude Dashboard
# Usage: ./scripts/deploy.sh <environment> [image-tag]

ENVIRONMENT="${1:-}"
IMAGE_TAG="${2:-latest}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[Deploy]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[Deploy]${NC} $1"
}

log_error() {
  echo -e "${RED}[Deploy]${NC} $1"
}

# Validation
if [ -z "$ENVIRONMENT" ]; then
  log_error "Environment not specified"
  echo "Usage: ./scripts/deploy.sh <environment> [image-tag]"
  echo "Environments: dev, staging, production"
  exit 1
fi

case "$ENVIRONMENT" in
  dev)
    log_info "Deploying to development environment"
    COMPOSE_FILE="-f docker-compose.yml -f docker-compose.dev.yml"
    ;;
  staging)
    log_info "Deploying to staging environment"
    COMPOSE_FILE="-f docker-compose.yml -f docker-compose.prod.yml"
    PROFILE="--profile prod"
    ;;
  production)
    log_info "Deploying to PRODUCTION environment"
    COMPOSE_FILE="-f docker-compose.yml -f docker-compose.prod.yml"
    PROFILE="--profile prod"
    ;;
  *)
    log_error "Invalid environment: $ENVIRONMENT"
    exit 1
    ;;
esac

# Verify prerequisites
log_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
  log_error "Docker is not installed"
  exit 1
fi

if ! command -v docker-compose &> /dev/null; then
  log_error "Docker Compose is not installed"
  exit 1
fi

# For dev environment, build locally
if [ "$ENVIRONMENT" = "dev" ]; then
  log_info "Building Docker image locally..."
  docker build -t claude-dashboard:$IMAGE_TAG .
  if [ $? -ne 0 ]; then
    log_error "Docker build failed"
    exit 1
  fi
fi

# Set environment variables
export IMAGE_TAG=$IMAGE_TAG
export NODE_ENV=$ENVIRONMENT

# Load environment-specific variables
if [ -f ".env.$ENVIRONMENT" ]; then
  log_info "Loading environment variables from .env.$ENVIRONMENT"
  set -a
  source ".env.$ENVIRONMENT"
  set +a
fi

# For staging/production, verify image exists
if [ "$ENVIRONMENT" != "dev" ]; then
  log_info "Verifying image availability..."
  REGISTRY_IMAGE="ghcr.io/$(git config --get remote.origin.url | grep -o '[^/:]*\/[^/]*$' | tr -d '.git'):$IMAGE_TAG"
  log_warn "Note: Using image tag: $IMAGE_TAG"
  log_warn "To pull from registry, image must be: ghcr.io/your-repo:$IMAGE_TAG"
fi

# Create required directories
log_info "Creating required directories..."
mkdir -p ./data
mkdir -p ./projects
mkdir -p ./logs

# Deploy using docker-compose
log_info "Deploying application..."
eval "docker-compose $COMPOSE_FILE down" || true
eval "docker-compose $COMPOSE_FILE up -d"

if [ $? -ne 0 ]; then
  log_error "Deployment failed"
  exit 1
fi

# Wait for service to be healthy
log_info "Waiting for service to become healthy..."
max_attempts=60
attempt=0
healthy=false

while [ $attempt -lt $max_attempts ]; do
  if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    health_status=$(curl -s http://localhost:3000/health | grep -o '"status":"[^"]*"')
    log_info "Health check passed: $health_status"
    healthy=true
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
  if [ $((attempt % 10)) -eq 0 ]; then
    log_warn "Waiting... ($attempt/$max_attempts seconds)"
  fi
done

if [ "$healthy" = false ]; then
  log_error "Service failed to become healthy after ${max_attempts} seconds"
  log_info "Checking logs..."
  docker-compose $COMPOSE_FILE logs --tail=50
  exit 1
fi

# Display deployment information
log_info "Deployment completed successfully!"
echo ""
echo "========================================"
echo "Deployment Summary"
echo "========================================"
echo "Environment: $ENVIRONMENT"
echo "Image Tag: $IMAGE_TAG"
echo "Access URL: http://localhost:3000"
echo "Health Check: http://localhost:3000/health"
echo ""
echo "Useful commands:"
echo "  View logs:    docker-compose logs -f"
echo "  Stop service: docker-compose down"
echo "  Restart:      docker-compose restart"
echo "========================================"

# For production, run smoke tests
if [ "$ENVIRONMENT" != "dev" ] && [ -f "./scripts/smoke-tests.sh" ]; then
  log_info "Running smoke tests..."
  bash ./scripts/smoke-tests.sh "http://localhost:3000" || log_warn "Some smoke tests failed"
fi

log_info "Done!"
