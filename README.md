# CampusPay

CampusPay is a school-project demo. Student coins are points stored in Supabase, not real money. The ESP32 can write a copy of the student's name, ID, and current coin count to a card; the database remains the main record.

## Before you start

You need Node.js LTS, a Supabase account, Chrome or Edge, an ESP32 DevKit, an MFRC522 RFID module, and a MIFARE Classic 1K card. The included firmware is written for this exact ESP32/MFRC522 combination. A different reader or card type needs different firmware.

## 1. Create the Supabase database

1. Open [supabase.com](https://supabase.com/) and sign in.
2. Click **New project**, choose your organization, enter a project name and database password, choose a region, and create the project. Save the database password somewhere safe.
3. Wait until the project status says it is ready.
4. In the project dashboard, open **SQL Editor** and click **New query**.
5. In this project, open `supabase/schema.sql`. Copy the entire file, paste it into the Supabase SQL Editor, and click **Run**.
6. Confirm the query completes successfully. It creates the students, NFC cards, and transactions tables, access policies, photo storage, and database functions.
7. In Supabase, open **Authentication → Users → Add user**. Create your admin user with an email and password.
8. Open that user and copy its **User UID**.
9. Return to **SQL Editor**, run this command, and replace the example UUID with the copied UID:

```sql
update public.profiles
set role = 'admin', display_name = 'Campus Admin'
where id = 'PASTE-THE-USER-UID-HERE';
```

10. In Supabase, open **Project Settings → API** (or the project's **Connect** panel). Copy the **Project URL** and the **anon/public key**. Do not use the `service_role` key in the app.

## 2. Connect CampusPay to Supabase

1. Open PowerShell in the folder containing this README.
2. Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

3. Open `.env` and replace the example values with your Supabase Project URL and anon/public key:

```env
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
```

4. Save `.env`. Never put the Supabase `service_role` key in this file.
5. In PowerShell, install and run the app:

```powershell
npm install
npm run dev
```

6. Open the URL Vite prints, usually `http://localhost:5173`.
7. Sign in with the admin email and password you created. Student registration and card operations require this database connection; preview data is not saved.

## 3. Upload the ESP32 code

Two firmware options are included:

1. **Dual-Mode WiFi + MQTT (Recommended):** [CampusPayEsp32Mfrc522_MQTT.ino](firmware/CampusPayEsp32Mfrc522_MQTT/CampusPayEsp32Mfrc522_MQTT.ino) — Works wirelessly over WiFi via MQTT and simultaneously over USB Serial. Requires the **PubSubClient** (by Nick O'Leary) and **MFRC522** libraries.
2. **USB Serial Only:** [CampusPayEsp32Mfrc522.ino](firmware/CampusPayEsp32Mfrc522/CampusPayEsp32Mfrc522.ino) — Classic USB Web Serial connection.

### Arduino IDE setup for WiFi + MQTT

1. Install **Arduino IDE 2** from [arduino.cc](https://www.arduino.cc/en/software/).
2. In Arduino IDE, open **Tools → Board → Boards Manager**, search for **esp32**, and install **esp32 by Espressif Systems**.
3. Open **Sketch → Include Library → Manage Libraries**. Search for and install:
   - **MFRC522** (by GithubCommunity)
   - **PubSubClient** (by Nick O'Leary)
4. Wire the MFRC522 to the ESP32 using the table below (**3.3V only**, do not connect to 5V).
5. Open `firmware/CampusPayEsp32Mfrc522_MQTT/CampusPayEsp32Mfrc522_MQTT.ino` in Arduino IDE.
6. In lines 29-39, enter your WiFi credentials and broker preferences:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_NAME";
   const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";
   const char* MQTT_SERVER   = "broker.hivemq.com";
   const int   MQTT_PORT     = 1883;
   const char* TOPIC_PREFIX  = "campuspay";
   ```
7. Select **ESP32 Dev Module** and the USB Port, then click **Upload**.
8. In the CampusPay web dashboard:
   - Ensure the mode toggle in the top bar is set to **WiFi MQTT**.
   - Click **Connect WiFi**. Once connected, card taps and writes are transmitted wirelessly in real time!
   - Click the **Settings (gear)** icon next to the toggle to change broker URLs or topic prefixes at any time.

### MFRC522 wiring

| MFRC522 pin | ESP32 DevKit pin |
| --- | --- |
| 3.3V / VCC | 3V3 |
| GND | GND |
| SDA / SS | GPIO 5 |
| SCK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| RST | GPIO 22 |

The sketch uses 115200 baud. Its `hello` command checks that the MFRC522 responds over SPI; a connected USB cable alone does not mean the RFID reader is ready.

## 4. Register a student and write their card

1. Keep the ESP32 connected to the computer with USB. Keep Arduino IDE's Serial Monitor closed.
2. In CampusPay, open **Students → Add student**.
3. Click **Connect ESP32**. In the browser permission dialog, choose the ESP32 USB serial port and click **Connect**.
4. Wait for the status to show **ESP32 connected**. If it fails, check the USB cable, selected port, firmware upload, and MFRC522 wiring.
5. Click **Scan physical card** and present a MIFARE Classic 1K card to the MFRC522 antenna. The UID shown must come from the reader; the app does not make one up.
6. Fill in the student details and starting coin balance. The default coin balance is zero.
7. Click **Register student**. CampusPay saves the student and starting coins in Supabase and reserves the card as disabled.
8. When the screen says **Present the scanned card to the ESP32**, present that same card again. The ESP32 checks its UID before writing the student ID, name, and coin snapshot.
9. The ESP32 reads the written data back. CampusPay activates the card only when the firmware confirms a successful write for the same UID. If writing fails, the student stays saved and the card stays disabled; use **Retry card write** to try again.

## What the serial code sends

The dashboard sends one JSON command per line. The `id` is a request identifier; firmware replies must return the same `id`.

```json
{"id":"request-id","action":"hello"}
{"id":"request-id","action":"scan"}
{"id":"request-id","action":"write_student","uid":"04A1B2C3D4","student":{"studentId":"STU-2026-005","fullName":"Student Name","coins":0}}
```

The firmware replies with `ready`, `scan_result`, or `write_result`. A write succeeds only after the card UID matches and the data can be read back. The full C++ implementation is in the linked `.ino` file above; do not paste these JSON examples into Arduino IDE as firmware code.

## Important school-project limitation

This example uses MIFARE Classic 1K and its public factory key. Student details and coin snapshots are not encrypted, and cards can be cloned or changed. This is suitable only as a classroom demonstration. The card's coin count is a snapshot, not the live balance. CampusPay keeps the current coin balance in Supabase. Do not use this sample for real money or real access control.

## Main features

- Student registration and profile photo storage
- Database-backed coin balances and transaction history
- ESP32/MFRC522 UID scanning and verified card-profile writing
- Card administration and cafeteria demo checkout
- Supabase authentication and database access policies
