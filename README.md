# Roshan & Mathan — Shared Intraday Desk

A cloud-ready, browser-based shared intraday trade ledger. The web app is designed for two invited users, works across separate devices, stores records in Supabase Postgres, and is deployed through Vercel. It is a tracking/reconciliation tool only: it has no INDmoney integration and cannot place orders.

## Included in this starter

- Email/password sign-in and account creation via Supabase Auth.
- One shared workspace for Roshan and Mathan; the owner can create a private one-time invite code.
- One-time workspace initialization that imports the historical records listed in `docs/HISTORICAL_DATA_RECONCILIATION.md`.
- Trade entry with gross P&L, brokerage, other charges, batch labels and either contribution-based or current-balance-based P&L splits.
- Unverified charges are explicitly marked pending and are excluded from the final net-P&L balance calculation until confirmed.
- Separate capital movements for deposits, withdrawals and corrections.
- Trade CSV export and full JSON data snapshot export.
- Postgres Row Level Security (RLS) on the workspace tables and role-aware invite creation.

## Architecture

- **Next.js**: user interface and deployable website.
- **Supabase Auth + Postgres**: sign-in and shared data store.
- **Supabase RLS**: access rules are enforced by the database, not only by hidden UI controls.
- **Vercel**: hosts the web app and provides deployment/environment configuration.

## Setup and deployment

### 1. Create the Supabase project

1. Open <https://supabase.com> and create a project. Choose a project region convenient for both users.
2. Keep the database password private. It is not needed in the frontend.
3. In **Project Settings → API**, copy the **Project URL** and **publishable key**.
4. In **Authentication → URL Configuration**, set the site URL after Vercel has deployed the website. Enable email confirmation if you want confirmed email addresses before access.

### 2. Create the database schema

1. Open the project's SQL Editor.
2. Open `supabase/migrations/0001_shared_intraday_desk.sql` from this repository.
3. Paste and run the entire SQL file once. It creates the schema, indexes, RLS policies and restricted RPC functions.
4. Do not run the migration a second time unless you first make it repeatable or inspect the existing policies/functions. The `CREATE POLICY` statements are intended for a one-time setup.

This SQL migration uses `SECURITY DEFINER` functions for workspace initialization and invite acceptance. Those functions check the authenticated user and are granted only to signed-in users. The app tables have RLS enabled; workspace records should not be made public.

### 3. Put the code in GitHub

1. Extract the project ZIP.
2. Create a **private** GitHub repository, for example `roshan-mathan-intraday-desk`.
3. Upload the project files and commit them. Do not upload `.env.local`, API secrets, or database passwords.

### 4. Deploy on Vercel

1. Open <https://vercel.com>, import the private GitHub repository and select Next.js.
2. Under **Project → Settings → Environment Variables**, add these values for Production (and Preview if you need preview deployments):
   - `NEXT_PUBLIC_SUPABASE_URL` = the Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the Supabase publishable key
3. Deploy, then set the Supabase Auth **Site URL** to the Vercel production URL and add the URL to the allowed redirect URLs.
4. Redeploy if you change environment variables.

**Never put the Supabase `service_role` or secret key into a `NEXT_PUBLIC_*` variable or any client-side file.** This application uses the publishable key; RLS must remain enabled. Never share the database password or personal sign-in password in chat.

### 5. Initialize and connect both accounts

1. Roshan opens the deployed URL and selects **Create account**. Confirm the email if Supabase asks, then sign in.
2. Click **Initialize workspace & import history** once. The database seeds four completed older trades, four October 19 positions, two opening balance snapshots, and Mathan's historical ₹340.13 withdrawal adjustment.
3. In the Sharing & Security panel, click **Create Mathan invite**. Send the generated code to Mathan privately. It is one-use and expires after seven days.
4. Mathan creates his own account on his device, signs in, pastes the invite code, and accepts it. Both then see the same records.
5. Open Trade History and review the TCS entry. The exact brokerage and government/other charge numbers were not present in the chat transcript used for migration, so that trade is flagged as pending instead of relying on the old estimate. Select **Enter verified charges** and enter the two exact charge components from the INDmoney breakdown. Net P&L and balances then recalculate.

Do not initialize the workspace from Mathan's account if Roshan is intended to own administrative access; create the workspace with Roshan's account first.

## Historical migration policy

See `docs/HISTORICAL_DATA_RECONCILIATION.md`. In summary:

- The four completed trades in the uploaded tracker are retained with their original buy/sell values, charges, contribution amounts and recorded owner-level P&L allocations.
- The old completed trades are marked `affects_current_balance = false`, because their effects are already included in the supplied carry-forward balance snapshot. This prevents historical P&L from being counted a second time.
- The opening snapshot is Roshan ₹4,952.09 and Mathan ₹3,667.21. Mathan's ₹340.13 withdrawal is a separate negative capital movement, resulting in starting owner balances of Roshan ₹4,952.09 and Mathan ₹3,327.08, total ₹8,279.17.
- All four October 19 positions are imported. Three are Batch 1; Union Bank 285 shares is Batch 2. The screenshots show P&L and charges for Gabriel India, Union Bank 85 shares, and Union Bank 285 shares. TCS gross P&L is imported as −₹339.00 but final net P&L is held pending verified charges.

## Suggested security checklist before sharing

- Keep the GitHub repository private.
- Enable email confirmation and use unique, long passwords for Roshan and Mathan.
- Consider enabling MFA on Supabase and Vercel account logins.
- Run the Supabase Security Advisor and verify RLS is enabled on every exposed table.
- Never disable RLS for convenience. Never add a public/anonymous policy for these tables.
- The invite code is a credential: send it privately and do not post it in a public channel.
- Export a full JSON snapshot regularly. A trades CSV is useful for analysis but it is not a complete database backup.
- Supabase Free projects may pause after a week of insufficient activity and Free does not include automatic database backups. For a money ledger, make regular off-site exports and consider a paid tier if you need provider-managed backups and less downtime risk.
- The app is not a regulated accounting or brokerage system. Compare daily totals against INDmoney and retain the broker's official trade/charges statements.

## Local development

Requirements: Node.js compatible with the active Next.js LTS version and npm.

```bash
cp .env.example .env.local
# Add your real Supabase Project URL and publishable key in .env.local
npm install
npm run dev
```

Open <http://localhost:3000>. Use a separate Supabase development project when testing schema changes, invitations, or migrations. Do not test by deleting production records.
