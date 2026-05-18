import React, { useState, useEffect, useRef } from 'react';
import { Activity, Thermometer, AlertTriangle, CheckCircle, Power, RefreshCw, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Knob = ({ label, value, min, max, step, onChange }) => {
  const percent = (value - min) / (max - min);
  const angle = -135 + percent * 270;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full bg-gray-800 border border-gray-700" />
        <div
          className="absolute left-1/2 top-1/2 h-4 w-0.5 bg-gray-200 origin-bottom"
          style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <div className="text-[10px] text-gray-300">{label}</div>
      <div className="text-[10px] text-gray-400">{value}</div>
    </div>
  );
};

const formatTimeLabel = (value) => {
  if (value === null || value === undefined) return '';
  const date = new Date(value);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

const ramp = (value, start, end) => {
  if (value <= start) return 0;
  if (value >= end) return 1;
  return (value - start) / (end - start);
};

const computeFuzzyRisk = ({ temperaturaCelsius, pitch, roll, yaw }) => {
  const tilt = Math.max(Math.abs(pitch), Math.abs(roll), Math.abs(yaw));

  const tempHigh = ramp(temperaturaCelsius, 70, 90);
  const tempWarn = ramp(temperaturaCelsius, 55, 75) * (1 - tempHigh);
  const tiltHigh = ramp(tilt, 35, 60);
  const tiltWarn = ramp(tilt, 20, 40) * (1 - tiltHigh);

  const risk = clamp01(Math.max(tempHigh, tiltHigh, 0.6 * tempWarn, 0.6 * tiltWarn));
  return { risk, tilt };
};


const getTimeDomain = (data, windowSec) => {
  if (!data.length) return ['auto', 'auto'];
  const latest = data[data.length - 1].timeMs;
  return [latest - windowSec * 1000, latest];
};

const Dashboard = () => {
  const initialData = {
    temperaturaCelsius: 0.0,
    pitch: 0.0,
    roll: 0.0,
    yaw: 0.0,
    mpuOk: true,
    status: 'normal',
  };
  const [sensorData, setSensorData] = useState(initialData);

  const [chartData, setChartData] = useState([]);
  const [isRunning, setIsRunning] = useState(true);
  const [alertas, setAlertas] = useState([]);
  const [logCount, setLogCount] = useState(0);
  const [toastEnabled, setToastEnabled] = useState(true);
  const [chartControls, setChartControls] = useState({
    temperatura: { xWindow: 30, yMin: 20, yMax: 100, yTicks: 5, clamp: false },
    orientacao: { xWindow: 30, yMin: -180, yMax: 180, yTicks: 7, clamp: false },
  });
  const logRef = useRef([]);
  const lastDataRef = useRef(initialData);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const closingRef = useRef(false);
  const runningRef = useRef(isRunning);

  const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

  useEffect(() => {
    runningRef.current = isRunning;
  }, [isRunning]);

  const normalizePayload = (payload, previous) => {
    const data = payload || {};
    const toNumber = (value, fallback) => {
      if (value === undefined || value === null || value === '') return fallback;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? fallback : parsed;
    };

    return {
      temperaturaCelsius: toNumber(
        data.temperatura_celsius ?? data.temperaturaCelsius ?? data.temperatura,
        previous.temperaturaCelsius,
      ),
      pitch: toNumber(data.pitch_graus ?? data.pitch, previous.pitch),
      roll: toNumber(data.roll_graus ?? data.roll, previous.roll),
      yaw: toNumber(data.yaw_graus ?? data.yaw ?? data.yaW, previous.yaw),
      mpuOk: data.mpu_ok ?? previous.mpuOk ?? true,
      status: data.mpu_ok === false ? 'alerta' : (data.status || previous.status || 'normal'),
    };
  };

  const scheduleReconnect = () => {
    if (reconnectTimerRef.current) return;
    if (!runningRef.current) return;
    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    const delay = Math.min(1000 * 2 ** attempt, 15000);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectWebSocket();
    }, delay);
  };

  const closeSocket = () => {
    if (!wsRef.current) return;
    closingRef.current = true;
    wsRef.current.close();
    wsRef.current = null;
  };

  const connectWebSocket = () => {
    if (!isRunning) return;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      closeSocket();
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    closingRef.current = false;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const nextData = normalizePayload(payload, lastDataRef.current);
        const status = avaliarDiagnostico(nextData);
        const finalData = { ...nextData, status };
        lastDataRef.current = finalData;
        setSensorData(finalData);

        const timestamp = new Date();
        const row = {
          ...finalData,
          timestamp: timestamp.toISOString(),
          timeMs: timestamp.getTime(),
        };
        setChartData((prevData) => [...prevData, row].slice(-200));
        logRef.current.push(row);
        setLogCount(logRef.current.length);
      } catch (error) {
        // Ignore malformed payloads to keep the dashboard running.
      }
    };

    ws.onclose = () => {
      if (closingRef.current || !runningRef.current) {
        closingRef.current = false;
        return;
      }
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  };

  useEffect(() => {
    if (isRunning) {
      connectWebSocket();
    } else if (wsRef.current) {
      closeSocket();
    }

    return () => {
      if (wsRef.current) {
        closeSocket();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [isRunning, WS_URL]);

  const avaliarDiagnostico = (data) => {
    const novosAlertas = [];
    let currentStatus = 'normal';

    const { risk: baseRisk, tilt } = computeFuzzyRisk(data);
    let risk = baseRisk;

    if (data.mpuOk === false) {
      risk = Math.max(risk, 0.6);
      novosAlertas.push({
        id: Date.now() + 1,
        tipo: 'aviso',
        mensagem: 'MPU sinalizou falha. Verificar integridade do sensor.',
      });
    }

    if (risk >= 0.7) {
      currentStatus = 'critico';
      novosAlertas.push({
        id: Date.now() + 2,
        tipo: 'aviso',
        mensagem: `Risco alto de falha (${Math.round(risk * 100)}%). Verificar temperatura e inclinacao (tilt ${tilt.toFixed(1)}°).`,
      });
      if (toastEnabled) {
        toast.error('CRITICO: Risco alto de falha!', { toastId: 'risk_crit' });
      }
    } else if (risk >= 0.4) {
      currentStatus = 'alerta';
      novosAlertas.push({
        id: Date.now() + 3,
        tipo: 'aviso',
        mensagem: `Risco moderado (${Math.round(risk * 100)}%). Monitorar temperatura e orientacao.`,
      });
      if (toastEnabled) {
        toast.warning('Atencao: risco moderado de falha.', { toastId: 'risk_warn' });
      }
    }

    if (novosAlertas.length > 0) {
      setAlertas((prev) => [...novosAlertas, ...prev].slice(0, 4));
    }

    return currentStatus;
  };

  const handleAcknowledge = () => setAlertas([]);

  const exportCsv = () => {
    if (!logRef.current.length) {
        if (toastEnabled) {
          toast.info('Sem dados para exportar.');
        }
      return;
    }

    const header = 'timestamp,temperatura_celsius,pitch,roll,yaw';
    const rows = logRef.current.map((row) => (
      `${row.timestamp},${row.temperaturaCelsius},${row.pitch},${row.roll},${row.yaw}`
    ));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `datalog_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const StatusLED = ({ value, thresholdWarning, thresholdCritical }) => {
    let colorClass = 'bg-emerald-500 shadow-[0_0_8px_#10B981]';
    if (value >= thresholdCritical) colorClass = 'bg-red-500 shadow-[0_0_8px_#EF4444]';
    else if (value >= thresholdWarning) colorClass = 'bg-yellow-500 shadow-[0_0_8px_#F59E0B]';

    return <div className={`w-3 h-3 rounded-full ${colorClass}`} />;
  };

  const buildAxisPropsRange = (min, max, tickCount) => {
    return {
      domain: [min ?? 'auto', max ?? 'auto'],
      ...(tickCount ? { tickCount } : {}),
    };
  };

  const clampValue = (value, min, max) => {
    if (min === undefined || max === undefined) return value;
    return Math.min(Math.max(value, min), max);
  };

  const clampSeries = (data, fields, min, max, enabled) => {
    if (!enabled) return data;
    return data.map((row) => {
      const next = { ...row };
      fields.forEach((field) => {
        next[field] = clampValue(next[field], min, max);
      });
      return next;
    });
  };

  const updateControl = (section, field, value) => {
    setChartControls((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const temperaturaData = clampSeries(
    chartData,
    ['temperaturaCelsius'],
    chartControls.temperatura.yMin,
    chartControls.temperatura.yMax,
    chartControls.temperatura.clamp,
  );
  const orientacaoData = clampSeries(
    chartData,
    ['pitch', 'roll', 'yaw'],
    chartControls.orientacao.yMin,
    chartControls.orientacao.yMax,
    chartControls.orientacao.clamp,
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 font-sans">
      {toastEnabled && <ToastContainer position="top-right" autoClose={3000} theme="dark" />}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Diagnóstico de Saúde de Transformadores</h1>
          <p className="text-gray-400 text-sm mt-1">Supervisório IHM - Tema 2</p>
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-6">
        Datalogger ativo: {logCount} registros com timestamp.
      </div>

      <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 shadow-lg mb-8">
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setIsRunning(!isRunning)} 
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${isRunning ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
          >
            <Power className="w-4 h-4" />
            {isRunning ? 'Parar Aquisição' : 'Iniciar Aquisição'}
          </button>
          <button onClick={handleAcknowledge} className="flex items-center gap-2 px-4 py-2 rounded-md font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors">
            <RefreshCw className="w-4 h-4" /> Reset Alarmes
          </button>
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 rounded-md font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <FileText className="w-4 h-4" /> Exportar CSV
          </button>
          <button onClick={() => setToastEnabled((prev) => !prev)} className="flex items-center gap-2 px-4 py-2 rounded-md font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors">
            {toastEnabled ? 'Desligar Toasts' : 'Ligar Toasts'}
          </button>
        </div>
      </div>

      {/* Grid de Sensores */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <Thermometer className="w-8 h-8 text-red-500" />
            <StatusLED value={sensorData.temperaturaCelsius} thresholdWarning={70} thresholdCritical={80} />
          </div>
          <h2 className="text-sm text-gray-400 font-medium mb-1">Temperatura</h2>
          <div className="text-3xl font-bold text-white">
            {sensorData.temperaturaCelsius} <span className="text-lg text-gray-500 font-normal">°C</span>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <Activity className="w-8 h-8 text-yellow-500" />
            <StatusLED value={Math.abs(sensorData.pitch)} thresholdWarning={30} thresholdCritical={45} />
          </div>
          <h2 className="text-sm text-gray-400 font-medium mb-1">Pitch</h2>
          <div className="text-3xl font-bold text-white">
            {sensorData.pitch} <span className="text-lg text-gray-500 font-normal">°</span>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <Activity className="w-8 h-8 text-emerald-500" />
            <StatusLED value={Math.abs(sensorData.roll)} thresholdWarning={30} thresholdCritical={45} />
          </div>
          <h2 className="text-sm text-gray-400 font-medium mb-1">Roll</h2>
          <div className="text-3xl font-bold text-white">
            {sensorData.roll} <span className="text-lg text-gray-500 font-normal">°</span>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <Activity className="w-8 h-8 text-purple-500" />
            <StatusLED value={Math.abs(sensorData.yaw)} thresholdWarning={30} thresholdCritical={45} />
          </div>
          <h2 className="text-sm text-gray-400 font-medium mb-1">Yaw</h2>
          <div className="text-3xl font-bold text-white">
            {sensorData.yaw} <span className="text-lg text-gray-500 font-normal">°</span>
          </div>
        </div>
      </div>

      {/* Gráficos em Tempo Real */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h3 className="text-gray-200 font-medium">Tendência Térmica (°C)</h3>
            <div className="flex flex-wrap gap-3">
              <Knob label="X (s)" value={chartControls.temperatura.xWindow} min={10} max={120} step={5} onChange={(value) => updateControl('temperatura', 'xWindow', value)} />
              <Knob label="Y Min" value={chartControls.temperatura.yMin} min={0} max={80} step={1} onChange={(value) => updateControl('temperatura', 'yMin', value)} />
              <Knob label="Y Max" value={chartControls.temperatura.yMax} min={40} max={120} step={1} onChange={(value) => updateControl('temperatura', 'yMax', value)} />
              <Knob label="Ticks" value={chartControls.temperatura.yTicks} min={3} max={10} step={1} onChange={(value) => updateControl('temperatura', 'yTicks', value)} />
              <button onClick={() => updateControl('temperatura', 'clamp', !chartControls.temperatura.clamp)} className={`px-3 py-1 rounded-md text-xs font-medium border ${chartControls.temperatura.clamp ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
                {chartControls.temperatura.clamp ? 'Limite ON' : 'Limite OFF'}
              </button>
            </div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={temperaturaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis type="number" domain={getTimeDomain(temperaturaData, chartControls.temperatura.xWindow)} dataKey="timeMs" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={formatTimeLabel} />
                <YAxis {...buildAxisPropsRange(chartControls.temperatura.yMin, chartControls.temperatura.yMax, chartControls.temperatura.yTicks)} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={formatTimeLabel} contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#F3F4F6' }} itemStyle={{ color: '#F3F4F6' }} />
                <Line type="monotone" dataKey="temperaturaCelsius" stroke="#EF4444" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h3 className="text-gray-200 font-medium">Orientação (Pitch/Roll/Yaw)</h3>
            <div className="flex flex-wrap gap-3">
              <Knob label="X (s)" value={chartControls.orientacao.xWindow} min={10} max={120} step={5} onChange={(value) => updateControl('orientacao', 'xWindow', value)} />
              <Knob label="Y Min" value={chartControls.orientacao.yMin} min={-180} max={0} step={5} onChange={(value) => updateControl('orientacao', 'yMin', value)} />
              <Knob label="Y Max" value={chartControls.orientacao.yMax} min={0} max={180} step={5} onChange={(value) => updateControl('orientacao', 'yMax', value)} />
              <Knob label="Ticks" value={chartControls.orientacao.yTicks} min={3} max={9} step={1} onChange={(value) => updateControl('orientacao', 'yTicks', value)} />
              <button onClick={() => updateControl('orientacao', 'clamp', !chartControls.orientacao.clamp)} className={`px-3 py-1 rounded-md text-xs font-medium border ${chartControls.orientacao.clamp ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
                {chartControls.orientacao.clamp ? 'Limite ON' : 'Limite OFF'}
              </button>
            </div>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={orientacaoData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis type="number" domain={getTimeDomain(orientacaoData, chartControls.orientacao.xWindow)} dataKey="timeMs" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={formatTimeLabel} />
                <YAxis {...buildAxisPropsRange(chartControls.orientacao.yMin, chartControls.orientacao.yMax, chartControls.orientacao.yTicks)} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={formatTimeLabel} contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#F3F4F6' }} itemStyle={{ color: '#F3F4F6' }} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="pitch" name="Pitch" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="roll" name="Roll" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="yaw" name="Yaw" stroke="#3B82F6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Módulo de Inteligência */}
      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
        <h2 className="flex items-center gap-2 text-lg font-medium text-gray-200 mb-6">
          <AlertTriangle className="w-5 h-5 text-yellow-500" /> 
          Sugestões de Intervenção Técnica
        </h2>
        <div className="space-y-3">
          {alertas.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-900/20 border border-emerald-800/30 text-emerald-400">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Sistema operando dentro dos parâmetros nominais. Nenhuma anomalia detectada.</span>
            </div>
          ) : (
            alertas.map((alerta) => (
              <div key={alerta.id} className={`flex items-start gap-3 p-4 rounded-lg border text-sm ${alerta.tipo === 'manutencao' ? 'bg-orange-900/20 border-orange-800/30 text-orange-400' : 'bg-red-900/20 border-red-800/30 text-red-400'}`}>
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{alerta.mensagem}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;