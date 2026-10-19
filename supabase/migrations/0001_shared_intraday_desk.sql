-- Roshan & Mathan Shared Intraday Desk
-- Run this entire file in Supabase SQL Editor using the project's owner/admin account.
-- Client requests are scoped by RLS; the service-role key is never needed in the browser.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Roshan & Mathan Shared Intraday Desk',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, name),
  unique (workspace_id, id)
);

create table if not exists public.capital_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  partner_id uuid not null,
  amount numeric(14,2) not null,
  movement_type text not null check (movement_type in ('opening_snapshot','deposit','withdrawal','correction','transfer')),
  movement_date date,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, partner_id) references public.partners(workspace_id, id) on delete restrict
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  trade_date date not null,
  stock_name text not null,
  symbol text not null default '',
  quantity numeric(14,4) not null default 0 check (quantity >= 0),
  buy_value numeric(14,2) not null default 0,
  sell_value numeric(14,2) not null default 0,
  gross_pnl numeric(14,2) not null,
  brokerage numeric(14,2) check (brokerage >= 0 or brokerage is null),
  other_charges numeric(14,2) check (other_charges >= 0 or other_charges is null),
  charges_confirmed boolean not null default false,
  batch_label text not null default 'Single trade',
  trade_status text not null default 'closed' check (trade_status in ('open','closed','needs_review')),
  affects_current_balance boolean not null default true,
  source_label text not null default 'manual entry',
  source_note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.trade_allocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  trade_id uuid not null,
  partner_id uuid not null,
  contribution_amount numeric(14,2) not null default 0 check (contribution_amount >= 0),
  allocation_percent numeric(9,6) not null check (allocation_percent >= 0 and allocation_percent <= 100),
  net_pnl_share numeric(14,2),
  allocation_method text not null default 'current-balance' check (allocation_method in ('contribution','current-balance','manual','historical-recorded')),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, trade_id) references public.trades(workspace_id, id) on delete cascade,
  foreign key (workspace_id, partner_id) references public.partners(workspace_id, id) on delete restrict,
  unique (trade_id, partner_id)
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

create index if not exists trades_workspace_date_idx on public.trades(workspace_id, trade_date desc);
create index if not exists capital_movements_workspace_partner_idx on public.capital_movements(workspace_id, partner_id);
create index if not exists trade_allocations_workspace_trade_idx on public.trade_allocations(workspace_id, trade_id);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id and wm.user_id = auth.uid() and wm.role = 'owner'
  );
$$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.partners enable row level security;
alter table public.capital_movements enable row level security;
alter table public.trades enable row level security;
alter table public.trade_allocations enable row level security;
alter table public.workspace_invites enable row level security;

-- Policies are deliberately limited to signed-in workspace members.
create policy "Members can read their workspace" on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));

create policy "Users can read their own membership and workspace co-members" on public.workspace_members
  for select to authenticated using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

create policy "Workspace members can read partners" on public.partners
  for select to authenticated using (public.is_workspace_member(workspace_id));

create policy "Workspace members can read capital movements" on public.capital_movements
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Workspace members can add capital movements" on public.capital_movements
  for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

create policy "Workspace members can read trades" on public.trades
  for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "Workspace members can read allocations" on public.trade_allocations
  for select to authenticated using (public.is_workspace_member(workspace_id));
-- Trade and allocation writes are exposed only through validated SECURITY DEFINER RPCs, not direct table writes.

-- Invite tokens are only manipulated through SECURITY DEFINER RPCs; no direct table policy is granted.

create or replace function public.initialize_shared_workspace()
returns uuid
language plpgsql security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_workspace uuid;
  v_roshan uuid;
  v_mathan uuid;
  v_trade uuid;
