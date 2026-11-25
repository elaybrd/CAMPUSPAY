import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Compass,
  Copy,
  ExternalLink,
  File,
  FileText,
  Layers,
  Link2,
  LoaderCircle,
  Mail,
  Package,
  Phone,
  Plug,
  Radio,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Sparkles,
  Users,
  Video,
  Wifi,
  X,
} from 'lucide-react';
import type { Esp32BridgeState } from './esp32Serial';
import type { ReaderMode } from './unifiedReader';
import type { NfcCard, Student } from './App';

export type NfcRecordType =
  | 'Text'
  | 'URL / URI'
  | 'Custom URL / URI'
  | 'Unit.Link'
  | 'Search'
  | 'Payment Link'
  | 'Social networks'
  | 'Video'
  | 'File'
  | 'Application'
  | 'Mail'
  | 'Phone';

export type NfcRecord = {
  id: string;
  cardUid: string;
  type: NfcRecordType;
  title: string;
  value: string;
  formattedValue: string;
  writtenAt: string;
  bytes: number;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetCard: NfcCard;
  availableCards?: NfcCard[];
  student?: Student;
  readerState: Esp32BridgeState;
  readerMode: ReaderMode;
  onWriteRecord: (record: NfcRecord, explicitUid?: string) => Promise<void>;
  connectReader?: () => Promise<void>;
  scanCard?: (timeoutMs?: number) => Promise<{ uid: string; cardType?: string }>;
  subscribeReader?: (listener: (msg: any) => void) => () => void;
}

export function getRecordMenuItems(): Array<{
  type: NfcRecordType;
  title: string;
  subtitle: string;
  icon: React.ComponentType<any>;
}> {
  return [
    { type: 'Text', title: 'Text', subtitle: 'Add a text record', icon: FileText },
    { type: 'URL / URI', title: 'URL / URI', subtitle: 'Add a URL record', icon: Link2 },
    { type: 'Custom URL / URI', title: 'Custom URL / URI', subtitle: 'Add a URI record', icon: Compass },
    { type: 'Unit.Link', title: 'Unit.Link', subtitle: 'Share everything with one link', icon: Layers },
    { type: 'Search', title: 'Search', subtitle: 'Add a link to a search', icon: Search },
    { type: 'Payment Link', title: 'Payment Link', subtitle: 'Add a personal payment link', icon: CircleDollarSign },
    { type: 'Social networks', title: 'Social networks', subtitle: 'Add a social network link', icon: Users },
    { type: 'Video', title: 'Video', subtitle: 'Add a video link', icon: Video },
    { type: 'File', title: 'File', subtitle: 'Add a link to a file', icon: File },
    { type: 'Application', title: 'Application', subtitle: 'Add application record', icon: Package },
    { type: 'Mail', title: 'Mail', subtitle: 'Add an email record', icon: Mail },
    { type: 'Phone', title: 'Phone', subtitle: 'Add a phone number record', icon: Phone },
  ];
}

