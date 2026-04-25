postdeploy: cd backend && ENVIRONMENT=${ENVIRONMENT:-production} python scripts/postdeploy.py
web: cd backend && ENVIRONMENT=${ENVIRONMENT:-production} gunicorn app.main:app --workers 2 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT --access-logfile - --error-logfile - --timeout 120
