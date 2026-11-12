#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------- BLE ----------
#define SERVICE_UUID         "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define REPS_CHAR_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define RESULT_CHAR_UUID     "beb5483e-36e1-4688-b7f5-ea07361b26a9"
// live arm position for the website: "fraction,accel,phase,lastRepMs"
#define LIVE_CHAR_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26aa"

BLECharacteristic *pRepsCharacteristic;
BLECharacteristic *pResultCharacteristic;
BLECharacteristic *pLiveCharacteristic;
unsigned long lastLiveMs = 0;
unsigned long lastRepMs = 0;

// restarts advertising after a phone disconnects so you can reconnect
class ServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer *pServer) {
    BLEDevice::startAdvertising();
  }
};

// ---------- OLED ----------
const int SDA_PIN = 33;
const int SCL_PIN = 32;
const int SCREEN_WIDTH = 128;
const int SCREEN_HEIGHT = 64;   // change to 32 if your screen is 128x32
const int OLED_ADDRESS = 0x3C;  // some screens use 0x3D
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ---------- ACCELEROMETER ----------
const int xPin = 27;
const int SAMPLES = 10;
const float RestVoltage = 1.641;
const float sensitivity = 0.8;
double AlphaAcc = 0.85;

// ---------- TUNE THESE ----------
const float BOTTOM_ACCEL = 3.1;     // accelX_smoothed with arm at the bottom
const float TOP_ACCEL = -11.15;     // accelX_smoothed with arm fully curled
const unsigned long TARGET_REP_MS = 3000;  // ideal time for one full rep (ms)
const unsigned long TOLERANCE_MS = 1000;   // allowed +/- from target (ms)
const unsigned long MIN_REP_MS = 1000;     // anything faster is ignored as a jolt
// --------------------------------

const float LOW_FRAC = 0.3;
const float HIGH_FRAC = 0.7;

float xSmoothedVoltage = RestVoltage;

int reps = 0;
bool inRep = false;
bool reachedTop = false;
unsigned long repStart = 0;

float readAverageVoltage(int pin, int samples) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delayMicroseconds(100);
  }
  return (sum / (float)samples) * (3.3 / 4095.0);
}

float smooth(float newVal, float prevVal, double alpha) {
  return alpha * prevVal + (1 - alpha) * newVal;
}

void showScreen(int repCount, const char* result) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("REPS");

  display.setTextSize(4);
  display.setCursor(0, 14);
  display.print(repCount);

  display.setTextSize(2);
  display.setCursor(0, 48);
  display.print(result);

  display.display();
}

void sendBLE(int repCount, const char* result) {
  String repsStr = String(repCount);

  pRepsCharacteristic->setValue(repsStr.c_str());
  pRepsCharacteristic->notify();

  pResultCharacteristic->setValue(result);
  pResultCharacteristic->notify();
}

void setup() {
  Serial.begin(9600);
  Wire.begin(SDA_PIN, SCL_PIN);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED not found - check wiring/address");
  }

  // ----- BLE setup -----
  BLEDevice::init("ESP32_BLE");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pRepsCharacteristic = pService->createCharacteristic(
    REPS_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pRepsCharacteristic->addDescriptor(new BLE2902());
  pRepsCharacteristic->setValue("0");

  pResultCharacteristic = pService->createCharacteristic(
    RESULT_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pResultCharacteristic->addDescriptor(new BLE2902());
  pResultCharacteristic->setValue("-");

  pLiveCharacteristic = pService->createCharacteristic(
    LIVE_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pLiveCharacteristic->addDescriptor(new BLE2902());
  pLiveCharacteristic->setValue("0,0,0,0");

  pService->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->start();
  Serial.println("ESP32 BLE is ready!");

  showScreen(0, "");
  delay(1000);
}

void loop() {
  double xVoltage;
  float g_x_smoothed;
  float accelX_smoothed;

  // accelerometer data
  xVoltage = readAverageVoltage(xPin, SAMPLES);
  xSmoothedVoltage = smooth(xVoltage, xSmoothedVoltage, AlphaAcc);
  g_x_smoothed = (xSmoothedVoltage - RestVoltage) / sensitivity;
  accelX_smoothed = g_x_smoothed * 9.81;  //convert gravities to ms^2

  // 0 = bottom of curl, 1 = top of curl
  float fraction = (accelX_smoothed - BOTTOM_ACCEL) / (TOP_ACCEL - BOTTOM_ACCEL);

  if (!inRep) {
    // rep starts when the arm leaves the bottom
    if (fraction > LOW_FRAC) {
      inRep = true;
      reachedTop = false;
      repStart = millis();
    }
  } else {
    // note if the arm made it to the top
    if (fraction > HIGH_FRAC) {
      reachedTop = true;
    }

    // rep ends when the arm is back at the bottom
    if (fraction < LOW_FRAC) {
      inRep = false;
      unsigned long repTime = millis() - repStart;

      if (reachedTop && repTime >= MIN_REP_MS) {
        reps++;
        const char* result;

        if (repTime < TARGET_REP_MS - TOLERANCE_MS) {
          result = "TOO FAST";
        } else if (repTime > TARGET_REP_MS + TOLERANCE_MS) {
          result = "TOO SLOW";
        } else {
          result = "GOOD";
        }

        Serial.print("Rep ");
        Serial.print(reps);
        Serial.print(": ");
        Serial.print(repTime / 1000.0, 1);
        Serial.print(" s - ");
        Serial.println(result);

        lastRepMs = repTime;
        showScreen(reps, result);
        sendBLE(reps, result);
      }
    }
  }

  int phase = 0;  // 0 rest, 1 lifting, 2 at the top, 3 lowering
  if (inRep && reachedTop && fraction <= HIGH_FRAC) phase = 3;
  else if (inRep && fraction > HIGH_FRAC) phase = 2;
  else if (inRep) phase = 1;

  sendLive(fraction, accelX_smoothed, phase);
  delay(20);
}

// about 10 Hz so the website can draw the curl without flooding BLE
void sendLive(float fraction, float accel, int phase) {
  if (millis() - lastLiveMs < 100) return;
  lastLiveMs = millis();

  char buf[48];
  snprintf(buf, sizeof(buf), "%.3f,%.2f,%d,%lu", fraction, accel, phase, lastRepMs);
  pLiveCharacteristic->setValue(buf);
  pLiveCharacteristic->notify();
}