import argparse
import json
import time
import requests
import serial


def main() -> None:
    parser = argparse.ArgumentParser(description="Serial to backend bridge")
    parser.add_argument("--port", default="COM2")
    parser.add_argument("--baud", type=int, default=9600)
    parser.add_argument("--endpoint", default="http://127.0.0.1:8080/ingest")
    parser.add_argument("--timeout", type=float, default=2.0)
    args = parser.parse_args()

    with serial.Serial(args.port, args.baud, timeout=1) as ser:
        while True:
            raw = ser.readline().decode("ascii", errors="ignore").strip()
            if not raw:
                continue

            print(raw)

            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            print(payload)

            try:
                requests.post(args.endpoint, json=payload, timeout=args.timeout)
            except requests.RequestException:
                time.sleep(1.0)


if __name__ == "__main__":
    main()
