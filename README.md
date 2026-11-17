# Bug Log: backend

REST API for the Bug Log bug tracker.
**Node.js 22+ · Express · MongoDB Atlas (Mongoose)**. The web app lives in the separate `bug-tracker-frontend` project.

## Run locally
```bash
npm install
cp .env.example .env      # then put your Atlas connection string in .env
npm run dev               # restarts on file changes; or: npm start
```
The API runs on http://localhost:3001. Check it with http://localhost:3001/api/health → `{"ok":true,"db":true}`.

### Environment variables
| Name | Example | What it is |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net` | Atlas connection string (**secret**) |
| `MONGODB_DB` | `bugtracker` | Database name inside the cluster |
| `PORT` | `3001` | Port (hosts like Render set this for you) |
| `CORS_ORIGIN` | `https://your-frontend.netlify.app` | Frontend address(es) allowed to call the API, comma-separated. Use `http://localhost:5173` locally |

`.env` is in `.gitignore`. Never commit it.

## Database (MongoDB collections)
| Collection | Holds |
|---|---|
| `users` | name, username (case-insensitive unique), password hash (scrypt), role `Tester`/`Developer` |
| `sessions` | sign-in tokens; deleted automatically after 90 days |
| `projects` | name (unique, ignoring case), description, creator |
| `project_members` | who can see which project (unique per project + user) |
| `bugs` | all bug fields, `project_id`, assignee, reporter, timestamps |
| `history` | every status change, comment, notes update and edit |
| `uploads` | screenshot images (stored in the database, max 5 MB each) |
| `counters` | next number for users, projects and bugs (so bugs are `BUG-001`, `BUG-002`, …) |

Collections and indexes are created automatically when the server starts.

## Rules the API enforces
- **Testers** report bugs, edit all fields, import CSV, create projects, manage project teams, and close/reopen bugs.
- **Developers** can move bugs to Open, In Progress, Fixed, Ready for Retest or Not a Bug, comment and edit notes.
- A project and its bugs are visible **only to its members**; everyone else gets "not found".
- Assignees must be project members. Removing a member unassigns their bugs in that project. A project keeps at least one tester.
- "Date reported" can't be in the future. Only the reporter can delete a bug.

## API overview
`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/me`, `/api/users`,
`/api/projects` (+ `/:id`, `/:id/members`), `/api/bugs` (+ `/:id`, `/:id/status`, `/:id/notes`),
`/api/import?project=ID` (CSV body), `/api/export.csv?project=ID`, `/api/upload`, `/uploads/:id`, `/api/health`.
Send `Authorization: Bearer <token>` (from login/register) on every call except auth, health and images.

## Import a CSV from the command line
```bash
npm run import -- "path/to/bugs.csv" --project "Project name"
```

## Deploy on Render (free web service)
1. Push this project to GitHub.
2. Render → **New → Web Service** → pick the repo.
   Build command `npm install`, start command `npm start`, instance type **Free**.
3. Environment: add `MONGODB_URI`, `MONGODB_DB=bugtracker`, and `CORS_ORIGIN=<your frontend URL>`.
4. Health check path: `/api/health`.
5. In MongoDB Atlas → **Network Access**, allow Render to connect (add `0.0.0.0/0`, since Render's free IPs change).

Free Render services sleep after a period without traffic; the first request afterwards takes about a minute.