begin
  if v_user is null then raise exception 'Sign in before initializing the workspace.'; end if;

  select wm.workspace_id into v_workspace
  from public.workspace_members wm where wm.user_id = v_user order by wm.joined_at limit 1;
  if v_workspace is not null then return v_workspace; end if;

  insert into public.workspaces(name, created_by)
  values ('Roshan & Mathan Shared Intraday Desk', v_user)
  returning id into v_workspace;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_workspace, v_user, 'owner');

  insert into public.partners(workspace_id, name, sort_order)
  values (v_workspace, 'Roshan', 1) returning id into v_roshan;
  insert into public.partners(workspace_id, name, sort_order)
  values (v_workspace, 'Mathan', 2) returning id into v_mathan;

  -- The current-balance baseline comes from the provided tracker. Old settled trades below are preserved
  -- for reporting but do NOT affect the balance again, because they are already included in this snapshot.
  insert into public.capital_movements(workspace_id, partner_id, amount, movement_type, movement_date, note, created_by)
  values
    (v_workspace, v_roshan, 4952.09, 'opening_snapshot', null, 'Opening balance snapshot from the provided tracker, before the historical withdrawal adjustment.', v_user),
    (v_workspace, v_mathan, 3667.21, 'opening_snapshot', null, 'Opening balance snapshot from the provided tracker, before the historical withdrawal adjustment.', v_user),
    (v_workspace, v_mathan, -340.13, 'withdrawal', null, 'Mathan withdrawal already reflected in the old dashboard; recorded once for audit and reconciliation.', v_user);

  -- Historical completed trades: original recorded amounts/allocations are preserved as entered.
  insert into public.trades(workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status, affects_current_balance, source_label, source_note, created_by)
  values (v_workspace, '2026-10-14', 'SS Retail', 'SSRETAIL', 33, 25442.20, 25964.40, 522.20, 40.00, 16.56, true,
    'Historical', 'closed', false, 'imported Excel', 'Imported from Roshan_Mathan_Trading_Tracker. Net P&L already included in opening snapshot.', v_user)
  returning id into v_trade;
  insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount, allocation_percent, net_pnl_share, allocation_method)
  values (v_workspace,v_trade,v_roshan,5000.00,96.285683,448.34,'historical-recorded'),(v_workspace,v_trade,v_mathan,192.88,3.714317,17.30,'historical-recorded');

  insert into public.trades(workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status, affects_current_balance, source_label, source_note, created_by)
  values (v_workspace, '2026-10-15', 'NETWEB', 'NETWEB', 9, 43487.80, 42435.90, -1051.90, 40.00, 22.66, true,
    'Historical', 'closed', false, 'imported Excel', 'Imported from tracker; P&L already reflected in opening snapshot.', v_user)
  returning id into v_trade;
  insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount, allocation_percent, net_pnl_share, allocation_method)
  values (v_workspace,v_trade,v_roshan,5448.34,62.642166,-698.18,'historical-recorded'),(v_workspace,v_trade,v_mathan,3249.22,37.357834,-416.38,'historical-recorded');

  insert into public.trades(workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status, affects_current_balance, source_label, source_note, created_by)
  values (v_workspace, '2026-10-16', 'Cupid', 'CUPID', 100, 35070.00, 35455.00, 385.00, 40.00, 19.99, true,
    'Historical', 'closed', false, 'imported Excel', 'Imported from tracker; P&L already reflected in opening snapshot.', v_user)
  returning id into v_trade;
  insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount, allocation_percent, net_pnl_share, allocation_method)
  values (v_workspace,v_trade,v_roshan,4750.16,62.128842,201.93,'historical-recorded'),(v_workspace,v_trade,v_mathan,2895.50,37.871158,123.08,'historical-recorded');

  insert into public.trades(workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status, affects_current_balance, source_label, source_note, created_by)
  values (v_workspace, '2026-10-16', 'Euro Pratik Sales', 'EUROPRATIK', 17, 3070.88, 3106.58, 35.70, 6.18, 2.21, true,
    'Historical', 'closed', false, 'imported Excel', 'Imported from tracker; P&L already reflected in opening snapshot.', v_user)
  returning id into v_trade;
  insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount, allocation_percent, net_pnl_share, allocation_method)
  values (v_workspace,v_trade,v_roshan,0.00,0.000000,0.00,'historical-recorded'),(v_workspace,v_trade,v_mathan,621.32,100.000000,27.31,'historical-recorded');

  -- October 19 screenshot positions. First three belong to batch 1; final Union Bank position is batch 2.
  insert into public.trades(workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status, affects_current_balance, source_label, source_note, created_by)
  values (v_workspace, '2026-10-19', 'Gabriel India', 'GABRIEL', 10, 14979.00, 15132.00, 153.00, 30.10, 10.71, true,
    'Batch 1 — traded together', 'closed', true, 'INDmoney screenshot', 'Gross P&L and ₹40.81 total charges confirmed from screenshot.', v_user)
  returning id into v_trade;
  insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount, allocation_percent, net_pnl_share, allocation_method)
  values (v_workspace,v_trade,v_roshan,0.00,59.813846,67.11,'current-balance'),(v_workspace,v_trade,v_mathan,0.00,40.186154,45.08,'current-balance');

  insert into public.trades(workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status, affects_current_balance, source_label, source_note, created_by)
  values (v_workspace, '2026-10-19', 'Union Bank of India', 'UNIONBANK', 85, 15094.30, 15061.15, -33.15, 30.15, 10.71, true,
    'Batch 1 — traded together', 'closed', true, 'INDmoney screenshot', 'Gross P&L and ₹40.86 total charges confirmed from screenshot.', v_user)
  returning id into v_trade;
  insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount, allocation_percent, net_pnl_share, allocation_method)
  values (v_workspace,v_trade,v_roshan,0.00,59.813846,-44.27,'current-balance'),(v_workspace,v_trade,v_mathan,0.00,40.186154,-29.74,'current-balance');

  insert into public.trades(workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status, affects_current_balance, source_label, source_note, created_by)
  values (v_workspace, '2026-10-19', 'Tata Consultancy Services', 'TCS', 10, 24939.00, 24600.00, -339.00, null, null, false,
    'Batch 1 — traded together', 'needs_review', true, 'INDmoney screenshot', 'Gross P&L confirmed. User said the charges were checked, but the exact rupee amount was not present in the chat transcript used for migration. Enter the verified brokerage and other charges once to finalize the P&L.', v_user)
  returning id into v_trade;
  insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount, allocation_percent, net_pnl_share, allocation_method)
  values (v_workspace,v_trade,v_roshan,0.00,59.813846,null,'current-balance'),(v_workspace,v_trade,v_mathan,0.00,40.186154,null,'current-balance');

  insert into public.trades(workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status, affects_current_balance, source_label, source_note, created_by)
  values (v_workspace, '2026-10-19', 'Union Bank of India', 'UNIONBANK', 285, 51280.30, 51093.15, -187.15, 70.15, 89.63, true,
    'Batch 2 — after first batch', 'closed', true, 'INDmoney screenshot', 'Auto-squared off at 3:10 PM. Gross loss ₹187.15; charges ₹159.78 confirmed from screenshot.', v_user)
  returning id into v_trade;
  insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount, allocation_percent, net_pnl_share, allocation_method)
  values (v_workspace,v_trade,v_roshan,0.00,59.813846,-207.51,'current-balance'),(v_workspace,v_trade,v_mathan,0.00,40.186154,-139.42,'current-balance');

  return v_workspace;
