# Bug Log: backend

REST API for the Bug Log bug tracker.
**Node.js 22+ · Express · MongoDB Atlas (Mongoose) · Cloudinary.** The web app lives in the separate `bug-tracker-frontend` project.

---

## Project structure

Feature-based: each feature owns its routes, controller, service, model and validation.
Shared code sits in `config/`, `middlewares/`, `utils/` and `constants/`.

```
src/
├── server.js                  # entry: validates env, connects DB, starts HTTP, graceful shutdown
├── app.js                     # builds the Express app (security, CORS, logging, routes, errors)
├── config/
│   ├── env.js                 # the ONLY place that reads process.env
│   ├── database.js            # MongoDB connect / disconnect / index sync
│   └── cloudinary.js          # Cloudinary SDK setup
├── constants/index.js         # roles, statuses, priorities, limits, shared messages
├── routes/index.js            # mounts every feature router under /api
├── middlewares/
│   ├── auth.middleware.js     # authenticate (Bearer token), testerOnly
│   ├── cors.middleware.js
│   ├── error.middleware.js    # notFound + central error handler -> { error }
│   ├── rateLimit.middleware.js
│   ├── requestLogger.middleware.js
│   └── upload.middleware.js   # multer: one image in memory, 5 MB max
├── utils/
│   ├── ApiError.js            # throw ApiError.notFound('...') from anywhere
│   ├── asyncHandler.js
│   ├── csv.js                 # parseCsv / toCsv
│   ├── date.js
│   ├── password.js            # scrypt hash / verify, random tokens
│   └── sanitize.js
└── modules/
    ├── auth/          auth.routes · auth.controller · auth.service · auth.validation · session.model
    ├── users/         user.routes · user.controller · user.service · user.model
    ├── projects/      project.routes · project.controller · project.service · member.service · *.model
    ├── bugs/          bug.routes · bug.controller · bug.service · bug.validation · bug.model · history.model
    ├── import-export/ import-export.routes · controller · csv-import.service · csv-export.service · csv-mapping
    ├── uploads/       upload.routes · upload.controller · upload.service (Cloudinary) · upload.model (legacy)
    ├── counter/       counter.model (BUG-001 style numeric ids)
    └── system/        health + meta
scripts/
├── import-cli.js              # npm run import -- "bugs.csv" --project "Name"
└── migrate-uploads.js         # npm run migrate:uploads (old DB images -> Cloudinary)
```

**Request flow:** `routes` → `middlewares` (auth, role, upload) → `controller` (reads `req`, writes `res`) → `service` (business rules + DB) → `model`.
Services throw `ApiError`; the error middleware turns it into `{ "error": "message" }` with the right status code.

---

## Run locally

```bash
npm install
cp .env.example .env      # fill in MongoDB + Cloudinary values
npm run dev               # restarts on file changes; or: npm start
```

Check it: http://localhost:3001/api/health → `{"ok":true,"db":true,...}`

### Environment variables

| Name | Required | Example | What it is |
|---|---|---|---|
| `MONGODB_URI` | yes | `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net` | Atlas connection string (**secret**) |
| `MONGODB_DB` | | `bugtracker` | Database name inside the cluster |
| `CORS_ORIGIN` | yes in prod | `https://your-frontend.netlify.app` | Frontend address(es), comma-separated |
| `CLOUDINARY_URL` | for uploads | `cloudinary://<key>:<secret>@<cloud_name>` | From Cloudinary → Settings → API Keys (**secret**) |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | | | Alternative to `CLOUDINARY_URL` |
| `CLOUDINARY_FOLDER` | | `bug-tracker/screenshots` | Folder in your Cloudinary media library |
| `PORT` | | `3001` | Hosts like Render set this for you |
| `NODE_ENV` | | `production` | Switches log format |

`.env` is in `.gitignore`. Never commit it.

---

## Deploy to Render (free)

### 1. Prepare the services (one time)

