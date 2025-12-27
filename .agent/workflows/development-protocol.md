---
description: Standard robust workflow for implementing features or bug fixes.
---

1. **Initialization**:
   - Ensure `main` is up to date: `git checkout main && git pull origin main`
   - Create a specific branch: `git checkout -b [type]/[context]-[short-description]`
     - Types: `feature`, `fix`, `refactor`, `docs`, `chore`
     - Example: `feature/auth-login`, `fix/mobile-zoom`

2. **Implementation Cycle**:
   - **Plan**: Analyze requirements and create an implementation plan if complex.
   - **Edit**: Make necessary code changes.
   - **Verify**: Run relevant tests locally.

3. **Quality Gate**:
   - Run Pre-commit hooks: `pre-commit run --all-files` (or relying on auto-run on commit)
   - Ensure linting passes: `npm run lint` (frontend) / `ruff check backend` (backend)

4. **Commit & Push**:
   - Stage changes: `git add .`
   - Commit using Conventional Commits: `git commit -m "[type](scope): description"`
   - Push to remote: `git push -u origin [branch-name]`

5. **Consolidation**:
   - Switch to main: `git checkout main`
   - Merge the branch: `git merge [branch-name]`
   - Push to main: `git push origin main`
   - Cleanup: `git branch -d [branch-name]`

// turbo-all
