# KuberCoin E2E Tests

End-to-end tests for KuberCoin web applications using Playwright.

## Installation

```bash
npm install
npx playwright install
```

## Running Tests

### All tests
```bash
npm test
```

### Specific test suites
```bash
npm run test:explorer    # Explorer web tests
npm run test:wallet      # Wallet web tests
npm run test:ops         # Operations dashboard tests
npm run test:websocket   # WebSocket real-time tests
```

### Interactive mode
```bash
npm run test:ui
```

### Headed mode (see browser)
```bash
npm run test:headed
```

## Test Structure

- `tests/explorer.spec.ts` - Block explorer functionality
- `tests/wallet.spec.ts` - Wallet operations and transactions
- `tests/ops.spec.ts` - Operations dashboard and monitoring
- `tests/websocket.spec.ts` - Real-time WebSocket updates

## Prerequisites

Before running tests, ensure all services are running:

```bash
# Prefer Docker Compose v2
docker compose up -d

# If you only have legacy Compose v1 installed:
# docker-compose up -d
```

Or let Playwright start them automatically (configured in `playwright.config.ts`).

## Test Reports

After running tests, view the HTML report:

```bash
npm run report
```

## CI/CD Integration

Tests are configured to run in CI environments with retries and parallel execution disabled.

Set `CI=true` environment variable:

```bash
CI=true npm test
```

## Writing New Tests

Use Playwright Test Generator to record new tests:

```bash
npm run codegen http://localhost:3200
```

## Debugging

- Run with `--debug` flag for step-by-step debugging
- Use `page.pause()` in tests to inspect
- Check screenshots in `test-results/` on failures

## Coverage

Tests cover:
- ✅ Page loading and rendering
- ✅ User interactions (clicks, forms, navigation)
- ✅ API integrations
- ✅ WebSocket real-time updates
- ✅ Error handling
- ✅ Performance metrics
- ✅ Security (input validation, XSS prevention)