**MongoDB Atlas** → *Network Access* → **Add IP Address** → `0.0.0.0/0` (Render's free IPs change).

**Cloudinary** → *Settings* → *API Keys* → copy the **API environment variable**
(`cloudinary://<api_key>:<api_secret>@<cloud_name>`).

### 2. Push the code to GitHub

```bash
git add .
git commit -m "Restructure backend into feature modules, add Cloudinary uploads"

# First time only: create the GitHub repo and push (needs the GitHub CLI, `gh auth login`)
gh repo create bug-tracker-backend --private --source . --push

# Every time after that
git push
```

### 3. Create the service on Render

1. https://dashboard.render.com → **New** → **Blueprint** → pick the `bug-tracker-backend` repo.
   Render reads [`render.yaml`](render.yaml): Node 22, free plan, `npm ci --omit=dev`, `npm start`, health check `/api/health`.
2. It asks for the secret values:
   - `MONGODB_URI` → your Atlas string
   - `CORS_ORIGIN` → your frontend URL, e.g. `https://bug-tracker-frontend.netlify.app`
   - `CLOUDINARY_URL` → the Cloudinary string from step 1
3. Click **Apply**. The first deploy takes 2–3 minutes.

*(Without the Blueprint: New → Web Service → repo, build `npm ci --omit=dev`, start `npm start`, health check `/api/health`, and add the same env vars plus `NODE_ENV=production`.)*

### 4. Check it

```bash
curl https://<your-service>.onrender.com/api/health
# {"ok":true,"db":true,"uptime":...}
```

### 5. Point the frontend at it

In the frontend's host (e.g. Netlify → Site settings → Environment variables) set
`VITE_API_URL=https://<your-service>.onrender.com` and redeploy the frontend.

### 6. (Once) move old screenshots to Cloudinary

Images uploaded before Cloudinary were stored in MongoDB. They still display, but to move them:

```bash
npm run migrate:uploads
```

Free Render services sleep after ~15 minutes without traffic; the first request afterwards takes about a minute.

### Alternative: Docker (any host: Railway, Fly.io, a VPS)

```bash
docker build -t bug-tracker-api .
docker run --env-file .env -e NODE_ENV=production -p 3001:3001 bug-tracker-api
```

---

## Database (MongoDB collections)

| Collection | Holds |
|---|---|
| `users` | name, username (case-insensitive unique), password hash (scrypt), role `Tester`/`Developer` |
| `sessions` | sign-in tokens; deleted automatically after 90 days |
| `projects` | name (unique, ignoring case), description, creator |
| `project_members` | who can see which project (unique per project + user) |
| `bugs` | all bug fields, `project_id`, assignee, reporter, timestamps; `screenshot` is a Cloudinary URL |
| `history` | every status change, comment, notes update and edit |
| `uploads` | **legacy** screenshots stored before Cloudinary (read-only) |
| `counters` | next number for users, projects and bugs (so bugs are `BUG-001`, `BUG-002`, …) |

Collections and indexes are created automatically when the server starts.

## Rules the API enforces

- **Testers** report bugs, edit all fields, import CSV, create projects, manage project teams, and close/reopen bugs.
- **Developers** can move bugs to Open, In Progress, Fixed, Ready for Retest or Not a Bug, comment and edit notes.
- A project and its bugs are visible **only to its members**; everyone else gets "not found".
- Assignees must be project members. Removing a member unassigns their bugs in that project. A project keeps at least one tester.
- "Date reported" can't be in the future. Only the reporter can delete a bug.
- Screenshots must be images from this app's own Cloudinary folder (no arbitrary URLs).
- Sign-in and sign-up are rate-limited to 20 attempts per 15 minutes per IP.

## API overview

| Method | Path | Who |
|---|---|---|
| GET | `/api/health`, `/api/meta` | public |
| POST | `/api/auth/register`, `/api/auth/login` | public |
| POST | `/api/auth/logout` | signed in |
| GET | `/api/me` | signed in |
| GET | `/api/users` | tester |
| GET / POST | `/api/projects` | member / tester |
| PUT / DELETE | `/api/projects/:id` | tester |
| GET / POST | `/api/projects/:id/members` | member / tester |
| DELETE | `/api/projects/:id/members/:userId` | tester |
| GET / POST | `/api/bugs?project=ID` | member / tester |
| GET / PUT / DELETE | `/api/bugs/:id` | member / tester / reporter |
| PATCH | `/api/bugs/:id/status`, `/api/bugs/:id/notes` | member |
| POST | `/api/import?project=ID` (CSV body) | tester |
| GET | `/api/export.csv?project=ID` | member |
| POST | `/api/upload` (multipart field `file`) → `{ url }` | signed in |
| GET | `/uploads/:id` (legacy images) | public |

Send `Authorization: Bearer <token>` (from login/register) on every call except the public ones.

## Import a CSV from the command line

```bash
npm run import -- "path/to/bugs.csv" --project "Project name"
```
