export type ServerConfig = {
  port: number;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy server/.env.example to server/.env and fill in the values.`,
    );
  }
  return value;
}

export function loadConfig(): ServerConfig {
  const portRaw = process.env.PORT?.trim() || '8787';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${portRaw}. Expected an integer between 1 and 65535.`);
  }

  return {
    port,
    livekitUrl: requireEnv('LIVEKIT_URL'),
    livekitApiKey: requireEnv('LIVEKIT_API_KEY'),
    livekitApiSecret: requireEnv('LIVEKIT_API_SECRET'),
  };
}
