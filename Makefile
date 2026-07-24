-include .env
export

.PHONY: install preflight run-backend run-frontend seed demo-up demo-seed demo-lipset validate-lipset demo-smoke demo-down lint check test ci run-ci ci-full run-ci-full

# Toolchain versions CI exercises. Keep in sync with .python-version, .nvmrc,
# backend/Dockerfile, docker-compose.yml and .github/workflows/ci.yml.
PYTHON_VERSION := 3.14
NODE_MAJOR := 24
POSTGRES_MAJOR := 18

# Fail early, and say why. Without this the toolchain mismatch only surfaces
# deep inside `uv sync` or at the first migration, where the error names a
# dependency rather than the actual cause.
preflight:
	@fail=0; \
	command -v uv >/dev/null 2>&1 || { echo "MISSING  uv — install: https://docs.astral.sh/uv/"; fail=1; }; \
	command -v node >/dev/null 2>&1 || { echo "MISSING  node — expected v$(NODE_MAJOR).x"; fail=1; }; \
	if command -v node >/dev/null 2>&1; then \
		major=$$(node --version | sed 's/^v\([0-9]*\).*/\1/'); \
		[ "$$major" = "$(NODE_MAJOR)" ] || echo "WARN     node v$$major, expected v$(NODE_MAJOR) (see .nvmrc)"; \
	fi; \
	if command -v python3 >/dev/null 2>&1; then \
		pv=$$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])'); \
		[ "$$pv" = "$(PYTHON_VERSION)" ] || echo "WARN     python $$pv, expected $(PYTHON_VERSION) (uv installs it if absent)"; \
	fi; \
	if command -v psql >/dev/null 2>&1; then \
		pg=$$(psql --version | sed 's/[^0-9]*\([0-9]*\).*/\1/'); \
		[ "$$pg" = "$(POSTGRES_MAJOR)" ] || echo "WARN     psql client $$pg, expected $(POSTGRES_MAJOR) — the server major is what matters"; \
	fi; \
	[ -f .env ] || echo "WARN     no .env — copy .env.example and fill SECRET_KEY, IP_HASH_SALT, DATABASE_URL"; \
	[ "$$fail" = "0" ] || { echo; echo "Prerequisites missing. See README.md > Local development setup."; exit 1; }

install: preflight
	cd backend && uv sync
	cd frontend && npm ci

run-backend:
	cd backend && uv run uvicorn app.main:app --reload

run-frontend:
	cd frontend && npm run dev

seed:
	cd backend && uv run python seed.py data/example-study.json

# COMPOSE_BAKE delegates the build to buildx bake, which builds the backend and
# frontend images in parallel instead of one after the other (ignored by Compose
# older than 2.33). DOCKER_BUILDKIT=1 guarantees the cache mounts in both
# Dockerfiles are honoured even if the daemon default was overridden.
demo-up:
	DOCKER_BUILDKIT=1 COMPOSE_BAKE=true docker compose up --build -d --wait --wait-timeout 240
	@printf '\nQualis services are running.\nNext: make demo-seed\n\n'

demo-seed:
	docker compose exec backend .venv/bin/python seed_demo.py
	@printf '\nDemo data is ready.\nNext: make demo-smoke\n\n'

demo-lipset:
	docker compose exec backend .venv/bin/python seed_lipset.py

validate-lipset:
	python3 validation/lipset/compare.py

demo-smoke:
	@curl -fsS http://localhost:3000/ >/dev/null
	@curl -fsS http://localhost:3000/health >/dev/null
	@curl -fsS http://localhost:3000/api/study/bioeconomy-futures >/dev/null
	@printf '\nQualis demo is ready: http://localhost:3000/login\nLogin: admin@example.com / admin123\n\n'

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

check-requirements:
	@echo "Checking uv.lock is in sync with pyproject.toml..."
	cd backend && uv lock --check
	@echo "Checking requirements.txt matches uv.lock..."
	cd backend && uv export --no-hashes --format requirements-txt --output-file requirements.txt
	git diff --exit-code backend/requirements.txt

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
	$(MAKE) check-requirements
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
