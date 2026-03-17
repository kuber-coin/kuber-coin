#!/bin/bash
# Build and push multi-architecture Docker images
# Usage: ./build-multiarch.sh [version]

set -e

VERSION=${1:-latest}
REGISTRY=${DOCKER_REGISTRY:-docker.io}
IMAGE_NAME=${DOCKER_IMAGE:-kubercoin/node}
PLATFORMS="linux/amd64,linux/arm64"

echo "=========================================="
echo "Multi-Architecture Docker Build"
echo "Version: $VERSION"
echo "Registry: $REGISTRY"
echo "Image: $IMAGE_NAME"
echo "Platforms: $PLATFORMS"
echo "=========================================="

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "Error: Docker not installed"
    exit 1
fi

# Setup buildx if not already configured
if ! docker buildx inspect multiarch-builder &> /dev/null; then
    echo "Creating buildx builder..."
    docker buildx create --name multiarch-builder --use
    docker buildx inspect --bootstrap
fi

# Build and push
echo "Building multi-architecture images..."
docker buildx build \
    --platform $PLATFORMS \
    --file Dockerfile.multiarch \
    --tag $REGISTRY/$IMAGE_NAME:$VERSION \
    --tag $REGISTRY/$IMAGE_NAME:latest \
    --build-arg VERSION=$VERSION \
    --build-arg "BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg "VCS_REF=$(git rev-parse --short HEAD)" \
    --push \
    .

echo ""
echo "=========================================="
echo "Build Complete!"
echo "=========================================="
echo "Images pushed:"
echo "  $REGISTRY/$IMAGE_NAME:$VERSION"
echo "  $REGISTRY/$IMAGE_NAME:latest"
echo ""
echo "Pull and run:"
echo "  docker pull $REGISTRY/$IMAGE_NAME:$VERSION"
echo "  docker run -p 8634:8634 -p 8633:8633 $REGISTRY/$IMAGE_NAME:$VERSION"
echo "=========================================="
