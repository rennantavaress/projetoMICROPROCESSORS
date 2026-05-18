HardwareSerial SerialProteus(2);

#define RX_PIN 3
#define TX_PIN 2

unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);

  SerialProteus.begin(
    115200,
    SERIAL_8N1,
    RX_PIN,
    TX_PIN
  );
}

void loop() {
  if (millis() - lastSend >= 1000) {
    lastSend = millis();

    SerialProteus.println("{\"temp\":42.5,\"i_primario\":0.31,\"i_secundario\":1.82}");
  }
}