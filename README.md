# Investure Capital

A dark-themed, PWA-installable prototype of an investment platform demonstrating
**compounding interest** mechanics. **Simulation only — no real money or trading.**

- **Stack:** Next.js 16 (App Router) · React 19 · Tailwind 4 · Firebase Auth · Recharts · Framer Motion
- **Hosting target:** Vercel
- **Live data:** Real BTC/ETH/SOL/BNB/XRP/ADA/DOGE prices via CoinGecko (no auth)
- **Currency:** PHP (₱)

## Local development

```bash
npm install
npm run dev
```

App runs at <http://localhost:3000>.

Without `.env.local` configured, the app runs in **Demo mode** — sign-in/sign-up
bypass auth and route straight to the dashboard. All balances and activity come
from mock data.

## Firebase setup (enables real auth)

1. Create a project at <https://console.firebase.google.com>
2. **Authentication → Sign-in method** → enable **Email/Password**
3. **Project settings → Your apps** → add a Web app → copy the config object
4. Copy `.env.local.example` → `.env.local`, then paste the values:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

5. Restart `npm run dev` — the "Demo" pill disappears, real auth is live.

**Note:** Firebase web API keys are public by design. Security comes from
Firestore rules and Auth's Authorized Domains list (settings → Authentication →
Settings → Authorized domains).

## Deploy to Vercel

### One-time: push to GitHub

```bash
# from inside investure/
gh repo create investurecapital --public --source=. --remote=origin --push
# or manually:
git remote add origin https://github.com/<you>/investurecapital.git
git push -u origin master
```

### Connect to Vercel

1. Go to <https://vercel.com/new>
2. **Import Git Repository** → pick `investurecapital`
3. Framework preset: **Next.js** (auto-detected)
4. Root Directory: leave as `./` (the repo root is the Next.js app)
5. **Environment Variables** → paste each `NEXT_PUBLIC_FIREBASE_*` from your `.env.local`
6. Click **Deploy**

### After first deploy

- Add the Vercel-issued domain (e.g. `investure-xxx.vercel.app`) to Firebase
  Auth's **Authorized Domains** list, or sign-in will fail with `auth/unauthorized-domain`
- Pushes to `master` auto-deploy. Branches get preview URLs.

## PWA / installable app

The app is configured as a PWA:

- `public/manifest.json` — name, theme color, start_url, icons
- `public/icon.svg` + `public/icon-maskable.svg` — gold-on-navy app icon
- `public/sw.js` — service worker with network-first navigation and
  cache-first static assets
- `src/components/RegisterSW.tsx` — registers the SW (production only)

**To install on desktop Chrome/Edge:** open the deployed site → click the
install icon in the address bar.

**To install on iOS Safari:** Share → Add to Home Screen.

**Service worker only registers in production builds** to avoid conflicts with
the Next.js dev server's HMR.

## Project structure

```
src/
  app/
    (app)/                    # routes with sidebar shell + auth guard
      dashboard/              # hero balance, KPIs, chart, plans, activity
      plans/                  # calculator + 4 plan cards
      wallet/                 # balance, withdraw/reinvest, transactions
      vault/                  # gold hero, compounding chart, lock countdown
      activity/               # full filterable activity log
      withdrawals/ transactions/ profile/ support/   # placeholders
    admin/                    # admin overview (own sidebar variant)
    login/ register/          # split-layout auth pages
    layout.tsx                # root (AuthProvider, PWA metadata, RegisterSW)
    page.tsx                  # redirects to /dashboard
  components/                 # reusable UI (Card, Modal, Sidebar, charts…)
  lib/
    auth.tsx                  # Firebase auth context
    firebase.ts               # SDK initializer (graceful demo-mode fallback)
    mock-data.ts              # all simulated balances + compounding math
    useLiveTickers.ts         # CoinGecko fetch hook (30s refresh)
    nav.ts                    # sidebar config (investor + admin variants)
    utils.ts                  # cn(), formatPHP()
public/
  manifest.json icon.svg icon-maskable.svg sw.js
```

## Compounding math (the showcase)

Single ₱1,000 investment in the 30-day premium plan @ 3.5% daily:
- Daily income to wallet: ₱35/day × 30 = **₱1,050**
- Vault credit at plan end: **₱1,050**
- Vault after 365d (1% daily compounding): ₱1,050 × 37.78 ≈ **₱39,672**
- **Total return: ₱40,722** (≈40.7×)

Reinvesting ₱1,000/month for 12 months → vault ≈ **₱150,551** at year-end.
Stop reinvesting and let it ride another year → ≈ **₱5.69M**.

All numbers above are simulated to demonstrate the *mechanics* of compounding,
not to make claims about real-world returns.
