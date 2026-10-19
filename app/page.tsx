'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import {
  Activity, Banknote, CircleAlert, Download, LogOut, Plus, RefreshCw, ShieldCheck, TrendingUp, Users, Wallet,
} from 'lucide-react';

type User = { id: string; email?: string };
type Partner = { id: string; name: string; sort_order: number };
type Workspace = { id: string; name: string; role: string };
type Trade = {
  id: string; trade_date: string; stock_name: string; symbol: string; quantity: number;
  buy_value: number; sell_value: number; gross_pnl: number; brokerage: number | null;
  other_charges: number | null; charges_confirmed: boolean; batch_label: string;
  trade_status: string; affects_current_balance: boolean; source_label: string; source_note: string;
};
type Allocation = { id: string; trade_id: string; partner_id: string; contribution_amount: number; allocation_percent: number; net_pnl_share: number | null; allocation_method: string };
type Movement = { id: string; partner_id: string; amount: number; movement_type: string; movement_date: string | null; note: string };

const money = (n: number | null | undefined) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0));
const nval = (s: string) => Number(s.trim() || 0);
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const csvCell = (v: unknown) => `"${String(v ?? '').replaceAll('"','""')}"`;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'signin'|'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [createdInvite, setCreatedInvite] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [tab, setTab] = useState<'dashboard'|'trades'|'capital'>('dashboard');

  const [tradeDate, setTradeDate] = useState(todayLocal());
  const [stockName, setStockName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyValue, setBuyValue] = useState('');
  const [sellValue, setSellValue] = useState('');
  const [brokerage, setBrokerage] = useState('');
  const [otherCharges, setOtherCharges] = useState('');
  const [chargesConfirmed, setChargesConfirmed] = useState(true);
  const [batchLabel, setBatchLabel] = useState('Single trade');
  const [splitMethod, setSplitMethod] = useState<'current-balance'|'contribution'>('current-balance');
  const [roshanContribution, setRoshanContribution] = useState('0');
  const [mathanContribution, setMathanContribution] = useState('0');
  const [movementPartner, setMovementPartner] = useState('');
  const [movementType, setMovementType] = useState<'deposit'|'withdrawal'|'correction'>('deposit');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');

  const refreshWorkspace = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase
      .from('workspace_members').select('workspace_id, role').eq('user_id', userId).limit(1).maybeSingle();
    if (queryError) throw queryError;
    if (!data) { setWorkspace(null); return; }
    const { data: w, error: wError } = await supabase.from('workspaces').select('id,name').eq('id', data.workspace_id).single();
    if (wError) throw wError;
    setWorkspace({ id: w.id, name: w.name, role: data.role });
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase || !workspace) return;
    setBusy(true); setError('');
    try {
      const [pRes, tRes, aRes, mRes] = await Promise.all([
        supabase.from('partners').select('id,name,sort_order').eq('workspace_id', workspace.id).order('sort_order'),
        supabase.from('trades').select('id,trade_date,stock_name,symbol,quantity,buy_value,sell_value,gross_pnl,brokerage,other_charges,charges_confirmed,batch_label,trade_status,affects_current_balance,source_label,source_note').eq('workspace_id', workspace.id).order('trade_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('trade_allocations').select('id,trade_id,partner_id,contribution_amount,allocation_percent,net_pnl_share,allocation_method').eq('workspace_id', workspace.id),
        supabase.from('capital_movements').select('id,partner_id,amount,movement_type,movement_date,note').eq('workspace_id', workspace.id),
      ]);
      if (pRes.error) throw pRes.error;
      if (tRes.error) throw tRes.error;
      if (aRes.error) throw aRes.error;
      if (mRes.error) throw mRes.error;
      setPartners((pRes.data ?? []) as Partner[]);
      setTrades((tRes.data ?? []) as Trade[]);
      setAllocations((aRes.data ?? []) as Allocation[]);
      setMovements((mRes.data ?? []) as Movement[]);
      if (!movementPartner && pRes.data?.length) setMovementPartner(pRes.data[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load workspace data.'); }
    finally { setBusy(false); }
  }, [workspace, movementPartner]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const current = data.session?.user ?? null;
      setUser(current ? { id: current.id, email: current.email } : null);
      if (current) {
        try { await refreshWorkspace(current.id); } catch (e) { setError(e instanceof Error ? e.message : 'Could not check workspace membership.'); }
      }
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user ?? null;
      setUser(current ? { id: current.id, email: current.email } : null);
      if (!current) { setWorkspace(null); setPartners([]); setTrades([]); setAllocations([]); setMovements([]); }
      else { void refreshWorkspace(current.id).catch((e) => setError(e instanceof Error ? e.message : 'Could not load membership.')); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [refreshWorkspace]);

  useEffect(() => { if (workspace) void loadData(); }, [workspace, loadData]);

  const pnlByTrade = useMemo(() => {
    const result = new Map<string, number | null>();
    for (const t of trades) result.set(t.id, t.charges_confirmed ? Number(t.gross_pnl) - Number(t.brokerage ?? 0) - Number(t.other_charges ?? 0) : null);
    return result;
  }, [trades]);

  const balances = useMemo(() => partners.map(p => {
    const movementsTotal = movements.filter(m => m.partner_id === p.id).reduce((sum, m) => sum + Number(m.amount), 0);
    const currentTrades = new Set(trades.filter(t => t.affects_current_balance).map(t => t.id));
    const tradesTotal = allocations.filter(a => a.partner_id === p.id && currentTrades.has(a.trade_id) && a.net_pnl_share !== null)
      .reduce((sum, a) => sum + Number(a.net_pnl_share), 0);
    return { ...p, balance: movementsTotal + tradesTotal, movementTotal: movementsTotal, tradesTotal };
  }), [partners, movements, allocations, trades]);

  const today = todayLocal();
  const todaysTrades = trades.filter(t => t.trade_date === today && t.affects_current_balance);
  const todaysPnl = todaysTrades.reduce((sum, t) => sum + (pnlByTrade.get(t.id) ?? 0), 0);
  const allTimeNet = trades.reduce((sum, t) => sum + (pnlByTrade.get(t.id) ?? 0), 0);
  const pendingCount = trades.filter(t => !t.charges_confirmed).length;
  const totalCharges = trades.filter(t => t.charges_confirmed).reduce((sum,t)=>sum+Number(t.brokerage ?? 0)+Number(t.other_charges ?? 0),0);
  const grossAllTime = trades.reduce((sum,t)=>sum+Number(t.gross_pnl),0);

  async function handleAuth(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      if (authMode === 'signup') {
        const { data, error: e1 } = await supabase.auth.signUp({ email: email.trim(), password });
        if (e1) throw e1;
        if (!data.session) setNotice('Account created. Check your email to confirm it, then return here to sign in.');
        else setNotice('Account created. You can now initialize a workspace or accept an invite.');
      } else {
        const { error: e1 } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e1) throw e1;
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  }

  async function initializeWorkspace() {
    if (!supabase) return; setError(''); setNotice(''); setBusy(true);
    try {
      const { data, error: e1 } = await supabase.rpc('initialize_shared_workspace');
      if (e1) throw e1;
      if (user) await refreshWorkspace(user.id);
      setNotice('Workspace created and historical records imported. Review the TCS charges flag before relying on final balances.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Workspace setup failed.'); }
    finally { setBusy(false); }
  }

  async function createInvite() {
    if (!supabase || !workspace) return; setError(''); setNotice(''); setBusy(true);
    try {
      const { data, error: e1 } = await supabase.rpc('create_workspace_invite', { target_workspace_id: workspace.id });
      if (e1) throw e1;
      setCreatedInvite(String(data));
      setNotice('Invite created. Share this one-time code privately with Mathan. It expires in 7 days.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create invite.'); }
    finally { setBusy(false); }
  }

  async function acceptInvite(e: FormEvent) {
    e.preventDefault(); if (!supabase || !user) return; setError(''); setNotice(''); setBusy(true);
    try {
      const { error: e1 } = await supabase.rpc('accept_workspace_invite', { invite_token: inviteToken.trim() });
      if (e1) throw e1;
      await refreshWorkspace(user.id); setInviteToken(''); setNotice('Invite accepted. You are now connected to the shared workspace.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Invite could not be accepted.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase) return; await supabase.auth.signOut(); setWorkspace(null); setUser(null); setNotice('Signed out.');
  }

  async function saveTrade(e: FormEvent) {
    e.preventDefault(); if (!supabase || !workspace || !user) return;
    setError(''); setNotice('');
    if (partners.length !== 2) { setError('This tracker expects two partners. Check the workspace setup.'); return; }
    const buy = nval(buyValue), sell = nval(sellValue), gross = Math.round((sell - buy) * 100) / 100;
    const broker = nval(brokerage), other = nval(otherCharges), totalCharges = broker + other;
    const rPartner = partners.find(p => p.name.toLowerCase() === 'roshan') ?? partners[0];
    const mPartner = partners.find(p => p.name.toLowerCase() === 'mathan') ?? partners[1];
    let rPct = 0, mPct = 0;
    let rContribution = nval(roshanContribution), mContribution = nval(mathanContribution);
    if (splitMethod === 'contribution') {
      const total = rContribution + mContribution;
      if (total <= 0) { setError('Enter a positive contribution for at least one person.'); return; }
      rPct = rContribution / total * 100; mPct = 100 - rPct;
    } else {
      const rBal = balances.find(b => b.id === rPartner.id)?.balance ?? 0;
      const mBal = balances.find(b => b.id === mPartner.id)?.balance ?? 0;
      if (rBal + mBal <= 0) { setError('Combined current ownership balance is zero. Use contribution-based split.'); return; }
      rPct = rBal / (rBal + mBal) * 100; mPct = 100 - rPct;
      rContribution = 0; mContribution = 0;
    }
    const net: number | null = chargesConfirmed ? Math.round((gross - totalCharges) * 100) / 100 : null;
    let rShare: number | null = null, mShare: number | null = null;
    if (net !== null) { rShare = Math.round(net * rPct) / 100; mShare = Math.round((net - rShare) * 100) / 100; }
    setBusy(true);
    try {
      const payload = {
        trade_date: tradeDate, stock_name: stockName.trim(), symbol: symbol.trim().toUpperCase(), quantity: nval(quantity),
        buy_value: buy, sell_value: sell, gross_pnl: gross,
        brokerage: chargesConfirmed ? broker : null, other_charges: chargesConfirmed ? other : null,
        charges_confirmed: chargesConfirmed, batch_label: batchLabel.trim() || 'Single trade',
        trade_status: chargesConfirmed ? 'closed' : 'needs_review', affects_current_balance: true,
        source_label: 'manual entry', source_note: chargesConfirmed ? '' : 'Awaiting confirmed brokerage and government/other charges.',
      };
      const allocationPayload = [
        { partner_id: rPartner.id, contribution_amount: rContribution, allocation_percent: Number(rPct.toFixed(6)), net_pnl_share: rShare, allocation_method: splitMethod },
        { partner_id: mPartner.id, contribution_amount: mContribution, allocation_percent: Number(mPct.toFixed(6)), net_pnl_share: mShare, allocation_method: splitMethod },
      ];
      const { error: e1 } = await supabase.rpc('create_shared_trade', { target_workspace_id: workspace.id, trade_data: payload, allocations: allocationPayload });
      if (e1) throw e1;
      setStockName(''); setSymbol(''); setQuantity(''); setBuyValue(''); setSellValue(''); setBrokerage(''); setOtherCharges('');
      setRoshanContribution('0'); setMathanContribution('0'); setChargesConfirmed(true); setBatchLabel('Single trade');
      setNotice(`Trade saved. Gross P&L ${money(gross)}${net === null ? ' — charges pending, so final net P&L is not yet applied to balances.' : `; net P&L ${money(net)}.`}`);
      setTab('trades'); await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save trade.'); }
    finally { setBusy(false); }
  }

  async function reviewCharges(trade: Trade) {
    if (!supabase) return;
    const broker = window.prompt(`Enter VERIFIED brokerage for ${trade.stock_name} (₹):`, trade.brokerage == null ? '' : String(trade.brokerage));
    if (broker === null) return;
    const other = window.prompt(`Enter VERIFIED Govt. and other charges for ${trade.stock_name} (₹):`, trade.other_charges == null ? '' : String(trade.other_charges));
    if (other === null) return;
    const b = Number(broker), o = Number(other);
    if (!Number.isFinite(b) || !Number.isFinite(o) || b < 0 || o < 0 || broker.trim() === '' || other.trim() === '') {
      setError('Enter valid non-negative numbers for both charge fields.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: e1 } = await supabase.rpc('update_trade_charges', { target_trade_id: trade.id, target_brokerage: b, target_other_charges: o });
      if (e1) throw e1;
      setNotice(`${trade.stock_name} charges saved. Net P&L and both balances have been recalculated.`);
      await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update charges.'); }
    finally { setBusy(false); }
  }

  async function saveMovement(e: FormEvent) {
    e.preventDefault(); if (!supabase || !workspace || !user) return;
    const amountRaw = nval(movementAmount);
    if (!movementPartner || (movementType === 'correction' ? amountRaw === 0 : amountRaw <= 0)) { setError(movementType === 'correction' ? 'Select a partner and enter a non-zero correction amount.' : 'Select a partner and enter an amount greater than zero.'); return; }
    const amount = movementType === 'withdrawal' ? -Math.abs(amountRaw) : movementType === 'deposit' ? Math.abs(amountRaw) : amountRaw;
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: e1 } = await supabase.from('capital_movements').insert({
        workspace_id: workspace.id, partner_id: movementPartner, amount, movement_type: movementType,
        movement_date: todayLocal(), note: movementNote.trim(), created_by: user.id,
      });
      if (e1) throw e1;
      setMovementAmount(''); setMovementNote(''); setNotice('Capital movement saved and owner balance updated.'); await loadData();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save capital movement.'); }
    finally { setBusy(false); }
  }

  function exportJsonBackup() {
    const snapshot = {
      format: 'shared-intraday-desk-backup', version: 1, exported_at: new Date().toISOString(),
      workspace: { id: workspace?.id, name: workspace?.name },
      partners, capital_movements: movements, trades, trade_allocations: allocations,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `intraday-full-backup-${todayLocal()}.json`; a.click(); URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const header = ['Date','Stock','Symbol','Qty','Buy Value','Sell Value','Gross P&L','Brokerage','Other Charges','Charges Confirmed','Net P&L','Batch','Status','Roshan Share','Mathan Share','Source Note'];
    const rows = trades.map(t => {
      const allocs = allocations.filter(a => a.trade_id === t.id);
      const ownerShare = (name: string) => { const p = partners.find(x => x.name.toLowerCase() === name.toLowerCase()); const a = allocs.find(x => x.partner_id === p?.id); return a?.net_pnl_share ?? ''; };
      return [t.trade_date,t.stock_name,t.symbol,t.quantity,t.buy_value,t.sell_value,t.gross_pnl,t.brokerage ?? '',t.other_charges ?? '',t.charges_confirmed,pnlByTrade.get(t.id) ?? '',t.batch_label,t.trade_status,ownerShare('Roshan'),ownerShare('Mathan'),t.source_note];
    });
    const content = [header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([content], {type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href=url; a.download=`intraday-trades-${todayLocal()}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (!supabaseConfigured || !supabase) {
    return <main className="auth-wrap"><section className="card auth-card"><div className="brand-icon"><Activity size={24}/></div><div className="eyebrow">Cloud setup required</div><h2>Shared Intraday Desk</h2><p>Add your Supabase project URL and publishable key to <code>.env.local</code>, then deploy this app. See <b>README.md</b> for the secure setup steps.</p><div className="alert">Do not paste a service-role key into any variable starting with <code>NEXT_PUBLIC_</code>. The browser must use only the publishable key and rely on database Row Level Security.</div></section></main>;
  }

  if (loading) return <main className="auth-wrap"><div className="card">Loading your secure workspace…</div></main>;

  if (!user) return <main className="auth-wrap"><section className="card auth-card">
    <div className="brand"><div className="brand-icon"><Activity size={24}/></div><div><div className="eyebrow">Private shared workspace</div><div style={{fontFamily:'Manrope',fontWeight:800,fontSize:20}}>Shared Intraday Desk</div></div></div>
    <h2>{authMode === 'signin' ? 'Welcome back' : 'Create your account'}</h2><p>One shared ledger for Roshan and Mathan. Sign in with your own account; workspace access is enforced by the database.</p>
    <div className="tab-row"><button type="button" className={authMode==='signin'?'active':''} onClick={()=>{setAuthMode('signin');setError('');}}>Sign in</button><button type="button" className={authMode==='signup'?'active':''} onClick={()=>{setAuthMode('signup');setError('');}}>Create account</button></div>
    <form className="auth-form" onSubmit={handleAuth}><div className="field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></div><div className="field"><label>Password</label><input type="password" autoComplete={authMode==='signin'?'current-password':'new-password'} minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="At least 8 characters"/></div><button className="btn btn-primary" disabled={busy}>{busy?'Please wait…':authMode==='signin'?'Sign in securely':'Create account'}</button></form>
    {notice&&<div className="alert success-alert">{notice}</div>}{error&&<div className="alert">{error}</div>}
    <div className="footnote"><ShieldCheck size={14} style={{display:'inline',verticalAlign:'-3px',marginRight:5}}/>Only invited signed-in members can view shared trading records. This app tracks trades and never connects to INDmoney order placement.</div>
  </section></main>;

  if (!workspace) return <main className="auth-wrap"><section className="card auth-card"><div className="brand"><div className="brand-icon"><Users size={24}/></div><div><div className="eyebrow">Signed in as {user.email}</div><div style={{fontFamily:'Manrope',fontWeight:800,fontSize:20}}>Join your trading desk</div></div></div><p>Roshan should initialize the desk once to import the historical records. Then create a one-time invite code for Mathan. Mathan should sign in on his own device and accept that code.</p>
    {error&&<div className="alert">{error}</div>}{notice&&<div className="alert success-alert">{notice}</div>}
    <button className="btn btn-primary" style={{width:'100%',marginTop:10}} disabled={busy} onClick={initializeWorkspace}><Plus size={16}/>Initialize workspace & import history</button>
    <div className="divider"/><form onSubmit={acceptInvite}><div className="field"><label>Already have an invite code?</label><input value={inviteToken} onChange={e=>setInviteToken(e.target.value)} required placeholder="Paste private invitation code"/></div><button className="btn" style={{width:'100%',marginTop:10}} disabled={busy}>Accept invitation</button></form>
    <button className="btn btn-subtle" style={{width:'100%',marginTop:12}} onClick={signOut}><LogOut size={15}/> Sign out</button><p className="footnote">Initialization imports the four completed historical trades plus the four October 19 positions, opening-balance snapshots, and Mathan's recorded withdrawal. It is designed to run once for the owner account.</p></section></main>;

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-icon"><Activity size={24}/></div><div><div className="eyebrow">Private workspace · live shared data</div><h1>Roshan & Mathan <span style={{color:'#8298bd'}}> / </span> Intraday Desk</h1></div></div><div className="top-actions"><span className="pill"><span style={{color:'var(--green)'}}>●</span> Connected · {user.email}</span><button className="btn btn-subtle" onClick={()=>void loadData()} disabled={busy}><RefreshCw size={15}/> Refresh</button><button className="btn btn-subtle" onClick={signOut}><LogOut size={15}/> Sign out</button></div></header>
    {error&&<div className="alert">{error}</div>}{notice&&<div className="alert success-alert">{notice}</div>}
    {pendingCount>0&&<div className="alert"><b>{pendingCount} trade{pendingCount>1?'s':''} need charge confirmation.</b> Their gross P&L is recorded, but unconfirmed net P&L is not applied to the owner balances. Open Trade History and enter the exact fees from INDmoney.</div>}
    {createdInvite&&<div className="card section"><div className="section-head"><h2>Private invite code for Mathan</h2><button className="btn btn-subtle" onClick={()=>setCreatedInvite('')}>Hide</button></div><div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}><code style={{overflowWrap:'anywhere',background:'#0b1222',padding:'12px',borderRadius:9,flex:1}}>{createdInvite}</code><button className="btn btn-primary" onClick={()=>navigator.clipboard.writeText(createdInvite)}>Copy code</button></div><p className="footnote">Share this code privately only with Mathan. It is one-time use and expires in seven days.</p></div>}
    <div className="kpi-grid grid">
      <Kpi title="Shared tracked balance" value={money(balances.reduce((s,p)=>s+p.balance,0))} foot="Ownership ledger; not broker buying power" icon={<Wallet size={18}/>}/>
      <Kpi title="Today's net P&L" value={money(todaysPnl)} foot={`${todaysTrades.length} position(s) recorded today · excludes unresolved charges`} icon={<TrendingUp size={18}/>} positive={todaysPnl>=0}/>
      <Kpi title="All-time recorded net P&L" value={money(allTimeNet)} foot={`Gross ${money(grossAllTime)} · confirmed charges ${money(totalCharges)}`} icon={<Activity size={18}/>} positive={allTimeNet>=0}/>
      <Kpi title="Needs review" value={String(pendingCount)} foot="Trades with unconfirmed charges" icon={<CircleAlert size={18}/>} warning={pendingCount>0}/>
    </div>

    <nav className="tab-row" style={{maxWidth:540}}><button className={tab==='dashboard'?'active':''} onClick={()=>setTab('dashboard')}>Dashboard</button><button className={tab==='trades'?'active':''} onClick={()=>setTab('trades')}>Trade history</button><button className={tab==='capital'?'active':''} onClick={()=>setTab('capital')}>Capital movements</button></nav>

    {tab==='dashboard'&&<div className="grid two-col section">
      <section className="card"><div className="section-head"><div><div className="section-tag">Ownership ledger</div><h2>Balance by person</h2></div><span className="pill">2 partners</span></div>
        {balances.map((p,i)=><div className="owner-row" key={p.id}><div className="owner-info"><div className="avatar">{p.name.slice(0,1)}</div><div><div className="owner-name">{p.name}</div><div className="owner-sub">Opening / movements {money(p.movementTotal)} · trade P&L {money(p.tradesTotal)}</div></div></div><div className={`owner-bal ${p.balance>=0?'good':'bad'}`}>{money(p.balance)}</div></div>)}
        <div className="footnote">Balances start from the verified carry-forward snapshots, subtract Mathan's ₹340.13 withdrawal once, and add only confirmed post-baseline net P&L allocations. Historical trades are preserved for analysis but not applied to the balance twice.</div>
      </section>
      <section className="card"><div className="section-head"><div><div className="section-tag">Quick entry</div><h2>Add a closed trade</h2></div><span className="pill">Tracking only</span></div>
        <form onSubmit={saveTrade}><div className="form-grid">
          <Field label="Trade date"><input type="date" value={tradeDate} onChange={e=>setTradeDate(e.target.value)} required/></Field>
          <Field label="Stock / instrument"><input value={stockName} onChange={e=>setStockName(e.target.value)} required placeholder="e.g. TCS"/></Field>
          <Field label="Symbol (optional)"><input value={symbol} onChange={e=>setSymbol(e.target.value)} placeholder="e.g. TCS"/></Field>
          <Field label="Quantity"><input type="number" min="0" step="0.01" value={quantity} onChange={e=>setQuantity(e.target.value)} required/></Field>
          <Field label="Total buy value (₹)"><input type="number" min="0" step="0.01" value={buyValue} onChange={e=>setBuyValue(e.target.value)} required/></Field>
          <Field label="Total sell value (₹)"><input type="number" min="0" step="0.01" value={sellValue} onChange={e=>setSellValue(e.target.value)} required/></Field>
          <Field label="Brokerage (₹)"><input type="number" min="0" step="0.01" value={brokerage} onChange={e=>setBrokerage(e.target.value)} placeholder={chargesConfirmed?'0.00':'pending'} disabled={!chargesConfirmed} required={chargesConfirmed}/></Field>
          <Field label="Govt. & other charges (₹)"><input type="number" min="0" step="0.01" value={otherCharges} onChange={e=>setOtherCharges(e.target.value)} placeholder={chargesConfirmed?'0.00':'pending'} disabled={!chargesConfirmed} required={chargesConfirmed}/></Field>
          <Field label="Batch / sequence"><select value={batchLabel} onChange={e=>setBatchLabel(e.target.value)}><option>Single trade</option><option>Batch 1 — traded together</option><option>Batch 2 — after first batch</option><option>Other / custom batch</option></select></Field>
          <Field label="How should P&L be split?"><select value={splitMethod} onChange={e=>setSplitMethod(e.target.value as 'current-balance'|'contribution')}><option value="current-balance">Current ownership proportions</option><option value="contribution">This trade's actual contributions</option></select></Field>
          {splitMethod==='contribution'&&<><Field label="Roshan contributed (₹)"><input type="number" min="0" step="0.01" value={roshanContribution} onChange={e=>setRoshanContribution(e.target.value)} required/></Field><Field label="Mathan contributed (₹)"><input type="number" min="0" step="0.01" value={mathanContribution} onChange={e=>setMathanContribution(e.target.value)} required/></Field></>}
          <div className="field span-2"><label style={{display:'flex',alignItems:'center',gap:9}}><input type="checkbox" checked={chargesConfirmed} onChange={e=>setChargesConfirmed(e.target.checked)} style={{width:16,height:16}}/> Brokerage and other charges are verified from the broker statement</label></div>
        </div><div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}><Plus size={15}/> Save trade & split P&L</button><button type="button" className="btn btn-subtle" onClick={()=>setTab('trades')}>View all trades</button></div><div className="footnote">Gross P&L = sell value − buy value. Net P&L subtracts both charge fields. If charges are not verified, the trade stays flagged and doesn't change owner balances yet.</div></form>
      </section>
    </div>}

    {tab==='trades'&&<section className="card section"><div className="section-head"><div><div className="section-tag">Audit-friendly ledger</div><h2>All trades</h2><div className="subline">Historical and current records · no live broker connection</div></div><div className="small-actions"><button className="btn btn-subtle" onClick={exportCsv}><Download size={15}/> Export trades CSV</button><button className="btn" onClick={exportJsonBackup}><Download size={15}/> Full JSON backup</button></div></div>
      <div className="table-wrap"><table className="trade-table"><thead><tr><th>Date</th><th>Instrument / batch</th><th>Qty</th><th>Buy value</th><th>Sell value</th><th>Gross P&L</th><th>Charges</th><th>Net P&L</th><th>Status / action</th></tr></thead><tbody>
      {trades.map(t=>{const net=pnlByTrade.get(t.id); return <tr key={t.id}><td>{t.trade_date}</td><td><div className="stock">{t.stock_name}</div><div className="subline">{t.batch_label}</div></td><td>{t.quantity}</td><td>{money(t.buy_value)}</td><td>{money(t.sell_value)}</td><td className={Number(t.gross_pnl)>=0?'good':'bad'}>{money(t.gross_pnl)}</td><td>{t.charges_confirmed?money(Number(t.brokerage??0)+Number(t.other_charges??0)):'Pending'}</td><td className={net == null ? '' : net >= 0 ? 'good' : 'bad'}>{net == null ? 'Pending' : money(net)}</td><td>{t.charges_confirmed?<span className="status status-ok">Confirmed</span>:<div className="small-actions"><span className="status status-review">Needs review</span><button className="linklike" onClick={()=>void reviewCharges(t)}>Enter verified charges</button></div>}</td></tr>;})}
      {trades.length===0&&<tr><td colSpan={9} className="empty">No trade records yet.</td></tr>}
      </tbody></table></div><div className="footnote">The uploaded Excel tracker had four closed historical trades, one unfinished Gabriel India row, and an empty row. The history import keeps the four settled trades and records all four October 19 positions, including the two Union Bank positions as separate trades.</div>
    </section>}

    {tab==='capital'&&<div className="grid two-col section"><section className="card"><div className="section-head"><div><div className="section-tag">Deposits and withdrawals</div><h2>Record a capital movement</h2></div><Banknote size={20} color="var(--blue)"/></div>
      <form onSubmit={saveMovement}><div className="form-grid"><Field label="Owner"><select value={movementPartner} onChange={e=>setMovementPartner(e.target.value)} required>{partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Movement type"><select value={movementType} onChange={e=>setMovementType(e.target.value as 'deposit'|'withdrawal'|'correction')}><option value="deposit">Deposit / added capital</option><option value="withdrawal">Withdrawal</option><option value="correction">Correction (+ or −)</option></select></Field><Field label="Amount (₹)"><input type="number" min={movementType==='correction'?undefined:0.01} step="0.01" value={movementAmount} onChange={e=>setMovementAmount(e.target.value)} required/></Field><Field label="Note"><input value={movementNote} onChange={e=>setMovementNote(e.target.value)} placeholder="e.g. UPI withdrawal"/></Field></div><div className="form-actions"><button className="btn btn-primary" disabled={busy}>Save capital movement</button></div><div className="footnote">Deposits are positive; withdrawals are automatically recorded as negative. Capital movements never alter trade P&L.</div></form>
      </section><section className="card"><div className="section-head"><div><div className="section-tag">Movement history</div><h2>Recent adjustments</h2></div></div>{movements.slice().sort((a,b)=>(b.movement_date??'').localeCompare(a.movement_date??'')).map(m=>{const p=partners.find(x=>x.id===m.partner_id);return <div className="owner-row" key={m.id}><div><div className="owner-name">{p?.name??'Unknown'} · {m.movement_type.replaceAll('_',' ')}</div><div className="owner-sub">{m.movement_date??'Historical / date not provided'}{m.note?` · ${m.note}`:''}</div></div><div className={`owner-bal ${m.amount>=0?'good':'bad'}`}>{money(m.amount)}</div></div>})}</section></div>}

    <div className="section card"><div className="section-head"><h2>Sharing & security</h2>{workspace.role==='owner'&&<button className="btn btn-primary" onClick={createInvite} disabled={busy}><Users size={15}/> Create Mathan invite</button>}</div><p className="muted small">Workspace role: <b>{workspace.role}</b>. Data access is protected by Supabase Auth and database Row Level Security. Only workspace members can query this trading desk. This tool does not store broker passwords, connect to INDmoney, or submit real orders.</p>{workspace.role!=='owner'&&<p className="footnote">Ask the workspace owner to create an invite for additional members. Capital movements and trades are shared, so agree together before editing records.</p>}</div>
    <footer className="page-footer"><span>Shared Intraday Desk · tracking and reconciliation only</span><span>{busy?'Saving / refreshing…':'Cloud database connected'} · {trades.length} trades stored</span></footer>
  </main>;
}

function Kpi({title,value,foot,icon,positive,warning}:{title:string;value:string;foot:string;icon:ReactNode;positive?:boolean;warning?:boolean}) {
  const valueClass = warning ? 'bad' : positive === undefined ? 'neutral' : positive ? 'good' : 'bad';
  return <section className="card"><div className="kpi"><div><div className="kpi-label">{title}</div><div className={`kpi-value ${valueClass}`}>{value}</div><div className="kpi-foot">{foot}</div></div><div className="metric-icon">{icon}</div></div></section>;
}
function Field({label,children}:{label:string;children:ReactNode}) { return <div className="field"><label>{label}</label>{children}</div>; }
