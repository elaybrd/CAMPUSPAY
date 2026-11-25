// CampusPay ESP32 + MFRC522 (RC522) Firmware (No ArduinoJson required!)
// Only requires the MFRC522 library.
//
// Wiring (ESP32 DevKit <-> RC522):
//   3.3V -> 3V3   (IMPORTANT: Do NOT connect to 5V)
//   GND  -> GND
//   SDA  -> GPIO 5
//   SCK  -> GPIO 18
//   MOSI -> GPIO 23
//   MISO -> GPIO 19
//   RST  -> GPIO 22

#include <MFRC522.h>
#include <SPI.h>
#include <vector>

constexpr byte SS_PIN = 5;
constexpr byte RST_PIN = 22;
constexpr uint32_t BAUD_RATE = 115200;
constexpr uint32_t DEFAULT_CARD_WAIT_MS = 90000;
constexpr size_t MAX_CARD_PAYLOAD = 700;
constexpr byte FIRST_DATA_BLOCK = 4;
constexpr byte LAST_CARD_BLOCK = 63;
constexpr byte BLOCK_SIZE = 16;
constexpr byte HEADER_SIZE = 8;

MFRC522 reader(SS_PIN, RST_PIN);
String inputLine;
MFRC522::MIFARE_Key keyA;

String jsonEscape(const String &s) {
  String out;
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

bool readerAvailable() {
  SPI.begin(18, 19, 23, 5);
  reader.PCD_Init();
  return true;
}

void reply(const String &id, const char *type, bool ok, const String &message = "") {
  String out = "{\"id\":\"" + jsonEscape(id) + "\",\"type\":\"" + String(type) +
               "\",\"ok\":" + (ok ? "true" : "false");
  if (message.length()) {
    out += String(",\"") + (ok ? "message" : "error") + "\":\"" +
           jsonEscape(message) + "\"";
  }
  out += "}";
  Serial.println(out);
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

bool waitForCard(uint32_t timeoutMs) {
  resetRfField();
  SPI.begin(18, 19, 23, 5);
  reader.PCD_Init();
  const uint32_t started = millis();
  uint16_t loopCount = 0;
  while (millis() - started < timeoutMs) {
    if (Serial.available()) {
      String pendingLine = Serial.readStringUntil('\n');
      pendingLine.trim();
      if (pendingLine.length()) {
        if (extractString(pendingLine, "action") == "cancel") {
          return false;
        }
      }
    }
    if (reader.PICC_IsNewCardPresent() && reader.PICC_ReadCardSerial()) {
      return true;
    }
    // Also try reading card serial directly in case card is already in field
    if (reader.PICC_ReadCardSerial()) {
      return true;
    }
    // Every 400ms, reset antenna register so cards held near reader register immediately
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
                 ",\"protocol\":1,\"reader\":\"MFRC522\"}";
    Serial.println(out);
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
    Serial.println(out);
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
      Serial.println(out);
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
    Serial.println(out);
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
    Serial.println(out);
    stopCard();
    return;
  }

  reply(id, "error", false, "Unsupported command. Supported: hello, scan, write_student, erase_card, read_sectors.");
}

void setup() {
  Serial.begin(BAUD_RATE);
  Serial.setTimeout(100);
  SPI.begin(18, 19, 23, 5);
  reader.PCD_Init();
  for (byte i = 0; i < 6; i++) keyA.keyByte[i] = 0xFF;
}

void loop() {
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
}