import net from 'node:net';
import tls from 'node:tls';
import { RouterOSClient } from '../../src/lib/mikrotik/client';
import { connectionMessage } from './diagnostics';
import type { Transport } from './configurator';

export interface Credentials { host: string; port: number; username: string; password: string; tls: boolean; ca?: string }
export function routerTransport(credentials: Credentials): Transport {
  async function connect() {
    const socket = credentials.tls
      ? tls.connect({ host: credentials.host, port: credentials.port, rejectUnauthorized: true, ca: credentials.ca })
      : net.connect({ host: credentials.host, port: credentials.port });
    const client = new RouterOSClient();
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { socket.destroy(); reject(new Error('Connexion API inaccessible. Vérifiez le port, le pare-feu et le service API.')); }, 8000);
        socket.once(credentials.tls ? 'secureConnect' : 'connect', () => { clearTimeout(timer); resolve(); });
        socket.once('error', error => { clearTimeout(timer); reject(error); });
      });
      await client.connectViaStream(socket, credentials.username, credentials.password);
      return { client, close() { client.close(); socket.destroy(); } };
    } catch (error) { socket.destroy(); throw new Error(connectionMessage(error, credentials.tls)); }
  }
  return {
    async read(path) {
      const connection = await connect();
      try { return await connection.client.talk([path], 15000); }
      catch (error) { throw new Error(connectionMessage(error, credentials.tls)); }
      finally { connection.close(); }
    },
    async command(words) {
      const connection = await connect();
      try { await connection.client.talk(words, 90000); }
      finally { connection.close(); }
    },
    async begin(words) {
      const connection = await connect();
      let failure: Error | undefined;
      // Garder la session ouverte : device-mode peut rester en attente de confirmation.
      void connection.client.talk(words, 1000000).catch((error: Error) => {
        // Une déconnexion pendant le reboot n’est pas une preuve de succès.
        // Le configurateur vérifiera toujours l’état via une nouvelle connexion.
        if (!/connection closed by peer|ECONNRESET|EPIPE/i.test(error.message)) failure = error;
      });
      return { error: () => failure, close: connection.close };
    },
  };
}
