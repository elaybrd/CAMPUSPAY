// CampusPay ESP32 + MFRC522 (RC522) Firmware with WiFi & MQTT Support
// Dual-Mode: Works over both WiFi / MQTT and USB Serial simultaneously.
//
// Required Arduino IDE Libraries:
//   1. MFRC522 by GithubCommunity
//   2. PubSubClient by Nick O'Leary
//
// Wiring (ESP32 DevKit <-> RC522):
//   3.3V -> 3V3   (IMPORTANT: Do NOT connect to 5V)
//   GND  -> GND
//   SDA  -> GPIO 5
//   SCK  -> GPIO 18
//   MOSI -> GPIO 23
//   MISO -> GPIO 19
//   RST  -> GPIO 22

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <vector>

// ============================================================================
// CONFIGURATION: Set your WiFi and MQTT credentials here
// ============================================================================
const char* WIFI_SSID     = "aymen1";      // Replace with your WiFi SSID
const char* WIFI_PASS     = "123456789";      // Replace with your WiFi Password

// MQTT Broker Settings:
// Option 1: HiveMQ Cloud (*.hivemq.cloud)
//   - Port MUST be 8883 (uses SSL/TLS encryption)
//   - Requires Username & Password created in HiveMQ Cloud -> Access Management
// Option 2: Public HiveMQ (broker.hivemq.com)
//   - Port is 1883 (no SSL/TLS, no credentials required)
const char* MQTT_SERVER   = "1a219aec1bc248c2a24c399c94a4a63d.s1.eu.hivemq.cloud";
const int   MQTT_PORT     = 8883;                  // IMPORTANT: 8883 for HiveMQ Cloud (TLS)!
const char* MQTT_USER     = "aymen_brd";                    // Required for HiveMQ Cloud (create in Access Management)
const char* MQTT_PASS     = "96383813";                    // Required for HiveMQ Cloud

// Topic prefix: Must match the prefix set in the web dashboard
const char* TOPIC_PREFIX  = "campuspay";

// ============================================================================
// HARDWARE PINS & CONSTANTS
// ============================================================================
constexpr byte SS_PIN = 5;
constexpr byte RST_PIN = 22;
constexpr uint32_t BAUD_RATE = 115200;
constexpr uint32_t DEFAULT_CARD_WAIT_MS = 90000;
constexpr size_t MAX_CARD_PAYLOAD = 700;
constexpr byte FIRST_DATA_BLOCK = 4;
constexpr byte LAST_CARD_BLOCK = 63;
constexpr byte BLOCK_SIZE = 16;
constexpr byte HEADER_SIZE = 8;

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);
MFRC522 reader(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key keyA;

String inputLine;
String lastTappedUid = "";
uint32_t lastTapTime = 0;
uint32_t lastWifiRetry = 0;
uint32_t lastMqttRetry = 0;
uint32_t lastStatusPublish = 0;

// Topic strings generated dynamically
String subCommandTopic;
String pubResponseTopic;
String pubStatusTopic;
String pubTapTopic;
String clientId;

// ============================================================================
// JSON UTILITIES
// ============================================================================
String jsonEscape(const String &s) {
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '\"' || c == '\\') out += '\\';
    out += c;
  }
  return out;
}

String extractString(const String &json, const char *key) {
  String pattern = String("\"") + key + "\"";
  int pos = json.indexOf(pattern);
  if (pos < 0) return "";
  pos = json.indexOf(':', pos + pattern.length());
  if (pos < 0) return "";
  pos = json.indexOf('\"', pos + 1);
  if (pos < 0) return "";
  int start = pos + 1;
  String result;
  for (int i = start; i < (int)json.length(); i++) {
    char c = json[i];
    if (c == '\\' && i + 1 < (int)json.length()) {
      result += json[++i];
    } else if (c == '\"') {
      return result;
    } else {
      result += c;
    }
  }
  return "";
}

long extractInt(const String &json, const char *key, long fallback) {
  String pattern = String("\"") + key + "\"";
  int pos = json.indexOf(pattern);
  if (pos < 0) return fallback;
  pos = json.indexOf(':', pos + pattern.length());
  if (pos < 0) return fallback;
  int start = pos + 1;
  while (start < (int)json.length() && json[start] == ' ') start++;
  int end = start;
  if (end < (int)json.length() && json[end] == '-') end++;
  while (end < (int)json.length() && isDigit(json[end])) end++;
  if (end == start || (end == start + 1 && json[start] == '-')) return fallback;
  return json.substring(start, end).toInt();
}

