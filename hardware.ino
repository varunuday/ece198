#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Preferences.h>

// =====================================================================
//  Multi-exercise rep counter (ESP32 + MMA7361 + SSD1306 OLED)
//
//  BOOT button (GPIO 0):
//    short press  = next exercise (reps reset to 0)
//    hold 1.5 s   = calibrate the current exercise (start pose, end pose)
//
//  To add an exercise: add one line to exercises[] below, AT THE END of
//  the list (saved calibrations are stored by position in the list).
// =====================================================================

// ---------- BLE ----------
#define SERVICE_UUID         "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define REPS_CHAR_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define RESULT_CHAR_UUID     "beb5483e-36e1-4688-b7f5-ea07361b26a9"
// live arm position for the website: "fraction,accel,phase,lastRepMs"
// (same format as before; accel is the axis used by the current exercise)
#define LIVE_CHAR_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26aa"
// NEW: exercise info (read/notify) and commands (write)
// notify value: "index,count,calibrated,NAME"   e.g. "1,6,0,PEC DECK"
// write: "0".."99" = select exercise, "N" = next, "R" = reset reps,
//        "C" = calibrate current exercise
#define EXERCISE_CHAR_UUID   "beb5483e-36e1-4688-b7f5-ea07361b26ab"

BLECharacteristic *pRepsCharacteristic;
BLECharacteristic *pResultCharacteristic;
BLECharacteristic *pLiveCharacteristic;
BLECharacteristic *pExerciseCharacteristic;
unsigned long lastLiveMs = 0;
unsigned long lastRepMs = 0;

// commands from BLE are handed to loop() so nothing runs in the BLE task
volatile int pendingExercise = -1;
volatile char pendingCmd = 0;

// restarts advertising after a phone disconnects so you can reconnect
class ServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer *pServer) {
    BLEDevice::startAdvertising();
  }
};

class ExerciseCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pChar) {
    auto v = pChar->getValue();
    const char *p = v.c_str();
    size_t len = v.length();
    if (len == 0) return;

    if (p[0] >= '0' && p[0] <= '9') {
      int n = 0;
      for (size_t i = 0; i < len && i < 3 && p[i] >= '0' && p[i] <= '9'; i++) {
        n = n * 10 + (p[i] - '0');
      }
      pendingExercise = n;
    } else if (p[0] == 'N' || p[0] == 'n') {
      pendingCmd = 'N';
    } else if (p[0] == 'R' || p[0] == 'r') {
      pendingCmd = 'R';
    } else if (p[0] == 'C' || p[0] == 'c') {
      pendingCmd = 'C';
    }
  }
};

// ---------- OLED ----------
const int SDA_PIN = 33;
const int SCL_PIN = 32;
const int SCREEN_WIDTH = 128;
const int SCREEN_HEIGHT = 64;   // this layout is designed for 128x64
const int OLED_ADDRESS = 0x3C;  // some screens use 0x3D
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ---------- BUTTON ----------
const int BUTTON_PIN = 0;                    // BOOT button on the board
const unsigned long LONG_PRESS_MS = 1500;
bool btnDown = false;
bool longHandled = false;
unsigned long btnDownMs = 0;

// ---------- ACCELEROMETER (MMA7361, analog) ----------
// X, Y, Z outputs -> these GPIOs
const int AXIS_PINS[3] = {27, 26, 25};
const int SAMPLES = 5;
const float REST_VOLTAGE[3] = {1.641, 1.641, 1.641};  // 0 g output per axis
const float SENSITIVITY = 0.8;                         // V per g (GS = GND)
const double ALPHA = 0.60;

float smoothedV[3] = {1.641, 1.641, 1.641};
float accel[3] = {0, 0, 0};   // m/s^2 for X, Y, Z

// ---------- EXERCISES ----------
struct Exercise {
  const char *name;             // shown on the OLED (max ~16 chars)
  uint8_t axis;                 // 0 = X, 1 = Y, 2 = Z
  float startAccel;             // accel on that axis at the START pose
  float endAccel;               // accel on that axis at the END pose
  unsigned long targetMs;       // ideal time for one full rep (ms)
  unsigned long toleranceMs;    // allowed +/- from target (ms)
  unsigned long minRepMs;       // anything faster is ignored as a jolt
  bool calibrated;              // false = needs a calibration (hold BOOT)
};

