#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "esp_camera.h"
#include "img_converters.h"
#include "secrets.h"

static const framesize_t CAPTURE_SIZE = FRAMESIZE_UXGA;  // photo sent to the server (1600x1200)
static const framesize_t DETECT_SIZE = FRAMESIZE_QVGA;   // frames used to watch for changes (320x240)
static const int JPEG_QUALITY = 10;                      // 0-63, lower = better quality, bigger file
static const bool FLIP_VERTICAL = false;                 // set true if the image is upside down
static const bool MIRROR_HORIZONTAL = false;

static const float MOTION_THRESHOLD = 6.0;   // frame-to-frame change above this = hand/card moving
static const float EMPTY_THRESHOLD = 10.0;   // this close to the background = no card in view
static const float CHANGE_THRESHOLD = 12.0;  // must differ this much from the last scanned card
static const int STABLE_FRAMES = 6;          // still frames required before scanning (~1 s)
static const uint32_t DETECT_INTERVAL_MS = 120;
static const uint32_t RETRY_DELAY_MS = 3000; // wait after a failed upload

#define LED_PIN 2     // blue on-board LED, on while taking/sending the photo
#define BUTTON_PIN 0  // BOOT button

// ---------------- Freenove ESP32-WROVER camera pins ----------------
#define PWDN_GPIO_NUM -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 21
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 19
#define Y4_GPIO_NUM 18
#define Y3_GPIO_NUM 5
#define Y2_GPIO_NUM 4
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

// ---------------- Scene signature ----------------
static const int GRID_W = 16;
static const int GRID_H = 12;
static const int CELLS = GRID_W * GRID_H;
typedef float Signature[CELLS];

static uint8_t *rgbBuf = nullptr;  // decoded detection frame (PSRAM)
static size_t rgbBufSize = 0;

static Signature previous, current, background, lastScanned;
static bool hasLastScanned = false;
static int stableCount = 0;
static uint32_t lastStatusLog = 0;

// ---------------- WiFi ----------------
static uint8_t lastDisconnectReason = 0;

void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  // Ignore our own disconnects (STA_LEAVING) so the router's real reason is kept.
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED &&
      info.wifi_sta_disconnected.reason != WIFI_REASON_STA_LEAVING) {
    lastDisconnectReason = info.wifi_sta_disconnected.reason;
  }
}

const char *describeReason(uint8_t reason) {
  switch (reason) {
    case WIFI_REASON_NO_AP_FOUND: return "network not found (wrong SSID, 5 GHz-only, or out of range)";
    case WIFI_REASON_AUTH_FAIL:
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_HANDSHAKE_TIMEOUT: return "authentication failed (wrong password?)";
    case WIFI_REASON_AUTH_EXPIRE:
    case WIFI_REASON_ASSOC_FAIL: return "router rejected the connection";
    default: return "see esp_wifi_types.h for this code";
  }
}

// Print the 2.4 GHz networks the ESP32 can see, to spot SSID typos or 5 GHz-only networks.
void listNetworks() {
  WiFi.disconnect();
  int n = WiFi.scanNetworks();
  Serial.printf("Networks visible to the ESP32 (%d):\n", n);
  for (int i = 0; i < n; i++) {
    Serial.printf("  '%s'  ch %d  %d dBm  %s\n", WiFi.SSID(i).c_str(), WiFi.channel(i), WiFi.RSSI(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "open" : "secured");
  }
  WiFi.scanDelete();
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  static bool eventsRegistered = false;
  if (!eventsRegistered) {
    WiFi.onEvent(onWifiEvent);
    eventsRegistered = true;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to WiFi '%s'", WIFI_SSID);
  uint32_t start = millis();
  bool scanned = false;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
    if (millis() - start > 20000) {
      Serial.printf("\nWiFi failed, reason %u: %s\n", lastDisconnectReason, describeReason(lastDisconnectReason));
      if (!scanned) {
        listNetworks();
        scanned = true;
      }
      Serial.print("Retrying");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      start = millis();
    }
  }
  Serial.printf("\nWiFi connected, IP %s\n", WiFi.localIP().toString().c_str());
}

// ---------------- Camera ----------------
bool initCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = CAPTURE_SIZE;  // buffers are sized for the biggest frame we use
  config.jpeg_quality = JPEG_QUALITY;
  config.fb_count = 2;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;

  if (!psramFound()) {
    Serial.println("PSRAM not found: select 'ESP32 Wrover Module' / enable PSRAM");
    return false;
  }
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  s->set_vflip(s, FLIP_VERTICAL);
  s->set_hmirror(s, MIRROR_HORIZONTAL);
  s->set_framesize(s, DETECT_SIZE);

  rgbBufSize = resolution[DETECT_SIZE].width * resolution[DETECT_SIZE].height * 3;
  rgbBuf = (uint8_t *)ps_malloc(rgbBufSize);
  return rgbBuf != nullptr;
}

// Grab frames until one has the expected size (frames already queued may be
// from before a resolution switch) and the exposure has had time to adapt.
camera_fb_t *grabFrame(framesize_t size, int discard) {
  for (int i = 0; i < discard + 5; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) continue;
    bool rightSize = fb->width == resolution[size].width && fb->height == resolution[size].height;
    if (rightSize && i >= discard) return fb;
    esp_camera_fb_return(fb);
  }
  return nullptr;
}

