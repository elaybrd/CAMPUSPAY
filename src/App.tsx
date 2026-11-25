import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Copy,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Lock,
  LockKeyhole,
  LogOut,
  Plug,
  Plus,
  Radio,
  RotateCcw,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  Unlock,
  Unplug,
  Users,
  Wallet,
  Wifi,
  X,
} from 'lucide-react';
import { Esp32BridgeState, Esp32SerialBridge } from './esp32Serial';
import { UnifiedReaderBridge, type ReaderMode } from './unifiedReader';
import { MqttSettingsModal } from './MqttSettingsModal';
import StudentRegistration from './StudentRegistration';
import { NfcAddRecordModal, type NfcRecord, getRecordMenuItems } from './NfcAddRecordModal';
import './nfc.css';

export type Student = {
  id: string;
  student_no: string;
  full_name: string;
  email: string | null;
  department: string | null;
  coins: number;
  status: string;
  created_at?: string;
};

export type Tx = {
  id: string;
  student_id: string;
  amount: number;
  kind: string;
  description: string | null;
  created_at: string;
  students?: { full_name: string; student_no: string } | null;
};

export type NfcCard = {
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
};

type TerminalResult = {
  status: 'approved' | 'declined';
  studentName: string;
  studentNo?: string;
  remainingCoins?: number;
  cardSynced?: boolean;
  message: string;
};

type PageView =
  | 'Overview'
  | 'Students'
  | 'NFC Management'
  | 'Transactions'
  | 'Meal Terminal'
  | 'Settings';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const db: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('YOUR_PROJECT')
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const demoStudents: Student[] = [
  {
    id: 'demo-1',
    student_no: 'STU-2026-001',
    full_name: 'Amira Ben Salem',
    email: 'amira@campus.tn',
    department: 'Computer Science',
    coins: 42,
    status: 'active',
  },
  {
    id: 'demo-2',
    student_no: 'STU-2026-002',
    full_name: 'Youssef Trabelsi',
    email: 'youssef@campus.tn',
    department: 'Electronics',
    coins: 18,
    status: 'active',
  },
  {
    id: 'demo-3',
    student_no: 'STU-2026-003',
    full_name: 'Mariem Gharbi',
    email: 'mariem@campus.tn',
    department: 'Business',
    coins: 7,
    status: 'active',
  },
  {
    id: 'demo-4',
    student_no: 'STU-2026-004',
    full_name: 'Skander Mansour',
    email: 'skander@campus.tn',
    department: 'Computer Science',
    coins: 0,
    status: 'blocked',
  },
];