// name, axis, start, end, target, tolerance, minRep, calibrated
// The values below assume: sensor strapped to the back of the
// forearm just above the wrist, X axis pointing along the forearm toward the
// ELBOW.
// All six exercises are calibrated and calculated out of the box.
// Hold BOOT for 1.5 s on any exercise (or send 'C' over BLE) to record
// custom measured poses.
Exercise exercises[] = {
  {"BICEP CURL",     0,  3.1f, -11.15f, 3000, 1000, 1000, true},   // forearm vertical down -> vertical up
  {"PEC DECK",       1, -0.5f,   6.5f,  3000, 1000, 1000, true},   // arms open wide -> squeeze pads in front
  {"OVERHEAD EXT",   0,  9.0f,  -9.0f,  3000, 1000, 1000, true},   // forearm down behind head -> straight up
  {"LATERAL RAISE",  0,  9.0f,   1.0f,  2500, 1000, 1000, true},   // arm hanging -> arm horizontal
  {"SHOULDER PRESS", 2,  4.0f,  -2.5f,  3000, 1000, 1000, true},   // hands at shoulders -> arms locked overhead
  {"TRICEP PUSHDN",  0, -2.0f,   9.0f,  3000, 1000, 1000, true},   // forearm forward -> pointing down
};
const int NUM_EXERCISES = sizeof(exercises) / sizeof(exercises[0]);
int currentEx = 0;

// ---------- TUNING ----------
const float LOW_FRAC = 0.3;
const float HIGH_FRAC = 0.7;
const float MIN_CAL_DIFF = 3.0;   // m/s^2: start/end poses must differ by this

// set to 1 to stream "X,Y,Z" accel to the Serial Monitor / Plotter
// (handy for checking the Y and Z wiring)
#define DEBUG_ACCEL 0

Preferences prefs;

// ---------- STATE ----------
int reps = 0;
bool inRep = false;
bool reachedTop = false;
unsigned long repStart = 0;
const char *resultText = "";

// =====================================================================
//  Sensor helpers
// =====================================================================
float readAverageVoltage(int pin, int samples) {
  analogRead(pin);  // throw-away read so the previous channel doesn't bleed in
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

// reads all three axes, smooths them, fills accel[] in m/s^2
void readAccel() {
  for (int a = 0; a < 3; a++) {
    float v = readAverageVoltage(AXIS_PINS[a], SAMPLES);
    smoothedV[a] = smooth(v, smoothedV[a], ALPHA);
    float g = (smoothedV[a] - REST_VOLTAGE[a]) / SENSITIVITY;
    accel[a] = g * 9.81f;
  }
}

// =====================================================================
//  OLED
// =====================================================================
void showScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // top row: exercise name (left), index (right)
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(exercises[currentEx].name);

  char idx[12];
  snprintf(idx, sizeof(idx), "%d/%d", currentEx + 1, NUM_EXERCISES);
  display.setCursor(SCREEN_WIDTH - 6 * (int)strlen(idx), 0);
  display.print(idx);

  // big rep count
  display.setTextSize(4);
  display.setCursor(0, 12);
  display.print(reps);

  // last rep time
  if (lastRepMs > 0) {
    display.setTextSize(2);
    display.setCursor(80, 20);
    display.print(lastRepMs / 1000.0, 1);
    display.print("s");
  }

  // result text
  display.setTextSize(2);
  display.setCursor(0, 48);
  display.print(resultText);

  display.display();
}

void drawCal(const char *label, const char *line) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("CALIBRATING");
  display.setCursor(0, 10);
  display.print(exercises[currentEx].name);
  display.setTextSize(2);
  display.setCursor(0, 26);
  display.print(label);
  display.setTextSize(1);
  display.setCursor(0, 50);
  display.print(line);
  display.display();
}

// =====================================================================
//  BLE senders
// =====================================================================
void sendBLE(const char *result) {
  String repsStr = String(reps);

  pRepsCharacteristic->setValue(repsStr.c_str());
  pRepsCharacteristic->notify();

  pResultCharacteristic->setValue(result);
  pResultCharacteristic->notify();
}

void sendExerciseInfo() {
  char buf[48];
  snprintf(buf, sizeof(buf), "%d,%d,%d,%s", currentEx, NUM_EXERCISES,
           exercises[currentEx].calibrated ? 1 : 0, exercises[currentEx].name);
  pExerciseCharacteristic->setValue(buf);
  pExerciseCharacteristic->notify();
}

// about 10 Hz so the website can draw the motion without flooding BLE
void sendLive(float fraction, float accelVal, int phase) {
  if (millis() - lastLiveMs < 100) return;
  lastLiveMs = millis();

  char buf[48];
  snprintf(buf, sizeof(buf), "%.3f,%.2f,%d,%lu", fraction, accelVal, phase, lastRepMs);
  pLiveCharacteristic->setValue(buf);
  pLiveCharacteristic->notify();
}

