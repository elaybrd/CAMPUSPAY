export type SerialStudentPayload = {
  studentId: string;
  fullName: string;
  coins: number;
};

export type Esp32Card = {
  uid: string;
  cardType?: string;
};

export type Esp32BridgeState = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error';

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
};

type SerialApiLike = {
  requestPort(): Promise<SerialPortLike>;
};

export type SerialMessage = {
  type?: string;
  action?: string;
  id?: string;
  ok?: boolean;
  uid?: string;
  cardType?: string;
  error?: string;
  message?: string;
  sectors?: Array<{ sector: number; blocks: Array<{ block: number; hex: string }> }>;
};

type PendingRequest = {
  resolve: (message: SerialMessage) => void;
  reject: (error: Error) => void;
  timer: number;
};

declare global {
  interface Navigator {
    serial?: SerialApiLike;
  }
}

const baudRate = 115200;
const normalizeUid = (uid: string) => uid.replace(/[^0-9a-f]/gi, '').toUpperCase();

export class Esp32SerialBridge {
  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readTask: Promise<void> | null = null;
  private textBuffer = '';
  private pending = new Map<string, PendingRequest>();
  private listeners = new Set<(message: SerialMessage) => void>();
  private reportState: (state: Esp32BridgeState, detail?: string) => void;
  private state: Esp32BridgeState = 'disconnected';

