import path from 'path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, loadEnv } from 'vite';
import svgr from 'vite-plugin-svgr';
import react from '@vitejs/plugin-react';
import mqtt from 'mqtt';

const PORT = 3040;

// Bridge ระหว่าง TCP MQTT Broker กับ Browser Frontend ผ่าน Vite WebSocket
function waterMqttBridgePlugin() {
  return {
    name: 'water-mqtt-bridge',
    configureServer(server: any) {
      const brokerUrl = 'mqtt://192.168.12.77:1884';
      const topic = 'water-system';
      let lastData: any = null;

      try {
        console.log(`[Vite MQTT Bridge] Connecting to ${brokerUrl}...`);
        const client = mqtt.connect(brokerUrl, {
          username: 'polipharm',
          password: '12345678',
          clientId: `vite_bridge_${Math.random().toString(16).substring(2, 8)}`,
          reconnectPeriod: 3000,
        });

        client.on('connect', () => {
          console.log(`[Vite MQTT Bridge] Connected to ${brokerUrl}. Subscribed to '${topic}'`);
          client.subscribe(topic);
        });

        client.on('message', (_t, payload) => {
          try {
            lastData = JSON.parse(payload.toString());
            server.ws.send({
              type: 'custom',
              event: 'water-system-data',
              data: lastData,
            });
          } catch {
            // ignore non-json
          }
        });

        server.ws.on('water-system-request', () => {
          if (lastData) {
            server.ws.send({
              type: 'custom',
              event: 'water-system-data',
              data: lastData,
            });
          }
        });

        client.on('error', (err) => {
          console.warn('[Vite MQTT Bridge] Error:', err.message);
        });
      } catch (err) {
        console.warn('[Vite MQTT Bridge] Init error:', err);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // ดึงค่าตัวแปรสิ่งแวดล้อมตาม mode (development/production)
  const env = loadEnv(mode, process.cwd(), '');

  // VITE_BASE_URL = server origin (e.g. https://192.168.175.154) — NO trailing path
  const apiTarget = env.VITE_BASE_URL || 'https://192.168.175.154';
  const wsTarget = env.VITE_WS_TARGET || 'wss://192.168.175.154';

  const configureProxy = (proxy: any) => {
    proxy.on('error', (err: any) => {
      if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') return;
      console.warn('[vite proxy error]', err.message);
    });
    proxy.on('proxyReqWs', (_proxyReq: any, _req: any, socket: any) => {
      socket.on('error', (err: any) => {
        if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') return;
      });
    });
  };

  const proxyOptions = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      secure: false,
      configure: configureProxy,
    },
    '/ws': {
      target: wsTarget,
      ws: true,
      changeOrigin: true,
      secure: false,
      configure: configureProxy,
    },
    '/storage': {
      target: apiTarget,
      changeOrigin: true,
      secure: false,
      configure: configureProxy,
    },
    '/static': {
      target: apiTarget,
      changeOrigin: true,
      secure: false,
      configure: configureProxy,
    },
  };

  return {
    base: '/',
    plugins: [
      react(),
      basicSsl(),
      svgr({
        svgrOptions: {
          exportType: 'named',
          ref: true,
          svgo: false,
          titleProp: true,
          namedExport: 'ReactComponent',
        },
        include: '**/*.svg?react',
      }),
      waterMqttBridgePlugin(),
    ],
    resolve: {
      alias: {
        '@_types': path.resolve(__dirname, 'types'), // ✅ ให้ Vite match กับ tsconfig
        '@': path.resolve(__dirname, 'src'),
        '~': path.resolve(__dirname, 'node_modules'),
        src: path.resolve(__dirname, 'src'),
      },
    },
    assetsInclude: ['**/*.wasm'], // ระบุว่าไฟล์ .wasm เป็น asset
    server: {
      port: PORT,
      host: true,
      proxy: proxyOptions,
    },
    preview: {
      port: PORT,
      host: true,
      proxy: proxyOptions,
    },
  };
});
