import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, BadgeCheck, Camera, Check, CircleAlert, CreditCard, LoaderCircle, Plug, Radio, RotateCcw, Save, ScanLine, Settings, Unplug, Upload, Wifi, X } from 'lucide-react';
import type { Esp32BridgeState, Esp32Card, SerialStudentPayload } from './esp32Serial';
import type { ReaderMode } from './unifiedReader';

type StudentRecord = {
  id: string;
  student_no: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  academic_level: string;
  coins: number;
};
type ReservedCard = { id: string; uid: string; status: string };
type RegistrationResult = { student: StudentRecord; card: ReservedCard | null };
type FieldErrors = Partial<Record<'studentId' | 'fullName' | 'email' | 'phone' | 'department' | 'academicLevel' | 'coins' | 'photo', string>>;

type Props = {
  db: SupabaseClient | null;
  authenticated: boolean;
  readerState: Esp32BridgeState;
  readerDetail: string;
  readerMode?: ReaderMode;
  onToggleMode?: (mode: ReaderMode) => void;
  onOpenMqttSettings?: () => void;
  subscribeReader?: (cb: (msg: any) => void) => () => void;
  connectReader: () => Promise<void>;
  disconnectReader: () => Promise<void>;
  scanCard: () => Promise<Esp32Card>;
  writeStudent: (uid: string, student: SerialStudentPayload) => Promise<void>;
  onCancel: () => void;
  onRegistered: () => void;
  onRegisteredPreview?: (student: StudentRecord, card: ReservedCard | null) => void;
  initialCard?: Esp32Card | null;
};

const initialForm = { studentId: '', fullName: '', email: '', phone: '', department: '', academicLevel: '', coins: '0' };

function formatUid(raw: string) {
  return raw.replace(/[^0-9a-f]/gi, '').toUpperCase().match(/.{1,2}/g)?.join(':') || raw.toUpperCase();
}