String uidString() {
  String uid;
  for (byte i = 0; i < reader.uid.size; i++) {
    if (i) uid += ':';
    if (reader.uid.uidByte[i] < 0x10) uid += '0';
    uid += String(reader.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

String compactUid(String value) {
  value.replace(":", "");
  value.replace(" ", "");
  value.toUpperCase();
  return value;
}

String cardTypeName() {
  return String(MFRC522::PICC_GetTypeName(MFRC522::PICC_GetType(reader.uid.sak)));
}

// ============================================================================
// RESPONSE SENDER (DUAL CHANNEL: SERIAL + MQTT)
// ============================================================================
void sendOut(const String &jsonString) {
  Serial.println(jsonString);
  if (mqttClient.connected()) {
    mqttClient.publish(pubResponseTopic.c_str(), jsonString.c_str());
  }
}

void reply(const String &id, const char *type, bool ok, const String &message = "") {
  String out = "{\"id\":\"" + jsonEscape(id) + "\",\"type\":\"" + String(type) +
               "\",\"ok\":" + (ok ? "true" : "false");
  if (message.length()) {
    out += String(",\"") + (ok ? "message" : "error") + "\":\"" +
           jsonEscape(message) + "\"";
  }
  out += "}";
  sendOut(out);
}

void stopCard() {
  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
}

void resetRfField() {
  reader.PCD_AntennaOff();
  delay(5);
  reader.PCD_AntennaOn();
  delay(5);
}

// ============================================================================
// CARD I/O HELPERS
// ============================================================================
bool waitForCard(uint32_t timeoutMs) {
  resetRfField();
  SPI.begin(18, 19, 23, 5);
  reader.PCD_Init();
  const uint32_t started = millis();
  uint16_t loopCount = 0;
  while (millis() - started < timeoutMs) {
    // Keep MQTT client active while waiting
    if (mqttClient.connected()) {
      mqttClient.loop();
    }

    if (Serial.available()) {
      String pendingLine = Serial.readStringUntil('\n');
      pendingLine.trim();
      if (pendingLine.length() && extractString(pendingLine, "action") == "cancel") {
        return false;
      }
    }

    if (reader.PICC_IsNewCardPresent() && reader.PICC_ReadCardSerial()) {
      return true;
    }
    if (reader.PICC_ReadCardSerial()) {
      return true;
    }

    loopCount++;
    if (loopCount >= 20) {
      loopCount = 0;
      SPI.begin(18, 19, 23, 5);
      reader.PCD_Init();
    }
    delay(20);
  }
  return false;
}

bool authenticateBlock(byte block) {
  return reader.PCD_Authenticate(
             MFRC522::PICC_CMD_MF_AUTH_KEY_A, block, &keyA, &reader.uid) ==
         MFRC522::STATUS_OK;
}

std::vector<byte> dataBlocks() {
  std::vector<byte> blocks;
  for (byte block = FIRST_DATA_BLOCK; block <= LAST_CARD_BLOCK; block++) {
    if (block % 4 != 3) blocks.push_back(block);
  }
  return blocks;
}

bool writeAndVerify(const String &payload) {
  if (payload.length() > MAX_CARD_PAYLOAD) return false;
  const std::vector<byte> blocks = dataBlocks();
  const size_t totalSize = HEADER_SIZE + payload.length();
  if (totalSize > blocks.size() * BLOCK_SIZE) return false;

  std::vector<byte> bytes(totalSize, 0);
  bytes[0] = 'C';
  bytes[1] = 'P';
  bytes[2] = 'A';
  bytes[3] = 'Y';
  bytes[4] = 1;
  bytes[5] = (payload.length() >> 8) & 0xFF;
  bytes[6] = payload.length() & 0xFF;
  for (size_t i = 0; i < payload.length(); i++) {
    bytes[HEADER_SIZE + i] = payload[i];
  }

  for (size_t offset = 0; offset < totalSize; offset += BLOCK_SIZE) {
    const byte block = blocks[offset / BLOCK_SIZE];
    byte chunk[BLOCK_SIZE] = {0};
    const size_t count = min(static_cast<size_t>(BLOCK_SIZE), totalSize - offset);
    for (size_t i = 0; i < count; i++) chunk[i] = bytes[offset + i];
    if (!authenticateBlock(block) ||
        reader.MIFARE_Write(block, chunk, BLOCK_SIZE) != MFRC522::STATUS_OK) {
      reader.PCD_StopCrypto1();
      return false;
    }
  }

  std::vector<byte> verified(totalSize, 0);
  for (size_t offset = 0; offset < totalSize; offset += BLOCK_SIZE) {
    const byte block = blocks[offset / BLOCK_SIZE];
    byte chunk[18] = {0};
    byte size = sizeof(chunk);
    if (!authenticateBlock(block) ||
        reader.MIFARE_Read(block, chunk, &size) != MFRC522::STATUS_OK) {
      reader.PCD_StopCrypto1();
      return false;
    }
    const size_t count = min(static_cast<size_t>(BLOCK_SIZE), totalSize - offset);
    for (size_t i = 0; i < count; i++) verified[offset + i] = chunk[i];
  }
  reader.PCD_StopCrypto1();
  return verified == bytes;
}

// ============================================================================
// COMMAND HANDLER
// ============================================================================
void handleCommand(const String &line) {
  if (line.indexOf('{') < 0) {
    reply("", "error", false, "Invalid JSON command.");
    return;
  }
  const String id = extractString(line, "id");
  const String action = extractString(line, "action");
  const uint32_t timeoutMs = (uint32_t)extractInt(line, "timeoutMs", DEFAULT_CARD_WAIT_MS);

  if (action == "hello") {
    SPI.begin(18, 19, 23, 5);
    reader.PCD_Init();
    String out = "{\"id\":\"" + jsonEscape(id) +
                 "\",\"type\":\"ready\",\"ok\":true" +
                 ",\"protocol\":1,\"reader\":\"MFRC522-MQTT\"" +
                 ",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
    sendOut(out);
    return;
  }

  if (action == "cancel") {
    return;
  }

  if (action == "scan") {
    SPI.begin(18, 19, 23, 5);
    reader.PCD_Init();
    if (!waitForCard(timeoutMs)) {
      reply(id, "error", false, "Scan timed out or was cancelled before a card was detected.");
      return;
    }
    String out = "{\"id\":\"" + jsonEscape(id) +
                 "\",\"type\":\"scan_result\",\"ok\":true,\"uid\":\"" +
                 uidString() + "\",\"cardType\":\"" +
                 jsonEscape(cardTypeName()) + "\"}";
    sendOut(out);
    stopCard();
    return;
  }

  if (action == "write_student") {
    const String expectedUid = compactUid(extractString(line, "uid"));
    if (!expectedUid.length()) {
      reply(id, "write_result", false, "A previously scanned card UID is required.");
      return;
    }
    if (!waitForCard(timeoutMs)) {
      reply(id, "write_result", false, "No card detected before timeout.");
      return;
    }
    const String actualUid = uidString();
    if (compactUid(actualUid) != expectedUid) {
      stopCard();
      String out = "{\"id\":\"" + jsonEscape(id) +
                   "\",\"type\":\"write_result\",\"ok\":false,\"uid\":\"" +
                   actualUid +
                   "\",\"error\":\"A different card was presented. No data was written.\"}";
      sendOut(out);
      return;
    }
    if (MFRC522::PICC_GetType(reader.uid.sak) != MFRC522::PICC_TYPE_MIFARE_1K) {
      stopCard();
      reply(id, "write_result", false, "This firmware writes only MIFARE Classic 1K cards.");
      return;
    }

    const String studentId = extractString(line, "studentId");
    const String fullName = extractString(line, "fullName");
    const long coins = extractInt(line, "coins", -1);

    if (!studentId.length() || !fullName.length() || coins < 0) {
      stopCard();
      reply(id, "write_result", false, "Student ID, full name, and integer coins are required.");
      return;
    }

    String serializedProfile =
        "{\"format\":\"campuspay-student-v1\",\"studentId\":\"" +
        jsonEscape(studentId) + "\",\"fullName\":\"" + jsonEscape(fullName) +
        "\",\"coins\":" + String(coins) + "}";

    const bool verified = writeAndVerify(serializedProfile);
    stopCard();

    String msg = verified
                     ? "Student data written and read back successfully."
                     : "Card write or read-back verification failed.";
    String out = "{\"id\":\"" + jsonEscape(id) +
                 "\",\"type\":\"write_result\",\"ok\":" +
                 (verified ? "true" : "false") + ",\"uid\":\"" + actualUid +
                 "\",\"cardType\":\"" + jsonEscape(String(cardTypeName())) +
                 "\",\"" + (verified ? "message" : "error") + "\":\"" + msg +
                 "\"}";
    sendOut(out);
    return;
  }

  if (action == "erase_card") {
    const String expectedUid = compactUid(extractString(line, "uid"));
    if (!waitForCard(timeoutMs)) {
      reply(id, "write_result", false, "No card detected before timeout.");
      return;
    }
    const String actualUid = uidString();
    if (expectedUid.length() && compactUid(actualUid) != expectedUid) {
      stopCard();
      reply(id, "write_result", false, "A different card was presented. Card not erased.");
      return;
    }
    String erasedPayload = "{\"format\":\"erased\"}";
    const bool verified = writeAndVerify(erasedPayload);
    stopCard();

    String msg = verified ? "Card memory erased successfully." : "Failed to erase card memory.";
    reply(id, "write_result", verified, msg);
    return;
  }

  if (action == "read_sectors" || action == "dump_sectors") {
    reader.PCD_Init();
    if (!waitForCard(timeoutMs)) {
      reply(id, "error", false, "No card detected before timeout.");
      return;
    }
    String cardUidStr = uidString();
    String cardTypeStr = cardTypeName();

    String out = "{\"id\":\"" + jsonEscape(id) + "\",\"type\":\"sector_dump\",\"ok\":true,\"uid\":\"" + cardUidStr + "\",\"cardType\":\"" + jsonEscape(cardTypeStr) + "\",\"sectors\":[";

    for (byte s = 0; s < 16; s++) {
      if (s > 0) out += ",";
      out += "{\"sector\":" + String(s) + ",\"blocks\":[";
      byte trailerBlock = s * 4 + 3;
      bool authed = (reader.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, trailerBlock, &keyA, &reader.uid) == MFRC522::STATUS_OK);

      for (byte b = 0; b < 4; b++) {
        byte blockNum = s * 4 + b;
        if (b > 0) out += ",";
        out += "{\"block\":" + String(blockNum) + ",\"hex\":\"";

        if (authed) {
          byte buffer[18];
          byte size = sizeof(buffer);
          if (reader.MIFARE_Read(blockNum, buffer, &size) == MFRC522::STATUS_OK) {
            String hexStr = "";
            for (byte i = 0; i < 16; i++) {
              if (i > 0) hexStr += " ";
              if (buffer[i] < 0x10) hexStr += "0";
              hexStr += String(buffer[i], HEX);
            }
            hexStr.toUpperCase();
            out += hexStr;
          } else {
            out += "READ_ERROR";
          }
        } else {
          out += "AUTH_ERROR";
        }
        out += "\"}";
      }
      out += "]}";
    }
    out += "]}";
    sendOut(out);
    stopCard();
    return;
  }

  reply(id, "error", false, "Unsupported command. Supported: hello, scan, write_student, erase_card, read_sectors.");
}

// ============================================================================
// MQTT CALLBACK
// ============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  message.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  message.trim();
  if (message.length()) {
    handleCommand(message);
  }
}

// ============================================================================
// WIFI & MQTT RECONNECT
// ============================================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (String(WIFI_SSID) == "YOUR_WIFI_SSID") {
    // WiFi not configured yet, skip silently
    return;
  }
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED || mqttClient.connected()) return;

  Serial.print("Connecting to MQTT broker: ");
  Serial.print(MQTT_SERVER);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  if (String(MQTT_SERVER).indexOf("hivemq.cloud") >= 0) {
    if (strlen(MQTT_USER) == 0 || strlen(MQTT_PASS) == 0) {
      Serial.println("[WARNING] HiveMQ Cloud requires a Username and Password!");
      Serial.println("Go to your HiveMQ Cloud console -> 'Access Management' -> create user credentials, then fill in MQTT_USER and MQTT_PASS.");
    }
    if (MQTT_PORT == 1883) {
      Serial.println("[ERROR] HiveMQ Cloud rejects port 1883! You MUST change MQTT_PORT to 8883 (SSL/TLS).");
    }
  }

  String willTopic = pubStatusTopic;
  String willMsg = "{\"status\":\"offline\"}";

  bool success = false;
  if (strlen(MQTT_USER) > 0) {
    success = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS, willTopic.c_str(), 1, true, willMsg.c_str());
  } else {
    success = mqttClient.connect(clientId.c_str(), willTopic.c_str(), 1, true, willMsg.c_str());
  }

  if (success) {
    Serial.println("MQTT Connected!");
    mqttClient.subscribe(subCommandTopic.c_str(), 1);

    // Publish online status
    String statusMsg = "{\"status\":\"online\",\"ip\":\"" + WiFi.localIP().toString() +
                       "\",\"rssi\":" + String(WiFi.RSSI()) +
                       ",\"clientId\":\"" + clientId + "\"}";
    mqttClient.publish(pubStatusTopic.c_str(), statusMsg.c_str(), true);
  } else {
    Serial.print("MQTT connect failed, rc=");
    Serial.println(mqttClient.state());
    if (mqttClient.state() == -2) {
      Serial.println("rc=-2 (NETWORK_FAILURE): HiveMQ Cloud requires port 8883 (TLS) and a valid username/password.");
    } else if (mqttClient.state() == 4 || mqttClient.state() == 5) {
      Serial.println("rc=4/5 (BAD_CREDENTIALS): Wrong username or password for HiveMQ Cloud!");
    }
  }
}