  constructor(reportState: (state: Esp32BridgeState, detail?: string) => void) {
    this.reportState = reportState;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.serial);
  }

  get connected() {
    return this.state === 'connected';
  }

  subscribe(listener: (message: SerialMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect() {
    if (!Esp32SerialBridge.supported) throw new Error('Web Serial is unavailable. Use a supported Chromium browser over HTTPS or localhost.');
    if (this.connected) return;
    if (this.port) await this.disconnect();
    this.setState('connecting', 'Choose the ESP32 serial port.');
    try {
      this.port = await navigator.serial!.requestPort();
      await this.port.open({ baudRate });
      if (!this.port.readable || !this.port.writable) throw new Error('The selected serial port is not readable and writable.');
      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      this.textBuffer = '';
      this.readTask = this.readLoop();
      const hello = await this.request({ action: 'hello' }, 5000);
      if (hello.type !== 'ready' || hello.ok === false) throw new Error(hello.message || 'No CampusPay firmware handshake received.');
      this.setState('connected', `ESP32 ready at ${baudRate} baud.`);
    } catch (error) {
      await this.disconnect();
      this.setState('error', error instanceof Error ? error.message : 'Serial connection failed.');
      throw error instanceof Error ? error : new Error('Serial connection failed.');
    }
  }

  async scanCard() {
    this.requireConnected();
    const response = await this.request({ action: 'scan' }, 95000);
    if (response.type !== 'scan_result' || response.ok === false || !response.uid) {
      throw new Error(response.error || response.message || 'ESP32 did not return a detected card UID.');
    }
    return { uid: response.uid, cardType: response.cardType } satisfies Esp32Card;
  }

  async writeStudent(uid: string, student: SerialStudentPayload) {
    this.requireConnected();
    const expectedUid = normalizeUid(uid);
    if (!expectedUid) throw new Error('A card UID from a real reader scan is required.');
    const response = await this.request(
      {
        action: 'write_student',
        uid: expectedUid,
        studentId: student.studentId,
        fullName: student.fullName,
        coins: student.coins,
        student,
      },
      95000
    );
    if (response.type !== 'write_result' || response.ok !== true || normalizeUid(response.uid || '') !== expectedUid) {
      throw new Error(response.error || response.message || 'ESP32 did not confirm a verified card write.');
    }
    return response;
  }

  async eraseCard(uid?: string) {
    this.requireConnected();
    const expectedUid = uid ? normalizeUid(uid) : '';
    const response = await this.request({ action: 'erase_card', uid: expectedUid }, 95000);
    if (response.type !== 'write_result' || response.ok !== true) {
      throw new Error(response.error || response.message || 'ESP32 did not confirm card erase.');
    }
    return response;
  }

  async readSectors(timeoutMs = 95000) {
    this.requireConnected();
    const response = await this.request({ action: 'read_sectors' }, timeoutMs);
    if (!response.ok || !response.sectors) {
      throw new Error(response.error || (response as any).message || 'Failed to read card memory sectors.');
    }
    return response as { ok: boolean; uid: string; cardType: string; sectors: Array<{ sector: number; blocks: Array<{ block: number; hex: string }> }> };
  }

  async writeStudentQuick(uid: string, student: SerialStudentPayload, timeoutMs = 1800): Promise<boolean> {
    if (!this.connected || !this.writer) return false;
    const expectedUid = normalizeUid(uid);
    if (!expectedUid) return false;
    const cancelTimer = window.setTimeout(() => {
      void this.cancelOperation();
    }, timeoutMs);
    try {
      const response = await this.request(
        {
          action: 'write_student',
          uid: expectedUid,
          studentId: student.studentId,
          fullName: student.fullName,
          coins: student.coins,
          student,
        },
        timeoutMs + 1000
      );
      return response.type === 'write_result' && response.ok === true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(cancelTimer);
    }
  }

  async cancelOperation() {
    if (!this.port || !this.writer) return;
    try {
      const command = new TextEncoder().encode(`${JSON.stringify({ action: 'cancel' })}\n`);
      await this.writer.write(command);
    } catch {
      // Ignore write errors during cancel
    }
  }

  async disconnect() {
    this.rejectPending(new Error('Serial connection closed.'));
    try {
      await this.reader?.cancel();
    } catch {
      // The reader may already have stopped after a device disconnect.
    }
    try {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      if (this.port) await this.port.close();
    } catch {
      // Closing an already-disconnected USB device is harmless.
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.readTask = null;
    this.setState('disconnected');
  }

  private requireConnected() {
    if (!this.connected || !this.writer) throw new Error('Connect and verify the ESP32 before performing card operations.');
  }

  private async request(payload: Record<string, unknown>, timeout: number) {
    this.requirePortOpen();
    const id = crypto.randomUUID();
    const response = new Promise<SerialMessage>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ESP32 ${String(payload.action)} timed out without a device response.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
    });
    const command = new TextEncoder().encode(`${JSON.stringify({ ...payload, id })}\n`);
    try {
      await this.writer!.write(command);
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        window.clearTimeout(pending.timer);
        this.pending.delete(id);
      }
      throw error instanceof Error ? error : new Error('Could not write to the ESP32 serial port.');
    }
    return response;
  }

  private requirePortOpen() {
    if (!this.port || !this.writer) throw new Error('ESP32 serial port is not open.');
  }

  private async readLoop() {
    while (this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.consume(new TextDecoder().decode(value, { stream: true }));
      } catch (error) {
        if (this.state !== 'disconnected') this.setState('error', error instanceof Error ? error.message : 'Serial read failed.');
        break;
      }
    }
    if (this.state === 'connected') {
      this.rejectPending(new Error('ESP32 serial connection was lost.'));
      this.setState('error', 'ESP32 serial connection was lost.');
    }
  }

  private consume(chunk: string) {
    this.textBuffer += chunk;
    const lines = this.textBuffer.split(/\r?\n/);
    this.textBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let message: SerialMessage;
      try {
        message = JSON.parse(line) as SerialMessage;
      } catch {
        this.setState('error', 'ESP32 sent malformed JSON. Check the selected firmware/protocol.');
        continue;
      }
      for (const listener of this.listeners) listener(message);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (pending) {
          window.clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.type === 'error' || message.ok === false) pending.reject(new Error(message.error || message.message || 'ESP32 operation failed.'));
          else pending.resolve(message);
        }
      }
    }
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private setState(state: Esp32BridgeState, detail?: string) {
    this.state = state;
    this.reportState(state, detail);
  }
}