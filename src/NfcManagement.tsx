import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Activity, AlertTriangle, ArrowLeft, BadgeCheck, Ban, Blocks, Check, CircleHelp,
  CreditCard, Database, HardDrive, LockKeyhole, Plug, Radio, RotateCw, ScanLine, Shield,
  ShieldCheck, Smartphone, X,
} from 'lucide-react';
import { type Esp32BridgeState, type Esp32Card, Esp32SerialBridge } from './esp32Serial';

type Student = { id: string; student_no: string; full_name: string; coins: number; status: string };
type Card = {
  id: string;
  student_id: string;
  uid: string;
  status: 'active' | 'disabled' | 'lost';
  can_pay: boolean;
  can_access: boolean;
  can_read: boolean;
  can_write: boolean;
  chip_type: string;
  memory_capacity: number;
  memory_used: number;
  registered_at: string;
  last_seen_at: string | null;
  students?: Student | Student[] | null;
};
type Notice = { kind: 'success' | 'error' | 'info'; text: string };
const tabs = [
  ['Card Info', CreditCard], ['Memory Explorer', Blocks], ['Access Rights', ShieldCheck],
  ['Read / Write', HardDrive], ['Diagnostics', Activity], ['Card Recovery', RotateCw],
] as const;

export default function NfcManagement({ db, authenticated, readerState, readerDetail, connectReader, disconnectReader, scanCard, onBack }: {
  db: SupabaseClient | null;
  authenticated: boolean;
  readerState: Esp32BridgeState;
  readerDetail: string;
  connectReader: () => Promise<void>;
  disconnectReader: () => Promise<void>;
  scanCard: () => Promise<Esp32Card>;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<Card | null>(null);
  const [activeTab, setActiveTab] = useState('Card Info');
  const [scanning, setScanning] = useState(false);
  const [operationState, setOperationState] = useState('No card scanned');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);

  const student = useMemo(() => {
    if (!selected?.students) return null;
    return Array.isArray(selected.students) ? selected.students[0] || null : selected.students;
  }, [selected]);
  function tell(kind: Notice['kind'], text: string) {
    setNotice({ kind, text });
  }

  function rememberError(message: string) {
    setErrors((current) => [`${new Date().toLocaleTimeString()} · ${message}`, ...current].slice(0, 8));
    setOperationState('Communication error');
    tell('error', message);
  }

  async function authorizeTag(tag: Esp32Card) {
    setOperationState('Tag detected · checking authorization');
    if (!tag.uid) {
      rememberError('The reader did not provide a card UID. No card data was exposed.');
      return;
    }
    if (!db || !authenticated) {
      rememberError('A signed-in database connection is required before card access.');
      return;
    }
    const uid = tag.uid.replace(/[^0-9a-f]/gi, '').toUpperCase().match(/.{1,2}/g)?.join(':') || tag.uid.toUpperCase();
    const { data, error } = await db.from('nfc_cards').select('*, students(id, student_no, full_name, coins, status)').ilike('uid', uid).maybeSingle();
    if (error) {
      rememberError(`Card authorization lookup failed: ${error.message}`);
      return;
    }
    if (!data) {
      rememberError(`Card ${uid} is not registered. NDEF contents were not opened.`);
      return;
    }
    const card = data as Card;
    if (card.status !== 'active') {
      rememberError(`Card ${uid} is ${card.status}; access is blocked.`);
      return;
    }
    if (!card.can_read) {
      rememberError(`Card ${uid} does not have read permission. NDEF contents were not opened.`);
      return;
    }

    const timestamp = new Date().toISOString();
    const { error: updateError } = await db.from('nfc_cards').update({ last_seen_at: timestamp }).eq('id', card.id);
    const refreshed = { ...card, last_seen_at: updateError ? card.last_seen_at : timestamp };
    setSelected(refreshed);
    setOperationState('Tag detected · database authorized');
    if (updateError) tell('info', `Read authorized, but the last-seen timestamp was not saved: ${updateError.message}`);
    else tell('success', `Read authorized for ${studentName(refreshed)}. UID verified against the database.`);
  }

  async function beginScan() {
    if (scanning) {
      return;
    }
    if (!db || !authenticated) {
      tell('error', 'Connect and sign in to Supabase before scanning; card operations are disabled in preview mode.');
      return;
    }
    if (readerState !== 'connected') {
      tell('error', 'Connect the ESP32 over USB serial before scanning a card.');
      return;
    }
    setSelected(null);
    setScanning(true);
    setOperationState('Waiting for a card');
    tell('info', 'ESP32 scan started. Present a card to the reader.');
    try {
      await authorizeTag(await scanCard());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ESP32 scan failed.';
      rememberError(message);
    } finally {
      setScanning(false);
    }
  }

  async function blockSelectedCard() {
    if (!db || !authenticated || !selected) {
      tell('error', 'A signed-in database session and selected card are required.');
      return;
    }
    if (selected.status !== 'active') {
      tell('info', `This card is already ${selected.status}.`);
      return;
    }
    const { error } = await db.from('nfc_cards').update({ status: 'lost' }).eq('id', selected.id);
    if (error) {
      tell('error', `Could not block the card: ${error.message}`);
      return;
    }
    tell('success', 'Card marked lost in the database. It is now blocked from authorized operations.');
    setSelected({ ...selected, status: 'lost' });
  }

  async function refreshSelectedCard() {
    if (!db || !authenticated || !selected) return;
    const { data, error } = await db.from('nfc_cards').select('*, students(id, student_no, full_name, coins, status)').eq('id', selected.id).single();
    if (error) {
      tell('error', `Could not refresh the selected card: ${error.message}`);
      return;
    }
    setSelected(data as Card);
    tell('success', 'Selected card record refreshed from Supabase.');
  }

  const readerLabel = scanning ? 'Waiting for card' : readerState === 'connected' ? operationState : readerState === 'unsupported' ? 'Web Serial unavailable' : readerState === 'error' ? 'Reader connection error' : 'ESP32 disconnected';

  return <main className="nfc-console">
    <header className="nfc-console-header">
      <button className="nfc-back" onClick={onBack}><ArrowLeft size={17}/> CampusPay</button>
      <div className="nfc-header-meta">
        <span className="nfc-db-state"><Database size={15}/>{db && authenticated ? 'Database connected' : 'Database unavailable'}</span>
        {readerState === 'connected' ? <button className="nfc-outline-action" onClick={() => void disconnectReader()}>Disconnect reader</button> : <button className="nfc-outline-action" disabled={readerState === 'unsupported' || connecting} onClick={async () => { setConnecting(true); try { await connectReader(); } catch (error) { rememberError(error instanceof Error ? error.message : 'Could not connect ESP32.'); } finally { setConnecting(false); } }}><Plug size={15}/>{connecting ? 'Connecting…' : 'Connect ESP32'}</button>}
      </div>
    </header>
    <div className="nfc-console-content">
      <div className="nfc-title-row">
        <div><div className="nfc-kicker">CAMPUS OPERATIONS / NFC</div><h1>NFC Management</h1><p>Card administration, reader diagnostics, and verified UID operations.</p></div>
        <div className={`nfc-reader-indicator ${readerState !== 'connected' ? 'offline' : scanning ? 'scanning' : 'ready'}`}>
          <span className="nfc-indicator-dot"/><div><b>{readerLabel}</b><small>{readerDetail || (scanning ? 'Present a card to continue' : readerState === 'connected' ? 'ESP32 firmware handshake verified over USB serial' : 'Connect the ESP32 reader over USB serial')}</small></div><Radio size={20}/>
        </div>
      </div>

      <section className="nfc-scan-bar">
        <div className="nfc-scan-icon"><ScanLine size={22}/></div>
        <div className="nfc-scan-copy"><b>{scanning ? 'Waiting for an NFC card' : 'Reader scan'}</b><span>{scanning ? 'Present a card to the connected ESP32 reader.' : 'The scanned UID is checked against card status and read permission in Supabase.'}</span></div>
        <button className="nfc-scan-button" disabled={scanning || readerState !== 'connected'} onClick={() => void beginScan()}><span>{scanning ? <Activity size={16}/> : <ScanLine size={16}/>}</span>{scanning ? 'Waiting for card…' : 'Scan for card'}</button>
      </section>

      {notice && <div className={`nfc-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
        {notice.kind === 'success' ? <Check size={17}/> : notice.kind === 'error' ? <AlertTriangle size={17}/> : <CircleHelp size={17}/>}<span>{notice.text}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15}/></button>
      </div>}

      <section className="nfc-workspace">
        <div className="nfc-tabs" role="tablist" aria-label="NFC management tools">{tabs.map(([name, Icon]) => <button key={name} role="tab" aria-selected={activeTab === name} className={activeTab === name ? 'active' : ''} onClick={() => setActiveTab(name)}><Icon size={16}/><span>{name}</span></button>)}</div>
        <div className="nfc-tab-body">
          {activeTab === 'Card Info' && <div className="nfc-pane">
            <div className="nfc-pane-heading"><div><h2>Card information</h2><p>Details appear only after a physical tag is detected and authorized.</p></div><span className="nfc-state-tag">{selected ? 'Authorized record' : 'No card scanned'}</span></div>
            {selected ? <>
              <div className="nfc-card-info-grid">
                <Info label="Card UID" value={selected.uid} mono/><Info label="Card type · database profile" value={selected.chip_type}/>
                <Info label="Linked student" value={student?.full_name || 'No linked student'}/><Info label="Student number" value={student?.student_no || '—'}/>
                <Info label="Wallet balance · database" value={student ? `${Number(student.coins).toLocaleString()} coins` : 'Unavailable'}/><Info label="Card status" value={selected.status} tone={selected.status === 'active' ? 'good' : 'bad'}/>
                <Info label="Reader source" value="ESP32 USB serial"/><Info label="Last verified scan" value={selected.last_seen_at ? new Date(selected.last_seen_at).toLocaleString() : 'Not recorded'}/>
              </div>
            </> : <EmptyState text={db && authenticated ? 'Scan an authorized card to load its database record.' : 'Connect Supabase and sign in to view real card and wallet records.'}/ >}
          </div>}

          {activeTab === 'Memory Explorer' && <div className="nfc-pane">
            <div className="nfc-pane-heading"><div><h2>Memory explorer</h2><p>The connected reference firmware verifies profile writes; it does not return a card memory dump.</p></div><span className="nfc-state-tag">Live memory read unsupported</span></div>
            <div className="nfc-capability-note"><HardDrive size={18}/><div><b>Memory content is not displayed as a live read</b><p>Card capacity and used bytes below are database profile metadata, not hardware measurements. The reference firmware writes student profiles from Register Student and verifies them by reading back.</p></div></div>
            {selected && <div className="nfc-capacity"><div><span>Registered profile capacity</span><b>{selected.memory_capacity} bytes</b></div><div className="nfc-capacity-track"><span style={{ width: `${Math.min(100, selected.memory_capacity ? selected.memory_used / selected.memory_capacity * 100 : 0)}%` }}/></div><small>{selected.memory_used} bytes recorded as used in database metadata · not verified from card memory</small></div>}
            <EmptyState text="The connected firmware does not provide a memory-dump operation. No block or NDEF data is fabricated."/>
          </div>}

          {activeTab === 'Access Rights' && <div className="nfc-pane">
            <div className="nfc-pane-heading"><div><h2>Access rights</h2><p>Permissions are loaded from the registered card record.</p></div><span className={`nfc-state-tag ${selected?.can_read && selected.status === 'active' ? 'good' : ''}`}>{selected?.can_read && selected.status === 'active' ? 'Read authorized' : 'No active authorization'}</span></div>
            {selected ? <div className="nfc-rights-grid"><Right label="Card status" detail="Card must be active before any authorized operation." allowed={selected.status === 'active'}/><Right label="UID lookup" detail="ESP32 UID must match an active database card." allowed={selected.can_read}/><Right label="Wallet payments" detail="Payment authorization is enforced by the database RPC." allowed={selected.can_pay}/><Right label="Campus access" detail="Requires a separate compatible door controller." allowed={selected.can_access}/><Right label="Student profile write" detail="Available from Register Student after a scan and same-card verification." allowed={selected.can_write}/></div> : <EmptyState text="Scan and authorize a registered card to inspect its permissions."/>}
            <div className="nfc-capability-note"><Shield size={18}/><div><b>Arbitrary sector operations unavailable</b><p>Raw key management and arbitrary MIFARE block operations are not exposed in this dashboard. The reference firmware writes a fixed student profile format only.</p></div></div>
          </div>}

          {activeTab === 'Read / Write' && <div className="nfc-pane">
            <div className="nfc-pane-heading"><div><h2>Read / write</h2><p>Student profile writes are initiated from Register Student and require the same scanned UID.</p></div><span className="nfc-state-tag">Profile write supported</span></div>
            <div className="nfc-capability-note"><HardDrive size={18}/><div><b>Supported write format: CampusPay student profile v1</b><p>The ESP32 writes student ID, full name, and a coin snapshot to MIFARE Classic 1K data blocks, then reads back and verifies the payload. Other card types and arbitrary blocks are rejected.</p></div></div>
            <div className="nfc-hex-label">Raw memory block<input disabled value="Unsupported by reference firmware"/></div>
            <div className="nfc-write-warning"><LockKeyhole size={17}/><span><b>Card balance is not authoritative</b> A card can be cloned or altered. All wallet payments continue to use the current Supabase balance, not this card snapshot.</span></div>
            <button className="nfc-disabled-action" disabled title="Use Register Student to write the supported profile"><HardDrive size={16}/> Arbitrary block read / write unsupported</button>
          </div>}

          {activeTab === 'Diagnostics' && <div className="nfc-pane">
            <div className="nfc-pane-heading"><div><h2>Reader diagnostics</h2><p>Capability checks are local; the reader is only confirmed when a tag responds.</p></div><button className="nfc-outline-action" onClick={() => void beginScan()} disabled={scanning}><Activity size={15}/> Test with a real tag</button></div>
            <div className="nfc-diagnostic-list"><Diagnostic icon={<Radio size={17}/>} label="Web Serial API" value={Esp32SerialBridge.supported ? readerState : 'Unavailable in this browser'} good={Esp32SerialBridge.supported && readerState === 'connected'}/><Diagnostic icon={<Smartphone size={17}/>} label="Secure browser context" value={window.isSecureContext ? 'HTTPS / localhost' : 'Insecure context'} good={window.isSecureContext}/><Diagnostic icon={<Database size={17}/>} label="Supabase authorization" value={db && authenticated ? 'Signed-in session' : 'Not connected'} good={Boolean(db && authenticated)}/><Diagnostic icon={<Activity size={17}/>} label="Tag communication" value={operationState} good={operationState.includes('authorized')}/><Diagnostic icon={<CircleHelp size={17}/>} label="Device" value={`${navigator.platform || 'Unknown platform'} · ${navigator.userAgent.slice(0, 90)}`}/></div>
            <div className="nfc-capability-note"><BadgeCheck size={18}/><div><b>Communication tests require a physical tag</b><p>Browser API availability is not proof of a connected reader. The ESP32 must return the CampusPay serial handshake, and the tag must reply to its RFID module.</p></div></div>
          </div>}

          {activeTab === 'Card Recovery' && <div className="nfc-pane">
            <div className="nfc-pane-heading"><div><h2>Card recovery</h2><p>Only safe database actions are available through this browser integration.</p></div><span className="nfc-state-tag">No tag repair performed</span></div>
            <div className="nfc-recovery-card"><div className="nfc-recovery-icon"><AlertTriangle size={19}/></div><div><b>Session errors</b><p>{errors.length ? 'Recent reader and authorization errors:' : 'No reader or authorization errors captured in this session.'}</p>{errors.map((error) => <small key={error}>{error}</small>)}</div></div>
            {selected ? <div className="nfc-safe-recovery"><div><b>Selected card · {selected.uid}</b><span>{selected.status === 'active' ? 'Block access in the database if this card is lost or compromised.' : `This card is already marked ${selected.status}.`}</span></div><button disabled={!db || !authenticated || selected.status !== 'active'} onClick={() => void blockSelectedCard()}><Ban size={15}/> Mark card lost</button></div> : <EmptyState text="Scan and authorize a registered card before applying recovery actions."/>}
            <div className="nfc-write-warning"><LockKeyhole size={17}/><span><b>Physical recovery is unsupported</b> No key recovery, sector repair, tag reset, or clone operation is attempted. A replacement requires a separate card registration workflow.</span></div>
            <button className="nfc-outline-action" onClick={() => void refreshSelectedCard()} disabled={!db || !authenticated || !selected}><RotateCw size={15}/> Refresh selected card</button>
          </div>}
        </div>
      </section>
      <footer className="nfc-console-footer"><span><ShieldCheck size={14}/> Wallet balances remain authoritative in Supabase</span><span>Hardware features are enabled only when actually supported</span></footer>
    </div>
  </main>;
}

function Info({ label, value, mono = false, tone = '' }: { label: string; value: string; mono?: boolean; tone?: string }) {
  return <div className="nfc-info-cell"><span>{label}</span><b className={`${mono ? 'mono' : ''} ${tone}`}>{value}</b></div>;
}

function Right({ label, detail, allowed, unsupported = false }: { label: string; detail: string; allowed: boolean; unsupported?: boolean }) {
  return <div className="nfc-right-card"><span className={`nfc-right-icon ${allowed && !unsupported ? 'good' : ''}`}>{unsupported ? <CircleHelp size={16}/> : allowed ? <Check size={16}/> : <X size={16}/>}</span><div><b>{label}</b><p>{detail}</p></div><span className={`nfc-right-state ${allowed && !unsupported ? 'good' : ''}`}>{unsupported ? 'Unsupported' : allowed ? 'Allowed' : 'Blocked'}</span></div>;
}

function Diagnostic({ icon, label, value, good }: { icon: React.ReactNode; label: string; value: string; good?: boolean }) {
  return <div className="nfc-diagnostic-row"><span className="nfc-diagnostic-icon">{icon}</span><div><b>{label}</b><small>{value}</small></div><span className={`nfc-diagnostic-status ${good ? 'good' : ''}`}>{good ? 'READY' : 'CHECK'}</span></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="nfc-empty"><CreditCard size={20}/><span>{text}</span></div>;
}

function studentName(card: Card) {
  const linked = Array.isArray(card.students) ? card.students[0] : card.students;
  return linked?.full_name || 'Unassigned';
}

