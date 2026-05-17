from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Set

app = FastAPI(title="Proteus Bridge API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

connections: Set[WebSocket] = set()


async def broadcast(payload: Dict) -> int:
    if not connections:
        return 0

    dead = []
    for ws in list(connections):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)

    for ws in dead:
        connections.discard(ws)

    return len(connections)


@app.get("/health")
async def health() -> Dict:
    return {"status": "ok", "clients": len(connections)}


@app.post("/ingest")
async def ingest(payload: Dict = Body(...)) -> Dict:
    clients = await broadcast(payload)
    return {"ok": True, "clients": clients}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    connections.add(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        connections.discard(websocket)
