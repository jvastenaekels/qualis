.PHONY: install run-backend run-frontend lint check test ci

install:
	cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt -r requirements-dev.txt
	cd frontend && npm install

run-backend:
	cd backend && ./venv/bin/uvicorn app.main:app --reload

run-frontend:
	cd frontend && npm run dev

# -------------------------
# Quality & Verification
# -------------------------

lint:
	cd backend && ./venv/bin/ruff check app/
	cd backend && ./venv/bin/ruff format --check app/
	cd frontend && npm run lint

check:
	cd backend && ./venv/bin/mypy app/
	cd backend && ./venv/bin/bandit -r app/ -ll
	cd backend && ./venv/bin/radon cc app/ -a -nb --min B
	cd backend && ./venv/bin/deptry app/
	cd backend && ./venv/bin/vulture app/ vulture_whitelist.py --min-confidence 60
	cd frontend && npm run type-check
	cd frontend && npm run i18n-check

test:
	cd backend && ./venv/bin/pytest tests/
	cd frontend && npm run test -- --run

ci: lint check test
	@echo "\n--- All CI checks passed locally! ---"
