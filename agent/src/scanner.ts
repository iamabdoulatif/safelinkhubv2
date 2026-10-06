import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { networkInterfaces } from 'node:os';
import { isIPv4, Socket } from 'node:net';
import { createSocket } from 'node:dgram';

export function isLocalAddress(ip: string) {
  if (!isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
const numeric = (ip: string) => ip.split('.').reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
const address = (value: number) => [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.');
export function subnetHosts(ip: string, mask: string): string[] {
  const netmask = numeric(mask), size = (~netmask >>> 0) + 1;
  if (size > 1024 || size < 4) return [];
  const network = (numeric(ip) & netmask) >>> 0;
  return Array.from({ length: size - 2 }, (_, index) => address(network + index + 1)).filter(host => host !== ip && isLocalAddress(host));
}
export type Candidate = { ip: string; ports: number[]; source: string; model?: string; version?: string; mac?: string };
export function parseMndp(packet: Buffer): Partial<Candidate> | undefined {
  // MNDP header: version, TTL, sequence. Also accept the two-byte relay format in this repository.
  for (const start of [4, 2]) {
    const fields = new Map<number, Buffer>();
    let offset = start;
    while (offset + 4 <= packet.length) {
      const type = packet.readUInt16BE(offset), length = packet.readUInt16BE(offset + 2);
      offset += 4;
      if (length > packet.length - offset) { offset = -1; break; }
      fields.set(type, packet.subarray(offset, offset + length));
      offset += length;
    }
    if (offset !== packet.length || fields.get(8)?.toString() !== 'MikroTik') continue;
    const mac = fields.get(1);
    return { model: fields.get(12)?.toString(), version: fields.get(7)?.toString(), mac: mac?.length === 6 ? [...mac].map(v => v.toString(16).padStart(2, '0')).join(':') : undefined };
  }
}
async function probe(host: string, port: number) {
  return new Promise<boolean>(resolve => {
    const socket = new Socket();
    const finish = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(350, () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host, () => finish(true));
  });
}
export function parseGateways(output: string, platform: string): string[] {
  const candidates = platform === 'win32' ? output.split(/\s+/) : output.split('\n').filter(line => /^default\s/.test(line.trim())).map(line => line.trim().split(/\s+/)[platform === 'linux' ? 2 : 1]);
  return [...new Set(candidates.filter(ip => isLocalAddress(ip)))];
}
async function defaultGateways() {
  const platform = process.platform;
  const command = platform === 'darwin' ? ['netstat', ['-rn', '-f', 'inet']] as const : platform === 'win32' ? ['powershell.exe', ['-NoProfile', '-Command', '(Get-NetRoute -DestinationPrefix 0.0.0.0/0).NextHop']] as const : ['ip', ['-4', 'route', 'show', 'default']] as const;
  try { const { stdout } = await promisify(execFile)(command[0], [...command[1]], { timeout: 3000 }); return parseGateways(stdout, platform); }
  catch { return []; }
}
export async function discoverRouters() {
  const candidates = new Map<string, Candidate>();
  const warnings: string[] = [];
  const hosts = new Set<string>(await defaultGateways());
  for (const entries of Object.values(networkInterfaces())) for (const entry of entries ?? []) {
    if (entry.family !== 'IPv4' || entry.internal || !isLocalAddress(entry.address)) continue;
    const subnet = subnetHosts(entry.address, entry.netmask);
    if (!subnet.length) warnings.push(`Réseau ${entry.address}/${entry.netmask} non scanné automatiquement : utilisez une IP manuelle.`);
    for (const host of subnet) if (hosts.size < 1024) hosts.add(host);
  }
  if (!hosts.has('192.168.88.1') && hosts.size >= 1024) hosts.delete([...hosts].at(-1)!);
  hosts.add('192.168.88.1');
  const listener = createSocket({ type: 'udp4', reuseAddr: true });
  const listening = new Promise<void>(resolve => {
    const timer = setTimeout(() => { try { listener.close(); } catch {} resolve(); }, 3500);
    listener.on('error', () => { clearTimeout(timer); warnings.push('MNDP indisponible (port UDP 5678 occupé ou refusé).'); try { listener.close(); } catch {} resolve(); });
    listener.on('message', (packet, remote) => {
      if (!isLocalAddress(remote.address)) return;
      const info = parseMndp(packet);
      if (info) candidates.set(remote.address, { ip: remote.address, ports: candidates.get(remote.address)?.ports ?? [], source: 'MNDP', ...info });
    });
    listener.bind(5678, '0.0.0.0');
  });
  const queue = [...hosts];
  await Promise.all(Array.from({ length: 32 }, async () => {
    let host: string | undefined;
    while ((host = queue.shift())) {
      const ip = host;
      const ports = (await Promise.all([8728, 8729].map(async port => await probe(ip, port) ? port : 0))).filter(Boolean);
      if (ports.length) candidates.set(ip, { ...candidates.get(ip), ip, ports, source: candidates.get(ip)?.source ?? 'TCP — identité à confirmer' });
    }
  }));
  await listening;
  return { routers: [...candidates.values()], warnings };
}
