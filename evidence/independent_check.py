"""
Independent check of fixture A's passport record, with no call to any Universal Goods service.

A28 §7 / A31 §5: a demonstration, outside the predictions, that the evidence for a
smart-contract passport can be checked without the issuer's platform.

Inputs, both public or archived:
  1. evidence/A-credential.json  the signed credential (SD-JWT) archived on 2026-10-14
  2. a public LUKSO testnet RPC   default https://rpc.testnet.lukso.network (not ours)

Steps:
  a. hash the archived credential: sha256(credentialJwt)
  b. derive the data key the issuer wrote: keccak256("UG_VerifiableData_product_<productId>")
  c. read that key from the issuing organisation's Universal Profile with getData(bytes32)
  d. compare (a) with (c)

Standard library only (keccak-256 is implemented below), so anyone can run it:
  python -I evidence/independent_check.py
"""
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

RPC = sys.argv[1] if len(sys.argv) > 1 else "https://rpc.testnet.lukso.network"
ORG_PROFILE = "0x04b816af69b6497829938e3204e85046f85f5589"  # owner of all three collections (A31 §1)

# ---- keccak-256 (the pre-NIST padding Ethereum uses; NOT hashlib.sha3_256) ----
_RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
_M = (1 << 64) - 1


def _rol(v, n):
    return ((v << n) | (v >> (64 - n))) & _M if n else v


def _f(a):
    for rc in _RC:
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        a = [[a[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rol(a[x][y], _ROT[x][y])
        a = [[b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y]) for y in range(5)] for x in range(5)]
        a[0][0] ^= rc
    return a


def keccak256(data: bytes) -> bytes:
    rate = 136
    msg = bytearray(data) + b"\x01"
    while len(msg) % rate:
        msg += b"\x00"
    msg[-1] |= 0x80
    a = [[0] * 5 for _ in range(5)]
    for off in range(0, len(msg), rate):
        block = msg[off:off + rate]
        for i in range(rate // 8):
            x, y = i % 5, i // 5
            a[x][y] ^= int.from_bytes(block[8 * i:8 * i + 8], "little")
        a = _f(a)
    out = b""
    for i in range(4):
        out += a[i % 5][i // 5].to_bytes(8, "little")
    return out


assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"

# ---- the check ----
archived = json.loads((Path(__file__).parent / "A-credential.json").read_text(encoding="utf-8"))
product_id = archived["productId"]
jwt_hash = "0x" + hashlib.sha256(archived["credentialJwt"].encode()).hexdigest()
data_key = keccak256(f"UG_VerifiableData_product_{product_id}".encode())

call = "0x54f6127f" + data_key.hex()  # getData(bytes32)
body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_call",
                   "params": [{"to": ORG_PROFILE, "data": call}, "latest"]}).encode()
req = urllib.request.Request(RPC, body, {"content-type": "application/json"})
raw = json.load(urllib.request.urlopen(req, timeout=30))["result"]
b = bytes.fromhex(raw[2:])
length = int.from_bytes(b[32:64], "big")
on_chain = "0x" + b[64:64 + length].hex()

print(f"RPC                 {RPC}")
print(f"organisation profile {ORG_PROFILE}")
print(f"product              {product_id}")
print(f"data key             0x{data_key.hex()}")
print(f"sha256(credential)   {jwt_hash}")
print(f"value on chain       {on_chain}")
match = on_chain.lower().endswith(jwt_hash[2:].lower())
print("RESULT              ", "MATCH: the archived credential is the one the issuer anchored" if match
      else "NO MATCH")
sys.exit(0 if match else 1)
