# GitHub OAuth Implementation Tasks

- [x] Read implementation plan & all relevant files
- [ ] Step 1: models.py — add `github_token` column to User
- [ ] Step 2: settings.py — add `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET`
- [ ] Step 3: auth.py — add `/api/auth/github/login` & `/api/auth/github/callback` routes
- [ ] Step 4: core.py — update `download_and_extract_repo()` to accept `github_token`
- [ ] Step 5: main.py — pass `github_token` from current_user into scan + fix migration helper
- [ ] Verify & push
