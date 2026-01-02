.PHONY: install run-backend run-frontend lint check test ci

install:
	cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt -r requirements-dev.txt
	cd frontend && npm install

run-backend:
	cd backend && uv run uvicorn app.main:app --reload

run-frontend:
	cd frontend && npm run dev

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
	cd frontend && npm run type-check
	cd frontend && npm run i18n-check

test:
	cd backend && uv run pytest -n auto tests/
	cd frontend && npm run test -- --run --coverage

e2e:
	cd frontend && npm run e2e

ci: lint check test e2e
	@echo "\n--- All CI checks passed locally! ---"
