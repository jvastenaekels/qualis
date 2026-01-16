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
   - **Update Tests**:
     - _If logic changed_: Update existing tests immediately.
     - _If new feature_: Add new corresponding unit/E2E tests.
   - **Verify**: Run relevant tests locally.

3. **Quality Gate**:
   - **Run CI Locally**: `make ci`
   - **Fix Issues**: If `make ci` fails (linting, formatting, tests), fix them **BEFORE** pushing. Do not push broken code.

4. **Commit & Push**:
   - Stage changes: `git add .`
   - Commit using Conventional Commits: `git commit -m "[type](scope): description"`
   - Push to remote: `git push -u origin [branch-name]`

5. **Validation**:
   - **Monitor CI**: `gh run watch`
   - **Fix Issues**: If the remote CI fails, fix the issues immediately and push a new commit.

6. **Consolidation**:
   - Switch to main: `git checkout main`
   - Merge the branch: `git merge [branch-name]`
   - Push to main: `git push origin main`
   - Cleanup: `git branch -d [branch-name]`

// turbo-all
