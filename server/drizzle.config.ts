import type { Config } from 'drizzle-kit';

function parseWriteHost(hosts?: string): { host: string; port: number } {
  if (!hosts) return { host: 'localhost', port: 3306 };
  const [host, portStr] = hosts.split(':');
  return { host: host || 'localhost', port: portStr ? parseInt(portStr, 10) : 3306 };
}

const { host, port } = parseWriteHost(process.env.VIP_MARIADB_WRITE_HOSTS);

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    host,
    port,
    user:     process.env.VIP_MARIADB_USER     ?? 'root',
    password: process.env.VIP_MARIADB_PASSWORD ?? '',
    database: process.env.VIP_MARIADB_NAME     ?? 'scanner',
  },
} satisfies Config;
