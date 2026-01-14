.PHONY: install run-backend run-frontend lint check test ci run-ci ci-full run-ci-full

install:
	cd backend && uv sync
	cd frontend && npm install

run-backend:
	cd backend && uv run uvicorn app.main:app --reload

run-frontend:
	cd frontend && npm run dev

seed:
	@echo "Usage: cd backend && uv run python seed.py <path-to-study-json>"

migrate:
	cd backend && uv run python scripts/migrate.py

migration-new:
	@read -p "Enter migration name: " name; \
	cd backend && uv run alembic revision --autogenerate -m "$$name"

generate-api:
	cd backend && uv run python ../export_openapi.py
	cd frontend && npm run generate:api

check-api: generate-api
	@echo "Checking if API client is up to date..."
	git diff --exit-code frontend/src/api/generated.ts frontend/openapi.json

# -------------------------
# Quality & Verification
# -------------------------

lint:
	cd backend && uv run ruff check app/
	cd backend && uv run ruff format --check app/
	cd frontend && npm run lint

check:
	cd backend && uv run mypy app/
	cd backend && uv run bandit -r app/ -ll
	cd backend && uv run radon cc app/ -a -nb --min B
	cd backend && uv run deptry app/
	cd backend && uv run vulture app/ vulture_whitelist.py --min-confidence 60
	cd backend && uv run pip-audit
	cd backend && uv run python -m app.schema_validation
	python3 backend/scripts/check_relationships.py
	$(MAKE) check-api
	cd frontend && npm run type-check
	cd frontend && npm run i18n-check

test:
	cd backend && uv run pytest -n auto tests/
	cd frontend && npm run test -- --run --coverage

e2e:
	cd frontend && ENVIRONMENT=test npm run e2e

build:
	cd frontend && npm run build

ci: lint check test build
	@echo "\n--- Fast CI checks passed locally! (Skipped E2E) ---"

ci-full: ci e2e
	@echo "\n--- All CI (Full) checks passed locally! ---"

run-ci: ci
run-ci-full: ci-full

cleanup:
	@echo "Cleaning up temporary files..."
	@find . -type d -name "__pycache__" -exec rm -rf {} +
	@find . -type d -name ".pytest_cache" -exec rm -rf {} +
	@find . -type d -name ".ruff_cache" -exec rm -rf {} +
	@find . -type d -name ".mypy_cache" -exec rm -rf {} +
	@find . -type d -name ".vulture_cache" -exec rm -rf {} +
	@rm -rf backend/.coverage
	@rm -rf backend/htmlcov
	@rm -rf frontend/dist
	@rm -rf frontend/coverage
	@rm -rf frontend/playwright-report
	@rm -rf frontend/test-results
	@echo "Cleanup complete."