// =====================================================================
//  Calibration storage
// =====================================================================
void loadCalibration() {
  char key[16];
  for (int i = 0; i < NUM_EXERCISES; i++) {
    snprintf(key, sizeof(key), "cal%d", i);
    if (prefs.getBool(key, false)) {
      snprintf(key, sizeof(key), "ax%d", i);
      exercises[i].axis = prefs.getUChar(key, exercises[i].axis);
      snprintf(key, sizeof(key), "st%d", i);
      exercises[i].startAccel = prefs.getFloat(key, exercises[i].startAccel);
      snprintf(key, sizeof(key), "en%d", i);
      exercises[i].endAccel = prefs.getFloat(key, exercises[i].endAccel);
      exercises[i].calibrated = true;
    }
  }
}

void saveCalibration(int i) {
  char key[16];
  snprintf(key, sizeof(key), "ax%d", i);
  prefs.putUChar(key, exercises[i].axis);
  snprintf(key, sizeof(key), "st%d", i);
  prefs.putFloat(key, exercises[i].startAccel);
  snprintf(key, sizeof(key), "en%d", i);
  prefs.putFloat(key, exercises[i].endAccel);
  snprintf(key, sizeof(key), "cal%d", i);
  prefs.putBool(key, true);
}

// =====================================================================
//  Exercise selection
// =====================================================================
void resetRepState() {
  inRep = false;
  reachedTop = false;
}

// also used to reset reps: selectExercise(currentEx)
void selectExercise(int idx) {
  if (idx < 0 || idx >= NUM_EXERCISES) return;

  currentEx = idx;
  reps = 0;
  lastRepMs = 0;
  resetRepState();
  resultText = exercises[idx].calibrated ? "" : "HOLD=CAL";

  Serial.print("Exercise ");
  Serial.print(idx);
  Serial.print(": ");
  Serial.print(exercises[idx].name);
  Serial.println(exercises[idx].calibrated ? "" : "  (needs calibration)");

  showScreen();
  sendBLE("-");
  sendExerciseInfo();
}

// =====================================================================
//  Calibration routine (blocking, takes about 12 seconds)
//  Records the START pose and END pose, then picks the axis that
//  changed the most and stores it for this exercise.
// =====================================================================
void capturePose(const char *label, int countdownSec, float out[3]) {
  unsigned long countdownMs = countdownSec * 1000UL;
  unsigned long t0 = millis();
  int lastLeft = -1;

  // time to get into position (keep the filter warm meanwhile)
  while (millis() - t0 < countdownMs) {
    readAccel();
    int left = (countdownMs - (millis() - t0)) / 1000 + 1;
    if (left != lastLeft) {
      lastLeft = left;
      char line[24];
      snprintf(line, sizeof(line), "Get in position: %d", left);
      drawCal(label, line);
    }
    delay(5);
  }

  // average 1 second of readings
  drawCal(label, "HOLD STILL...");
  float sum[3] = {0, 0, 0};
  int n = 0;
  unsigned long t1 = millis();
  while (millis() - t1 < 1000) {
    readAccel();
    for (int a = 0; a < 3; a++) sum[a] += accel[a];
    n++;
    delay(20);
  }
  for (int a = 0; a < 3; a++) out[a] = sum[a] / n;
}

void runCalibration() {
  Serial.print("Calibrating ");
  Serial.println(exercises[currentEx].name);

  float startPose[3], endPose[3];
  capturePose("START POSE", 4, startPose);
  capturePose("END POSE", 5, endPose);

  Serial.print("Start pose X,Y,Z: ");
  Serial.print(startPose[0]); Serial.print(", ");
  Serial.print(startPose[1]); Serial.print(", ");
  Serial.println(startPose[2]);
  Serial.print("End pose   X,Y,Z: ");
  Serial.print(endPose[0]); Serial.print(", ");
  Serial.print(endPose[1]); Serial.print(", ");
  Serial.println(endPose[2]);

  // pick the axis with the biggest change between the two poses
  int best = 0;
  float bestDiff = 0;
  for (int a = 0; a < 3; a++) {
    float d = fabs(endPose[a] - startPose[a]);
    if (d > bestDiff) {
      bestDiff = d;
      best = a;
    }
  }

  if (bestDiff < MIN_CAL_DIFF) {
    Serial.println("Calibration failed: poses too similar");
    drawCal("TOO SMALL", "No axis changed. Retry");
    delay(2500);
  } else {
    exercises[currentEx].axis = best;
    exercises[currentEx].startAccel = startPose[best];
    exercises[currentEx].endAccel = endPose[best];
    exercises[currentEx].calibrated = true;
    saveCalibration(currentEx);

    Serial.print("Saved: axis ");
    Serial.print("XYZ"[best]);
    Serial.print(", start ");
    Serial.print(startPose[best]);
    Serial.print(", end ");
    Serial.println(endPose[best]);

    char line[24];
    snprintf(line, sizeof(line), "Axis %c  %.1f > %.1f", "XYZ"[best], startPose[best], endPose[best]);
    drawCal("SAVED", line);
    delay(2500);
  }

  selectExercise(currentEx);  // resets reps and refreshes screen + BLE
}

