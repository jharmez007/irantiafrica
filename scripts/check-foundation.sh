#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
php -r 'exit(PHP_MAJOR_VERSION === 8 && PHP_MINOR_VERSION === 5 ? 0 : 1);'
(cd backend && composer validate --strict && composer lint && composer analyse && composer test)
(cd frontend && npm run format:check && npm run lint && npm run typecheck && npm test && npm run build)
echo "Code checks complete. Run explicit infrastructure and dependency-audit gates separately."