export default function StudentRegistration({ db, authenticated, readerState, readerDetail, readerMode = 'mqtt', onToggleMode, onOpenMqttSettings, subscribeReader, connectReader, disconnectReader, scanCard, writeStudent, onCancel, onRegistered, onRegisteredPreview, initialCard }: Props) {
  const [form, setForm] = useState(initialForm);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [scannedCard, setScannedCard] = useState<Esp32Card | null>(
    initialCard ? { ...initialCard, uid: formatUid(initialCard.uid) } : null
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [cardWriteState, setCardWriteState] = useState<'not-needed' | 'pending' | 'writing' | 'active' | 'failed'>('not-needed');
  const [cardWriteError, setCardWriteError] = useState('');

  useEffect(() => {
    if (initialCard) {
      setScannedCard({ ...initialCard, uid: formatUid(initialCard.uid) });
    }
  }, [initialCard]);

  useEffect(() => {
    if (!subscribeReader) return;
    return subscribeReader((msg) => {
      if (msg.type === 'scan_result' && msg.ok && msg.uid) {
        setScannedCard({ uid: formatUid(msg.uid), cardType: msg.cardType || 'MIFARE Classic 1K' });
        setFormError('');
      }
    });
  }, [subscribeReader]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function update(field: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const errors: FieldErrors = {};
    const studentId = form.studentId.trim();
    const fullName = form.fullName.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const coinValue = Number(form.coins);
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,31}$/.test(studentId)) errors.studentId = 'Use 2–32 letters, numbers, dots, underscores, slashes, or hyphens.';
    if (fullName.length < 2 || fullName.length > 120) errors.fullName = 'Enter a name between 2 and 120 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email address.';
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 5 || phoneDigits.length > 15) errors.phone = 'Enter a valid phone number with 5–15 digits.';
    if (form.department.trim().length < 2 || form.department.trim().length > 100) errors.department = 'Enter a faculty or department.';
    if (!form.academicLevel) errors.academicLevel = 'Choose an academic level.';
    if (!/^\d+$/.test(form.coins) || !Number.isSafeInteger(coinValue) || coinValue < 0 || coinValue > 100000) errors.coins = 'Use a whole number from 0 to 100,000.';
    if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) errors.photo = 'Choose a JPG, PNG, or WebP image under 5 MB.';
    if (scannedCard && readerState !== 'connected') setFormError('Reconnect the ESP32 before registration so the scanned card can be written and activated.');
    else setFormError('');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0 && (!scannedCard || readerState === 'connected');
  }

  async function captureCard() {
    if (readerState !== 'connected') {
      setFormError('Connect and verify the ESP32 before scanning a card.');
      return;
    }
    setScanBusy(true);
    setFormError('');
    try {
      const card = await scanCard();
      if (!card.uid) throw new Error('ESP32 did not return a physical card UID.');
      setScannedCard({ uid: formatUid(card.uid), cardType: card.cardType || 'MIFARE Classic 1K' });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Card scan failed.');
    } finally {
      setScanBusy(false);
    }
  }

  async function writeReservedCard(registration: RegistrationResult | null = result) {
    if (!registration?.card || !registration.student || readerState !== 'connected') return;
    setCardWriteState('writing');
    setCardWriteError('');
    try {
      await writeStudent(registration.card.uid, {
        studentId: registration.student.student_no,
        fullName: registration.student.full_name,
        coins: registration.student.coins,
      });
      if (db && authenticated) {
        const { error } = await db.from('nfc_cards').update({ status: 'active' }).eq('id', registration.card.id);
        if (error) throw new Error(`Card data was written, but the database could not activate the card: ${error.message}`);
      }
      setCardWriteState('active');
      setResult({ ...registration, card: { ...registration.card, status: 'active' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ESP32 did not confirm the card write.';
      setCardWriteError(message);
      setCardWriteState('failed');
    }
  }

  async function registerStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setFormError('');
    let uploadedPath: string | null = null;
    try {
      if (db && authenticated) {
        if (scannedCard) {
          const rawUid = scannedCard.uid.replace(/[^0-9a-f]/gi, '').toUpperCase();
          const colonUid = rawUid.match(/.{1,2}/g)?.join(':') || rawUid;
          const { data: existing, error: lookupError } = await db
            .from('nfc_cards')
            .select('id')
            .or(`uid.ilike.${colonUid},uid.ilike.${rawUid}`)
            .maybeSingle();
          if (lookupError) throw new Error(`Could not verify card availability: ${lookupError.message}`);
          if (existing) throw new Error('This NFC card is already assigned. Scan an unassigned card.');
        }

        if (photo) {
          const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
          uploadedPath = `${crypto.randomUUID()}.${extension}`;
          const { error } = await db.storage.from('student-photos').upload(uploadedPath, photo, { contentType: photo.type, upsert: false });
          if (error) throw new Error(`Profile photo upload failed: ${error.message}`);
        }

        const { data, error } = await db.rpc('register_student', {
          p_student_no: form.studentId.trim(),
          p_full_name: form.fullName.trim(),
          p_email: form.email.trim().toLowerCase(),
          p_phone: form.phone.trim(),
          p_department: form.department.trim(),
          p_academic_level: form.academicLevel,
          p_starting_coins: Number(form.coins),
          p_photo_path: uploadedPath,
          p_card_uid: scannedCard?.uid || null,
          p_card_type: scannedCard?.cardType || null,
        });
        if (error) throw new Error(duplicateOrDatabaseError(error));
        const registered = data as RegistrationResult;
        setResult(registered);
        onRegistered();
        if (registered.card) {
          setCardWriteState('pending');
          setBusy(false);
          await writeReservedCard(registered);
        } else {
          setCardWriteState('not-needed');
        }
      } else {
        // Preview / offline mode registration
        const previewStudent: StudentRecord = {
          id: crypto.randomUUID(),
          student_no: form.studentId.trim(),
          full_name: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          department: form.department.trim(),
          academic_level: form.academicLevel,
          coins: Number(form.coins),
        };
        const previewCard: ReservedCard | null = scannedCard
          ? { id: crypto.randomUUID(), uid: scannedCard.uid, status: 'active' }
          : null;
        const registered: RegistrationResult = {
          student: previewStudent,
          card: previewCard,
        };
        setResult(registered);
        onRegisteredPreview?.(previewStudent, previewCard);
        onRegistered();
        if (registered.card && readerState === 'connected') {
          setCardWriteState('pending');
          setBusy(false);
          await writeReservedCard(registered);
        } else {
          setCardWriteState('not-needed');
        }
      }
    } catch (error) {
      if (uploadedPath && db) await db.storage.from('student-photos').remove([uploadedPath]);
      setFormError(error instanceof Error ? error.message : 'Student registration failed.');
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setForm(initialForm);
    setPhoto(null);
    setScannedCard(null);
    setFieldErrors({});
    setFormError('');
  }

  const readerConnected = readerState === 'connected';
  const canUseReader = readerMode === 'mqtt' ? true : readerState !== 'unsupported';

  if (result) return <div className="registration-shell">
    <div className="registration-topbar"><button type="button" className="registration-back" onClick={onCancel}><ArrowLeft size={16}/> Back to student directory</button><span className="registration-db"><BadgeCheck size={15}/> {authenticated ? 'Supabase connected' : 'Preview mode'}</span></div>
    <section className="registration-confirmation">
      <div className="registration-confirm-icon"><Check size={24}/></div>
      <div className="registration-eyebrow">STUDENT REGISTRATION</div>
      <h1>{cardWriteState === 'active' || cardWriteState === 'not-needed' ? 'Student registered' : 'Student saved'}</h1>
      <p className="registration-lede">The profile and wallet are saved in CampusPay.</p>
      <div className="registration-summary">
        <Summary label="Student" value={result.student.full_name}/><Summary label="Student ID" value={result.student.student_no}/>
        <Summary label="Email" value={result.student.email}/><Summary label="Phone" value={result.student.phone}/>
        <Summary label="Faculty / department" value={result.student.department}/><Summary label="Academic level" value={result.student.academic_level}/>
        <Summary label="Wallet balance" value={`${Number(result.student.coins).toLocaleString()} coins`}/>
        {result.card && <Summary label="Assigned card UID" value={result.card.uid}/>}
      </div>
      {result.card && <div className={`registration-write-result ${cardWriteState === 'active' ? 'success' : 'warning'}`}>
        {cardWriteState === 'active' ? <Check size={17}/> : cardWriteState === 'writing' ? <LoaderCircle className="registration-spin" size={17}/> : <CircleAlert size={17}/>}
        <div><b>{cardWriteState === 'active' ? 'Card written and activated' : cardWriteState === 'writing' ? 'Present the scanned card to the ESP32' : 'Card assignment pending'}</b><span>{cardWriteError || (cardWriteState === 'active' ? 'ESP32 confirmed the UID and the database activated the card.' : cardWriteState === 'writing' ? `Present ${result.card.uid} now. The reader verifies the UID before writing.` : 'This card remains disabled until the ESP32 confirms the write.')}</span></div>
      </div>}
      <div className="registration-confirm-actions">
        {result.card && cardWriteState !== 'active' && <button className="registration-primary" onClick={() => void writeReservedCard()} disabled={!readerConnected || cardWriteState === 'writing'}><CreditCard size={16}/> Retry card write</button>}
        <button className="registration-secondary" onClick={onCancel}>Done</button>
      </div>
    </section>
  </div>;

  return <div className="registration-shell">
    <div className="registration-topbar"><button type="button" className="registration-back" onClick={onCancel}><ArrowLeft size={16}/> Back to student directory</button><span className="registration-db"><BadgeCheck size={15}/>{authenticated ? 'Database ready' : 'Preview mode'}</span></div>
    <div className="registration-content">
      <div className="registration-heading"><div><div className="registration-eyebrow">CAMPUS OPERATIONS / STUDENTS</div><h1>Register student</h1><p>Create a student profile, initialize their wallet, and optionally assign an NFC card.</p></div>
        <div className={`registration-reader-status ${readerConnected ? 'connected' : readerState === 'error' ? 'error' : ''}`}><span/><div><b>{readerLabel(readerState)}</b><small>{readerDetail || readerCopy(readerState)}</small></div></div>
      </div>

      <form className="registration-layout" onSubmit={registerStudent} noValidate>
        <div className="registration-main-column">
          <section className="registration-panel">
            <div className="registration-panel-heading"><div><h2>Student profile</h2><p>Enter the student's institutional and contact details.</p></div><span className="registration-required">Required fields marked *</span></div>
            <div className="registration-fields">
              <Field label="Student ID" required error={fieldErrors.studentId}><input autoComplete="off" maxLength={32} value={form.studentId} onChange={(event) => update('studentId', event.target.value)} placeholder="e.g. STU-2026-005" aria-invalid={Boolean(fieldErrors.studentId)}/></Field>
              <Field label="Full name" required error={fieldErrors.fullName}><input autoComplete="name" maxLength={120} value={form.fullName} onChange={(event) => update('fullName', event.target.value)} placeholder="Student's full name" aria-invalid={Boolean(fieldErrors.fullName)}/></Field>
              <Field label="Email address" required error={fieldErrors.email}><input type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="student@campus.edu" aria-invalid={Boolean(fieldErrors.email)}/></Field>
              <Field label="Phone number" required error={fieldErrors.phone}><input type="tel" autoComplete="tel" maxLength={32} value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+216 00 000 000" aria-invalid={Boolean(fieldErrors.phone)}/></Field>
              <Field label="Faculty / department" required error={fieldErrors.department}><input maxLength={100} value={form.department} onChange={(event) => update('department', event.target.value)} placeholder="e.g. Faculty of Engineering" aria-invalid={Boolean(fieldErrors.department)}/></Field>
              <Field label="Academic level" required error={fieldErrors.academicLevel}><select value={form.academicLevel} onChange={(event) => update('academicLevel', event.target.value)} aria-invalid={Boolean(fieldErrors.academicLevel)}><option value="">Choose academic level</option><option>Preparatory</option><option>Undergraduate · Year 1</option><option>Undergraduate · Year 2</option><option>Undergraduate · Year 3</option><option>Undergraduate · Year 4</option><option>Undergraduate · Year 5</option><option>Master's</option><option>Doctorate</option><option>Other</option></select></Field>
            </div>
            <div className="registration-photo-row"><div className="registration-photo-preview">{photoPreview ? <img src={photoPreview} alt="Selected student profile"/> : <Camera size={22}/>}</div><div className="registration-photo-copy"><b>Profile photo <span>Optional</span></b><small>JPG, PNG, or WebP · up to 5 MB</small>{fieldErrors.photo && <small className="registration-field-error">{fieldErrors.photo}</small>}</div><label className="registration-upload"><Upload size={15}/> Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { setPhoto(event.target.files?.[0] || null); setFieldErrors((current) => ({ ...current, photo: undefined })); }}/></label>{photo && <button type="button" className="registration-remove-photo" aria-label="Remove photo" onClick={() => setPhoto(null)}><X size={16}/></button>}</div>
          </section>

          <section className="registration-panel">
            <div className="registration-panel-heading">
              <div><h2>NFC card assignment</h2><p>Scan a physical card, then hold that same card near the reader again when writing.</p></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {onToggleMode && (
                  <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #dce3ee', backgroundColor: '#f1f4f9' }}>
                    <button
                      type="button"
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        background: readerMode === 'mqtt' ? '#172033' : 'transparent',
                        color: readerMode === 'mqtt' ? '#d8fa73' : '#64748b',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      onClick={() => onToggleMode('mqtt')}
                      title="Connect over WiFi MQTT"
                    >
                      <Wifi size={12} /> WiFi MQTT
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        background: readerMode === 'serial' ? '#172033' : 'transparent',
                        color: readerMode === 'serial' ? '#d8fa73' : '#64748b',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                      onClick={() => onToggleMode('serial')}
                      title="Connect via USB Serial"
                    >
                      <Plug size={12} /> USB
                    </button>
                  </div>
                )}
                {readerMode === 'mqtt' && onOpenMqttSettings && (
                  <button
                    type="button"
                    style={{
                      background: '#ffffff',
                      border: '1px solid #dfe4ed',
                      borderRadius: 6,
                      color: '#475467',
                      padding: '5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title="MQTT Broker Settings"
                    onClick={onOpenMqttSettings}
                  >
                    <Settings size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="registration-reader-row"><span className={`registration-reader-led ${readerConnected ? 'on' : ''}`}/><div><b>{readerLabel(readerState, readerMode)}</b><small>{readerDetail || readerCopy(readerState, readerMode)}</small></div>
              {readerConnected ? <button type="button" className="registration-outline-button" onClick={() => void disconnectReader()}><Unplug size={15}/> Disconnect</button> : <button type="button" className="registration-outline-button" onClick={async () => { setConnecting(true); setFormError(''); try { await connectReader(); } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not connect to ESP32.'); } finally { setConnecting(false); } }} disabled={!canUseReader || connecting}><Plug size={15}/>{connecting ? 'Connecting…' : 'Connect ESP32'}</button>}
            </div>
            <div className="registration-scan-area">
              <div className="registration-scan-symbol"><Radio size={22}/></div>
              <div className="registration-scan-copy"><b>{scannedCard ? 'Physical card detected' : 'No card assigned'}</b><span>{scannedCard ? 'UID came from the connected ESP32 reader.' : 'Connect the ESP32, then start a scan and present the card.'}</span></div>
              {scannedCard ? <div className="registration-scanned-uid"><small>SCANNED UID</small><code>{scannedCard.uid}</code><button type="button" onClick={() => setScannedCard(null)} aria-label="Remove scanned card"><X size={15}/></button></div> : <button type="button" className="registration-scan-button" onClick={() => void captureCard()} disabled={!readerConnected || scanBusy}><ScanLine size={16}/>{scanBusy ? 'Waiting for card…' : 'Scan physical card'}</button>}
            </div>
            {scannedCard && <div className="registration-card-write-hint"><BadgeCheck size={15}/><span>After registration, the ESP32 will ask you to present this UID again before writing and activation.</span></div>}
          </section>
        </div>

        <aside className="registration-side-column">
          <section className="registration-panel registration-wallet-panel"><div className="registration-panel-heading"><div><h2>Wallet initialization</h2><p>Starting balance is recorded in the database ledger.</p></div></div><Field label="Starting coin balance" required error={fieldErrors.coins}><div className="registration-coin-input"><input type="number" min="0" max="100000" step="1" inputMode="numeric" value={form.coins} onChange={(event) => update('coins', event.target.value)} aria-invalid={Boolean(fieldErrors.coins)}/><span>coins</span></div></Field><div className="registration-wallet-note"><BadgeCheck size={16}/><span>Default is zero. Any starting amount is saved as an initial wallet credit.</span></div></section>
          <section className="registration-panel registration-summary-panel"><div className="registration-panel-heading"><div><h2>Registration summary</h2><p>Review before creating the student record.</p></div></div><div className="registration-summary-line"><span>Student ID</span><b>{form.studentId.trim() || 'Not entered'}</b></div><div className="registration-summary-line"><span>Starting wallet</span><b>{Number(form.coins || 0).toLocaleString()} coins</b></div><div className="registration-summary-line"><span>NFC assignment</span><b className={scannedCard ? 'text-good' : ''}>{scannedCard ? 'Physical card scanned' : 'Not assigned'}</b></div><div className="registration-summary-line"><span>Database</span><b className={authenticated ? 'text-good' : 'text-error'}>{authenticated ? 'Connected' : 'Required'}</b></div></section>
        </aside>

        {formError && <div className="registration-form-error" role="alert"><CircleAlert size={17}/><span>{formError}</span></div>}
        <div className="registration-actions"><button type="button" className="registration-cancel" onClick={onCancel}>Cancel</button><button type="button" className="registration-reset" onClick={resetForm}><RotateCcw size={15}/> Reset form</button><button type="submit" className="registration-primary" disabled={busy || !authenticated}><Save size={16}/>{busy ? 'Registering…' : 'Register student'}</button></div>
      </form>
    </div>
  </div>;
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return <label className="registration-field"><span>{label}{required && <b> *</b>}</span>{children}{error && <small className="registration-field-error" role="alert">{error}</small>}</label>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="registration-summary-item"><span>{label}</span><b>{value}</b></div>;
}

function readerLabel(state: Esp32BridgeState, mode: ReaderMode = 'mqtt') {
  if (mode === 'mqtt') {
    return ({
      unsupported: 'MQTT broker unavailable',
      disconnected: 'MQTT reader disconnected',
      connecting: 'Connecting to MQTT broker…',
      connected: 'ESP32 connected (WiFi MQTT)',
      error: 'MQTT connection error',
    })[state];
  }
  return ({
    unsupported: 'Web Serial unavailable',
    disconnected: 'ESP32 disconnected',
    connecting: 'Connecting to ESP32',
    connected: 'ESP32 connected (USB Serial)',
    error: 'Reader connection error',
  })[state];
}

function readerCopy(state: Esp32BridgeState, mode: ReaderMode = 'mqtt') {
  if (mode === 'mqtt') {
    return ({
      unsupported: 'Check broker URL or network connection.',
      disconnected: 'Click Connect ESP32 to join the MQTT broker over WiFi.',
      connecting: 'Establishing WebSocket connection to MQTT broker…',
      connected: 'Listening for card taps and ready for card writes.',
      error: 'Reconnect to retry.',
    })[state];
  }
  return ({
    unsupported: 'Use Chrome or Edge over localhost / HTTPS.',
    disconnected: 'Connect the reader over USB serial.',
    connecting: 'Select the ESP32 serial port.',
    connected: 'Firmware handshake verified at 115200 baud.',
    error: 'Reconnect the device and retry.',
  })[state];
}

function duplicateOrDatabaseError(error: { code?: string; message: string }) {
  if (error.code === '23505') {
    if (error.message.toLowerCase().includes('email')) return 'That email address is already registered.';
    if (error.message.toLowerCase().includes('student_no')) return 'That student ID is already registered.';
    if (error.message.toLowerCase().includes('nfc_cards')) return 'That NFC card is already assigned.';
    return 'A duplicate student or card value already exists.';
  }
  return error.message;
}