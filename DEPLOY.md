# Deploy Checklist

## Content source
- All content comes from one Google Sheet: the media tab (`gid=0`) and a tab
  named `projects` (columns `project`, `description`).
- To point a build at a different sheet, set `VITE_ITEMS_CSV_URL` and
  `VITE_PROJECTS_CSV_URL` in `/.env.production` or `/.env.staging`.

## Start new work on `codex/*`
```bash
cd "/Volumes/RMNDS1 AI CORE/Projects/keep_scrolling-main"
git fetch origin
git switch staging
git pull --ff-only origin staging
git switch -c codex/feature-name
```

## Commit and push your feature branch
```bash
git add .
git commit -m "Describe feature"
git push -u origin codex/feature-name
```

## Merge feature into `staging` (preview)
```bash
git switch staging
git pull --ff-only origin staging
git merge --no-ff codex/feature-name
git push origin staging
```

## Deploy preview from `staging`
- In Hostinger Git deployment, select branch `staging` for preview/staging target.

## Promote to production (`main`)
```bash
git switch main
git pull --ff-only origin main
git merge --no-ff staging
git push origin main
```

## Deploy production from `main`
- In Hostinger production deploy, use branch `main` only.

## Optional cleanup after release
```bash
git branch -d codex/feature-name
git push origin --delete codex/feature-name
```