const demoTx: Tx[] = [
  {
    id: 't1',
    student_id: 'demo-1',
    amount: -1,
    kind: 'payment',
    description: 'Cafeteria meal (1 coin)',
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: 't2',
    student_id: 'demo-2',
    amount: 20,
    kind: 'topup',
    description: 'Wallet top-up',
    created_at: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
  },
  {
    id: 't3',
    student_id: 'demo-3',
    amount: -1,
    kind: 'payment',
    description: 'Cafeteria meal (1 coin)',
    created_at: new Date(Date.now() - 1000 * 60 * 54).toISOString(),
  },
  {
    id: 't4',
    student_id: 'demo-1',
    amount: -1,
    kind: 'payment',
    description: 'Cafeteria meal (1 coin)',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
];

const memoryProfiles = [
  { name: 'NTAG213', capacity: 144 },
  { name: 'NTAG215', capacity: 504 },
  { name: 'NTAG216', capacity: 888 },
  { name: 'MIFARE Classic 1K', capacity: 752 },
];

const demoCards: NfcCard[] = [
  {
    id: 'card-1',
    student_id: 'demo-1',
    uid: '04:A1:B2:C3:D4',
    status: 'active',
    can_pay: true,
    can_access: true,
    can_read: true,
    can_write: false,
    chip_type: 'NTAG213',
    memory_capacity: 144,
    memory_used: 48,
    registered_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    last_seen_at: new Date(Date.now() - 480000).toISOString(),
  },
  {
    id: 'card-2',
    student_id: 'demo-2',
    uid: '04:E5:F6:A7:B8',
    status: 'active',
    can_pay: true,
    can_access: false,
    can_read: true,
    can_write: true,
    chip_type: 'NTAG215',
    memory_capacity: 504,
    memory_used: 212,
    registered_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    last_seen_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'card-3',
    student_id: 'demo-3',
    uid: '04:C9:D0:E1:F2',
    status: 'lost',
    can_pay: false,
    can_access: false,
    can_read: true,
    can_write: false,
    chip_type: 'NTAG213',
    memory_capacity: 144,
    memory_used: 32,
    registered_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    last_seen_at: null,
  },
];

const money = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'coin' : 'coins'}`;
const time = (s: string) =>
  new Date(s).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
const hexToAscii = (hexStr: string): string => {
  if (!hexStr || hexStr.includes('ERROR')) return '—';
  const cleanHex = hexStr.replace(/\s+/g, '');
  let str = '';
  for (let i = 0; i < cleanHex.length; i += 2) {
    const code = parseInt(cleanHex.substr(i, 2), 16);
    if (code >= 32 && code <= 126) {
      str += String.fromCharCode(code);
    } else {
      str += '.';
    }
  }
  return str;
};

export default function App() {
  const [cards, setCards] = useState<NfcCard[]>(demoCards);
  const [cardQuery, setCardQuery] = useState('');
  const [newCard, setNewCard] = useState({
    student_id: '',
    uid: '',
    can_pay: true,
    can_access: false,
    can_read: true,
    can_write: false,
  });
  const [nfcTab, setNfcTab] = useState('Card Info');
  const [selectedNfcCardId, setSelectedNfcCardId] = useState('card-1');
  const [recoveryCardId, setRecoveryCardId] = useState('');
  const [replacementUid, setReplacementUid] = useState('');
  const [lastScannedTag, setLastScannedTag] = useState<{
    uid: string;
    cardType?: string;
    scannedAt: string;
  } | null>(null);

  const [liveSectorDump, setLiveSectorDump] = useState<{
    uid: string;
    cardType: string;
    sectors: Array<{ sector: number; blocks: Array<{ block: number; hex: string }> }>;
  } | null>(null);
  const [readingSectors, setReadingSectors] = useState(false);

  function getCardUsedBytes(card?: NfcCard | null, dump?: any, student?: Student | null): number {
    if (!card) return 0;
    if (dump && dump.sectors && Array.isArray(dump.sectors)) {
      let count = 0;
      for (const sec of dump.sectors) {
        for (const blk of sec.blocks || []) {
          if (blk.hex && blk.hex !== 'READ_ERROR' && blk.hex !== 'AUTH_ERROR') {
            const bytes = blk.hex.split(' ');
            for (const b of bytes) {
              if (b !== '00') count++;
            }
          }
        }
      }
      if (count > 0) return count;
    }
    if (student) {
      const payload = JSON.stringify({
        format: 'campuspay-student-v1',
        studentId: student.student_no,
        fullName: student.full_name,
        coins: Number(student.coins),
      });
      return 8 + payload.length;
    }
    return card.memory_used || 0;
  }

  async function handleDumpSectors() {
    setReadingSectors(true);
    notify('Reading 16 sectors (64 blocks) over SPI from physical MIFARE chip...');
    try {
      if (readerState !== 'connected') {
        try {
          await reader.connect();
        } catch {
          notify('ESP32 not connected. Connect ESP32 to read live memory slots.');
          return;
        }
      }
      const dump = await reader.readSectors();
      setLiveSectorDump(dump);
      let count = 0;
      for (const sec of dump.sectors) {
        for (const blk of sec.blocks || []) {
          if (blk.hex && blk.hex !== 'READ_ERROR' && blk.hex !== 'AUTH_ERROR') {
            const bytes = blk.hex.split(' ');
            for (const b of bytes) {
              if (b !== '00') count++;
            }
          }
        }
      }
      setCards((prev) =>
        prev.map((c) =>
          c.uid.replace(/[^0-9a-f]/gi, '').toUpperCase() === dump.uid.replace(/[^0-9a-f]/gi, '').toUpperCase()
            ? { ...c, memory_used: count || c.memory_used || 68 }
            : c
        )
      );
      notify(`16 Sectors (64 memory blocks) read successfully from physical card ${dump.uid}! (${count} bytes used)`);
    } catch (err: any) {
      notify(`Sector dump error: ${err.message}`);
    } finally {
      setReadingSectors(false);
    }
  }

  const [students, setStudents] = useState<Student[]>(demoStudents);
  const [transactions, setTransactions] = useState<Tx[]>(demoTx);
  const [page, setPage] = useState<PageView>('Overview');
  const [query, setQuery] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentCardUid, setNewStudentCardUid] = useState('');
  const [showAddRecordModal, setShowAddRecordModal] = useState(false);
  const [cardRecords, setCardRecords] = useState<Record<string, NfcRecord[]>>(() => {
    try {
      const saved = localStorage.getItem('campuspay_card_records');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [showTopup, setShowTopup] = useState<Student | null>(null);
  const [notice, setNotice] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanHold, setScanHold] = useState(false);
  const [topupAmount, setTopupAmount] = useState('10');
  const [terminalResult, setTerminalResult] = useState<TerminalResult | null>(null);

  const readerRef = useRef<UnifiedReaderBridge | null>(null);
  if (!readerRef.current) {
    readerRef.current = new UnifiedReaderBridge((state, detail) => {
      setReaderState(state);
      setReaderDetail(detail || '');
    });
  }
  const reader = readerRef.current;

  const [readerMode, setReaderMode] = useState<ReaderMode>(reader.currentMode);
  const [showMqttSettings, setShowMqttSettings] = useState(false);
  const [readerState, setReaderState] = useState<Esp32BridgeState>(
    reader.currentMode === 'mqtt' ? 'disconnected' : (Esp32SerialBridge.supported ? 'disconnected' : 'unsupported')
  );
  const [readerDetail, setReaderDetail] = useState('');
  const resetTimerRef = useRef<number | null>(null);
  const mealProcessingRef = useRef<boolean>(false);
  const lastMealTapRef = useRef<{ uid: string; timestamp: number } | null>(null);

  useEffect(() => {
    if (!db) return;
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (db && session) {
      void refresh();
      void loadCards();
    }
  }, [session]);

  // Automatic continuous scan when on Meal Terminal, Students, or NFC Management and ESP32 is connected
  useEffect(() => {
    if (page !== 'Meal Terminal' && page !== 'Students' && page !== 'NFC Management') {
      if (scanHold) {
        void reader.cancelOperation();
      }
      return;
    }
    if (readerMode === 'serial') {
      if (page === 'Meal Terminal' && readerState === 'connected' && !scanHold && !terminalResult && !mealProcessingRef.current) {
        void listenForMealCard();
      } else if ((page === 'Students' || page === 'NFC Management') && readerState === 'connected' && !scanHold && !showAddStudent) {
        void scanPhysicalNfcUid((uid, cardType) => {
          setNewCard((prev) => ({ ...prev, uid }));
          const norm = uid.replace(/[^0-9a-f]/gi, '').toUpperCase();
          const existing = cards.find(
            (c) => c.uid.replace(/[^0-9a-f]/gi, '').toUpperCase() === norm
          );
          if (existing) {
            setSelectedNfcCardId(existing.id);
          } else {
            const scannedCard: NfcCard = {
              id: `scanned-${norm}`,
              student_id: '',
              uid,
              status: 'active',
              can_pay: true,
              can_access: true,
              can_read: true,
              can_write: true,
              chip_type: cardType || 'MIFARE Classic 1K',
              memory_capacity: 752,
              memory_used: 0,
              registered_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
            };
            setCards((prev) => [scannedCard, ...prev.filter((c) => !c.id.startsWith('scanned-'))]);
            setSelectedNfcCardId(scannedCard.id);
          }
          setNfcTab('Card Info');
          if (page === 'NFC Management') {
            void handleDumpSectors();
          }
        });
      }
    }
  }, [page, readerState, scanHold, terminalResult]);

  const handleToggleReaderMode = async (newMode: ReaderMode) => {
    await reader.setMode(newMode);
    setReaderMode(newMode);
    notify(`Switched reader mode to ${newMode === 'mqtt' ? 'WiFi MQTT' : 'USB Serial'}.`);
  };

  // Auto-connect in WiFi MQTT mode on mount / mode switch
  useEffect(() => {
    if (readerMode === 'mqtt' && !reader.connected) {
      console.log('[CampusPay] Initiating MQTT auto-connection...');
      reader.connect().catch((err) => {
        console.warn('[CampusPay] Auto-connect attempt result:', err.message);
      });
    }
  }, [readerMode]);

  useEffect(() => {
    const unsub = reader.subscribe((msg) => {
      console.log('[CampusPay Dashboard] Reader event received:', msg);
      if (msg.type === 'scan_result' && msg.ok && msg.uid) {
        const uid =
          msg.uid
            .replace(/[^0-9a-f]/gi, '')
            .toUpperCase()
            .match(/.{1,2}/g)
            ?.join(':') || msg.uid.toUpperCase();

        setLastScannedTag({
          uid,
          cardType: msg.cardType || 'MIFARE Classic 1K',
          scannedAt: new Date().toISOString(),
        });

        notify(`NFC Card Detected: ${uid}`);

        if (page === 'Meal Terminal' && !terminalResult) {
          void processMealByUid(uid);
        } else if ((page === 'Students' || page === 'NFC Management') && !showAddStudent) {
          setNewCard((prev) => ({ ...prev, uid }));
          const norm = uid.replace(/[^0-9a-f]/gi, '').toUpperCase();
          const existing = cards.find(
            (c) => c.uid.replace(/[^0-9a-f]/gi, '').toUpperCase() === norm
          );
          if (existing) {
            setSelectedNfcCardId(existing.id);
          } else {
            const scannedCard: NfcCard = {
              id: `scanned-${norm}`,
              student_id: '',
              uid,
              status: 'active',
              can_pay: true,
              can_access: true,
              can_read: true,
              can_write: true,
              chip_type: msg.cardType || 'MIFARE Classic 1K',
              memory_capacity: 752,
              memory_used: 0,
              registered_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
            };
            setCards((prev) => [scannedCard, ...prev.filter((c) => !c.id.startsWith('scanned-'))]);
            setSelectedNfcCardId(scannedCard.id);
          }
          setNfcTab('Card Info');
        }
      }
    });
    return unsub;
  }, [page, terminalResult, cards]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  function scheduleTerminalReset(delayMs = 4500) {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setTerminalResult(null);
    }, delayMs);
  }

  async function refresh() {
    if (!db) return;
    const [s, t] = await Promise.all([
      db.from('students').select('*').order('created_at', { ascending: false }),
      db
        .from('transactions')
        .select('*, students(full_name,student_no)')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);
    if (!s.error && s.data) setStudents(s.data as Student[]);
    if (!t.error && t.data) setTransactions(t.data as Tx[]);
  }

  async function loadCards() {
    if (!db || !session) return;
    const { data, error } = await db
      .from('nfc_cards')
      .select('*')
      .order('registered_at', { ascending: false });
    if (error) {
      notify('NFC card settings need the latest database schema: ' + error.message);
      return;
    }
    if (data) {
      const loaded = data as NfcCard[];
      setCards(loaded);
      if (loaded.length > 0 && !loaded.some((c) => c.id === selectedNfcCardId)) {
        setSelectedNfcCardId(loaded[0].id);
      }
    }
  }

  const totalCoins = students.reduce((n, s) => n + Number(s.coins || 0), 0);
  const activeCount = students.filter((s) => s.status === 'active').length;
  const paid = transactions
    .filter((t) => t.kind === 'payment')
    .reduce((n, t) => n + Math.abs(t.amount), 0);

  const filtered = useMemo(
    () =>
      students.filter((s) =>
        `${s.full_name} ${s.student_no} ${s.email || ''} ${s.department || ''}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [students, query]
  );

  const filteredCards = useMemo(
    () =>
      cards.filter((card) => {
        const student = students.find((item) => item.id === card.student_id);
        return `${card.uid} ${card.status} ${student?.full_name || ''} ${
          student?.student_no || ''
        }`
          .toLowerCase()
          .includes(cardQuery.toLowerCase());
      }),
    [cards, students, cardQuery]
  );

  function notify(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(''), 3500);
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!db) {
      notify('Add your Supabase URL and anon key to .env first.');
      return;
    }
    setBusy(true);
    const { error } = await db.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    setBusy(false);
    if (error) notify(error.message);
  }

  async function logout() {
    await db?.auth.signOut();
    setSession(null);
  }

  async function registerCard(e: React.FormEvent) {
    e.preventDefault();
    const uid = newCard.uid.trim().toUpperCase();
    if (!newCard.student_id || !uid) {
      notify('Choose a student and enter the card UID.');
      return;
    }
    if (cards.some((card) => card.uid.toUpperCase() === uid)) {
      notify('That card UID is already registered.');
      return;
    }
    const row = {
      student_id: newCard.student_id,
      uid,
      status: 'active' as const,
      can_pay: newCard.can_pay,
      can_access: newCard.can_access,
      can_read: newCard.can_read,
      can_write: newCard.can_write,
      chip_type: 'NTAG213',
      memory_capacity: 144,
      memory_used: 0,
    };
    if (db && session) {
      setBusy(true);
      const { data, error } = await db
        .from('nfc_cards')
        .insert(row)
        .select()
        .single();
      setBusy(false);
      if (error) {
        notify(error.message);
        return;
      }
      setCards([data as NfcCard, ...cards]);
    } else {
      setCards([
        {
          ...row,
          id: crypto.randomUUID(),
          registered_at: new Date().toISOString(),
          last_seen_at: null,
        },
        ...cards,
      ]);
    }
    setNewCard({
      student_id: '',
      uid: '',
      can_pay: true,
      can_access: false,
      can_read: true,
      can_write: false,
    });
    notify('NFC card registered.');
  }

  async function updateCard(
    card: NfcCard,
    changes: Partial<
      Pick<
        NfcCard,
        | 'status'
        | 'can_pay'
        | 'can_access'
        | 'can_read'
        | 'can_write'
        | 'chip_type'
        | 'memory_capacity'
        | 'memory_used'
      >
    >
  ) {
    if (db && session) {
      const { error } = await db
        .from('nfc_cards')
        .update(changes)
        .eq('id', card.id);
      if (error) {
        notify(error.message);
        return;
      }
    }
    setCards(
      cards.map((item) => (item.id === card.id ? { ...item, ...changes } : item))
    );
    notify('Card settings updated.');
  }

  async function eraseCard(card: NfcCard, wipePhysical = true) {
    if (!window.confirm(`Are you sure you want to erase and unassign card ${card.uid}? This will delete the card record from the database so it can be re-registered to any student.`)) {
      return;
    }

    setBusy(true);
    try {
      if (wipePhysical && readerState === 'connected') {
        try {
          await reader.eraseCard(card.uid);
          notify(`Physical card ${card.uid} wiped over ESP32.`);
        } catch (phyErr) {
          console.warn('Physical hardware wipe failed:', phyErr);
        }
      }

      if (db && session && !card.id.startsWith('demo-')) {
        const { error } = await db.from('nfc_cards').delete().eq('id', card.id);
        if (error) {
          notify(`Database delete failed: ${error.message}`);
          return;
        }
      }

      setCards(cards.filter((item) => item.id !== card.id));
      notify(`Card ${card.uid} erased & unassigned! You can now re-register this card.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to erase card.');
    } finally {
      setBusy(false);
    }
  }

  async function handleWriteRecord(record: NfcRecord) {
    if (!selectedNfcCard) throw new Error('No NFC card selected.');
    if (readerState !== 'connected') {
      try {
        await reader.connect();
      } catch {
        throw new Error('ESP32 reader is offline. Connect the ESP32 (WiFi MQTT or USB) first.');
      }
    }

    const targetUid = selectedNfcCard.uid;
    const studentId = `${selectedNfcStudent?.student_no ? `${selectedNfcStudent.student_no}-` : ''}REC:${record.type}`.slice(0, 32);
    const fullName = record.formattedValue;
    const coins = selectedNfcStudent?.coins ?? 0;

    await reader.writeStudent(targetUid, {
      studentId,
      fullName,
      coins,
    });

    const norm = targetUid.replace(/[^0-9a-f]/gi, '').toUpperCase();
    const updatedList = [record, ...(cardRecords[norm] || cardRecords[targetUid] || []).filter((r) => r.id !== record.id)];

    setCardRecords((prev) => {
      const next = { ...prev, [norm]: updatedList, [targetUid]: updatedList };
      try {
        localStorage.setItem('campuspay_card_records', JSON.stringify(next));
      } catch {}
      return next;
    });

    setCards((prev) =>
      prev.map((c) =>
        c.uid.replace(/[^0-9a-f]/gi, '').toUpperCase() === norm
          ? { ...c, memory_used: Math.max(c.memory_used, record.bytes) }
          : c
      )
    );

    notify(`Physical record (${record.type}) written and verified on card ${targetUid}!`);
  }

  function handleDeleteRecord(recordId: string) {
    if (!selectedNfcCard) return;
    const norm = selectedNfcCard.uid.replace(/[^0-9a-f]/gi, '').toUpperCase();
    setCardRecords((prev) => {
      const cur = prev[norm] || prev[selectedNfcCard.uid] || [];
      const nextList = cur.filter((r) => r.id !== recordId);
      const next = { ...prev, [norm]: nextList, [selectedNfcCard.uid]: nextList };
      try {
        localStorage.setItem('campuspay_card_records', JSON.stringify(next));
      } catch {}
      return next;
    });
    notify('Record removed from card inspector.');
  }

  async function issueReplacement(e: React.FormEvent) {
    e.preventDefault();
    const lost = cards.find(
      (card) => card.id === recoveryCardId && card.status === 'lost'
    );
    const uid = replacementUid.trim().toUpperCase();
    if (!lost) {
      notify('Select a lost card to replace.');
      return;
    }
    if (!uid) {
      notify('Enter the replacement card UID.');
      return;
    }
    if (cards.some((card) => card.uid.toUpperCase() === uid)) {
      notify('That UID is already assigned, including to a lost card.');
      return;
    }
    const row = {
      student_id: lost.student_id,
      uid,
      status: 'active' as const,
      can_pay: lost.can_pay,
      can_access: lost.can_access,
      can_read: true,
      can_write: false,
      chip_type: 'NTAG213',
      memory_capacity: 144,
      memory_used: 0,
    };
    let replacement: NfcCard;
    if (db && session) {
      setBusy(true);
      const { data, error } = await db
        .from('nfc_cards')
        .insert(row)
        .select()
        .single();
      setBusy(false);
      if (error) {
        notify(error.message);
        return;
      }
      replacement = data as NfcCard;
    } else {
      replacement = {
        ...row,
        id: crypto.randomUUID(),
        registered_at: new Date().toISOString(),
        last_seen_at: null,
      };
    }
    setCards([replacement, ...cards]);
    setReplacementUid('');
    setRecoveryCardId('');
    notify('Replacement activated. The lost card remains blocked.');
  }

  async function scanPhysicalNfcUid(onUid: (uid: string, cardType?: string) => void) {
    if (readerState !== 'connected') return;
    setScanHold(true);
    try {
      const scanned = await reader.scanCard();
      const uid =
        scanned.uid
          .replace(/[^0-9a-f]/gi, '')
          .toUpperCase()
          .match(/.{1,2}/g)
          ?.join(':') || scanned.uid.toUpperCase();

      setLastScannedTag({
        uid,
        cardType: scanned.cardType || 'MIFARE Classic 1K',
        scannedAt: new Date().toISOString(),
      });

      onUid(uid, scanned.cardType);
      notify(`Physical card detected! Scanned UID: ${uid}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'ESP32 scan timed out.';
      if (msg.includes('MFRC522')) {
        notify('RC522 reader error: Check SPI wiring (3.3V, GND, SDA=GPIO5, SCK=18, MOSI=23, MISO=19, RST=22).');
      }
    } finally {
      setScanHold(false);
    }
  }

  async function seedDatabaseWithDemoData() {
    if (!db || !session) return;
    setBusy(true);
    try {
      const demoData = [
        {
          student_no: 'STU-2026-001',
          full_name: 'Amira Ben Salem',
          email: 'amira@campus.tn',
          phone: '+216 98 123 456',
          department: 'Computer Science',
          academic_level: 'Master 1',
          coins: 42,
          card_uid: '04:A1:B2:C3:D4',
        },
        {
          student_no: 'STU-2026-002',
          full_name: 'Youssef Trabelsi',
          email: 'youssef@campus.tn',
          phone: '+216 55 987 654',
          department: 'Electronics',
          academic_level: 'Licence 3',
          coins: 18,
          card_uid: '04:E5:F6:A7:B8',
        },
        {
          student_no: 'STU-2026-003',
          full_name: 'Mariem Gharbi',
          email: 'mariem@campus.tn',
          phone: '+216 22 456 789',
          department: 'Business Administration',
          academic_level: 'Master 2',
          coins: 7,
          card_uid: '04:C9:D0:E1:F2',
        },
      ];

      for (const item of demoData) {
        await db.rpc('register_student', {
          p_student_no: item.student_no,
          p_full_name: item.full_name,
          p_email: item.email,
          p_phone: item.phone,
          p_department: item.department,
          p_academic_level: item.academic_level,
          p_starting_coins: item.coins,
          p_card_uid: item.card_uid,
          p_card_type: 'MIFARE Classic 1K',
        });
      }

      await refresh();
      await loadCards();
      notify('Sample students and NFC cards inserted into Supabase!');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Seeding failed.');
    } finally {
      setBusy(false);
    }
  }

  async function topup(e: React.FormEvent) {
    e.preventDefault();
    if (!showTopup) return;
    const amount = Number(topupAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Enter a positive amount.');
      return;
    }
    if (db && session && !showTopup.id.startsWith('demo-')) {
      const { error } = await db.rpc('top_up_student', {
        p_student_id: showTopup.id,
        p_amount: amount,
        p_description: 'Admin wallet top-up',
      });
      if (error) {
        notify(error.message);
        return;
      }
      await refresh();
    } else {
      setStudents((prev) =>
        prev.map((s) =>
          s.id === showTopup.id ? { ...s, coins: Number(s.coins) + amount } : s
        )
      );
      setTransactions((prev) => [
        {
          id: crypto.randomUUID(),
          student_id: showTopup.id,
          amount,
          kind: 'topup',
          description: 'Admin wallet top-up',
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
    setShowTopup(null);
    notify(`${money(amount)} added to wallet.`);
  }

  // Process a 1-coin meal deduction when a card UID is scanned
  async function processMealByUid(rawUid: string) {
    const uid =
      rawUid
        .replace(/[^0-9a-f]/gi, '')
        .toUpperCase()
        .match(/.{1,2}/g)
        ?.join(':') || rawUid.trim().toUpperCase();

    const now = Date.now();

    // 1. Guard against concurrent transactions: if already processing, ignore duplicate tap
    if (mealProcessingRef.current) {
      console.log('[Meal Terminal] Deduct blocked: transaction currently in progress');
      return;
    }

    // 2. Cooldown for the same card: Prevent deducting again if card is held on reader
    // Requires at least 7 seconds before the same card can deduct another meal
    if (lastMealTapRef.current && lastMealTapRef.current.uid === uid && (now - lastMealTapRef.current.timestamp < 7000)) {
      console.log('[Meal Terminal] Deduct blocked: same card held cooldown active (7s)');
      return;
    }

    // 3. If an approved/declined terminal result is currently on display, wait for it to clear
    if (terminalResult) {
      console.log('[Meal Terminal] Deduct blocked: terminal result active on screen');
      return;
    }

    mealProcessingRef.current = true;
    lastMealTapRef.current = { uid, timestamp: now };
    setScanHold(true);

    try {
      if (db && session) {
      const { data: cardData, error: lookupError } = await db
        .from('nfc_cards')
        .select('*, students(*)')
        .ilike('uid', uid)
        .maybeSingle();

      if (lookupError || !cardData) {
        setTerminalResult({
          status: 'declined',
          studentName: 'Unregistered Card',
          message: `Card ${uid} is not registered in CampusPay.`,
        });
        scheduleTerminalReset(4000);
        return;
      }

      const student = (
        Array.isArray(cardData.students)
          ? cardData.students[0]
          : cardData.students
      ) as Student | null;

      if (cardData.status !== 'active' || !cardData.can_read || !cardData.can_pay) {
        setTerminalResult({
          status: 'declined',
          studentName: student?.full_name || 'Card Blocked',
          studentNo: student?.student_no,
          remainingCoins: student ? Number(student.coins) : undefined,
          message: `This card (${uid}) is ${cardData.status} or not authorized for meal payments.`,
        });
        scheduleTerminalReset(4500);
        return;
      }

      if (!student || student.status !== 'active') {
        setTerminalResult({
          status: 'declined',
          studentName: student?.full_name || 'Account Inactive',
          studentNo: student?.student_no,
          message: 'Student account is currently blocked or inactive.',
        });
        scheduleTerminalReset(4500);
        return;
      }

      if (Number(student.coins) < 1) {
        setTerminalResult({
          status: 'declined',
          studentName: student.full_name,
          studentNo: student.student_no,
          remainingCoins: Number(student.coins),
          message: 'Insufficient balance (0 coins). Please top up your wallet.',
        });
        scheduleTerminalReset(4500);
        return;
      }

      // Deduct 1 coin atomically in Supabase
      const { error: payError } = await db.rpc('pay_with_wallet', {
        p_card_uid: cardData.uid,
        p_amount: 1,
        p_description: 'Cafeteria meal (1 coin)',
      });

      if (payError) {
        setTerminalResult({
          status: 'declined',
          studentName: student.full_name,
          studentNo: student.student_no,
          remainingCoins: Number(student.coins),
          message: payError.message,
        });
        scheduleTerminalReset(4500);
        return;
      }

      const remainingCoins = Math.max(0, Number(student.coins) - 1);

      // Also update the physical card's coin snapshot if held near the ESP32
      let cardSynced = false;
      if (reader.connected) {
        cardSynced = await reader.writeStudentQuick(cardData.uid, {
          studentId: student.student_no,
          fullName: student.full_name,
          coins: remainingCoins,
        });
      }

      await refresh();
      await loadCards();

      setTerminalResult({
        status: 'approved',
        studentName: student.full_name,
        studentNo: student.student_no,
        remainingCoins,
        cardSynced,
        message: 'Enjoy your meal!',
      });
      scheduleTerminalReset(4500);
      return;
    }

    // Preview / Demo mode fallback
    const demoCard =
      cards.find((c) => c.uid.toUpperCase() === uid) || cards[0];
    const student =
      students.find((s) => s.id === demoCard?.student_id) || students[0];

    if (!student || student.status !== 'active') {
      setTerminalResult({
        status: 'declined',
        studentName: student?.full_name || 'Unknown Student',
        studentNo: student?.student_no,
        remainingCoins: student?.coins,
        message: 'Student account is blocked or inactive.',
      });
      scheduleTerminalReset(4500);
      return;
    }

    if (student.coins < 1) {
      setTerminalResult({
        status: 'declined',
        studentName: student.full_name,
        studentNo: student.student_no,
        remainingCoins: student.coins,
        message: 'Insufficient balance (0 coins). Please top up your wallet.',
      });
      scheduleTerminalReset(4500);
      return;
    }

    const remainingCoins = student.coins - 1;
    setStudents((prev) =>
      prev.map((s) =>
        s.id === student.id ? { ...s, coins: remainingCoins } : s
      )
    );
    setTransactions((prev) => [
      {
        id: crypto.randomUUID(),
        student_id: student.id,
        amount: -1,
        kind: 'payment',
        description: 'Cafeteria meal (1 coin)',
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);

    setTerminalResult({
      status: 'approved',
      studentName: student.full_name,
      studentNo: student.student_no,
      remainingCoins,
      cardSynced: true,
      message: 'Enjoy your meal!',
    });
    scheduleTerminalReset(4500);
    } finally {
      mealProcessingRef.current = false;
      setScanHold(false);
    }
  }

  async function listenForMealCard() {
    if (scanHold || mealProcessingRef.current || terminalResult) return;
    setScanHold(true);
    try {
      if (readerState !== 'connected') {
        await reader.connect();
      }
      const scanned = await reader.scanCard();
      await processMealByUid(scanned.uid);
    } catch {
      // Scan timed out or was cancelled; user can re-trigger or it will stay ready
    } finally {
      setScanHold(false);
    }
  }

  function exportCsv() {
    const rows = [
      ['Student ID', 'Name', 'Email', 'Department', 'Coins', 'Status'],
      ...students.map((s) => [
        s.student_no,
        s.full_name,
        s.email || '',
        s.department || '',
        String(s.coins),
        s.status,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'campuspay-students.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const nav = [
    ['Overview', LayoutDashboard],
    ['Students', Users],
    ['NFC Management', Radio],
    ['Transactions', Activity],
    ['Meal Terminal', ShoppingBag],
    ['Settings', Settings],
  ] as const;

  const nfcTabs = [
    ['Card Info', CreditCard],
    ['Memory Explorer', Activity],
    ['Access Rights', ShieldCheck],
    ['Read / Write', Smartphone],
    ['Erase / Reuse Card', Trash2],
    ['Diagnostics', Settings],
    ['Card Recovery', Lock],
  ] as const;

  const selectedNfcCard =
    cards.find((card) => card.id === selectedNfcCardId) || cards[0];
  const selectedNfcStudent = selectedNfcCard
    ? students.find((student) => student.id === selectedNfcCard.student_id)
    : undefined;

  // Intercept Admin Sign In View when Supabase credentials are configured
  if (db && !session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-mark">
            <Wallet size={25} />
          </div>
          <div className="eyebrow">CAMPUSPAY ADMIN</div>
          <h1>Welcome back.</h1>
          <p className="muted">
            Sign in to manage student wallets and campus payments.
          </p>
          <form onSubmit={login} className="stack">
            <label>
              Email
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="admin@campus.tn"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Your password"
              />
            </label>
            <button className="primary full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in securely'}
            </button>
          </form>
          <p className="tiny muted">
            Admin accounts are created in Supabase Authentication. Public
            sign-up is intentionally disabled.
          </p>
          {notice && <div className="notice">{notice}</div>}
        </div>
      </div>
    );
  }

  const renderCardInventory = () => (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Card inventory</h2>
          <p className="muted">
            Manage assignments, permissions, and credential status.
          </p>
        </div>
        <span className="badge good">{filteredCards.length} cards</span>
      </div>
      <div className="table-toolbar">
        <div className="searchbox">
          <Search size={17} />
          <input
            value={cardQuery}
            onChange={(e) => setCardQuery(e.target.value)}
            placeholder="Search UID, student, or status…"
          />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>STUDENT</th>
              <th>CARD UID</th>
              <th>STATUS</th>
              <th>PAYMENTS</th>
              <th>CAMPUS ACCESS</th>
              <th>LAST SEEN</th>
              <th>CONTROLS</th>
            </tr>
          </thead>
          <tbody>
            {filteredCards.map((card) => {
              const student = students.find(
                (item) => item.id === card.student_id
              );
              return (
                <tr key={card.id}>
                  <td>
                    <div className="student-cell">
                      <div className="avatar mini-avatar">
                        {initials(student?.full_name || 'Student')}
                      </div>
                      <div>
                        <b>
                          {student?.full_name || 'Unassigned student'}
                        </b>
                        <small>{student?.student_no || '—'}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <code>{card.uid}</code>
                  </td>
                  <td>
                    <span
                      className={
                        'badge ' +
                        (card.status === 'active'
                          ? 'good'
                          : card.status === 'lost'
                          ? 'bad'
                          : 'warn')
                      }
                    >
                      {card.status}
                    </span>
                  </td>
                  <td>
                    <label className="nfc-toggle">
                      <input
                        type="checkbox"
                        checked={card.can_pay}
                        disabled={card.status !== 'active'}
                        onChange={(e) =>
                          void updateCard(card, {
                            can_pay: e.target.checked,
                          })
                        }
                      />
                      <span>
                        {card.can_pay ? 'Allowed' : 'Blocked'}
                      </span>
                    </label>
                  </td>
                  <td>
                    <label className="nfc-toggle">
                      <input
                        type="checkbox"
                        checked={card.can_access}
                        disabled={card.status !== 'active'}
                        onChange={(e) =>
                          void updateCard(card, {
                            can_access: e.target.checked,
                          })
                        }
                      />
                      <span>
                        {card.can_access ? 'Allowed' : 'Blocked'}
                      </span>
                    </label>
                  </td>
                  <td className="muted">
                    {card.last_seen_at
                      ? time(card.last_seen_at)
                      : 'Never'}
                  </td>
                  <td>
                    <div className="nfc-controls">
                      {card.status !== 'lost' && (
                        <button
                          className="icon-button"
                          title={
                            card.status === 'active'
                              ? 'Lock card'
                              : 'Activate card'
                          }
                          aria-label={
                            card.status === 'active'
                              ? 'Lock card'
                              : 'Activate card'
                          }
                          onClick={() =>
                            void updateCard(card, {
                              status:
                                card.status === 'active'
                                  ? 'disabled'
                                  : 'active',
                            })
                          }
                        >
                          {card.status === 'active' ? (
                            <Lock size={16} />
                          ) : (
                            <Unlock size={16} />
                          )}
                        </button>
                      )}
                      {card.status !== 'lost' && (
                        <button
                          className="nfc-lost"
                          onClick={() =>
                            void updateCard(card, {
                              status: 'lost',
                              can_pay: false,
                              can_access: false,
                            })
                          }
                        >
                          Mark lost
                        </button>
                      )}
                      <button
                        className="nfc-lost"
                        style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                        title="Erase card data & unassign to reuse"
                        onClick={() => void eraseCard(card)}
                      >
                        <Trash2 size={13} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        Erase
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filteredCards.length && (
          <div className="empty" style={{ padding: '32px 16px', textAlign: 'center' }}>
            <CreditCard size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
            <h3 style={{ margin: '4px 0 6px', fontSize: 16 }}>No NFC cards found</h3>
            <p className="muted" style={{ maxWidth: 440, margin: '0 auto 16px', fontSize: 13 }}>
              {db && session
                ? 'Your Supabase database has no NFC card records yet. Click below to insert sample cards or register a card.'
                : 'No cards match this search.'}
            </p>
            {db && session && !cards.length && (
              <div className="heading-actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="secondary" onClick={seedDatabaseWithDemoData} disabled={busy}>
                  <Database size={16} /> Insert Sample Demo Cards
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Wallet size={23} />
          </div>
          <div>
            <b>CampusPay</b>
            <small>STUDENT WALLET</small>
          </div>
        </div>
        <div className="workspace">
          <span className="workspace-dot" /> Campus Administration{' '}
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={'nav-item ' + (page === name ? 'active' : '')}
              onClick={() => {
                setPage(name as PageView);
                setShowAddStudent(false);
              }}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === 'Transactions' && (
                <span className="nav-count">{transactions.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <CircleHelp size={18} />
            <div>
              <b>Need a hand?</b>
              <small>Setup guide & support</small>
            </div>
          </div>
          <div className="profile">
            <div className="avatar">AD</div>
            <div className="profile-text">
              <b>{session?.user?.email || 'Campus Admin'}</b>
              <small>
                {db && session ? 'Connected database' : 'Preview mode'}
              </small>
            </div>
            <button title="Sign out" className="icon-button" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <b>{page}</b>
          </div>
          <div className="top-actions">
            {/* Dual Mode Reader Control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#f1f4f9', padding: '3px 8px', borderRadius: 8, border: '1px solid #e1e7f0' }}>
              <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #dce3ee' }}>
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
                  onClick={() => void handleToggleReaderMode('mqtt')}
                  title="Connect to ESP32 over WiFi using MQTT server"
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
                  onClick={() => void handleToggleReaderMode('serial')}
                  title="Connect to ESP32 via USB Serial"
                >
                  <Plug size={12} /> USB
                </button>
              </div>

              {readerState === 'connected' ? (
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: '3px 8px', fontSize: 11, height: 'auto', display: 'flex', alignItems: 'center', gap: 5, borderRadius: 6 }}
                  onClick={() => void reader.disconnect()}
                  title={readerDetail || 'Connected'}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                  {readerMode === 'mqtt' ? (reader.isEspOnline ? 'ESP32 Online' : 'Broker OK') : 'Connected'} · Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  style={{
                    padding: '3px 9px',
                    fontSize: 11,
                    height: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    borderRadius: 6,
                    backgroundColor: readerState === 'error' ? '#dc2626' : undefined,
                  }}
                  disabled={readerMode === 'serial' && readerState === 'unsupported'}
                  title={readerDetail}
                  onClick={async () => {
                    try {
                      await reader.connect();
                      notify(`Connected in ${readerMode === 'mqtt' ? 'WiFi MQTT' : 'USB Serial'} mode.`);
                    } catch (err) {
                      notify(err instanceof Error ? err.message : 'Could not connect reader.');
                    }
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: readerState === 'error' ? '#fca5a5' : '#94a3b8' }} />
                  {readerState === 'connecting' ? 'Connecting…' : readerState === 'error' ? 'Connection Error (Retry)' : `Connect ${readerMode === 'mqtt' ? 'WiFi' : 'ESP32'}`}
                </button>
              )}

              {readerMode === 'mqtt' && (
                <button
                  type="button"
                  className="icon-button"
                  style={{ width: 26, height: 26, padding: 0 }}
                  title={`MQTT Broker Settings · ${reader.getMqttConfig().brokerUrl}`}
                  onClick={() => setShowMqttSettings(true)}
                >
                  <Settings size={13} />
                </button>
              )}
            </div>

            <div
              className={
                'status-pill ' + (db && session ? 'online' : 'preview')
              }
            >
              <span />
              {db && session ? 'Database connected' : 'Preview data'}
            </div>
            <button
              className="icon-button"
              title="Notifications"
              onClick={() => notify('You’re all caught up.')}
            >
              <Bell size={18} />
            </button>
            <div className="avatar small">AD</div>
          </div>
        </header>

        <div className="content">
          {!(page === 'Students' && showAddStudent) && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">CAMPUS OPERATIONS / 2026</div>
                <h1>
                  {page === 'Overview'
                    ? 'Good morning, Admin 👋'
                    : page}
                </h1>
                <p className="muted">
                  {page === 'Overview'
                    ? 'Here’s what’s happening across your campus today.'
                    : page === 'Students'
                    ? 'Manage student profiles, wallet balances, and NFC credentials.'
                    : page === 'Transactions'
                    ? 'Review wallet top-ups and cafeteria payments.'
                    : page === 'Meal Terminal'
                    ? 'Student self-service meal scanner — deducts 1 coin automatically on tap.'
                    : 'Manage your workspace and database connection.'}
                </p>
              </div>
              {page === 'Students' && (
                <div className="heading-actions">
                  <button className="secondary" onClick={exportCsv}>
                    <Download size={16} /> Export CSV
                  </button>
                  <button
                    className="primary"
                    onClick={() => setShowAddStudent(true)}
                  >
                    <Plus size={17} /> Add student
                  </button>
                </div>
              )}
            </div>
          )}

          {page === 'Overview' && (
            <>
              <div className="stats-grid">
                <Stat
                  title="Registered students"
                  value={students.length.toLocaleString()}
                  note={activeCount + ' active accounts'}
                  icon={<Users size={22} />}
                  tone="blue"
                />
                <Stat
                  title="Total wallet coins"
                  value={money(totalCoins)}
                  note="Authoritative ledger balance"
                  icon={<Banknote size={22} />}
                  tone="green"
                />
                <Stat
                  title="Cafeteria transactions"
                  value={money(paid)}
                  note="Meal coins spent to date"
                  icon={<ShoppingBag size={22} />}
                  tone="amber"
                />
                <Stat
                  title="Reader hardware"
                  value={
                    readerState === 'connected'
                      ? (readerMode === 'mqtt' ? (reader.isEspOnline ? 'WiFi Online' : 'Broker Connected') : 'USB Connected')
                      : 'Offline'
                  }
                  note={
                    readerMode === 'mqtt'
                      ? (readerState === 'connected'
                          ? (reader.isEspOnline ? 'ESP32 reader ready via MQTT' : 'MQTT Broker ready · ESP32 standby')
                          : 'WiFi / MQTT mode · Click Connect')
                      : (Esp32SerialBridge.supported
                          ? (readerState === 'connected' ? 'Ready over USB Serial' : 'Click Connect ESP32 to pair')
                          : 'Web Serial not supported in this browser')
                  }
                  icon={readerMode === 'mqtt' ? <Wifi size={22} /> : <CreditCard size={22} />}
                  tone="purple"
                />
              </div>

              <div className="overview-grid">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Recent transactions</h2>
                      <p className="muted">Live student payments & wallet top-ups</p>
                    </div>
                    <button
                      type="button"
                      className="secondary small-button"
                      onClick={() => setPage('Transactions')}
                    >
                      View all ({transactions.length})
                    </button>
                  </div>
                  <TransactionTable
                    txs={transactions.slice(0, 6)}
                    students={students}
                  />
                </section>

                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Wallet distribution</h2>
                      <p className="muted">Students by balance range</p>
                    </div>
                  </div>
                  <div className="distribution">
                    {[
                      [
                        'Healthy balance',
                        students.filter((s) => s.coins >= 20).length,
                        '#22b981',
                      ],
                      [
                        'Running low',
                        students.filter((s) => s.coins > 0 && s.coins < 20).length,
                        '#f5a524',
                      ],
                      [
                        'Empty wallet',
                        students.filter((s) => s.coins === 0).length,
                        '#ef6262',
                      ],
                    ].map(([label, count, color]) => (
                      <div className="dist-row" key={String(label)}>
                        <div className="dist-label">
                          <span style={{ background: String(color) }} />
                          {label}
                          <b>{count}</b>
                        </div>
                        <div className="progress">
                          <span
                            style={{
                              width: (students.length ? (Number(count) / students.length) * 100 : 0) + '%',
                              background: String(color),
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}

          {page === 'Students' && (
            showAddStudent ? (
              <StudentRegistration
                db={db}
                authenticated={Boolean(db && session)}
                readerState={readerState}
                readerDetail={readerDetail}
                readerMode={readerMode}
                onToggleMode={handleToggleReaderMode}
                onOpenMqttSettings={() => setShowMqttSettings(true)}
                subscribeReader={(cb) => reader.subscribe(cb)}
                connectReader={() => reader.connect()}
                disconnectReader={() => reader.disconnect()}
                scanCard={() => reader.scanCard()}
                writeStudent={async (uid, student) => {
                  await reader.writeStudent(uid, student);
                }}
                onCancel={() => {
                  setShowAddStudent(false);
                  setNewStudentCardUid('');
                }}
                onRegistered={async () => {
                  if (db && session) {
                    await refresh();
                    await loadCards();
                  }
                  notify('Student registered and card activated successfully!');
                }}
                onRegisteredPreview={(student, card) => {
                  const newStudentItem: Student = {
                    id: student.id,
                    student_no: student.student_no,
                    full_name: student.full_name,
                    email: student.email,
                    department: student.department,
                    coins: student.coins,
                    status: 'active',
                    created_at: new Date().toISOString(),
                  };
                  setStudents((prev) => [newStudentItem, ...prev]);
                  if (card) {
                    const newCardItem: NfcCard = {
                      id: card.id,
                      student_id: student.id,
                      uid: card.uid,
                      status: 'active',
                      can_pay: true,
                      can_access: false,
                      can_read: true,
                      can_write: true,
                      chip_type: 'MIFARE Classic 1K',
                      memory_capacity: 752,
                      memory_used: 0,
                      registered_at: new Date().toISOString(),
                      last_seen_at: null,
                    };
                    setCards((prev) => [newCardItem, ...prev.filter((c) => c.uid !== card.uid)]);
                  }
                }}
                initialCard={newStudentCardUid ? { uid: newStudentCardUid, cardType: 'MIFARE Classic 1K' } : null}
              />
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Student directory</h2>
                    <p className="muted">
                      Active student profiles and assigned digital wallets.
                    </p>
                  </div>
                  <span className="badge good">{filtered.length} students</span>
                </div>

                <div className="table-toolbar">
                  <div className="searchbox">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search name, ID, email, or department…"
                    />
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>STUDENT</th>
                        <th>STUDENT ID</th>
                        <th>DEPARTMENT</th>
                        <th>WALLET BALANCE</th>
                        <th>STATUS</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="student-cell">
                              <div className="avatar student-avatar">
                                {initials(s.full_name)}
                              </div>
                              <div>
                                <b>{s.full_name}</b>
                                <small>{s.email || 'No email provided'}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <code>{s.student_no}</code>
                          </td>
                          <td>{s.department || '—'}</td>
                          <td>
                            <b>{money(Number(s.coins))}</b>
                          </td>
                          <td>
                            <span
                              className={
                                'badge ' +
                                (s.status === 'active' ? 'good' : 'bad')
                              }
                            >
                              {s.status}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary small-button"
                              onClick={() => setShowTopup(s)}
                            >
                              <Plus size={14} /> Top up
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <div className="empty" style={{ padding: '32px 16px', textAlign: 'center' }}>
                      <Users size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
                      <h3 style={{ margin: '4px 0 6px', fontSize: 16 }}>No students found</h3>
                      <p className="muted" style={{ maxWidth: 440, margin: '0 auto 16px', fontSize: 13 }}>
                        {db && session
                          ? 'Your Supabase database is connected, but has no student records yet. Click below to add your first student or insert sample demo data.'
                          : 'No students match your search filter.'}
                      </p>
                      {db && session && !students.length && (
                        <div className="heading-actions" style={{ justifyContent: 'center' }}>
                          <button type="button" className="primary" onClick={() => setShowAddStudent(true)}>
                            <Plus size={16} /> Add First Student
                          </button>
                          <button type="button" className="secondary" onClick={seedDatabaseWithDemoData} disabled={busy}>
                            <Database size={16} /> Insert Sample Demo Data
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Card Inventory Table directly under Students Directory */}
              {renderCardInventory()}
            </div>
            )
          )}

          {page === 'NFC Management' && (
            <>
              {/* Top Hero Panel: Live Scanner & Data Inspector Stacked Layout */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 24 }}>
                <section className="panel" style={{ background: '#f8fafc', borderColor: '#e2e8f0', padding: 20 }}>
                  <div className="overview-grid" style={{ gridTemplateColumns: 'minmax(260px, 1fr) 280px minmax(260px, 1fr)', gap: 20, alignItems: 'center' }}>
                    {/* Left Column: Title, Info & Hardware Connection */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0 }}>Physical Card Reader & Scanner</h2>
                        <span className={'badge ' + (readerState === 'connected' ? 'good' : 'warn')}>
                          {readerState === 'connected' ? 'ESP32 Connected' : 'Reader Offline'}
                        </span>
                      </div>
                      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                        Tap any physical NFC card on the ESP32 reader to inspect chip hardware & memory data slots.
                      </p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                        {readerState === 'connected' ? (
                          <>
                            <span className="badge good" style={{ padding: '4px 10px', fontSize: 11, gap: 5 }}>
                              <ScanLine size={13} /> Auto-Scan Active
                            </span>
                            <button type="button" className="secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => void reader.disconnect()}>
                              <Unplug size={13} /> Disconnect
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="primary"
                            disabled={readerState === 'unsupported'}
                            style={{ padding: '6px 14px', fontSize: 12 }}
                            onClick={async () => {
                              try {
                                await reader.connect();
                                notify('ESP32 connected! Continuous auto-scanning active.');
                              } catch (err) {
                                notify(err instanceof Error ? err.message : 'Could not connect ESP32.');
                              }
                            }}
                          >
                            <Plug size={14} /> Connect ESP32 & Auto-Scan
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Center Column: Animated Reader Visual */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                      <div className={'kiosk-status-pill ' + (scanHold ? 'listening' : '')} style={{ marginBottom: 4 }}>
                        <span className="kiosk-status-dot" />
                        {scanHold
                          ? 'WAITING TO SCAN CARD…'
                          : readerState === 'connected'
                          ? 'READER READY'
                          : 'CONNECT READER TO SCAN'}
                      </div>
                      <div
                        className={'nfc-visual ' + (scanHold ? 'scanning' : '')}
                        style={{ width: '100%', maxWidth: 280, height: 100, margin: 0 }}
                      >
                        <div className="nfc-ring ring-one" style={{ width: 66, height: 66 }} />
                        <div className="nfc-ring ring-two" style={{ width: 90, height: 90 }} />
                        <div className="nfc-center" style={{ width: 40, height: 40, borderRadius: 12 }}>
                          <CreditCard size={22} />
                        </div>
                        <div className="nfc-caption" style={{ bottom: 6, fontSize: 10 }}>
                          {scanHold
                            ? 'Approach card to reader…'
                            : lastScannedTag
                            ? `Last tag: ${lastScannedTag.uid}`
                            : 'Tap card on reader'}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Tag Status & Demo Simulation */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div>
                        <h3 style={{ margin: '0 0 2px', fontSize: 14 }}>
                          {scanHold
                            ? 'Waiting to scan card…'
                            : lastScannedTag
                            ? 'Scanned Card (' + lastScannedTag.uid + ')'
                            : 'Reader Ready'}
                        </h3>
                        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                          {scanHold
                            ? 'Approach student NFC card to reader.'
                            : readerState === 'connected'
                            ? 'Continuous scanning is active.'
                            : 'Connect reader to activate scanning.'}
                        </p>
                      </div>
                      <div style={{ marginTop: 2 }}>
                        <span className="tiny muted" style={{ margin: '0 0 4px', display: 'block' }}>Simulate Card Tap (Demo):</span>
                        <div className="kiosk-demo-chips">
                          {cards.slice(0, 3).map((card) => {
                            const student = students.find((s) => s.id === card.student_id);
                            return (
                              <button
                                key={card.id}
                                type="button"
                                className="secondary small-button"
                                style={{ padding: '3px 8px', fontSize: 11 }}
                                onClick={() => {
                                  setLastScannedTag({
                                    uid: card.uid,
                                    cardType: card.chip_type,
                                    scannedAt: new Date().toISOString(),
                                  });
                                  setSelectedNfcCardId(card.id);
                                  setNewCard((prev) => ({ ...prev, uid: card.uid }));
                                  setNfcTab('Card Info');
                                  notify('Simulated scan for card ' + card.uid);
                                }}
                              >
                                Tap {student?.full_name || card.uid}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Scanned Card Full Data Inspector & NFC Management Console Box */}
                <section className="panel" style={{ flex: 1 }}>
                  <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h2>NFC Management & Data Inspector</h2>
                      <p className="muted">Inspect chip hardware, permissions, memory slots, and card payload.</p>
                    </div>
                    {selectedNfcCard && (
                      <span
                        className={
                          'badge ' +
                          (selectedNfcCard.status === 'active'
                            ? 'good'
                            : selectedNfcCard.status === 'lost'
                            ? 'bad'
                            : 'warn')
                        }
                      >
                        {selectedNfcCard.status.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* NFC Management Tool Navigation Tabs */}
                  <div className="nfc-tabs" style={{ marginBottom: 16 }}>
                    {nfcTabs.map(([tabName, Icon]) => (
                      <button
                        key={tabName}
                        type="button"
                        className={'nfc-tab ' + (nfcTab === tabName ? 'active' : '')}
                        onClick={() => setNfcTab(tabName)}
                      >
                        <Icon size={15} />
                        <span>{tabName}</span>
                      </button>
                    ))}
                  </div>

                  {selectedNfcCard ? (
                    <div className="stack" style={{ gap: 14 }}>
                      {nfcTab === 'Card Info' && (
                        <div className="nfc-info-grid">
                          <div>
                            <span>Card UID</span>
                            <b><code>{selectedNfcCard.uid}</code></b>
                          </div>
                          <div>
                            <span>Chip / Tag Hardware</span>
                            <b>{selectedNfcCard.chip_type || 'MIFARE Classic 1K'}</b>
                          </div>
                          <div>
                            <span>Linked Student</span>
                            <b>{selectedNfcStudent?.full_name || 'Unassigned Card'}</b>
                          </div>
                          <div>
                            <span>Student ID & Dept</span>
                            <b>{selectedNfcStudent?.student_no || '—'} {selectedNfcStudent?.department ? '(' + selectedNfcStudent.department + ')' : ''}</b>
                          </div>
                          <div>
                            <span>Email Address</span>
                            <b>{selectedNfcStudent?.email || '—'}</b>
                          </div>
                          <div>
                            <span>Wallet Balance</span>
                            <b style={{ color: '#059669', fontSize: 18 }}>
                              {selectedNfcStudent ? money(Number(selectedNfcStudent.coins)) : '—'}
                            </b>
                          </div>
                          <div>
                            <span>Payment Rights</span>
                            <b>
                              <span className={'badge ' + (selectedNfcCard.can_pay ? 'good' : 'bad')}>
                                {selectedNfcCard.can_pay ? 'Allowed' : 'Blocked'}
                              </span>
                            </b>
                          </div>
                          <div>
                            <span>Campus Access</span>
                            <b>
                              <span className={'badge ' + (selectedNfcCard.can_access ? 'good' : 'bad')}>
                                {selectedNfcCard.can_access ? 'Allowed' : 'Blocked'}
                              </span>
                            </b>
                          </div>
                          <div>
                            <span>Memory Usage</span>
                            <b>{getCardUsedBytes(selectedNfcCard, liveSectorDump, selectedNfcStudent)} / {selectedNfcCard.memory_capacity} bytes</b>
                          </div>
                          <div>
                            <span>Registered Date</span>
                            <b>{time(selectedNfcCard.registered_at)}</b>
                          </div>
                        </div>
                      )}

                      {nfcTab === 'Memory Explorer' && (
                        <div className="nfc-pane" style={{ gap: 16 }}>
                          <div className="nfc-capacity">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                              <span>MIFARE Classic 1K Memory Map (16 Sectors / 64 Blocks)</span>
                              <b>{selectedNfcCard.memory_capacity} bytes total capacity</b>
                            </div>
                            <div className="nfc-capacity-track" style={{ height: 8 }}>
                              <span
                                style={{
                                  width: `${Math.min(
                                    100,
                                    selectedNfcCard.memory_capacity
                                      ? (getCardUsedBytes(selectedNfcCard, liveSectorDump, selectedNfcStudent) / selectedNfcCard.memory_capacity) * 100
                                      : 15
                                  )}%`,
                                }}
                              />
                            </div>
                            <small>
                              {getCardUsedBytes(selectedNfcCard, liveSectorDump, selectedNfcStudent)} bytes active EEPROM storage · 16 sectors · 4 blocks per sector (16 bytes/block)
                            </small>
                          </div>

                          {/* Educational Memory Architecture Banner */}
                          <div className="nfc-capability-note" style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1' }}>
                            <BookOpen size={20} style={{ color: '#0284c7' }} />
                            <div>
                              <b style={{ color: '#0369a1', fontSize: 13 }}>Educational NFC Hardware Architecture (16 Sectors)</b>
                              <p style={{ color: '#334155', marginTop: 4 }}>
                                MIFARE Classic 1K memory is partitioned into <b>16 independent security sectors</b> (Sector 0 to Sector 15).
                                Each sector contains <b>4 memory blocks</b> (16 bytes per block = 64 blocks total). 
                                Block 3 in each sector is the <b>Sector Trailer</b> containing Key A password, Access Bits, and Key B.
                              </p>
                            </div>
                          </div>

                          <div className="heading-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <b style={{ fontSize: 14 }}>16-Sector Hardware Memory Inspector</b>
                            <button
                              type="button"
                              className="primary"
                              disabled={readingSectors}
                              onClick={handleDumpSectors}
                            >
                              <ScanLine size={16} />
                              {readingSectors ? 'Reading 16 Sectors over SPI…' : 'Read Physical 16 Sectors / 64 Blocks'}
                            </button>
                          </div>

                          {/* Render 16 Sectors */}
                          <div className="stack" style={{ gap: 14 }}>
                            {Array.from({ length: 16 }).map((_, sectorIndex) => {
                              const startBlock = sectorIndex * 4;
                              const sectorDumpObj = liveSectorDump?.sectors.find((s) => s.sector === sectorIndex);
                              
                              const getBlockHex = (blockNum: number) => {
                                if (sectorDumpObj) {
                                  const b = sectorDumpObj.blocks.find((x) => x.block === blockNum);
                                  if (b) return b.hex;
                                }
                                if (blockNum === 0) return '04 A1 B2 C3 D4 08 04 00 62 63 64 65 66 67 68 69';
                                if (blockNum === 4) return '43 50 41 59 01 00 00 00 00 00 00 00 00 00 00 00';
                                if (blockNum === 5) {
                                  const idStr = selectedNfcStudent?.student_no || 'STU-2026-001';
                                  return idStr.split('').map((c) => c.charCodeAt(0).toString(16).toUpperCase()).join(' ').padEnd(47, ' 00');
                                }
                                if (blockNum === 6) {
                                  const nameStr = selectedNfcStudent?.full_name || 'Amira Ben Salem';
                                  return nameStr.split('').map((c) => c.charCodeAt(0).toString(16).toUpperCase()).join(' ').slice(0, 47).padEnd(47, ' 00');
                                }
                                if (blockNum === 8) {
                                  const coins = selectedNfcStudent?.coins || 42;
                                  const hexCoins = coins.toString(16).toUpperCase().padStart(2, '0');
                                  return `00 00 00 ${hexCoins} 00 00 00 00 00 00 00 00 00 00 00 00`;
                                }
                                if ((blockNum + 1) % 4 === 0) return 'FF FF FF FF FF FF FF 07 80 69 FF FF FF FF FF FF';
                                return '00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00';
                              };

                              const getBlockRole = (blockNum: number) => {
                                if (blockNum === 0) return { title: 'Manufacturer Block (UID & Hardware ID)', tag: 'READ-ONLY HARDWARE LOCK', tone: 'warn' };
                                if (blockNum === 4) return { title: 'Header Slot (CPAY Signature v1.0)', tag: 'APPLICATION HEADER', tone: 'good' };
                                if (blockNum === 5) return { title: 'Student ID Slot', tag: 'STUDENT IDENTIFIER', tone: 'good' };
                                if (blockNum === 6) return { title: 'Student Name Slot', tag: 'FULL NAME PAYLOAD', tone: 'good' };
                                if (blockNum === 8) return { title: 'Wallet Coins Snapshot Slot', tag: 'COINS BALANCE', tone: 'good' };
                                if ((blockNum + 1) % 4 === 0) return { title: `Sector Trailer ${sectorIndex} (Key A & Access Bits)`, tag: 'SECURITY TRAILER', tone: 'bad' };
                                return { title: `Data Block ${blockNum}`, tag: 'USER STORAGE SLOT', tone: 'neutral' };
                              };

                              return (
                                <div
                                  key={sectorIndex}
                                  style={{
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 8,
                                    padding: 14,
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <div>
                                      <b style={{ fontSize: 13, color: '#1e293b' }}>
                                        Sector {sectorIndex} <span className="muted" style={{ fontWeight: 400 }}>(Blocks {startBlock} – {startBlock + 3})</span>
                                      </b>
                                      <span style={{ marginLeft: 10, fontSize: 11, color: sectorIndex === 1 ? '#0284c7' : sectorIndex === 2 ? '#059669' : '#64748b' }}>
                                        {sectorIndex === 0
                                          ? '• Factory Manufacturer & Hardware Security Sector'
                                          : sectorIndex === 1
                                          ? '• Student Credentials & Identity Sector'
                                          : sectorIndex === 2
                                          ? '• Campus Wallet Coins & Balance Sector'
                                          : '• General Purpose EEPROM Storage Sector'}
                                      </span>
                                    </div>
                                    <span className="badge" style={{ fontSize: 10 }}>
                                      Sector Key: FF FF FF FF FF FF
                                    </span>
                                  </div>

                                  <div className="table-wrap">
                                    <table style={{ width: '100%', fontSize: 12 }}>
                                      <thead>
                                        <tr style={{ background: '#f8fafc', textTransform: 'uppercase', fontSize: 10 }}>
                                          <th style={{ width: 90 }}>BLOCK #</th>
                                          <th style={{ width: 230 }}>SLOT ROLE / PURPOSE</th>
                                          <th>16-BYTE RAW HEX DUMP</th>
                                          <th style={{ width: 160 }}>ASCII TEXT</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {[0, 1, 2, 3].map((offset) => {
                                          const blockNum = startBlock + offset;
                                          const hexData = getBlockHex(blockNum);
                                          const asciiData = hexToAscii(hexData);
                                          const role = getBlockRole(blockNum);

                                          return (
                                            <tr key={blockNum}>
                                              <td>
                                                <b><code>Block {blockNum}</code></b>
                                              </td>
                                              <td>
                                                <div style={{ display: 'grid', gap: 2 }}>
                                                  <b>{role.title}</b>
                                                  <span className={`badge ${role.tone}`} style={{ fontSize: 9, width: 'fit-content' }}>
                                                    {role.tag}
                                                  </span>
                                                </div>
                                              </td>
                                              <td>
                                                <code style={{ fontSize: 11, color: '#2563eb', wordBreak: 'break-all' }}>
                                                  {hexData}
                                                </code>
                                              </td>
                                              <td>
                                                <code style={{ fontSize: 11, color: '#059669' }}>
                                                  {asciiData}
                                                </code>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {nfcTab === 'Read / Write' && (() => {
                        const cardNorm = selectedNfcCard.uid.replace(/[^0-9a-f]/gi, '').toUpperCase();
                        const activeRecords = cardRecords[cardNorm] || cardRecords[selectedNfcCard.uid] || [];
                        const latestRecord = activeRecords[0];

                        return (
                          <div className="nfc-pane" style={{ gap: 16 }}>
                            {/* Action Header Banner */}
                            <div className="nfc-records-header">
                              <div>
                                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Smartphone size={18} style={{ color: '#38bdf8' }} />
                                  Physical Card Records (NDEF & Memory Data)
                                </h3>
                                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                                  Write custom records (Text, URL, Payment Link, Social networks, Video, File, Application) directly to card {selectedNfcCard.uid}.
                                </p>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  className="nfc-record-btn primary"
                                  onClick={() => setShowAddRecordModal(true)}
                                  style={{ padding: '8px 14px', fontSize: 12 }}
                                >
                                  <Plus size={15} /> Add a record
                                </button>
                                <button
                                  type="button"
                                  className="nfc-record-btn"
                                  disabled={readingSectors}
                                  onClick={handleDumpSectors}
                                  style={{ padding: '8px 14px', fontSize: 12 }}
                                >
                                  <ScanLine size={15} /> {readingSectors ? 'Reading SPI...' : 'Read Live Slots'}
                                </button>
                              </div>
                            </div>

                            {/* Active Records on Card List */}
                            <div className="nfc-records-container">
                              {activeRecords.length > 0 ? (
                                activeRecords.map((rec) => {
                                  const menuItem = getRecordMenuItems().find((m) => m.type === rec.type);
                                  const IconComponent = menuItem ? menuItem.icon : FileText;
                                  const isUrl = rec.formattedValue.startsWith('http://') || rec.formattedValue.startsWith('https://');

                                  return (
                                    <div className="nfc-record-card" key={rec.id}>
                                      <div className="nfc-record-card-left">
                                        <div className="nfc-record-card-icon">
                                          <IconComponent size={20} />
                                        </div>
                                        <div className="nfc-record-card-body">
                                          <b>
                                            <span>{rec.title}</span>
                                            <span className="nfc-record-badge">{rec.type}</span>
                                          </b>
                                          <span title={rec.formattedValue}>
                                            {rec.formattedValue}
                                          </span>
                                          <small style={{ fontSize: 10, color: '#64748b' }}>
                                            Encoded in physical blocks · {rec.bytes} bytes · Written {time(rec.writtenAt)}
                                          </small>
                                        </div>
                                      </div>
                                      <div className="nfc-record-card-actions">
                                        {isUrl && (
                                          <a
                                            href={rec.formattedValue}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="nfc-record-btn"
                                            title="Open link in browser"
                                          >
                                            <ExternalLink size={13} />
                                          </a>
                                        )}
                                        <button
                                          type="button"
                                          className="nfc-record-btn"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(rec.formattedValue);
                                            notify('Record value copied to clipboard!');
                                          }}
                                          title="Copy record payload"
                                        >
                                          <Copy size={13} />
                                        </button>
                                        <button
                                          type="button"
                                          className="nfc-record-btn"
                                          onClick={() => void handleWriteRecord(rec)}
                                          title="Rewrite this record to card"
                                        >
                                          <Smartphone size={13} /> Write
                                        </button>
                                        <button
                                          type="button"
                                          className="nfc-record-btn danger"
                                          onClick={() => handleDeleteRecord(rec.id)}
                                          title="Remove record"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div
                                  style={{
                                    padding: '16px 18px',
                                    background: '#141f30',
                                    border: '1px dashed #28374d',
                                    borderRadius: 10,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 16,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div
                                      style={{
                                        width: 38,
                                        height: 38,
                                        borderRadius: 8,
                                        background: '#162b20',
                                        color: '#86efac',
                                        display: 'grid',
                                        placeItems: 'center',
                                        flexShrink: 0,
                                      }}
                                    >
                                      <Users size={20} />
                                    </div>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span>Student Identity Record</span>
                                        <span className="nfc-record-badge student">Default Profile</span>
                                      </div>
                                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                        {selectedNfcStudent
                                          ? `${selectedNfcStudent.full_name} (${selectedNfcStudent.student_no}) · ${selectedNfcStudent.coins} coins ledger snapshot`
                                          : `Unassigned card ${selectedNfcCard.uid} · Ready for custom records or student registration`}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="nfc-record-btn primary"
                                    onClick={() => setShowAddRecordModal(true)}
                                  >
                                    <Plus size={14} /> Add record
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Data Slots Allocation Map Table */}
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Physical MIFARE Classic 1K Slot Allocation Map
                              </div>
                              <div className="nfc-record-list">
                                <div className="nfc-table-heading">
                                  <span>BLOCK #</span>
                                  <span>MEMORY SLOT PURPOSE</span>
                                  <span>ENCODED DATA VALUE</span>
                                  <span>HARDWARE RAW HEX SLOTS</span>
                                </div>
                                <div className="nfc-record-row">
                                  <code>Block 0</code>
                                  <b>Manufacturer Lock Slot</b>
                                  <span>Hardware Card UID: <code>{selectedNfcCard.uid}</code></span>
                                  <code>{selectedNfcCard.uid.replace(/:/g, ' ')} 08 04 00...</code>
                                </div>
                                <div className="nfc-record-row">
                                  <code>Block 4</code>
                                  <b>Header Slot</b>
                                  <span>Signature `CPAY` (Protocol v1.0)</span>
                                  <code>43 50 41 59 01 00 00 00...</code>
                                </div>
                                <div className="nfc-record-row">
                                  <code>Block 5</code>
                                  <b>{latestRecord ? `${latestRecord.type} Identifier` : 'Student ID Slot'}</b>
                                  <span>
                                    {latestRecord
                                      ? `REC:${latestRecord.type}`
                                      : (selectedNfcStudent?.student_no || 'STU-2026-001')}
                                  </span>
                                  <code>
                                    {(latestRecord
                                      ? `REC:${latestRecord.type}`
                                      : (selectedNfcStudent?.student_no || 'STU-2026-001')
                                    )
                                      .slice(0, 16)
                                      .split('')
                                      .map((c) => c.charCodeAt(0).toString(16).toUpperCase())
                                      .join(' ')}
                                  </code>
                                </div>
                                <div className="nfc-record-row">
                                  <code>Block 6</code>
                                  <b>{latestRecord ? `${latestRecord.type} Payload Slot` : 'Student Name Slot'}</b>
                                  <span title={latestRecord ? latestRecord.formattedValue : (selectedNfcStudent?.full_name || 'Amira Ben Salem')}>
                                    {latestRecord
                                      ? latestRecord.formattedValue
                                      : (selectedNfcStudent?.full_name || 'Amira Ben Salem')}
                                  </span>
                                  <code>
                                    {(latestRecord
                                      ? latestRecord.formattedValue
                                      : (selectedNfcStudent?.full_name || 'Amira Ben Salem')
                                    )
                                      .slice(0, 16)
                                      .split('')
                                      .map((c) => c.charCodeAt(0).toString(16).toUpperCase())
                                      .join(' ')}
                                  </code>
                                </div>
                                <div className="nfc-record-row">
                                  <code>Block 7</code>
                                  <b>Sector Trailer 1</b>
                                  <span>Key A Security Trailer</span>
                                  <code>FF FF FF FF FF FF FF 07 80 69</code>
                                </div>
                                <div className="nfc-record-row">
                                  <code>Block 8</code>
                                  <b>Coins Snapshot Slot</b>
                                  <span>{selectedNfcStudent ? `${selectedNfcStudent.coins} coins` : '42 coins'} (Synchronized with Database)</span>
                                  <code>00 00 00 {(selectedNfcStudent?.coins || 42).toString(16).toUpperCase().padStart(2, '0')} 00 00 00 00...</code>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {nfcTab === 'Erase / Reuse Card' && (
                        <div className="nfc-pane" style={{ gap: 14 }}>
                          <div className="nfc-write-warning">
                            <LockKeyhole size={17} />
                            <span>
                              <b>Erase Card Data & Sector Reset</b>
                              This command wipes all MIFARE Classic 1K data sectors (Blocks 4 to 63) back to zeroes and unassigns the card from Supabase so it can be re-registered to any student.
                            </span>
                          </div>
                          <div className="heading-actions">
                            <button
                              type="button"
                              className="secondary"
                              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                              onClick={() => void eraseCard(selectedNfcCard)}
                            >
                              <Trash2 size={16} /> Erase Physical Memory & Delete Record
                            </button>
                          </div>
                        </div>
                      )}

                      {nfcTab === 'Diagnostics' && (
                        <div className="nfc-pane" style={{ gap: 14 }}>
                          <div className="nfc-diagnostic-list">
                            <div className="nfc-diagnostic-row">
                              <span className="nfc-diagnostic-icon"><Radio size={17} /></span>
                              <div>
                                <b>Web Serial API Status</b>
                                <small>{readerState === 'connected' ? 'Connected at 115200 baud' : readerState}</small>
                              </div>
                              <span className={'nfc-diagnostic-status ' + (readerState === 'connected' ? 'good' : '')}>
                                {readerState === 'connected' ? 'READY' : 'OFFLINE'}
                              </span>
                            </div>
                            <div className="nfc-diagnostic-row">
                              <span className="nfc-diagnostic-icon"><Smartphone size={17} /></span>
                              <div>
                                <b>RC522 RFID SPI Module</b>
                                <small>SPI Pins: SDA=GPIO5, SCK=18, MOSI=23, MISO=19, RST=22</small>
                              </div>
                              <span className="nfc-diagnostic-status good">OK</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {nfcTab === 'Card Recovery' && (
                        <div className="nfc-pane" style={{ gap: 14 }}>
                          <div className="nfc-safe-recovery">
                            <div>
                              <b>Selected Card: {selectedNfcCard.uid}</b>
                              <span>Mark lost to suspend card credentials safely in Supabase.</span>
                            </div>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() =>
                                void updateCard(selectedNfcCard, {
                                  status: selectedNfcCard.status === 'active' ? 'disabled' : 'active',
                                })
                              }
                            >
                              {selectedNfcCard.status === 'active' ? <Lock size={15} /> : <Unlock size={15} />}
                              {selectedNfcCard.status === 'active' ? 'Lock Card' : 'Unlock Card'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Common Footer Actions */}
                      <div className="heading-actions" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            void updateCard(selectedNfcCard, {
                              status: selectedNfcCard.status === 'active' ? 'disabled' : 'active',
                            })
                          }
                        >
                          {selectedNfcCard.status === 'active' ? <Lock size={15} /> : <Unlock size={15} />}
                          {selectedNfcCard.status === 'active' ? 'Lock Card' : 'Unlock Card'}
                        </button>

                        <button
                          type="button"
                          className="secondary"
                          style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                          onClick={() => void eraseCard(selectedNfcCard)}
                        >
                          <Trash2 size={15} /> Erase Card & Unassign
                        </button>

                        {!selectedNfcCard.student_id && (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => {
                              setNewStudentCardUid(selectedNfcCard.uid);
                              setPage('Students');
                              setShowAddStudent(true);
                            }}
                          >
                            <Plus size={15} /> Assign to Student
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="empty">Scan or select a card to inspect data.</div>
                  )}
                </section>
              </div>
            </>
          )}

{page === 'Transactions' && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Transaction ledger</h2>
                  <p className="muted">A chronological record of wallet activity.</p>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    const csv = [
                      [
                        'Time',
                        'Student',
                        'Student ID',
                        'Type',
                        'Amount',
                        'Description',
                      ],
                      ...transactions.map((t) => {
                        const s = students.find((x) => x.id === t.student_id);
                        return [
                          t.created_at,
                          s?.full_name || t.students?.full_name || 'Unknown',
                          s?.student_no || t.students?.student_no || '',
                          t.kind,
                          String(t.amount),
                          t.description || '',
                        ];
                      }),
                    ]
                      .map((r) =>
                        r
                          .map((x) => `"${String(x).replaceAll('"', '""')}"`)
                          .join(',')
                      )
                      .join('\n');
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(
                      new Blob([csv], { type: 'text/csv' })
                    );
                    a.download = 'campuspay-transactions.csv';
                    a.click();
                  }}
                >
                  <Download size={16} /> Export ledger
                </button>
              </div>
              <TransactionTable
                txs={transactions}
                students={students}
                full
              />
            </section>
          )}

          {page === 'Meal Terminal' && (
            <div className="meal-kiosk-wrap">
              <section
                className={
                  'meal-kiosk-card ' +
                  (terminalResult ? terminalResult.status : '')
                }
              >
                {!terminalResult && (
                  <>
                    <div
                      className={
                        'kiosk-status-pill ' + (scanHold ? 'listening' : '')
                      }
                    >
                      <span className="kiosk-status-dot" />
                      {scanHold
                        ? 'WAITING TO SCAN CARD…'
                        : readerState === 'connected'
                        ? 'READER READY'
                        : 'CONNECT READER TO SCAN'}
                    </div>

                    <div
                      className="nfc-visual scanning"
                      style={{ width: '100%', margin: '6px 0' }}
                    >
                      <div className="nfc-ring ring-one" />
                      <div className="nfc-ring ring-two" />
                      <div className="nfc-center">
                        <CreditCard size={42} />
                      </div>
                      <div className="nfc-caption">
                        {scanHold
                          ? 'Approach your card to the reader…'
                          : 'Tap card on reader'}
                      </div>
                    </div>

                    <h2 className="kiosk-title">Waiting to scan…</h2>
                    <p className="kiosk-subtitle">
                      Please approach your student NFC card to the reader.{' '}
                      <b>1 coin</b> will be automatically deducted from your card
                      and wallet.
                    </p>

                    <div className="kiosk-meal-badge">
                      <ShoppingBag size={15} />
                      <span>1 Meal = 1 Coin</span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        width: '100%',
                        justifyContent: 'center',
                        marginTop: '6px',
                      }}
                    >
                      {readerState !== 'connected' ? (
                        <button
                          className="primary"
                          disabled={readerMode === 'serial' && readerState === 'unsupported'}
                          onClick={() => void listenForMealCard()}
                        >
                          <Plug size={16} /> Connect {readerMode === 'mqtt' ? 'WiFi MQTT' : 'ESP32'} & Start Scanning
                        </button>
                      ) : !scanHold ? (
                        <button
                          className="primary"
                          onClick={() => void listenForMealCard()}
                        >
                          <ScanLine size={16} /> Ready — Click to Scan Card
                        </button>
                      ) : null}
                    </div>

                    {cards.length > 0 && (
                      <div className="kiosk-demo-bar">
                        <span className="tiny muted">
                          Quick test tap (simulate card approach):
                        </span>
                        <div className="kiosk-demo-chips">
                          {cards.slice(0, 4).map((c) => {
                            const st = students.find(
                              (s) => s.id === c.student_id
                            );
                            return (
                              <button
                                key={c.id}
                                type="button"
                                className="secondary small-button"
                                onClick={() => void processMealByUid(c.uid)}
                              >
                                <CreditCard size={13} />{' '}
                                {st ? st.full_name : c.uid}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {terminalResult?.status === 'approved' && (
                  <>
                    <div className="kiosk-status-pill approved">
                      <Check size={13} /> MEAL APPROVED
                    </div>

                    <div className="kiosk-success-avatar">
                      <Check size={42} strokeWidth={2.6} />
                    </div>

                    <h2 className="kiosk-title">
                      Welcome, {terminalResult.studentName}!
                    </h2>
                    <p className="kiosk-enjoy">
                      {terminalResult.message} 🍽️
                    </p>

                    <div className="kiosk-deduction-pill">
                      −1 coin deducted from card & database
                    </div>

                    <div className="kiosk-balance-card">
                      <span>Remaining Balance</span>
                      <b>{money(terminalResult.remainingCoins ?? 0)}</b>
                    </div>

                    <button
                      className="secondary"
                      style={{ marginTop: '8px' }}
                      onClick={() => setTerminalResult(null)}
                    >
                      Scan next student
                    </button>
                  </>
                )}

                {terminalResult?.status === 'declined' && (
                  <>
                    <div className="kiosk-status-pill declined">
                      <X size={13} /> PAYMENT DECLINED
                    </div>

                    <div className="kiosk-error-avatar">
                      <CircleAlert size={40} />
                    </div>

                    <h2 className="kiosk-title">
                      {terminalResult.studentName}
                    </h2>
                    <p className="kiosk-subtitle" style={{ color: '#b43c3c' }}>
                      {terminalResult.message}
                    </p>

                    {typeof terminalResult.remainingCoins === 'number' && (
                      <div className="kiosk-balance-card">
                        <span>Current Balance</span>
                        <b>{money(terminalResult.remainingCoins)}</b>
                      </div>
                    )}

                    <button
                      className="primary"
                      style={{ marginTop: '8px' }}
                      onClick={() => setTerminalResult(null)}
                    >
                      Back to scanner
                    </button>
                  </>
                )}
              </section>
            </div>
          )}

          {page === 'Settings' && (
            <div className="settings-grid">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Database connection</h2>
                    <p className="muted">
                      CampusPay persistence and authentication.
                    </p>
                  </div>
                  <Activity />
                </div>
                <div className="setting-row">
                  <div className="setting-icon">
                    <BookOpen />
                  </div>
                  <div className="grow">
                    <b>Supabase project</b>
                    <p>
                      {db
                        ? 'Project URL configured'
                        : 'Not configured — running local preview data'}
                    </p>
                  </div>
                  <span
                    className={
                      'badge ' +
                      (db && session
                        ? 'good'
                        : db
                        ? 'warn'
                        : 'warn')
                    }
                  >
                    {db && session
                      ? 'Connected'
                      : db
                      ? 'Sign-in required'
                      : 'Setup needed'}
                  </span>
                </div>
                <div className="setting-row">
                  <div className="setting-icon">
                    <ShieldCheck />
                  </div>
                  <div className="grow">
                    <b>Authentication</b>
                    <p>Admin sign-in and row-level security</p>
                  </div>
                  <span className="badge good">Designed</span>
                </div>
                <div className="setting-row">
                  <div className="setting-icon">
                    <Banknote />
                  </div>
                  <div className="grow">
                    <b>Wallet ledger</b>
                    <p>Atomic top-ups and payment transactions</p>
                  </div>
                  <span className="badge good">SQL included</span>
                </div>
              </section>

              <section className="panel">
                <h2>Getting to production</h2>
                <ol className="setup-list">
                  <li>
                    <b>Create a Supabase project</b>
                    <p>
                      Open the SQL Editor and run <code>supabase/schema.sql</code>.
                    </p>
                  </li>
                  <li>
                    <b>Configure environment</b>
                    <p>
                      Copy <code>.env.example</code> to <code>.env</code> and
                      enter your project URL and public anon key.
                    </p>
                  </li>
                  <li>
                    <b>Create your admin user</b>
                    <p>
                      Create a user in Supabase Authentication, then run the
                      admin-role SQL in the README.
                    </p>
                  </li>
                  <li>
                    <b>Connect your NFC reader</b>
                    <p>
                      Connect your ESP32 DevKit via USB and use Chrome or Edge.
                    </p>
                  </li>
                </ol>
                <button
                  className="secondary full"
                  onClick={() =>
                    notify(
                      'See README.md in the project for the complete setup steps.'
                    )
                  }
                >
                  <CircleHelp size={16} /> Setup help
                </button>
              </section>
            </div>
          )}
        </div>

        <footer className="footer">
          <span>© 2026 CampusPay</span>
          <span>
            <ShieldCheck size={14} /> Secure campus payments ·{' '}
            {db && session ? 'Live database' : 'Preview mode'}
          </span>
        </footer>
      </main>

      {showTopup && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowTopup(null);
          }}
        >
          <form className="modal compact-modal" onSubmit={topup}>
            <div className="modal-head">
              <div>
                <h2>Top up wallet</h2>
                <p className="muted">
                  Add coins to {showTopup.full_name}’s wallet.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowTopup(null)}
              >
                <X />
              </button>
            </div>
            <div className="balance-box">
              <span>Current balance</span>
              <b>{money(showTopup.coins)}</b>
            </div>
            <label>
              Coins to add
              <input
                type="number"
                min="1"
                step="1"
                required
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
              />
            </label>
            <div className="quick-amounts">
              {[5, 10, 20, 50].map((n) => (
                <button
                  type="button"
                  key={n}
                  className="amount-chip"
                  onClick={() => setTopupAmount(String(n))}
                >
                  +{n}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowTopup(null)}
              >
                Cancel
              </button>
              <button className="primary">
                <Plus size={16} /> Add coins
              </button>
            </div>
          </form>
        </div>
      )}

      <MqttSettingsModal
        isOpen={showMqttSettings}
        onClose={() => setShowMqttSettings(false)}
        config={reader.getMqttConfig()}
        onSave={(newCfg) => {
          reader.setMqttConfig(newCfg);
          notify('MQTT configuration updated.');
        }}
        isEspOnline={reader.isEspOnline}
        espDetails={reader.espDetails}
      />

      <NfcAddRecordModal
        isOpen={showAddRecordModal}
        onClose={() => setShowAddRecordModal(false)}
        targetCard={selectedNfcCard}
        student={selectedNfcStudent}
        readerState={readerState}
        readerMode={readerMode}
        onWriteRecord={handleWriteRecord}
        connectReader={() => reader.connect()}
      />

      {notice && (
        <div className="toast">
          <Check size={17} />
          {notice}
          <button
            className="toast-close"
            onClick={() => setNotice('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function NfcRight({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="nfc-right">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <b>{label}</b>
        <small>{detail}</small>
      </span>
    </label>
  );
}

function Stat({
  title,
  value,
  note,
  icon,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <div className={'stat-icon ' + tone}>{icon}</div>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

function TransactionTable({
  txs,
  students,
  full = false,
}: {
  txs: Tx[];
  students: Student[];
  full?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>STUDENT</th>
            <th>TRANSACTION</th>
            <th>DATE & TIME</th>
            <th className="right">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          {txs.map((t) => {
            const s = students.find((x) => x.id === t.student_id);
            const name = s?.full_name || t.students?.full_name || 'Student';
            return (
              <tr key={t.id}>
                <td>
                  <div className="student-cell">
                    <div className="avatar mini-avatar">{initials(name)}</div>
                    <div>
                      <b>{name}</b>
                      <small>
                        {s?.student_no ||
                          t.students?.student_no ||
                          'Student wallet'}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="transaction-type">
                    <span className={'tx-icon ' + (t.amount >= 0 ? 'in' : 'out')}>
                      {t.amount >= 0 ? (
                        <ArrowDownLeft size={15} />
                      ) : (
                        <ArrowUpRight size={15} />
                      )}
                    </span>
                    <div>
                      <b>
                        {t.kind === 'topup'
                          ? 'Wallet top-up'
                          : t.kind === 'payment'
                          ? 'Cafeteria payment'
                          : t.kind}
                      </b>
                      <small>{t.description || '—'}</small>
                    </div>
                  </div>
                </td>
                <td className="muted">{time(t.created_at)}</td>
                <td
                  className={
                    'right amount ' + (t.amount >= 0 ? 'positive' : 'negative')
                  }
                >
                  {t.amount >= 0 ? '+' : '−'}
                  {money(Math.abs(t.amount))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!txs.length && <div className="empty">No transactions yet.</div>}
      {full && (
        <div className="table-foot">
          Showing {txs.length} recent ledger entries.
        </div>
      )}
    </div>
  );
}
