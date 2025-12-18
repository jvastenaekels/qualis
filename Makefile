.PHONY: install run-backend run-frontend

install:
	cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
	cd frontend && npm install

run-backend:
	cd backend && ./venv/bin/uvicorn app.main:app --reload

run-frontend:
	cd frontend && npm run dev