end;
$$;

create or replace function public.create_workspace_invite(target_workspace_id uuid)
returns text
language plpgsql security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare v_token text; begin
  if auth.uid() is null or not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only the workspace owner can create an invite.';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.workspace_invites(workspace_id, token_hash, created_by, expires_at)
  values (target_workspace_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days');
  return v_token;
end;
$$;

create or replace function public.accept_workspace_invite(invite_token text)
returns uuid
language plpgsql security definer
set search_path = public, extensions, auth, pg_temp
as $$
declare v_user uuid := auth.uid(); v_workspace uuid; v_invite uuid; begin
  if v_user is null then raise exception 'Sign in before accepting an invite.'; end if;
  select wi.id, wi.workspace_id into v_invite, v_workspace
    from public.workspace_invites wi
    where wi.token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
      and wi.accepted_at is null and wi.expires_at > now()
    limit 1 for update;
  if v_workspace is null then raise exception 'Invite code is invalid, expired, or already used.'; end if;
  if exists (select 1 from public.workspace_members wm where wm.workspace_id = v_workspace and wm.user_id = v_user) then
    raise exception 'You are already a member of this workspace.';
  end if;
  insert into public.workspace_members(workspace_id, user_id, role) values (v_workspace, v_user, 'member');
  update public.workspace_invites set accepted_at = now(), accepted_by = v_user where id = v_invite;
  return v_workspace;
end;
$$;

create or replace function public.update_trade_charges(
  target_trade_id uuid,
  target_brokerage numeric,
  target_other_charges numeric
)
returns void
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_workspace uuid; v_gross numeric; v_net numeric; v_total_pct numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if target_brokerage < 0 or target_other_charges < 0 then raise exception 'Charges must be zero or greater.'; end if;
  select workspace_id, gross_pnl into v_workspace, v_gross from public.trades where id = target_trade_id;
  if v_workspace is null or not public.is_workspace_member(v_workspace) then raise exception 'Trade not found or access denied.'; end if;
  v_net := v_gross - target_brokerage - target_other_charges;
  update public.trades set brokerage = target_brokerage, other_charges = target_other_charges,
    charges_confirmed = true, trade_status = 'closed', updated_at = now() where id = target_trade_id;
  select sum(allocation_percent) into v_total_pct from public.trade_allocations where trade_id = target_trade_id;
  if abs(coalesce(v_total_pct,0) - 100) > 0.001 then raise exception 'Trade allocations do not total 100 percent.'; end if;
  update public.trade_allocations set net_pnl_share = round(v_net * allocation_percent / v_total_pct, 2)
    where trade_id = target_trade_id;
  -- Correct a potential one-cent rounding drift by assigning it to the second partner row.
  with s as (select sum(net_pnl_share) as total_share from public.trade_allocations where trade_id = target_trade_id),
       last_row as (select id from public.trade_allocations where trade_id = target_trade_id order by created_at desc, id desc limit 1)
  update public.trade_allocations ta set net_pnl_share = ta.net_pnl_share + (v_net - s.total_share)
    from s, last_row where ta.id = last_row.id and v_net <> s.total_share;
end;
$$;

-- Restrict sensitive RPCs to authenticated users. Never expose a service-role key in the frontend.
revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_owner(uuid) from public;
revoke all on function public.initialize_shared_workspace() from public;
revoke all on function public.create_workspace_invite(uuid) from public;
revoke all on function public.accept_workspace_invite(text) from public;
revoke all on function public.update_trade_charges(uuid,numeric,numeric) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.initialize_shared_workspace() to authenticated;
grant execute on function public.create_workspace_invite(uuid) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.update_trade_charges(uuid,numeric,numeric) to authenticated;

-- Explicitly remove direct table access from unsigned users and the PUBLIC role.
revoke all on public.workspaces, public.workspace_members, public.partners, public.capital_movements,
  public.trades, public.trade_allocations, public.workspace_invites from anon, public;
revoke all on public.workspace_invites from authenticated;

-- Minimal direct grants. Trade/allocations are read-only through the client; writes go through validated RPCs.
grant usage on schema public to authenticated;
grant select on public.workspaces, public.workspace_members, public.partners, public.capital_movements,
  public.trades, public.trade_allocations to authenticated;
grant insert on public.capital_movements to authenticated;

create or replace function public.create_shared_trade(
  target_workspace_id uuid,
  trade_data jsonb,
  allocations jsonb
)
returns uuid
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_trade uuid; v_item jsonb; v_partner uuid; v_pct numeric; v_net numeric; v_pct_sum numeric; v_share_sum numeric; v_expected_net numeric;
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace access denied.';
  end if;
  if coalesce(trade_data->>'stock_name','') = '' then raise exception 'Stock name is required.'; end if;
  if jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations) < 2 then
    raise exception 'At least two partner allocations are required.';
  end if;
  select sum((x->>'allocation_percent')::numeric) into v_pct_sum from jsonb_array_elements(allocations) x;
  if v_pct_sum is null or abs(v_pct_sum - 100) > 0.001 then
    raise exception 'Partner allocation percentages must total 100%%.';
  end if;
  if coalesce((trade_data->>'charges_confirmed')::boolean,false) then
    v_expected_net := (trade_data->>'gross_pnl')::numeric
      - coalesce(nullif(trade_data->>'brokerage','')::numeric,0)
      - coalesce(nullif(trade_data->>'other_charges','')::numeric,0);
    select sum((x->>'net_pnl_share')::numeric) into v_share_sum from jsonb_array_elements(allocations) x;
    if v_share_sum is null or abs(v_share_sum - v_expected_net) > 0.03 then
      raise exception 'Allocated net P&L must reconcile to the trade net P&L.';
    end if;
  end if;
  insert into public.trades(
    workspace_id, trade_date, stock_name, symbol, quantity, buy_value, sell_value, gross_pnl,
    brokerage, other_charges, charges_confirmed, batch_label, trade_status,
    affects_current_balance, source_label, source_note, created_by
  ) values (
    target_workspace_id,
    (trade_data->>'trade_date')::date,
    trade_data->>'stock_name',
    coalesce(trade_data->>'symbol',''),
    coalesce((trade_data->>'quantity')::numeric,0),
    coalesce((trade_data->>'buy_value')::numeric,0),
    coalesce((trade_data->>'sell_value')::numeric,0),
    (trade_data->>'gross_pnl')::numeric,
    nullif(trade_data->>'brokerage','')::numeric,
    nullif(trade_data->>'other_charges','')::numeric,
    coalesce((trade_data->>'charges_confirmed')::boolean,false),
    coalesce(trade_data->>'batch_label','Single trade'),
    coalesce(trade_data->>'trade_status','closed'),
    coalesce((trade_data->>'affects_current_balance')::boolean,true),
    coalesce(trade_data->>'source_label','manual entry'),
    coalesce(trade_data->>'source_note',''),
    auth.uid()
  ) returning id into v_trade;

  for v_item in select * from jsonb_array_elements(allocations) loop
    v_partner := (v_item->>'partner_id')::uuid;
    v_pct := (v_item->>'allocation_percent')::numeric;
    if not exists (select 1 from public.partners p where p.id = v_partner and p.workspace_id = target_workspace_id) then
      raise exception 'Invalid partner allocation.';
    end if;
    v_net := nullif(v_item->>'net_pnl_share','')::numeric;
    insert into public.trade_allocations(workspace_id, trade_id, partner_id, contribution_amount,
      allocation_percent, net_pnl_share, allocation_method)
    values (target_workspace_id, v_trade, v_partner,
      coalesce(nullif(v_item->>'contribution_amount','')::numeric,0), v_pct, v_net,
      coalesce(v_item->>'allocation_method','current-balance'));
  end loop;
  return v_trade;
end;
$$;
revoke all on function public.create_shared_trade(uuid,jsonb,jsonb) from public;
grant execute on function public.create_shared_trade(uuid,jsonb,jsonb) to authenticated;
