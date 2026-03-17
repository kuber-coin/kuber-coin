#!/bin/bash
# Quick start script for KuberCoin

set -e

echo "🚀 Starting KuberCoin Stack..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Build and start services
echo "📦 Building containers..."
if docker compose version > /dev/null 2>&1; then
    compose() { docker compose "$@"; }
elif command -v docker-compose > /dev/null 2>&1; then
    compose() { docker-compose "$@"; }
else
    echo "❌ Neither 'docker compose' nor 'docker-compose' is available."
    exit 1
fi

compose build

echo ""
echo "🔧 Starting services..."
compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo ""
echo "🏥 Checking service health..."

services=(
    "node-api:8634:/api/health"
    "explorer-web:3200:/"
    "wallet-web:3250:/"
    "ops-web:3300:/"
    "web-unified:3100:/"
)

for service in "${services[@]}"; do
    IFS=':' read -r name port path <<< "$service"
    if curl -sf "http://localhost:$port$path" > /dev/null 2>&1; then
        echo "  ✓ $name ($port) is healthy"
    else
        echo "  ⚠ $name ($port) is not responding"
    fi
done

echo ""
echo "✅ KuberCoin is running!"
echo ""
echo "📱 Access the UIs:"
echo "  • Explorer:    http://localhost:3200"
echo "  • Wallet:      http://localhost:3250"
echo "  • Operations:  http://localhost:3300"
echo "  • Landing:     http://localhost:3100"
echo "  • Grafana:     http://localhost:3000 (credentials from env/compose)"
echo ""
echo "🔌 API Endpoints:"
echo "  • Node API:    http://localhost:8634"
echo "  • Health:      http://localhost:8634/api/health"
echo "  • Metrics:     http://localhost:8634/metrics"
echo ""
echo "📊 View logs:"
echo "  compose logs -f node"
echo ""
echo "🛑 Stop services:"
echo "  compose down"
