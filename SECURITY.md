# Security notes

1. Database tables containing trading information have Row Level Security enabled. The client must be authenticated and a member of the matching workspace to read them.
2. `initialize_shared_workspace`, `create_workspace_invite`, `accept_workspace_invite`, `create_shared_trade`, and `update_trade_charges` are restricted to authenticated users and validate workspace membership or ownership.
3. The frontend accepts only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do not put `service_role`, secret API keys, database passwords, or Vercel access tokens in frontend source, client environment variables, screenshots, or the shared invite.
4. Invite tokens are random, one-time and expire in seven days. The token is hashed before being stored in the database.
5. The app intentionally has no delete-trade button. Use a documented correction movement or future audited correction workflow rather than silently erasing financial history.
6. This is a starter for a private two-person ledger, not a security audit. Before real use, test that an unauthenticated client cannot read each table and that a signed-in non-member cannot read or modify this workspace. Run the Supabase Security Advisor and review the SQL migration policies.