// ============================================================================
// SETUP & LOOP
// ============================================================================
void setup() {
  Serial.begin(BAUD_RATE);
  Serial.setTimeout(100);

  SPI.begin(18, 19, 23, 5);
  reader.PCD_Init();
  for (byte i = 0; i < 6; i++) keyA.keyByte[i] = 0xFF;

  // Generate topics
  clientId = "CampusPay-ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  subCommandTopic = String(TOPIC_PREFIX) + "/command";
  pubResponseTopic = String(TOPIC_PREFIX) + "/response";
  pubStatusTopic = String(TOPIC_PREFIX) + "/status";
  pubTapTopic = String(TOPIC_PREFIX) + "/tap";

  espClient.setInsecure(); // Required for HiveMQ Cloud TLS connection
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(3072); // Allow full sector dumps

  connectWiFi();
}

void loop() {
  // Check WiFi status every 10 seconds if not connected
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - lastWifiRetry > 10000) {
      lastWifiRetry = millis();
      connectWiFi();
    }
  } else {
    // Check MQTT connection
    if (!mqttClient.connected()) {
      if (millis() - lastMqttRetry > 5000) {
        lastMqttRetry = millis();
        connectMQTT();
      }
    } else {
      mqttClient.loop();

      // Periodically publish heartbeat/status every 30 seconds
      if (millis() - lastStatusPublish > 30000) {
        lastStatusPublish = millis();
        String statusMsg = "{\"status\":\"online\",\"ip\":\"" + WiFi.localIP().toString() +
                           "\",\"rssi\":" + String(WiFi.RSSI()) +
                           ",\"clientId\":\"" + clientId + "\"}";
        mqttClient.publish(pubStatusTopic.c_str(), statusMsg.c_str(), true);
      }
    }
  }

  // Handle incoming Serial commands
  while (Serial.available()) {
    const char character = static_cast<char>(Serial.read());
    if (character == '\n') {
      inputLine.trim();
      if (inputLine.length()) handleCommand(inputLine);
      inputLine = "";
    } else if (character != '\r' && inputLine.length() < 2048) {
      inputLine += character;
    }
  }

  // Idle automatic card tap detector
  // When a card is placed on reader without a command active, broadcast it over tap topic
  if (reader.PICC_IsNewCardPresent() && reader.PICC_ReadCardSerial()) {
    String currentUid = uidString();
    uint32_t now = millis();

    // Debounce: require card to be removed OR at least 7 seconds cooldown for the same card
    // This prevents repeated coin deductions while holding the card near the reader
    if (currentUid != lastTappedUid || (now - lastTapTime > 7000)) {
      lastTappedUid = currentUid;
      lastTapTime = now;

      String tapJson = "{\"type\":\"card_tapped\",\"uid\":\"" + currentUid +
                       "\",\"cardType\":\"" + jsonEscape(cardTypeName()) + "\"}";

      Serial.println(tapJson);
      if (mqttClient.connected()) {
        mqttClient.publish(pubTapTopic.c_str(), tapJson.c_str());
      }
    }
    stopCard();
    resetRfField();
  } else {
    // Once the card is physically removed from the reader for 1.5s, clear the memory lock
    if (millis() - lastTapTime > 1500 && lastTappedUid.length() > 0) {
      lastTappedUid = "";
    }
  }
}
