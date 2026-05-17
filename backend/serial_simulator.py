import argparse
import json
import random
import time
import serial


def build_payload() -> dict:
    return {
        "temperatura": round(random.uniform(40.0, 85.0), 1),
        "corrente_primario": round(random.uniform(0.5, 1.5), 2),
        "corrente_secundario": round(random.uniform(8.0, 10.0), 2),
        "vibracao": round(random.uniform(0.1, 2.5), 2),
        "status": "online",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Serial data simulator")
    parser.add_argument("--port", default="COM3")
    parser.add_argument("--baud", type=int, default=9600)
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    with serial.Serial(args.port, args.baud, timeout=1) as ser:
        while True:
            payload = build_payload()
            line = json.dumps(payload, ensure_ascii=True)
            ser.write((line + "\n").encode("ascii"))
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
