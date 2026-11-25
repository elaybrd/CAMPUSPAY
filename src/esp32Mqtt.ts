import mqtt, { type MqttClient } from 'mqtt';
import type { Esp32BridgeState, Esp32Card, SerialMessage, SerialStudentPayload } from './esp32Serial';

export interface MqttConfig {
  brokerUrl: string; // e.g. "wss://1a219aec1bc248c2a24c399c94a4a63d.s1.eu.hivemq.cloud:8884/mqtt"
  topicPrefix: string; // e.g. "campuspay"
  clientId?: string;
  username?: string;
  password?: string;
}

export const DEFAULT_MQTT_CONFIG: MqttConfig = {
  brokerUrl: 'wss://1a219aec1bc248c2a24c399c94a4a63d.s1.eu.hivemq.cloud:8884/mqtt',
  topicPrefix: 'campuspay',
  username: 'aymen_brd',
  password: '***',
};

const normalizeUid = (uid: string) => uid.replace(/[^0-9a-f]/gi, '').toUpperCase();

export class Esp32MqttBridge {
  private client: MqttClient | null = null;
  private config: MqttConfig;
  private state: Esp32BridgeState = 'disconnected';
  private reportState: (state: Esp32BridgeState, detail?: string) => void;
  private pending = new Map<string, {
    resolve: (message: SerialMessage) => void;
    reject: (error: Error) => void;
    timer: number;
  }>();
  private listeners = new Set<(message: SerialMessage) => void>();
  private espOnline = false;
  private espInfo: { ip?: string; rssi?: number } = {};
  private lastMsg: { topic: string; payload: string; time: string } | null = null;

  constructor(
    reportState: (state: Esp32BridgeState, detail?: string) => void,
    config: Partial<MqttConfig> = {}
  ) {
    this.reportState = reportState;
    this.config = { ...DEFAULT_MQTT_CONFIG, ...config };
  }

  get connected() {
    return this.state === 'connected' && Boolean(this.client?.connected);
  }

  get isEspOnline() {
    return this.espOnline;
  }

  get espDetails() {
    return this.espInfo;
  }

  get lastMessage() {
    return this.lastMsg;
  }

