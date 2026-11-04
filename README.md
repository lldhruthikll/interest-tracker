# 💰 Interest Collection Manager

A simple, fast, and modern web application built specifically for personal money lending businesses to manage borrowers, track active loans, automatically compute monthly interest due dates, process FIFO payments, and export Excel reports.

---

## 🌟 Key Features

- **Single Admin Authentication**: Clean JWT login flow for the business owner.
- **Borrower & Loan Directory**:
  - Store borrower details (Name, Phone, Address, Notes).
  - Track loans with Principal Amount, Monthly Interest Amount (entered manually), and Start Date.
  - Automatic due date generation (e.g. Loan starting 15 March $\rightarrow$ interest due on the 15th of every month).
- **Automated FIFO Payment Allocation**:
  - When collecting payments, enter **only the payment amount**.
  - System automatically pays the **oldest pending interest record first** (First-In, First-Out: April $\rightarrow$ May $\rightarrow$ June).
- **Dashboard Analytics**:
  - Interest Due Today
  - Overdue Borrowers
  - Upcoming Due Dates (Next 7 Days)
  - Total Pending Interest
  - Total Principal Lent
  - Total Active Loans
- **Visual Due Calendar**: Interactive monthly calendar with color-coded due statuses.
- **Browser Notifications**: One-click Web Browser Notifications for payments due today.
- **Instant Search**: Search by borrower name or phone number.
- **Excel Reports Export**: Single-click export of complete pending ledgers, borrower summaries, and payment history to `.xlsx`.

---

## 🛠️ Technology Stack

- **Frontend**: React + Vite + Tailwind CSS (Optimized for **Vercel** deployment)
- **Backend**: Node.js + Express (Optimized for **Render** web service deployment)
- **Database & ORM**: Prisma ORM + PostgreSQL (**Neon PostgreSQL** compatible)
- **Containerization**: Docker & Docker Compose

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- Local Postgres (Docker container `interest_db`, host port **5436**, user `postgres`)

### 1. Database & Backend Setup

All local backend commands go through `scripts/local.js`, which loads `.env.local` (or `.env.test`) and refuses any non-local `DATABASE_URL`. The plain `backend/.env` is not used locally.

```bash
cd backend
npm install
cp .env.local.example .env.local     # DATABASE_URL -> localhost:5436/finledger_v2
cp .env.test.example .env.test       # DATABASE_URL -> localhost:5436/finledger_test

node scripts/local.js npx prisma migrate deploy   # create/upgrade the dev schema
npm run db:test:reset                             # test schema
node scripts/local.js node scripts/create-admin.js   # empty DB only: creates the first admin
npm run dev                                       # API on http://localhost:5000
npm test                                          # full backend test suite
```

There is no default admin account. On an empty database, create one with `create-admin.js`. On the existing production database the existing user becomes `ADMIN` through the migration.

---

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🐳 Docker Deployment

To launch the full stack (PostgreSQL, Backend API, Nginx Frontend) with a single command:

```bash
docker-compose up --build -d
```

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000`

---

## ☁️ Deployment Instructions

### 1. Backend Deployment on Render
1. Push this repository to GitHub/GitLab.
2. Go to [Render Dashboard](https://dashboard.render.com/) and create a **Web Service**.
3. Point to the `/backend` directory.
4. Set Build Command: `npm install && npx prisma generate`
5. Set Start Command: `node src/index.js` (migrations are not run on start; run them manually per `docs/superpowers/runbooks/2026-11-04-finledger-v2-cutover.md`)
6. Add Environment Variables:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string (`postgresql://user:pass@ep-xyz.neon.tech/dbname?sslmode=require`)
   - `JWT_SECRET`: A secure random secret string.
   - `CORS_ORIGIN`: Your Vercel domain (comma-separated list allowed).
   - `NODE_ENV`: `production`

### 2. Frontend Deployment on Vercel
1. Go to [Vercel Dashboard](https://vercel.com/) and create a **New Project**.
2. Select the repository and set Framework Preset to **Vite**.
3. Set Root Directory to `frontend`.
4. Set Environment Variables:
   - `VITE_API_URL`: `https://your-render-backend.onrender.com/api`
5. Click **Deploy**.

---

## 🧮 How FIFO Interest Payment Allocation Works

### Example Scenario
- **Loan Start Date**: 15 March
- **Monthly Interest**: ₹4,000

Monthly records automatically created:
- April: ₹4,000 Pending
- May: ₹4,000 Pending
- June: ₹4,000 Pending
- **Total Pending Interest**: ₹12,000

When borrower pays **₹8,000**:
1. System checks pending records sorted by due date (`dueDate ASC`).
2. April (₹4,000) $\rightarrow$ **Paid** (Remaining payment = ₹4,000)
3. May (₹4,000) $\rightarrow$ **Paid** (Remaining payment = ₹0)
4. June (₹4,000) $\rightarrow$ **Pending**
