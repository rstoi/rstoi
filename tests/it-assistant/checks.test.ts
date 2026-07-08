import { describe, it, expect } from "vitest";
import { parsePingOutput } from "../../src/it-assistant/agent/checks.js";

const LINUX_OUTPUT = `PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=59 time=12.3 ms
64 bytes from 1.1.1.1: icmp_seq=2 ttl=59 time=14.1 ms
64 bytes from 1.1.1.1: icmp_seq=3 ttl=59 time=11.9 ms

--- 1.1.1.1 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 11.900/12.766/14.100/0.964 ms`;

const LINUX_LOSS_OUTPUT = `PING 1.1.1.1 (1.1.1.1) 56(84) bytes of data.
64 bytes from 1.1.1.1: icmp_seq=1 ttl=59 time=12.3 ms

--- 1.1.1.1 ping statistics ---
4 packets transmitted, 1 received, 75% packet loss, time 3003ms`;

const WINDOWS_OUTPUT = `
Pinging 1.1.1.1 with 32 bytes of data:
Reply from 1.1.1.1: bytes=32 time=15ms TTL=59
Reply from 1.1.1.1: bytes=32 time=17ms TTL=59

Ping statistics for 1.1.1.1:
    Packets: Sent = 2, Received = 2, Lost = 0 (0% loss),`;

describe("parsePingOutput", () => {
  it("extrai latência média, jitter e perda (Linux)", () => {
    const r = parsePingOutput("1.1.1.1", LINUX_OUTPUT, "linux");
    expect(r.latencyMs).toBeCloseTo(12.8, 0);
    expect(r.packetLossPct).toBe(0);
    expect(r.jitterMs).toBeGreaterThan(0);
  });

  it("reconhece perda de pacotes alta (Linux)", () => {
    const r = parsePingOutput("1.1.1.1", LINUX_LOSS_OUTPUT, "linux");
    expect(r.packetLossPct).toBe(75);
  });

  it("extrai latência do formato do Windows (time=Xms)", () => {
    const r = parsePingOutput("1.1.1.1", WINDOWS_OUTPUT, "win32");
    expect(r.latencyMs).toBeCloseTo(16, 0);
    expect(r.packetLossPct).toBe(0);
  });

  it("sem amostras válidas, retorna perda 100% e latência nula", () => {
    const r = parsePingOutput("host.invalido", "unknown host", "linux");
    expect(r.latencyMs).toBeNull();
    expect(r.packetLossPct).toBe(100);
  });
});