// =====================================================================
//  Button handling (short = next exercise, long = calibrate)
// =====================================================================
void handleButton() {
  bool pressed = (digitalRead(BUTTON_PIN) == LOW);
  unsigned long now = millis();

  if (pressed && !btnDown) {
    btnDown = true;
    btnDownMs = now;
    longHandled = false;
  } else if (pressed && btnDown && !longHandled && now - btnDownMs >= LONG_PRESS_MS) {
    longHandled = true;
    pendingCmd = 'C';
  } else if (!pressed && btnDown) {
    btnDown = false;
    if (!longHandled && now - btnDownMs >= 30) {
      selectExercise((currentEx + 1) % NUM_EXERCISES);
    }
  }
}

// =====================================================================
//  Setup
// =====================================================================
void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED not found - check wiring/address");
  }

  // saved calibrations
  prefs.begin("gym", false);
  loadCalibration();

  // start the smoothing filter at the real sensor values
  for (int a = 0; a < 3; a++) {
    smoothedV[a] = readAverageVoltage(AXIS_PINS[a], SAMPLES);
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

  pExerciseCharacteristic = pService->createCharacteristic(
    EXERCISE_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pExerciseCharacteristic->addDescriptor(new BLE2902());
  pExerciseCharacteristic->setCallbacks(new ExerciseCallbacks());
  pExerciseCharacteristic->setValue("0,0,0,-");

  pService->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->start();
  Serial.println("ESP32 BLE is ready!");

  selectExercise(0);
}

// =====================================================================
//  Main loop
// =====================================================================
void loop() {
  handleButton();

  // commands that arrived over BLE (or from a long button press)
  int pe = pendingExercise;
  if (pe >= 0) {
    pendingExercise = -1;
    selectExercise(pe);
  }
  char pc = pendingCmd;
  if (pc != 0) {
    pendingCmd = 0;
    if (pc == 'N') selectExercise((currentEx + 1) % NUM_EXERCISES);
    else if (pc == 'R') selectExercise(currentEx);
    else if (pc == 'C') runCalibration();
  }

  readAccel();

#if DEBUG_ACCEL
  static unsigned long lastDebugMs = 0;
  if (millis() - lastDebugMs > 100) {
    lastDebugMs = millis();
    Serial.print(accel[0]); Serial.print(",");
    Serial.print(accel[1]); Serial.print(",");
    Serial.println(accel[2]);
  }
#endif

  const Exercise &ex = exercises[currentEx];
  float accelAxis = accel[ex.axis];

  // 0 = start pose, 1 = end pose
  float range = ex.endAccel - ex.startAccel;
  float fraction = (fabs(range) > 0.5f) ? (accelAxis - ex.startAccel) / range : 0;

  if (ex.calibrated) {
    if (!inRep) {
      // rep starts when the arm leaves the start pose
      if (fraction > LOW_FRAC) {
        inRep = true;
        reachedTop = false;
        repStart = millis();
      }
    } else {
      // note if the arm made it to the end pose
      if (fraction > HIGH_FRAC) {
        reachedTop = true;
      }

      // rep ends when the arm is back at the start pose
      if (fraction < LOW_FRAC) {
        inRep = false;
        unsigned long repTime = millis() - repStart;

        if (reachedTop && repTime >= ex.minRepMs) {
          reps++;
          const char *result;

          if (repTime < ex.targetMs - ex.toleranceMs) {
            result = "TOO FAST";
          } else if (repTime > ex.targetMs + ex.toleranceMs) {
            result = "TOO SLOW";
          } else {
            result = "GOOD";
          }

          Serial.print(ex.name);
          Serial.print(" rep ");
          Serial.print(reps);
          Serial.print(": ");
          Serial.print(repTime / 1000.0, 1);
          Serial.print(" s - ");
          Serial.println(result);

          lastRepMs = repTime;
          resultText = result;
          showScreen();
          sendBLE(result);
        }
      }
    }
  }

  int phase = 0;  // 0 rest, 1 lifting, 2 at the top, 3 lowering
  if (ex.calibrated) {
    if (inRep && reachedTop && fraction <= HIGH_FRAC) phase = 3;
    else if (inRep && fraction > HIGH_FRAC) phase = 2;
    else if (inRep) phase = 1;
  }

  sendLive(ex.calibrated ? fraction : 0, accelAxis, phase);
  delay(20);
}