// Reduce a detection frame to a GRID_W x GRID_H grid of brightness values.
// The global mean is subtracted so auto-exposure drift doesn't look like a change.
bool captureSignature(Signature out) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return false;
  const int w = fb->width;
  const int h = fb->height;
  bool ok = (size_t)w * h * 3 <= rgbBufSize && fmt2rgb888(fb->buf, fb->len, fb->format, rgbBuf);
  esp_camera_fb_return(fb);
  if (!ok) return false;

  static uint32_t sums[CELLS];
  static uint32_t counts[CELLS];
  memset(sums, 0, sizeof(sums));
  memset(counts, 0, sizeof(counts));
  for (int y = 0; y < h; y += 2) {
    const int row = (y * GRID_H / h) * GRID_W;
    for (int x = 0; x < w; x += 2) {
      const uint8_t *p = rgbBuf + (y * w + x) * 3;
      const int cell = row + x * GRID_W / w;
      sums[cell] += p[0] + p[1] + p[2];
      counts[cell] += 3;
    }
  }
  float mean = 0;
  for (int i = 0; i < CELLS; i++) {
    out[i] = (float)sums[i] / counts[i];
    mean += out[i];
  }
  mean /= CELLS;
  for (int i = 0; i < CELLS; i++) out[i] -= mean;
  return true;
}

float difference(const Signature a, const Signature b) {
  float total = 0;
  for (int i = 0; i < CELLS; i++) total += fabsf(a[i] - b[i]);
  return total / CELLS;
}

// Wait until the scene is still, then store it in `out`.
void captureStableSignature(Signature out) {
  Signature prev;
  int still = 0;
  while (!captureSignature(prev)) delay(100);
  while (still < STABLE_FRAMES * 2) {
    delay(DETECT_INTERVAL_MS);
    if (!captureSignature(out)) continue;
    still = difference(out, prev) < MOTION_THRESHOLD ? still + 1 : 0;
    memcpy(prev, out, sizeof(Signature));
  }
}

void learnBackground() {
  Serial.println("Learning empty background (keep cards out of view)...");
  captureStableSignature(background);
  memcpy(previous, background, sizeof(Signature));
  hasLastScanned = false;
  stableCount = 0;
  Serial.println("Background learned. Place a card.");
}

// ---------------- Upload ----------------
bool postImage(camera_fb_t *fb) {
  connectWifi();
  HTTPClient http;
  http.setTimeout(20000);
  if (!http.begin(SERVER_URL)) {
    Serial.println("Bad SERVER_URL");
    return false;
  }
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Device-Id", DEVICE_ID);
  int code = http.POST(fb->buf, fb->len);
  String body = code > 0 ? http.getString() : http.errorToString(code);
  http.end();
  Serial.printf("POST %u bytes -> %d %s\n", fb->len, code, body.c_str());
  return code == 202;
}

bool captureAndSend() {
  digitalWrite(LED_PIN, HIGH);
  sensor_t *s = esp_camera_sensor_get();
  s->set_framesize(s, CAPTURE_SIZE);
  camera_fb_t *fb = grabFrame(CAPTURE_SIZE, 3);
  bool ok = false;
  if (fb) {
    ok = postImage(fb);
    esp_camera_fb_return(fb);
  } else {
    Serial.println("Failed to capture full-size photo");
  }
  s->set_framesize(s, DETECT_SIZE);
  camera_fb_t *warmup = grabFrame(DETECT_SIZE, 2);
  if (warmup) esp_camera_fb_return(warmup);
  digitalWrite(LED_PIN, LOW);
  return ok;
}

void scanNow() {
  if (captureAndSend()) {
    memcpy(lastScanned, current, sizeof(Signature));
    hasLastScanned = true;
  } else {
    delay(RETRY_DELAY_MS);
    stableCount = 0;  // re-check after the scene is still again
  }
}

// ---------------- Button ----------------
void handleButton() {
  if (digitalRead(BUTTON_PIN) != LOW) return;
  uint32_t pressed = millis();
  while (digitalRead(BUTTON_PIN) == LOW) delay(10);
  if (millis() - pressed > 1500) {
    learnBackground();
  } else {
    Serial.println("Button: forced scan");
    if (captureSignature(current)) scanNow();
  }
}

// ---------------- Main ----------------
void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println("\npoke_scanner starting");

  if (!initCamera()) {
    Serial.println("Camera setup failed, restarting in 5 s");
    delay(5000);
    ESP.restart();
  }
  connectWifi();
  delay(1500);  // let auto-exposure settle
  learnBackground();
}

void loop() {
  handleButton();
  delay(DETECT_INTERVAL_MS);
  if (!captureSignature(current)) return;

  const float motion = difference(current, previous);
  memcpy(previous, current, sizeof(Signature));

  if (millis() - lastStatusLog > 2000) {
    lastStatusLog = millis();
    Serial.printf("motion=%.1f bg=%.1f last=%.1f\n", motion, difference(current, background),
                  hasLastScanned ? difference(current, lastScanned) : -1.0f);
  }

  if (motion > MOTION_THRESHOLD) {
    stableCount = 0;
    return;
  }
  if (stableCount > STABLE_FRAMES) return;  // this still scene was already evaluated
  if (++stableCount < STABLE_FRAMES) return;
  stableCount = STABLE_FRAMES + 1;

  const float vsBackground = difference(current, background);
  if (vsBackground < EMPTY_THRESHOLD) {
    if (hasLastScanned) Serial.println("Card removed, ready for the next one");
    hasLastScanned = false;
    return;
  }
  if (hasLastScanned && difference(current, lastScanned) < CHANGE_THRESHOLD) return;  // same card

  Serial.printf("New card detected (bg diff %.1f), scanning\n", vsBackground);
  scanNow();
}
