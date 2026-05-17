import argparse
import json
import random
import time
from typing import Dict

import requests


def build_payload() -> Dict[str, float | str]:
    return {
        "temperatura": round(random.uniform(40.0, 85.0), 1),
        "corrente_primario": round(random.uniform(0.5, 1.5), 2),
        "corrente_secundario": round(random.uniform(8.0, 10.0), 2),
        "vibracao": round(random.uniform(0.1, 2.5), 2),
        "status": "online",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="HTTP data simulator")
    parser.add_argument("--endpoint", default="http://127.0.0.1:8080/ingest")
    parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args()

    while True:
        payload = build_payload()
        try:
            requests.post(args.endpoint, json=payload, timeout=2.0)
            print(json.dumps(payload, ensure_ascii=True))
        except requests.RequestException:
            print("failed to POST payload")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
