import React, { useState } from 'react';
import { Check, Copy, Globe, Radio, Server, Shield, Wifi, X } from 'lucide-react';
import type { MqttConfig } from './esp32Mqtt';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  config: MqttConfig;
  onSave: (newConfig: Partial<MqttConfig>) => void;
  isEspOnline?: boolean;
  espDetails?: { ip?: string; rssi?: number };
};

const PRESETS = [
  {
    name: 'HiveMQ Public (Zero-Config)',
    brokerUrl: 'wss://broker.hivemq.com:8884/mqtt',
    espMqttServer: 'broker.hivemq.com',
    espMqttPort: 1883,
    note: 'Zero-config free broker. No account or password needed.',
  },
  {
    name: 'HiveMQ Cloud Cluster (*.hivemq.cloud)',
    brokerUrl: 'wss://1a219aec1bc248c2a24c399c94a4a63d.s1.eu.hivemq.cloud:8884/mqtt',
    espMqttServer: '1a219aec1bc248c2a24c399c94a4a63d.s1.eu.hivemq.cloud',
    espMqttPort: 8883,
    note: 'Dedicated HiveMQ Cloud cluster. Requires port 8883 (TLS) and credentials.',
  },
  {
    name: 'EMQX Cloud (Public)',
    brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
    espMqttServer: 'broker.emqx.io',
    espMqttPort: 1883,
    note: 'Fast public MQTT broker provided by EMQX.',
  },
  {
    name: 'Local Mosquitto (LAN/PC)',
    brokerUrl: 'ws://localhost:9001',
    espMqttServer: '192.168.1.xxx',
    espMqttPort: 1883,
    note: 'Requires Mosquitto broker running on your machine or Raspberry Pi with WebSockets enabled.',
  },
];

export const MqttSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  config,
  onSave,
  isEspOnline,
  espDetails,
}) => {
  const [brokerUrl, setBrokerUrl] = useState(config.brokerUrl);
  const [topicPrefix, setTopicPrefix] = useState(config.topicPrefix);
  const [username, setUsername] = useState(config.username || '');
  const [password, setPassword] = useState(config.password || '');
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      brokerUrl: brokerUrl.trim(),
      topicPrefix: topicPrefix.trim() || 'campuspay',
      username: username.trim() || undefined,
      password: password.trim() || undefined,
    });
    onClose();
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setBrokerUrl(preset.brokerUrl);
  };

  const selectedPreset = PRESETS.find((p) => p.brokerUrl === brokerUrl);
  const espServer = selectedPreset ? selectedPreset.espMqttServer : 'broker.hivemq.com';
  const espPort = selectedPreset ? selectedPreset.espMqttPort : 1883;

  const espCodeSnippet = `// In firmware/CampusPayEsp32Mfrc522_MQTT/CampusPayEsp32Mfrc522_MQTT.ino:
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";
const char* MQTT_SERVER   = "${espServer}";
const int   MQTT_PORT     = ${espPort};
const char* TOPIC_PREFIX  = "${topicPrefix.trim() || 'campuspay'}";`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(espCodeSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#181b20',
          border: '1px solid #2a303c',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          color: '#e2e8f0',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid #2a303c',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Wifi size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                ESP32 WiFi & MQTT Settings
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                Wirelessly communicate with the ESP32 card reader across the campus network
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ padding: '24px' }}>
          {/* Status banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: isEspOnline ? 'rgba(34, 197, 94, 0.1)' : 'rgba(148, 163, 184, 0.1)',
              border: `1px solid ${isEspOnline ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: isEspOnline ? '#22c55e' : '#94a3b8',
                  boxShadow: isEspOnline ? '0 0 8px #22c55e' : 'none',
                }}
              />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                {isEspOnline
                  ? `ESP32 Hardware Online (${espDetails?.ip || 'WiFi connected'})`
                  : 'ESP32 Reader Status: Standby / Not seen yet'}
              </span>
            </div>
            {espDetails?.rssi !== undefined && (
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Signal: {espDetails.rssi} dBm
              </span>
            )}
          </div>

          {/* Preset Buttons */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>
              Quick Broker Presets:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  style={{
                    backgroundColor: brokerUrl === preset.brokerUrl ? '#4f46e5' : '#232832',
                    color: brokerUrl === preset.brokerUrl ? '#ffffff' : '#cbd5e1',
                    border: '1px solid #333d4d',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          {/* Broker WebSocket URL */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
              MQTT WebSocket URL (for Browser):
            </label>
            <input
              type="text"
              value={brokerUrl}
              onChange={(e) => setBrokerUrl(e.target.value)}
              placeholder="wss://broker.hivemq.com:8884/mqtt"
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                backgroundColor: '#101216',
                border: '1px solid #333d4d',
                color: '#f8fafc',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <small style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', display: 'block' }}>
              Browsers require MQTT over WebSockets (`wss://` or `ws://`).
            </small>
          </div>

          {/* Topic Prefix */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
              MQTT Topic Prefix / Device ID:
            </label>
            <input
              type="text"
              value={topicPrefix}
              onChange={(e) => setTopicPrefix(e.target.value)}
              placeholder="campuspay"
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                backgroundColor: '#101216',
                border: '1px solid #333d4d',
                color: '#f8fafc',
                fontSize: '13px',
                boxSizing: 'border-box',
              }}
            />
            <small style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', display: 'block' }}>
              Topics used: <code>{topicPrefix}/command</code>, <code>{topicPrefix}/response</code>, <code>{topicPrefix}/tap</code>, <code>{topicPrefix}/status</code>.
            </small>
          </div>

          {/* Optional Username & Password (Required for HiveMQ Cloud) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                Username (optional):
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Leave empty if public"
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#101216',
                  border: '1px solid #333d4d',
                  color: '#f8fafc',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                Password (optional):
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave empty if public"
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#101216',
                  border: '1px solid #333d4d',
                  color: '#f8fafc',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* ESP32 Arduino sketch copy box */}
          <div
            style={{
              marginTop: '20px',
              backgroundColor: '#101216',
              border: '1px solid #2a303c',
              borderRadius: '8px',
              padding: '14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#a5b4fc' }}>
                ESP32 Firmware Configuration Values:
              </span>
              <button
                type="button"
                onClick={copyToClipboard}
                style={{
                  background: 'transparent',
                  border: '1px solid #374151',
                  color: copiedCode ? '#4ade80' : '#cbd5e1',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre
              style={{
                margin: 0,
                fontSize: '12px',
                fontFamily: 'Consolas, monospace',
                color: '#93c5fd',
                overflowX: 'auto',
                lineHeight: 1.5,
              }}
            >
              {espCodeSnippet}
            </pre>
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '24px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                border: '1px solid #374151',
                color: '#cbd5e1',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '9px 18px',
                borderRadius: '6px',
                backgroundColor: '#4f46e5',
                border: 'none',
                color: '#ffffff',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Save & Apply
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
