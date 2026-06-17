-include .env
export

.PHONY: install run-backend run-frontend seed demo-up demo-seed demo-lipset validate-lipset demo-smoke demo-down lint check test ci run-ci ci-full run-ci-full

install:
	cd backend && uv sync
	cd frontend && npm ci

run-backend:
	cd backend && uv run uvicorn app.main:app --reload

run-frontend:
	cd frontend && npm run dev

seed:
	cd backend && uv run python seed.py data/example-study.json

demo-up:
	docker compose up --build -d

demo-seed:
	docker compose exec backend uv run python seed_demo.py

demo-lipset:
	docker compose exec backend uv run python seed_lipset.py

validate-lipset:
	python3 validation/lipset/compare.py

demo-smoke:
	curl -fsS http://localhost:3000/ >/dev/null
	curl -fsS http://localhost:3000/health >/dev/null
	curl -fsS http://localhost:3000/api/study/bioeconomy-futures >/dev/null

demo-down:
	docker compose down

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
	cd backend && uv run pip-audit \
		--ignore-vuln CVE-2026-4539 \
		--ignore-vuln CVE-2026-28684 \
		--ignore-vuln CVE-2026-25645
	# CVE-2026-4539 (pygments): transitive via rich, no direct pin; ReDoS in archetype lexer not used
	# CVE-2026-28684 (python-dotenv): transitive via pydantic-settings, symlink attack requires write access to .env
	# CVE-2026-25645 (requests): transitive via boto3, extract_zipped_paths() not called by Qualis
	# See SECURITY.md for the deliberate-acceptance evaluation.
	cd backend && uv run python -m app.schema_validation
	python3 backend/scripts/check_relationships.py
	python3 scripts/check_installation_docs.py
	$(MAKE) check-api
	cd frontend && npm run type-check
	cd frontend && npm run i18n-check
	cd frontend && npm run check-interpolations

test:
	cd backend && uv run pytest tests/
	cd frontend && npm run test -- --run --coverage

test-property:
	cd backend && uv run pytest tests/property/ -v --hypothesis-show-statistics

e2e:
	cd frontend && ENVIRONMENT=test npm run e2e

build:
	cd frontend && npm run build

ci: lint check test build
	@echo "\n--- Fast CI checks passed locally! (Skipped E2E) ---"

# ci-fast — tight inner-loop feedback (~30-90s)
# Skips: bandit, radon, vulture, pip-audit, deptry, schema-validation,
#        check-relationships, check-api, i18n-check, build, e2e, integration tests.
# Run this between every change. Use `make ci` before pushing.
.PHONY: ci-fast
ci-fast:
	cd backend && uv run ruff check app/
	cd backend && uv run ruff format --check app/
	cd frontend && npm run lint
	cd backend && uv run mypy app/
	cd frontend && npm run type-check
	cd backend && uv run pytest tests/unit/ -q
	cd frontend && npm run test -- --run
	@echo "\n--- ci-fast OK — run \`make ci\` before push. ---"

db-reset:
	cd backend && uv run python init_db.py --reset

ci-full: ci db-reset e2e
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