  getConfig(): MqttConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<MqttConfig>) {
    this.config = { ...this.config, ...config };
    if (this.connected) {
      void this.disconnect().then(() => this.connect());
    }
  }

  subscribe(listener: (message: SerialMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.client) await this.disconnect();

    this.setState('connecting', `Connecting to MQTT broker (${this.config.brokerUrl})...`);
    console.log('[CampusPay MQTT] Connecting to:', this.config.brokerUrl, 'Username:', this.config.username);

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      const clientId = this.config.clientId || `campuspay-web-${Math.random().toString(16).substring(2, 10)}`;

      const client = mqtt.connect(this.config.brokerUrl, {
        clientId,
        username: this.config.username || undefined,
        password: this.config.password || undefined,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 5000,
      });

      this.client = client;

      const timeoutTimer = window.setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.setState('error', 'MQTT broker connection timed out.');
          console.error('[CampusPay MQTT] Connection timed out after 12s');
          client.end(true);
          reject(new Error('MQTT broker connection timed out.'));
        }
      }, 12000);

      client.on('connect', () => {
        window.clearTimeout(timeoutTimer);
        console.log('[CampusPay MQTT] Successfully connected to broker!');
        const prefix = this.config.topicPrefix.replace(/\/+$/, '');
        const topics = [`${prefix}/#`, prefix];

        client.subscribe(topics, (err) => {
          if (err) {
            console.error('[CampusPay MQTT] Subscription error:', err);
            if (!resolved) {
              resolved = true;
              this.setState('error', `Failed to subscribe: ${err.message}`);
              reject(err);
            }
            return;
          }

          console.log('[CampusPay MQTT] Subscribed to wildcard topics:', topics);
          this.setState('connected', `Connected to MQTT. Waiting for ESP32 on topic '${prefix}/#'...`);

          // Probe for ESP32
          void this.request({ action: 'hello' }, 3000)
            .then((res) => {
              this.espOnline = true;
              this.setState('connected', `ESP32 verified on MQTT topic '${prefix}'.`);
            })
            .catch(() => {
              this.setState('connected', `Connected to broker. ESP32 reader standby.`);
            });

          if (!resolved) {
            resolved = true;
            resolve();
          }
        });
      });

      client.on('message', (topic, payload) => {
        this.handleIncomingMessage(topic, payload.toString());
      });

      client.on('error', (err) => {
        console.error('[CampusPay MQTT] Client error:', err.message, err);
        if (!resolved) {
          window.clearTimeout(timeoutTimer);
          resolved = true;
          this.setState('error', `MQTT Error: ${err.message}`);
          reject(err);
        } else {
          this.setState('error', `MQTT Error: ${err.message}`);
        }
      });

      client.on('close', () => {
        console.warn('[CampusPay MQTT] Broker connection closed.');
        if (this.state === 'connected') {
          this.setState('disconnected', 'Disconnected from MQTT broker.');
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    this.rejectPending(new Error('MQTT connection closed.'));
    if (this.client) {
      try {
        await new Promise<void>((resolve) => {
          this.client!.end(false, {}, () => resolve());
        });
      } catch {
        // ignore
      }
      this.client = null;
    }
    this.espOnline = false;
    this.setState('disconnected');
  }

  async scanCard(timeoutMs = 95000): Promise<Esp32Card> {
    this.requireConnected();
    const response = await this.request({ action: 'scan', timeoutMs }, timeoutMs + 2000);
    if (response.type !== 'scan_result' || response.ok === false || !response.uid) {
      throw new Error(response.error || response.message || 'ESP32 did not return a detected card UID.');
    }
    return { uid: response.uid, cardType: response.cardType } satisfies Esp32Card;
  }

  async writeStudent(uid: string, student: SerialStudentPayload, timeoutMs = 95000): Promise<SerialMessage> {
    this.requireConnected();
    const expectedUid = normalizeUid(uid);
    if (!expectedUid) throw new Error('A card UID from a real reader scan is required.');
    const response = await this.request(
      { action: 'write_student', uid: expectedUid, studentId: student.studentId, fullName: student.fullName, coins: student.coins, timeoutMs },
      timeoutMs + 2000
    );
    if (response.type !== 'write_result' || response.ok !== true || normalizeUid(response.uid || '') !== expectedUid) {
      throw new Error(response.error || response.message || 'ESP32 did not confirm a verified card write.');
    }
    return response;
  }

  async eraseCard(uid?: string, timeoutMs = 95000): Promise<SerialMessage> {
    this.requireConnected();
    const expectedUid = uid ? normalizeUid(uid) : '';
    const response = await this.request({ action: 'erase_card', uid: expectedUid, timeoutMs }, timeoutMs + 2000);
    if (response.type !== 'write_result' || response.ok !== true) {
      throw new Error(response.error || response.message || 'ESP32 did not confirm card erase.');
    }
    return response;
  }

  async readSectors(timeoutMs = 95000): Promise<{ ok: boolean; uid: string; cardType: string; sectors: Array<{ sector: number; blocks: Array<{ block: number; hex: string }> }> }> {
    this.requireConnected();
    const response = await this.request({ action: 'read_sectors', timeoutMs }, timeoutMs + 2000);
    if (!response.ok || !response.sectors) {
      throw new Error(response.error || (response as any).message || 'Failed to read card memory sectors.');
    }
    return response as { ok: boolean; uid: string; cardType: string; sectors: Array<{ sector: number; blocks: Array<{ block: number; hex: string }> }> };
  }

  async writeStudentQuick(uid: string, student: SerialStudentPayload, timeoutMs = 2500): Promise<boolean> {
    if (!this.connected) return false;
    const expectedUid = normalizeUid(uid);
    if (!expectedUid) return false;
    try {
      const response = await this.request(
        { action: 'write_student', uid: expectedUid, studentId: student.studentId, fullName: student.fullName, coins: student.coins, timeoutMs },
        timeoutMs + 1000
      );
      return response.type === 'write_result' && response.ok === true;
    } catch {
      return false;
    }
  }

  async cancelOperation(): Promise<void> {
    if (!this.client || !this.connected) return;
    try {
      const prefix = this.config.topicPrefix.replace(/\/+$/, '');
      const commandTopic = `${prefix}/command`;
      this.client.publish(commandTopic, JSON.stringify({ action: 'cancel' }));
    } catch {
      // ignore
    }
  }

  private requireConnected() {
    if (!this.connected) throw new Error('Connect and verify the MQTT connection before performing card operations.');
  }

  private async request(payload: Record<string, unknown>, timeout: number): Promise<SerialMessage> {
    this.requireConnected();
    const id = crypto.randomUUID();
    const prefix = this.config.topicPrefix.replace(/\/+$/, '');
    const commandTopic = `${prefix}/command`;

    const response = new Promise<SerialMessage>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ESP32 MQTT ${String(payload.action)} timed out without a device response.`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
    });

    const commandStr = JSON.stringify({ ...payload, id });
    this.client!.publish(commandTopic, commandStr, { qos: 1 }, (err) => {
      if (err) {
        const pending = this.pending.get(id);
        if (pending) {
          window.clearTimeout(pending.timer);
          this.pending.delete(id);
        }
        throw err;
      }
    });

    return response;
  }

  private handleIncomingMessage(topic: string, messageStr: string) {
    console.log('[CampusPay MQTT] Message arrived:', topic, '->', messageStr);
    this.lastMsg = { topic, payload: messageStr, time: new Date().toLocaleTimeString() };

    let data: Record<string, any>;
    try {
      data = JSON.parse(messageStr);
    } catch {
      const clean = messageStr.trim().replace(/[^0-9a-f]/gi, '');
      if (clean.length >= 8 && clean.length <= 20) {
        data = { uid: messageStr.trim(), type: 'card_tapped' };
      } else {
        console.warn('[CampusPay MQTT] Non-JSON payload received:', messageStr);
        return;
      }
    }

    const prefix = this.config.topicPrefix.replace(/\/+$/, '');

    // 1. Status messages
    if (topic.endsWith('/status') || data.status === 'online' || data.status === 'offline') {
      if (data.status === 'online') {
        this.espOnline = true;
        this.espInfo = { ip: data.ip, rssi: data.rssi };
        this.setState('connected', `ESP32 Online (${data.ip || 'WiFi'}${data.rssi ? `, ${data.rssi} dBm` : ''})`);
      } else if (data.status === 'offline') {
        this.espOnline = false;
        this.setState('connected', 'MQTT Broker Connected (ESP32 Offline)');
      }
      return;
    }

    // 2. Card tap or scan messages
    const isTapTopic = topic.endsWith('/tap') || topic.endsWith('/scan') || topic.endsWith('/card') || topic === prefix;
    const isTapData = data.type === 'card_tapped' || data.type === 'scan_result' || (data.uid && !topic.endsWith('/response'));

    if (isTapTopic || isTapData) {
      const cardUid = String(data.uid || data.card_uid || messageStr).trim();
      const msg: SerialMessage = {
        type: 'scan_result',
        ok: true,
        uid: cardUid,
        cardType: data.cardType || data.chip_type || 'MIFARE Classic 1K',
      };
      this.espOnline = true;
      console.log('[CampusPay MQTT] Card tap event:', msg);
      for (const listener of this.listeners) listener(msg);

      // Also resolve any pending scan requests immediately
      for (const [id, pending] of this.pending.entries()) {
        window.clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.resolve(msg);
      }
      return;
    }

    // 3. Command responses
    if (topic.endsWith('/response') || data.id) {
      const message = data as SerialMessage;
      for (const listener of this.listeners) listener(message);

      if (message.id) {
        const pending = this.pending.get(message.id);
        if (pending) {
          window.clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.type === 'error' || message.ok === false) {
            pending.reject(new Error(message.error || message.message || 'ESP32 MQTT operation failed.'));
          } else {
            pending.resolve(message);
          }
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
