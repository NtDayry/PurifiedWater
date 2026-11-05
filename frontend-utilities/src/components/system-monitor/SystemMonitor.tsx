import { useEffect, useState, useRef } from "react";
import {
  Cpu,
  Thermometer,
  HardDrive,
  Network,
  Layers,
  Database,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

// Types matching ws_monitor.py payload
interface CpuStats {
  usage: number;
}

interface CpuTempStats {
  temp: number;
}

interface MemoryStats {
  usage: number;
  used_gb: number;
  total_gb: number;
}

interface DiskStats {
  usage: number;
  used_gb: number;
  total_gb: number;
}

interface NetworkStats {
  bytes_sent_mb: number;
  bytes_recv_mb: number;
}

interface AppInstanceStats {
  name: string;
  status: "ok" | "error" | "unreachable";
  queues: Record<string, number>;
}

interface DockerStats {
  app_count: number;
  instances: AppInstanceStats[];
}

interface MonitorPayload {
  timestamp: string;
  cpu: CpuStats;
  cpu_temp: CpuTempStats;
  memory: MemoryStats;
  disk: DiskStats;
  network: NetworkStats;
  docker: DockerStats;
}

export default function SystemMonitor() {
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [netSpeed, setNetSpeed] = useState({ send: 0, recv: 0 }); // in MB/s
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectCountRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Refs for tracking network speeds
  const prevSentRef = useRef<number | null>(null);
  const prevRecvRef = useRef<number | null>(null);
  const prevTimeRef = useRef<number | null>(null);

  const getWsUrl = () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${protocol}//${host}/ws/monitor`;
  };

  const connect = () => {
    if (!isMountedRef.current) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus("connecting");
    const wsUrl = getWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setStatus("connected");
      reconnectCountRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data) as MonitorPayload;

        // Calculate network transfer speed
        const now = Date.now();
        if (
          prevSentRef.current !== null &&
          prevRecvRef.current !== null &&
          prevTimeRef.current !== null
        ) {
          const elapsedSec = (now - prevTimeRef.current) / 1000;
          if (elapsedSec > 0) {
            const sendSpeed = (parsed.network.bytes_sent_mb - prevSentRef.current) / elapsedSec;
            const recvSpeed = (parsed.network.bytes_recv_mb - prevRecvRef.current) / elapsedSec;
            setNetSpeed({
              send: Math.max(0, sendSpeed),
              recv: Math.max(0, recvSpeed),
            });
          }
        }

        prevSentRef.current = parsed.network.bytes_sent_mb;
        prevRecvRef.current = parsed.network.bytes_recv_mb;
        prevTimeRef.current = now;

        setData(parsed);
      } catch (error) {
        console.error("Failed to parse system monitor WebSocket data", error);
      }
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      setStatus("disconnected");
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      if (!isMountedRef.current) return;
      console.error("WebSocket system monitor error", err);
      ws.close();
    };
  };

  const scheduleReconnect = () => {
    if (!isMountedRef.current) return;
    if (reconnectTimeoutRef.current) return;

    reconnectCountRef.current += 1;
    const delay = Math.min(1000 * reconnectCountRef.current, 10000);
    reconnectTimeoutRef.current = window.setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connect();
    }, delay);
  };

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;

      prevSentRef.current = null;
      prevRecvRef.current = null;
      prevTimeRef.current = null;

      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  const formatMB = (mb: number) => {
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GiB` : `${mb.toFixed(1)} MiB`;
  };

  const formatSpeed = (mbps: number) => {
    const kbps = mbps * 1024;
    if (kbps < 0.1) return "0.0 KB/s";
    if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
    return `${kbps.toFixed(1)} KB/s`;
  };

  // Helper function to color progress bar based on percentage thresholds
  const getProgressBarColor = (pct: number) => {
    if (pct >= 85) return "bg-red-500";
    if (pct >= 60) return "bg-amber-500";
    return "bg-sky-500";
  };

  return (
    <div className="space-y-6">
      {/* --- Connection and Timestamp Status Row --- */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap justify-between gap-1 w-full">
          <span className="font-mono text-xs text-gray-500 dark:text-white/[0.6]">
            Last update:{" "}
            {data?.timestamp
              ? new Date(data.timestamp).toLocaleTimeString("th-TH", { hour12: false })
              : "--:--:--"}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                status === "connected"
                  ? "bg-green-500 animate-pulse"
                  : status === "connecting"
                  ? "bg-amber-500 animate-bounce"
                  : "bg-red-500"
              }`}
            />
            <span className="font-mono text-xs font-bold text-gray-700 dark:text-white">
              {status === "connected" && "CONNECTED"}
              {status === "connecting" && "CONNECTING"}
              {status === "disconnected" && "DISCONNECTED"}
            </span>
            {status !== "connected" && (
              <button
                onClick={connect}
                className="p-1 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-white cursor-pointer"
                title="Reconnect manually"
              >
                <RefreshCw className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* --- Main Metric Grid: CPU / RAM / Disk --- */}
      <div className="grid grid-cols-12 gap-6">
        {/* CPU Temperature Card */}
        <div className="col-span-12 md:col-span-6 lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-white/[0.8]">
              CPU Temperature
            </span>
            <div className="flex items-center justify-center w-10 h-10 bg-amber-100 rounded-xl dark:bg-amber-500/10">
              <Thermometer className="size-5 text-amber-500" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <span className="text-8xl font-extrabold text-amber-500 dark:text-amber-500/80 tracking-tight">
              {data ? data.cpu_temp.temp?.toFixed(1) : "--"}
              <span className="text-4xl font-normal text-gray-400 ml-1">°C</span>
            </span>
          </div>
        </div>

        {/* CPU Card */}
        <div className="col-span-12 md:col-span-6 lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-white/[0.8]">
              CPU Usage
            </span>
            <div className="flex items-center justify-center w-10 h-10 bg-sky-100 rounded-xl dark:bg-sky-500/10">
              <Cpu className="size-5 text-sky-500" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <span className="text-7xl font-extrabold text-gray-500 dark:text-white tracking-tight">
              {data ? data.cpu.usage.toFixed(1) : "--"}
              <span className="text-sm font-normal text-gray-400 ml-1">%</span>
            </span>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2.5 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${getProgressBarColor(data?.cpu.usage ?? 0)}`}
              style={{ width: `${Math.min(data?.cpu.usage ?? 0, 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-gray-600 dark:text-white/[0.4] mt-2 block font-mono">
            Measured across all cores
          </span>
        </div>

        {/* RAM Card */}
        <div className="col-span-12 md:col-span-6 lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-white/[0.8]">
              RAM Usage
            </span>
            <div className="flex items-center justify-center w-10 h-10 bg-cyan-100 rounded-xl dark:bg-cyan-500/10">
              <HardDrive className="size-5 text-cyan-500" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <span className="text-7xl font-extrabold text-gray-500 dark:text-white tracking-tight">
              {data ? data.memory.usage.toFixed(1) : "--"}
              <span className="text-sm font-normal text-gray-400 ml-1">%</span>
            </span>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2.5 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${getProgressBarColor(data?.memory.usage ?? 0)}`}
              style={{ width: `${Math.min(data?.memory.usage ?? 0, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-gray-600 dark:text-white/[0.4] mt-2 font-mono">
            <span>Used: {data ? data.memory.used_gb.toFixed(2) : "--"} GB</span>
            <span>Total: {data ? data.memory.total_gb.toFixed(2) : "--"} GB</span>
          </div>
        </div>

        {/* Disk Card */}
        <div className="col-span-12 md:col-span-12 lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-white/[0.8]">
              Disk Space
            </span>
            <div className="flex items-center justify-center w-10 h-10 bg-amber-100 rounded-xl dark:bg-amber-500/10">
              <Database className="size-5 text-amber-500" />
            </div>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <span className="text-7xl font-extrabold text-gray-500 dark:text-white tracking-tight">
              {data ? data.disk.usage.toFixed(1) : "--"}
              <span className="text-sm font-normal text-gray-400 ml-1">%</span>
            </span>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2.5 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-2.5 rounded-full transition-all duration-500 ${getProgressBarColor(data?.disk.usage ?? 0)}`}
              style={{ width: `${Math.min(data?.disk.usage ?? 0, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] text-gray-600 dark:text-white/[0.4] mt-2 font-mono">
            <span>Used: {data ? data.disk.used_gb.toFixed(1) : "--"} GB</span>
            <span>Total: {data ? data.disk.total_gb.toFixed(1) : "--"} GB</span>
          </div>
        </div>
      </div>

      {/* --- Second Row: Network I/O and Docker Services --- */}
      <div className="grid grid-cols-12 gap-6">
        {/* Network Metrics */}
        <div className="col-span-12 lg:col-span-5 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Network className="size-4 text-purple-500" />
                <h4 className="text-sm font-bold text-gray-800 dark:text-white">Network Traffic</h4>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-500 uppercase font-bold">
                Live
              </span>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-500 dark:text-white/[0.6]">
                    Sent Outbound
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-white/[0.4] mt-0.5 font-mono">
                    Total: {data ? formatMB(data.network.bytes_sent_mb) : "--"}
                  </span>
                </div>
                <span className="font-mono text-sm font-bold text-sky-500">
                  {data ? formatSpeed(netSpeed.send) : "--"}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-gray-500 dark:text-white/[0.6]">
                    Received Inbound
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-white/[0.4] mt-0.5 font-mono">
                    Total: {data ? formatMB(data.network.bytes_recv_mb) : "--"}
                  </span>
                </div>
                <span className="font-mono text-sm font-bold text-emerald-500">
                  {data ? formatSpeed(netSpeed.recv) : "--"}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-gray-600 dark:text-white/[0.3] mt-4 font-mono">
            Host network socket interfaces
          </p>
        </div>

        {/* Docker Services */}
        <div className="col-span-12 lg:col-span-7 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-violet-500" />
              <h4 className="text-sm font-bold text-gray-800 dark:text-white">Docker Scale Instances</h4>
            </div>
            <span className="text-xs font-mono font-bold text-violet-500 bg-violet-500/10 px-2 py-0.5 rounded-full">
              {data?.docker.app_count ?? 0} active
            </span>
          </div>

          <div className="space-y-3 max-h-[175px] overflow-y-auto pr-1 custom-scrollbar">
            {data && data.docker.instances.length > 0 ? (
              data.docker.instances
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((instance) => (
                  <div
                    key={instance.name}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-950/20 border border-gray-100 dark:border-gray-800 hover:border-violet-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          instance.status === "ok"
                            ? "bg-green-500 shadow-sm shadow-green-500"
                            : instance.status === "error"
                            ? "bg-red-500"
                            : "bg-gray-400"
                        }`}
                      />
                      <span className="font-mono text-xs font-bold text-gray-800 dark:text-white">
                        {instance.name}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      {instance.queues && Object.keys(instance.queues).length > 0 ? (
                        Object.entries(instance.queues).map(([qName, qSize]) => (
                          <div
                            key={qName}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${
                              qSize > 0
                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20 font-bold"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-white/[0.4] border-transparent"
                            }`}
                          >
                            <span className="capitalize">{qName}</span>
                            <span className="opacity-80 font-extrabold">{qSize}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[11px] text-gray-400 dark:text-white/[0.3] font-mono">
                          No queue details
                        </span>
                      )}
                    </div>
                  </div>
                ))
            ) : (
              <div className="text-center py-6 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
                <AlertTriangle className="size-6 text-gray-400 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-semibold text-gray-500 dark:text-white/[0.5]">
                  No active app containers detected
                </p>
                <p className="text-[11px] text-gray-400 dark:text-white/[0.3] mt-0.5">
                  Verify Docker Compose scaling settings
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

