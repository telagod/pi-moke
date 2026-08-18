---
name: net-reverse
description: Network and protocol reverse-engineering for authorized captures. Use when the user asks for 网络逆向, 抓包, PCAP, HAR, Wireshark, tshark, WebSocket, protobuf, gRPC, 自定义协议, thick-client framing, or to recover a session/state machine from traffic. Do not use for unauthorized MITM, mass sniffing, or attacking third-party hosts.
---

# Net Reverse

Recover a protocol from traffic, then a parser. Distilled from reverse-skill `protocol-reverse` and the protocol-reverse-engineering skill: conversations first, then framing, then fields, then a client. Not a scanner.

## Scope

Allowed sources:

- PCAP / PCAPNG / HAR / mitm dump the guest handed over
- capture on an interface the guest owns (their lab VM, their loopback, their app)
- TLS keys the guest already has (`SSLKEYLOGFILE`, server cert they control)

Forbidden: transparent MITM on a network they do not administer; replay against a host they did not name as in-scope.

## Loop

```
preserve → conversations → identify L7 → frame → fields → parser → (optional) authorized replay
```

### 1. Preserve

Copy the capture. Hash it. Note snaplen (truncated packets lie). Do not edit the original.

```bash
cp -- capture.pcap capture.pcap.bak
sha256sum capture.pcap
capinfos capture.pcap 2>/dev/null || tshark -r capture.pcap -q -z io,phs
```

### 2. Conversations before bytes

```bash
tshark -r capture.pcap -q -z conv,tcp
tshark -r capture.pcap -q -z endpoints,ip
tshark -r capture.pcap -q -z io,phs
```

Name the pair that matters (client ↔ server, ports). Follow **that** stream. Ignore the rest until the primary session is understood.

```bash
tshark -r capture.pcap -q -z follow,tcp,ascii,0
```

### 3. Identify L7

Cheap signatures, then stop guessing:

| Hint | Likely |
| --- | --- |
| `GET ` / `HTTP/1.` | HTTP → hand `$api-reverse` for the contract |
| `16 03` TLS record | TLS. Need guest keylog before payload work |
| `GET /` + `Upgrade: websocket` | WebSocket |
| `PRI * HTTP/2` / many small binary frames | HTTP/2 or gRPC |
| `\x00` length + `.proto` strings / `grpc` content-type | protobuf / gRPC |
| magic at offset 0, stable header size | custom binary |
| JSON / msgpack after a small header | framed RPC |

Encrypted blob with entropy > ~7.5 and no keylog: document the envelope (SNI, ALPN, sizes, timing). Do not invent plaintext.

TLS with guest keylog:

```bash
export SSLKEYLOGFILE=/path/to/keys.log   # guest-supplied
tshark -r capture.pcap -o "tls.keylog_file:$SSLKEYLOGFILE" -Y http -T fields -e http.request.method -e http.host -e http.request.uri
```

### 4. Frame the message

Compare **two or more** sessions of the same action (login, send, heartbeat). Diff what is constant vs what moves.

Look for, in order:

1. magic / signature
2. version
3. type / opcode
4. length (inclusive or payload-only — prove it)
5. sequence / session id
6. checksum / HMAC (name the range it covers)
7. payload (maybe another nested TLV)

Endianness: try both; the length field that matches remaining bytes is the winner.

Protobuf: if `.proto` exists, compile it. If not, treat length-delimited records and recover field numbers from repeated samples; do not fake message names.

WebSocket: reassemble, then treat opcode 1 as text (maybe JSON → `$api-reverse` / `$js-reverse`), opcode 2 as binary (this lane).

### 5. Field table (the nail)

Every field gets a row. "some bytes" is not a field.

| Off | Size | Name | Evidence |
| --- | --- | --- | --- |
| 0 | 4 | magic | same in all packets, ASCII `PROT` |
| 4 | 2 | type | 1=hello, 3=data (two sessions) |
| 6 | 4 | len | equals payload bytes |

Keep a state machine: `HELLO → ACK → DATA* → CLOSE`. Heartbeats are first-class messages.

### 6. Parser, then optional replay

Write a parser that consumes the capture and prints the table. The parser is the proof. A dissector or `struct` decoder counts.

Replay only against a service the guest named (their mock, their staging, their loopback). Replay is for proving the framing, not for hammering a vendor.

Mobile / thick client on a **guest-owned** device: capture via their proxy or `tcpdump` on their emulator. Certificate pinning is an analysis obstacle — locate the pin (APK Java/`TrustManager` / native). Unpinning scripts only on that owned build. Then the HTTP part goes to `$api-reverse`.

## Anti-stuck

- Truncated snaplen → recapture, do not "fix" lengths.
- Same header, random payload → encrypted or compressed; say which, with entropy.
- One sample only → ask for a second session of the same action, or vary one input.
- HTTP-looking traffic with a custom sign header → `$api-reverse` (+ `$js-reverse` if browser).

## Completion

1. Transport + L7 identity.
2. Field table + state machine.
3. Parser path and the command that dumps one session.
4. What is still ciphertext / unknown.
5. If HTTP/JSON: hand off `$api-reverse`. If sign lives in JS: `$js-reverse`.
