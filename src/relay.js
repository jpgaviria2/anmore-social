import { RELAY, validEvent } from "./core.js";
function matches(e, f) {
  return (
    (!f.kinds || f.kinds.includes(e.kind)) &&
    (!f.authors || f.authors.includes(e.pubkey)) &&
    (!f.ids || f.ids.includes(e.id)) &&
    (f.until === undefined || e.created_at <= f.until) &&
    (f.since === undefined || e.created_at >= f.since) &&
    Object.entries(f).every(
      ([k, v]) =>
        !k.startsWith("#") ||
        e.tags.some((t) => t[0] === k.slice(1) && v.includes(t[1])),
    )
  );
}
export class Relay {
  constructor(Socket = WebSocket) {
    this.Socket = Socket;
    this.pending = new Map();
    this.counter = 0;
  }
  async open() {
    this.socket = new this.Socket(RELAY);
    this.socket.addEventListener("message", (ev) => this.receive(ev));
    this.socket.addEventListener("close", () => {
      for (const p of this.pending.values())
        p.finish(Error("Relay disconnected. Please retry."));
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
        reject(Error("Relay connection timed out."));
      }, 10000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(Error("Cannot reach relay.anmore.me. Please retry."));
      });
    });
  }
  query(filters, timeout = 12000, { rejectAtLimit = false } = {}) {
    if (this.socket?.readyState !== 1)
      return Promise.reject(Error("Relay is not connected."));
    const id = `anmore-${++this.counter}`,
      cap = filters.reduce((s, f) => s + (f.limit || 40), 0);
    return new Promise((resolve, reject) => {
      const events = new Map();
      let count = 0;
      const timer = setTimeout(
        () =>
          finish(
            Error("Relay query timed out; no unverified results were added."),
          ),
        timeout,
      );
      const finish = (err) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (this.socket.readyState === 1)
          this.socket.send(JSON.stringify(["CLOSE", id]));
        err ? reject(err) : resolve([...events.values()]);
      };
      this.pending.set(id, {
        finish,
        filters,
        events,
        accept: (e) => {
          count++;
          if (rejectAtLimit && count >= cap)
            return finish(Error("Receipt snapshot truncated."));
          if (count > cap + 20)
            return finish(Error("Relay response exceeded the safety limit."));
          if (validEvent(e) && filters.some((f) => matches(e, f)))
            events.set(e.id, e);
        },
      });
      this.socket.send(JSON.stringify(["REQ", id, ...filters]));
    });
  }
  receive(ev) {
    if (typeof ev.data !== "string" || ev.data.length > 1200000) {
      for (const p of this.pending.values())
        p.finish(Error("Relay sent an oversized response."));
      return;
    }
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!Array.isArray(m)) return;
    const p = this.pending.get(m[1]);
    if (m[0] === "NOTICE") {
      for (const item of this.pending.values())
        item.finish(
          Error("Relay reported a service notice. Please retry later."),
        );
      return;
    }
    if (!p) return;
    if (m[0] === "EVENT") p.accept(m[2]);
    if (m[0] === "EOSE") p.finish();
    if (m[0] === "CLOSED")
      p.finish(Error("Relay declined the read request. Please retry later."));
  }
  close() {
    this.socket?.close();
  }
}