export function NfcAddRecordModal({
  isOpen,
  onClose,
  targetCard,
  availableCards = [],
  student,
  readerState,
  readerMode,
  onWriteRecord,
  connectReader,
  scanCard,
  subscribeReader,
}: Props) {
  const [selectedType, setSelectedType] = useState<NfcRecordType | null>(null);
  const [activeUid, setActiveUid] = useState(targetCard?.uid || '');
  const [scanningCard, setScanningCard] = useState(false);
  const [writePhase, setWritePhase] = useState<'idle' | 'waiting_card' | 'writing' | 'verified' | 'failed'>('idle');
  const [differentCardUid, setDifferentCardUid] = useState<string | null>(null);
  const [liveScannedBanner, setLiveScannedBanner] = useState<string | null>(null);

  // Sync with targetCard when opened or changed
  useEffect(() => {
    if (targetCard?.uid && (!activeUid || activeUid.startsWith('04:A1:B2'))) {
      setActiveUid(targetCard.uid);
    }
  }, [targetCard?.uid]);

  // Real-time reader listener: Auto-detect any tapped card when modal is open
  useEffect(() => {
    if (!isOpen || !subscribeReader) return;
    const unsub = subscribeReader((msg) => {
      if (msg.type === 'scan_result' && msg.ok && msg.uid) {
        const cleanUid =
          msg.uid
            .replace(/[^0-9a-f]/gi, '')
            .toUpperCase()
            .match(/.{1,2}/g)
            ?.join(':') || msg.uid.toUpperCase();
        setActiveUid(cleanUid);
        setDifferentCardUid(null);
        setLiveScannedBanner(`Physical card detected: ${cleanUid} (${msg.cardType || 'MIFARE Classic 1K'})`);
        setTimeout(() => setLiveScannedBanner(null), 5000);
      }
    });
    return unsub;
  }, [isOpen, subscribeReader]);

  const handleScanCard = async () => {
    if (!scanCard) return;
    setScanningCard(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await scanCard(25000);
      if (res?.uid) {
        const cleanUid =
          res.uid
            .replace(/[^0-9a-f]/gi, '')
            .toUpperCase()
            .match(/.{1,2}/g)
            ?.join(':') || res.uid.toUpperCase();
        setActiveUid(cleanUid);
        setDifferentCardUid(null);
        setLiveScannedBanner(`Card detected & bound: ${cleanUid}`);
        setTimeout(() => setLiveScannedBanner(null), 5000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Scan timed out. Present card closer to the ESP32 antenna.');
    } finally {
      setScanningCard(false);
    }
  };

  // Form states for each record type
  const [textVal, setTextVal] = useState('');
  const [urlProtocol, setUrlProtocol] = useState<'https://' | 'http://'>('https://');
  const [urlVal, setUrlVal] = useState('');
  const [customUriVal, setCustomUriVal] = useState('');
  const [unitLinkUsername, setUnitLinkUsername] = useState('');
  const [searchEngine, setSearchEngine] = useState('Google');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentProvider, setPaymentProvider] = useState('CampusPay');
  const [paymentIdentifier, setPaymentIdentifier] = useState(student ? student.student_no : '');
  const [paymentAmount, setPaymentAmount] = useState('10');
  const [socialPlatform, setSocialPlatform] = useState('Instagram');
  const [socialHandle, setSocialHandle] = useState('');
  const [videoPlatform, setVideoPlatform] = useState('YouTube');
  const [videoUrl, setVideoUrl] = useState('');
  const [fileService, setFileService] = useState('Direct Link');
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [appPlatform, setAppPlatform] = useState('Android');
  const [appPackage, setAppPackage] = useState('com.google.android.apps.walletnfcrel');
  const [mailTo, setMailTo] = useState(student?.email || '');
  const [mailSubject, setMailSubject] = useState('CampusPay Student Inquiry');
  const [phoneVal, setPhoneVal] = useState('+216 ');

  const [writing, setWriting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // Compute the formatted payload for the card based on chosen category
  const computePayload = (): { title: string; rawValue: string; formattedValue: string } => {
    switch (selectedType) {
      case 'Text':
        return {
          title: 'Text Note',
          rawValue: textVal.trim() || 'CampusPay Secure Physical Tag',
          formattedValue: textVal.trim() || 'CampusPay Secure Physical Tag',
        };
      case 'URL / URI': {
        const cleanUrl = urlVal.trim().replace(/^https?:\/\//i, '');
        const fullUrl = cleanUrl ? `${urlProtocol}${cleanUrl}` : `${urlProtocol}campuspay.edu`;
        return {
          title: 'Web Address (URL)',
          rawValue: cleanUrl || 'campuspay.edu',
          formattedValue: fullUrl,
        };
      }
      case 'Custom URL / URI':
        return {
          title: 'Custom URI',
          rawValue: customUriVal.trim() || 'geo:36.8065,10.1815',
          formattedValue: customUriVal.trim() || 'geo:36.8065,10.1815',
        };
      case 'Unit.Link': {
        const u = unitLinkUsername.trim().replace(/^https?:\/\/unit\.link\//i, '') || 'campuspay';
        return {
          title: 'Unit.Link Profile',
          rawValue: u,
          formattedValue: `https://unit.link/${u}`,
        };
      }
      case 'Search': {
        const q = encodeURIComponent(searchQuery.trim() || 'CampusPay Student Portal');
        let searchUrl = `https://www.google.com/search?q=${q}`;
        if (searchEngine === 'DuckDuckGo') searchUrl = `https://duckduckgo.com/?q=${q}`;
        else if (searchEngine === 'Bing') searchUrl = `https://www.bing.com/search?q=${q}`;
        else if (searchEngine === 'Ecosia') searchUrl = `https://www.ecosia.org/search?q=${q}`;
        return {
          title: `${searchEngine} Search`,
          rawValue: searchQuery.trim() || 'CampusPay Student Portal',
          formattedValue: searchUrl,
        };
      }
      case 'Payment Link': {
        let pUrl = `https://campuspay.edu/pay/${paymentIdentifier.trim() || 'STU-001'}`;
        if (paymentProvider === 'PayPal.Me') {
          pUrl = `https://paypal.me/${paymentIdentifier.trim().replace(/^@/, '')}/${paymentAmount || ''}`;
        } else if (paymentProvider === 'Revolut') {
          pUrl = `https://revolut.me/${paymentIdentifier.trim().replace(/^@/, '')}`;
        } else if (paymentProvider === 'Cash App') {
          pUrl = `https://cash.app/$${paymentIdentifier.trim().replace(/^\$/, '')}`;
        }
        return {
          title: `${paymentProvider} Payment Link`,
          rawValue: paymentIdentifier.trim() || 'campuspay',
          formattedValue: pUrl,
        };
      }
      case 'Social networks': {
        const handle = socialHandle.trim().replace(/^@/, '') || 'campuspay';
        let sUrl = `https://instagram.com/${handle}`;
        if (socialPlatform === 'X (Twitter)') sUrl = `https://x.com/${handle}`;
        else if (socialPlatform === 'Facebook') sUrl = `https://facebook.com/${handle}`;
        else if (socialPlatform === 'LinkedIn') sUrl = `https://linkedin.com/in/${handle}`;
        else if (socialPlatform === 'TikTok') sUrl = `https://tiktok.com/@${handle}`;
        else if (socialPlatform === 'YouTube') sUrl = `https://youtube.com/@${handle}`;
        else if (socialPlatform === 'GitHub') sUrl = `https://github.com/${handle}`;
        else if (socialPlatform === 'Telegram') sUrl = `https://t.me/${handle}`;
        else if (socialPlatform === 'WhatsApp') sUrl = `https://wa.me/${handle.replace(/[^0-9]/g, '')}`;
        return {
          title: `${socialPlatform} Profile`,
          rawValue: handle,
          formattedValue: sUrl,
        };
      }
      case 'Video': {
        const cleanVid = videoUrl.trim() || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        return {
          title: `${videoPlatform} Video`,
          rawValue: cleanVid,
          formattedValue: cleanVid,
        };
      }
      case 'File': {
        const fUrl = fileUrl.trim() || 'https://campuspay.edu/docs/handbook.pdf';
        return {
          title: fileName.trim() || 'Attached File Document',
          rawValue: fUrl,
          formattedValue: fUrl,
        };
      }
      case 'Application': {
        const pkg = appPackage.trim() || 'com.campuspay.app';
        const formatted = appPlatform === 'Android' ? `android.com:pkg/${pkg}` : `https://apps.apple.com/app/${pkg}`;
        return {
          title: `${appPlatform} Application Launch`,
          rawValue: pkg,
          formattedValue: formatted,
        };
      }
      case 'Mail': {
        const to = mailTo.trim() || 'admin@campuspay.edu';
        const subj = encodeURIComponent(mailSubject.trim() || 'CampusPay');
        return {
          title: 'Email Address',
          rawValue: to,
          formattedValue: `mailto:${to}?subject=${subj}`,
        };
      }
      case 'Phone': {
        const ph = phoneVal.trim() || '+216 00 000 000';
        return {
          title: 'Phone Number',
          rawValue: ph,
          formattedValue: `tel:${ph.replace(/\s+/g, '')}`,
        };
      }
      default:
        return {
          title: 'Custom Record',
          rawValue: 'CampusPay Tag',
          formattedValue: 'CampusPay Tag',
        };
    }
  };

  const currentPayload = computePayload();
  const estimatedBytes = currentPayload.formattedValue.length + 24;

  const handleWriteToCard = async (overrideUid?: string) => {
    if (!selectedType) return;
    const cardToWriteUid = (overrideUid || activeUid || targetCard?.uid || '').trim();
    if (!cardToWriteUid) {
      setErrorMsg('No card UID selected. Tap your card on the ESP32 reader or click Scan Card.');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setDifferentCardUid(null);
    setWriting(true);
    setWritePhase('waiting_card');

    try {
      const record: NfcRecord = {
        id: crypto.randomUUID(),
        cardUid: cardToWriteUid,
        type: selectedType,
        title: currentPayload.title,
        value: currentPayload.rawValue,
        formattedValue: currentPayload.formattedValue,
        writtenAt: new Date().toISOString(),
        bytes: estimatedBytes,
      };

      setWritePhase('writing');
      await onWriteRecord(record, cardToWriteUid);
      setWritePhase('verified');
      setSuccessMsg(`Record "${selectedType}" successfully written and read back from physical card ${cardToWriteUid}!`);
    } catch (err: any) {
      setWritePhase('failed');
      const raw = err?.message || 'Failed to write record to NFC card.';

      // Check if ESP32 reported a different card UID
      const uidMatch = raw.match(/([0-9a-f]{2}[: ]?){4,7}/i);
      if (raw.toLowerCase().includes('different card') && uidMatch) {
        setDifferentCardUid(uidMatch[0].trim());
      }
      setErrorMsg(raw);
    } finally {
      setWriting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        zIndex: 1050,
        backgroundColor: 'rgba(5, 10, 20, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !writing) onClose();
      }}
    >
      <div
        className="nfc-record-modal-box"
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          backgroundColor: '#161922',
          border: '1px solid #2b3240',
          borderRadius: 14,
          color: '#f1f5f9',
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header - matching photo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #242c38',
            backgroundColor: '#13161c',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => {
                if (selectedType) {
                  setSelectedType(null);
                  setErrorMsg('');
                  setSuccessMsg('');
                } else {
                  onClose();
                }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e2e8f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 4,
                borderRadius: 6,
              }}
              title={selectedType ? 'Back to categories' : 'Close'}
            >
              <ArrowLeft size={20} />
            </button>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
              {selectedType ? `Add ${selectedType}` : 'Add a record'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={writing}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Target Card Subheader Pill */}
        <div
          style={{
            padding: '10px 20px',
            background: '#19202c',
            borderBottom: '1px solid #263142',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#94a3b8',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Smartphone size={13} style={{ color: '#38bdf8' }} />
            <span>Target Card:</span>
            <code
              style={{
                color: '#7dd3fc',
                fontWeight: 700,
                background: '#0c1929',
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid #1e3a5f',
              }}
            >
              {activeUid || targetCard.uid}
            </code>

            {/* Scan Card Button */}
            {scanCard && (
              <button
                type="button"
                onClick={() => void handleScanCard()}
                disabled={scanningCard || writing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  background: scanningCard ? '#0284c7' : '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 4,
                  color: '#e2e8f0',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                title="Tap your physical card on the ESP32 reader to detect its UID"
              >
                {scanningCard ? <LoaderCircle size={12} className="registration-spin" /> : <Radio size={12} />}
                <span>{scanningCard ? 'Waiting for card...' : 'Scan / Tap Card'}</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {readerMode === 'mqtt' ? <Wifi size={12} /> : <Plug size={12} />}
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: readerState === 'connected' ? '#22c55e' : '#eab308',
              }}
            />
            <span style={{ color: readerState === 'connected' ? '#4ade80' : '#facc15' }}>
              {readerState === 'connected' ? 'Hardware Ready' : 'Reader Standby'}
            </span>
          </div>
        </div>

        {/* Live Detected Banner */}
        {liveScannedBanner && (
          <div
            style={{
              padding: '8px 20px',
              background: 'rgba(34, 197, 94, 0.15)',
              borderBottom: '1px solid rgba(34, 197, 94, 0.3)',
              color: '#86efac',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Check size={14} />
            <span>{liveScannedBanner}</span>
          </div>
        )}

        {/* Modal Body */}
        <div
          style={{
            overflowY: 'auto',
            padding: selectedType ? '20px' : '8px 0',
            flex: 1,
          }}
        >
          {/* STEP 1: Main Category Selection Menu - Identical to photo */}
          {!selectedType && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {getRecordMenuItems().map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      setSelectedType(item.type);
                      setErrorMsg('');
                      setSuccessMsg('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 22px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid #1f2733',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#1f2633';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#f8fafc',
                        }}
                      >
                        <Icon size={24} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 2 }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>{item.subtitle}</div>
                      </div>
                    </div>
                    <ChevronRight size={18} style={{ color: '#64748b' }} />
                  </button>
                );
              })}
            </div>
          )}

          {/* STEP 2: Dedicated Form for the chosen Record Type */}
          {selectedType && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Record Type Specific Fields */}
              {selectedType === 'Text' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                    Text Message / Student Note
                  </label>
                  <textarea
                    rows={4}
                    value={textVal}
                    onChange={(e) => setTextVal(e.target.value)}
                    placeholder="Enter any text to encode onto the card (e.g. Student Name, Department, Emergency Note)..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: 11, color: '#64748b', textAlign: 'right' }}>
                    {textVal.length} / 700 characters
                  </div>
                </div>
              )}

              {selectedType === 'URL / URI' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Website URL</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={urlProtocol}
                      onChange={(e) => setUrlProtocol(e.target.value as any)}
                      style={{
                        padding: '10px 8px',
                        backgroundColor: '#0f131a',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        color: '#f8fafc',
                        fontSize: 13,
                      }}
                    >
                      <option value="https://">https://</option>
                      <option value="http://">http://</option>
                    </select>
                    <input
                      type="text"
                      value={urlVal}
                      onChange={(e) => setUrlVal(e.target.value)}
                      placeholder="campuspay.edu/portal"
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        backgroundColor: '#0f131a',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        color: '#f8fafc',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['campuspay.edu', 'student.campus.tn', 'github.com'].map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setUrlVal(s)}
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: 4,
                          color: '#94a3b8',
                          cursor: 'pointer',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedType === 'Custom URL / URI' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Custom URI Scheme</label>
                  <input
                    type="text"
                    value={customUriVal}
                    onChange={(e) => setCustomUriVal(e.target.value)}
                    placeholder="geo:36.8065,10.1815 or spotify:playlist:... or tel:..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Examples: <code>geo:36.8065,10.1815</code>, <code>market://details?id=app</code>
                  </div>
                </div>
              )}

              {selectedType === 'Unit.Link' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Unit.Link Profile</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>https://unit.link/</span>
                    <input
                      type="text"
                      value={unitLinkUsername}
                      onChange={(e) => setUnitLinkUsername(e.target.value)}
                      placeholder="username"
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        backgroundColor: '#0f131a',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        color: '#f8fafc',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              )}

              {selectedType === 'Search' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Search Engine & Query</label>
                  <select
                    value={searchEngine}
                    onChange={(e) => setSearchEngine(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                    }}
                  >
                    <option>Google</option>
                    <option>DuckDuckGo</option>
                    <option>Bing</option>
                    <option>Ecosia</option>
                  </select>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search terms (e.g. Computer Science Campus 2026)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {selectedType === 'Payment Link' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Payment Provider</label>
                  <select
                    value={paymentProvider}
                    onChange={(e) => setPaymentProvider(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                    }}
                  >
                    <option>CampusPay</option>
                    <option>PayPal.Me</option>
                    <option>Revolut</option>
                    <option>Cash App</option>
                  </select>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                    {paymentProvider === 'CampusPay' ? 'Student ID / Wallet' : 'Username / Handle'}
                  </label>
                  <input
                    type="text"
                    value={paymentIdentifier}
                    onChange={(e) => setPaymentIdentifier(e.target.value)}
                    placeholder={
                      paymentProvider === 'PayPal.Me'
                        ? 'paypal_username'
                        : paymentProvider === 'Cash App'
                        ? 'cashtag'
                        : 'STU-2026-001'
                    }
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {selectedType === 'Social networks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Social Network</label>
                  <select
                    value={socialPlatform}
                    onChange={(e) => setSocialPlatform(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                    }}
                  >
                    <option>Instagram</option>
                    <option>X (Twitter)</option>
                    <option>LinkedIn</option>
                    <option>GitHub</option>
                    <option>Facebook</option>
                    <option>TikTok</option>
                    <option>YouTube</option>
                    <option>Telegram</option>
                    <option>WhatsApp</option>
                  </select>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Username or Handle</label>
                  <input
                    type="text"
                    value={socialHandle}
                    onChange={(e) => setSocialHandle(e.target.value)}
                    placeholder="e.g. aymen_brd"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {selectedType === 'Video' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Video Platform & URL</label>
                  <select
                    value={videoPlatform}
                    onChange={(e) => setVideoPlatform(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                    }}
                  >
                    <option>YouTube</option>
                    <option>Vimeo</option>
                    <option>Twitch</option>
                    <option>TikTok</option>
                  </select>
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://youtu.be/..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {selectedType === 'File' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>File URL & Name</label>
                  <input
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="Document Title (e.g. Student Syllabus 2026)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    type="text"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {selectedType === 'Application' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Target App Package / ID</label>
                  <select
                    value={appPlatform}
                    onChange={(e) => setAppPlatform(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                    }}
                  >
                    <option>Android</option>
                    <option>iOS</option>
                  </select>
                  <input
                    type="text"
                    value={appPackage}
                    onChange={(e) => setAppPackage(e.target.value)}
                    placeholder="com.campuspay.app"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {selectedType === 'Mail' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Email Address & Subject</label>
                  <input
                    type="email"
                    value={mailTo}
                    onChange={(e) => setMailTo(e.target.value)}
                    placeholder="student@campus.tn"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    type="text"
                    value={mailSubject}
                    onChange={(e) => setMailSubject(e.target.value)}
                    placeholder="Subject line"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {selectedType === 'Phone' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>Phone Number</label>
                  <input
                    type="tel"
                    value={phoneVal}
                    onChange={(e) => setPhoneVal(e.target.value)}
                    placeholder="+216 22 000 000"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#0f131a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      color: '#f8fafc',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}

              {/* Live Formatted Card Payload Preview Box */}
              <div
                style={{
                  background: '#0d1117',
                  border: '1px solid #232c3d',
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
                  <span>CARD ENCODED RECORD PREVIEW</span>
                  <span>{estimatedBytes} bytes / 752 capacity</span>
                </div>
                <div
                  style={{
                    fontFamily: 'Consolas, monospace',
                    fontSize: 12,
                    color: '#38bdf8',
                    wordBreak: 'break-all',
                    background: '#161d2b',
                    padding: '8px 10px',
                    borderRadius: 6,
                  }}
                >
                  {currentPayload.formattedValue}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  Allocation: Block 4 (`CPAY` Protocol v1.0 Header) + Block 5 (Record Role) + Block 6+ (Payload Data).
                </div>
              </div>

              {/* Interactive Write Step Flow */}
              {writing && writePhase === 'waiting_card' && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '12px 14px',
                    background: 'rgba(14, 116, 144, 0.15)',
                    border: '1px solid rgba(14, 116, 144, 0.4)',
                    borderRadius: 8,
                    color: '#bae6fd',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: '#38bdf8' }}>
                    <Radio size={16} className="registration-spin" />
                    <span>Present card {activeUid} to the ESP32 reader</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#93c5fd', lineHeight: 1.5 }}>
                    Tap and hold your card flat against the RC522 antenna for 2 seconds.
                    <br />
                    <span style={{ color: '#fde047' }}>💡 Note:</span> If the card was already resting on the reader, lift it up for 1 second, then tap it back down.
                  </div>
                </div>
              )}

              {writing && writePhase === 'writing' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: 8,
                    color: '#6ee7b7',
                  }}
                >
                  <LoaderCircle size={18} className="registration-spin" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Writing blocks & reading back to verify...</div>
                    <div style={{ fontSize: 11, color: '#a7f3d0' }}>Keep card firmly in place on the reader antenna.</div>
                  </div>
                </div>
              )}

              {/* Feedback messages */}
              {errorMsg && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    padding: '12px 14px',
                    background: '#451a1a',
                    border: '1px solid #7f1d1d',
                    borderRadius: 8,
                    color: '#fca5a5',
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                    <CircleAlert size={16} style={{ flexShrink: 0 }} />
                    <span>Write Not Confirmed</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#fecaca', lineHeight: 1.4 }}>{errorMsg}</div>

                  {differentCardUid && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveUid(differentCardUid);
                        void handleWriteToCard(differentCardUid);
                      }}
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: 4,
                        padding: '6px 12px',
                        background: '#0284c7',
                        border: 'none',
                        borderRadius: 6,
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Write to detected card ({differentCardUid}) instead
                    </button>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => void handleWriteToCard()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 12px',
                        background: '#b91c1c',
                        border: 'none',
                        borderRadius: 6,
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <RotateCcw size={12} />
                      <span>Retry Card Write</span>
                    </button>
                  </div>
                </div>
              )}

              {successMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    background: '#143825',
                    border: '1px solid #166534',
                    borderRadius: 8,
                    color: '#86efac',
                    fontSize: 12,
                  }}
                >
                  <Check size={16} style={{ flexShrink: 0 }} />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Hardware Connection prompt if offline */}
              {readerState !== 'connected' && connectReader && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: '#2b2316',
                    border: '1px solid #78350f',
                    borderRadius: 8,
                    color: '#fde68a',
                    fontSize: 11,
                  }}
                >
                  <span>Connect the ESP32 reader to write to the physical card.</span>
                  <button
                    type="button"
                    onClick={() => void connectReader()}
                    style={{
                      padding: '4px 10px',
                      background: '#d97706',
                      border: 'none',
                      borderRadius: 6,
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    Connect ESP32
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  disabled={writing}
                  style={{
                    padding: '9px 16px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    color: '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleWriteToCard()}
                  disabled={writing}
                  style={{
                    padding: '9px 18px',
                    background: writing ? '#15803d' : '#22c55e',
                    border: 'none',
                    borderRadius: 8,
                    color: '#052e16',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: writing ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)',
                  }}
                >
                  {writing ? (
                    <>
                      <LoaderCircle size={15} className="registration-spin" />
                      <span>{writePhase === 'waiting_card' ? 'Waiting for card...' : 'Writing blocks...'}</span>
                    </>
                  ) : (
                    <>
                      <Smartphone size={15} />
                      <span>Write to Physical Card</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
