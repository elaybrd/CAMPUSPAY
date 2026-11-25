import { Esp32SerialBridge, type Esp32BridgeState, type Esp32Card, type SerialMessage, type SerialStudentPayload } from './esp32Serial';
import { Esp32MqttBridge, type MqttConfig, DEFAULT_MQTT_CONFIG } from './esp32Mqtt';

export type ReaderMode = 'serial' | 'mqtt';

export class UnifiedReaderBridge {
  private mode: ReaderMode = 'mqtt';
  private serialBridge: Esp32SerialBridge;
  private mqttBridge: Esp32MqttBridge;
  private reportState: (state: Esp32BridgeState, detail?: string) => void;
  private listeners = new Set<(message: SerialMessage) => void>();

  constructor(
    reportState: (state: Esp32BridgeState, detail?: string) => void,
    defaultMode: ReaderMode = 'mqtt'
  ) {
    this.reportState = reportState;
    const savedMode = (typeof localStorage !== 'undefined' && localStorage.getItem('campuspay_reader_mode') as ReaderMode) || defaultMode;
    this.mode = savedMode;

    const savedMqtt = typeof localStorage !== 'undefined' ? localStorage.getItem('campuspay_mqtt_config') : null;
    let mqttConfig: Partial<MqttConfig> = {};
    if (savedMqtt) {
      try {
        mqttConfig = JSON.parse(savedMqtt);
      } catch {
        // ignore malformed JSON
      }
    }

    // If the saved config is still pointing to the old public broker or missing credentials, migrate to the configured cluster
    if (mqttConfig.brokerUrl?.includes('broker.hivemq.com') || (!mqttConfig.username && DEFAULT_MQTT_CONFIG.username)) {
      mqttConfig = { ...DEFAULT_MQTT_CONFIG, ...mqttConfig, brokerUrl: DEFAULT_MQTT_CONFIG.brokerUrl, username: DEFAULT_MQTT_CONFIG.username, password: DEFAULT_MQTT_CONFIG.password };
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('campuspay_mqtt_config', JSON.stringify(mqttConfig));
      }
    }

    this.serialBridge = new Esp32SerialBridge((state, detail) => {
      if (this.mode === 'serial') {
        this.reportState(state, detail);
      }
    });

    this.mqttBridge = new Esp32MqttBridge((state, detail) => {
      if (this.mode === 'mqtt') {
        this.reportState(state, detail);
      }
    }, mqttConfig);

    this.serialBridge.subscribe((msg) => {
      if (this.mode === 'serial') {
        for (const listener of this.listeners) listener(msg);
      }
    });

    this.mqttBridge.subscribe((msg) => {
      if (this.mode === 'mqtt') {
        for (const listener of this.listeners) listener(msg);
      }
    });
  }

  get currentMode(): ReaderMode {
    return this.mode;
  }

  get connected(): boolean {
    return this.activeBridge.connected;
  }

  get isEspOnline(): boolean {
    return this.mode === 'mqtt' ? this.mqttBridge.isEspOnline : this.serialBridge.connected;
  }

  get espDetails() {
    return this.mode === 'mqtt' ? this.mqttBridge.espDetails : {};
  }

  get lastMessage() {
    return this.mode === 'mqtt' ? this.mqttBridge.lastMessage : null;
  }

  get activeBridge(): Esp32SerialBridge | Esp32MqttBridge {
    return this.mode === 'serial' ? this.serialBridge : this.mqttBridge;
  }

  getMqttConfig(): MqttConfig {
    return this.mqttBridge.getConfig();
  }

  setMqttConfig(config: Partial<MqttConfig>) {
    this.mqttBridge.updateConfig(config);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('campuspay_mqtt_config', JSON.stringify(this.mqttBridge.getConfig()));
    }
  }

  async setMode(newMode: ReaderMode) {
    if (this.mode === newMode) return;
    if (this.connected) {
      await this.disconnect();
    }
    this.mode = newMode;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('campuspay_reader_mode', newMode);
    }
    if (newMode === 'serial') {
      this.reportState(Esp32SerialBridge.supported ? 'disconnected' : 'unsupported', 'Switched to USB Serial mode.');
    } else {
      this.reportState('disconnected', 'Switched to WiFi / MQTT mode. Ready to connect.');
    }
  }

  subscribe(listener: (message: SerialMessage) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(): Promise<void> {
    return this.activeBridge.connect();
  }

  async disconnect(): Promise<void> {
    return this.activeBridge.disconnect();
  }

  async scanCard(timeoutMs?: number): Promise<Esp32Card> {
    if (this.mode === 'mqtt') {
      return this.mqttBridge.scanCard(timeoutMs);
    }
    return this.serialBridge.scanCard();
  }

  async writeStudent(uid: string, student: SerialStudentPayload, timeoutMs?: number): Promise<SerialMessage> {
    if (this.mode === 'mqtt') {
      return this.mqttBridge.writeStudent(uid, student, timeoutMs);
    }
    return this.serialBridge.writeStudent(uid, student);
  }

  async eraseCard(uid?: string, timeoutMs?: number): Promise<SerialMessage> {
    if (this.mode === 'mqtt') {
      return this.mqttBridge.eraseCard(uid, timeoutMs);
    }
    return this.serialBridge.eraseCard(uid);
  }

  async readSectors(timeoutMs?: number) {
    return this.activeBridge.readSectors(timeoutMs);
  }

  async cancelOperation(): Promise<void> {
    return this.activeBridge.cancelOperation();
  }

  async writeStudentQuick(uid: string, student: SerialStudentPayload, timeoutMs?: number): Promise<boolean> {
    return this.activeBridge.writeStudentQuick(uid, student, timeoutMs);
  }
}
