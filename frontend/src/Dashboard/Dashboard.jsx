import React, { useState, useEffect, useRef } from 'react';
import { Activity, Zap, Thermometer, AlertTriangle, CheckCircle, Power, RefreshCw, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ExportButton } from './ExportButton';

const FFT_SIZE = 256;
const SAMPLE_RATE = 1000;
const IQR_WINDOW = 30;

const buildVibrationSamples = (amplitude, spike) => {
  const samples = [];
  for (let i = 0; i < FFT_SIZE; i += 1) {
    const t = i / SAMPLE_RATE;
    const base = amplitude * Math.sin(2 * Math.PI * 120 * t);
    const harmonic = 0.35 * amplitude * Math.sin(2 * Math.PI * 60 * t);
    const noise = (Math.random() - 0.5) * amplitude * 0.15;
    samples.push(base + harmonic + noise);
  }

  if (spike) {
    const center = Math.floor(FFT_SIZE / 2);
    const burst = amplitude * 8;
    samples[center - 2] += burst * 0.6;
    samples[center - 1] += burst * 0.85;
    samples[center] += burst;
    samples[center + 1] += burst * 0.8;
    samples[center + 2] += burst * 0.5;
  }

  return samples;
};

const fftRadix2 = (samples) => {
  const n = samples.length;
  const re = samples.slice();
  const im = Array(n).fill(0);

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wLenRe = Math.cos(ang);
    const wLenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
        const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;

        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + len / 2] = uRe - vRe;
        im[i + j + len / 2] = uIm - vIm;

        const nextWRe = wRe * wLenRe - wIm * wLenIm;
        const nextWIm = wRe * wLenIm + wIm * wLenRe;
        wRe = nextWRe;
        wIm = nextWIm;
      }
    }
  }

  return { re, im };
};

const buildSpectrum = (samples) => {
  const { re, im } = fftRadix2(samples);
  const spectrum = [];
  const half = samples.length / 2;
  for (let k = 0; k < half; k += 1) {
    const magnitude = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / samples.length;
    spectrum.push({
      freq: Math.round((k * SAMPLE_RATE) / samples.length),
      magnitude: Number(magnitude.toFixed(4)),
    });
  }
  return spectrum;
};

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

const getIqrBounds = (values) => {
  if (values.length < 4) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => {
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  };

  const q1 = percentile(0.25);
  const q3 = percentile(0.75);
  const iqr = q3 - q1;
  return {
    lower: q1 - 1.5 * iqr,
    upper: q3 + 1.5 * iqr,
  };
};

const getTimeDomain = (data, windowSec) => {
  if (!data.length) return ['auto', 'auto'];
  const latest = data[data.length - 1].timeMs;
  return [latest - windowSec * 1000, latest];
};

const Dashboard = () => {
  const [sensorData, setSensorData] = useState({
    correntePrimario: 0.0,
    correnteSecundario: 0.0,
    temperatura: 25.0,
    vibracao120Hz: 0.1,
    status: 'normal',
  });

  const [chartData, setChartData] = useState([]);
  const [isRunning, setIsRunning] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const isRunningRef = useRef(isRunning);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);
  const [alertas, setAlertas] = useState([]);
  const [fftData, setFftData] = useState([]);
  const [logCount, setLogCount] = useState(0);
  const [toastEnabled, setToastEnabled] = useState(true);
  const [chartControls, setChartControls] = useState({
    temperatura: { xWindow: 30, yMin: 50, yMax: 52, yTicks: 5, clamp: false },
    correntes: { xWindow: 30, yMin: 0, yMax: 12, yTicks: 6, clamp: false },
    vibracao: { xWindow: 30, yMin: 0, yMax: 12, yTicks: 6, clamp: true },
    fft: { xMax: 500, yMin: 0, yMax: 2, yTicks: 5 },
  });
  const logRef = useRef([]);
  const iqrRef = useRef([]);
  const spikeRef = useRef(false);

  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connect = () => {
      // O backend roda na porta 8080 (http_simulator e serial_bridge apontam para porta 8080)
      ws = new WebSocket('ws://127.0.0.1:8080/ws');
      
      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        if (!isRunningRef.current) return;

        try {
          const rawData = JSON.parse(event.data);
          const timestamp = new Date();
          const timeMs = timestamp.getTime();
          const shouldSpike = spikeRef.current;
          spikeRef.current = false;

          const newData = {
            timestamp: timestamp.toISOString(),
            timeMs,
            correntePrimario: rawData.corrente_primario,
            correnteSecundario: rawData.corrente_secundario,
            temperatura: rawData.temperatura,
            vibracao120Hz: shouldSpike ? 12.0 : rawData.vibracao,
          };

          const bounds = getIqrBounds(iqrRef.current);
          const isSpike = shouldSpike || (bounds
            ? newData.vibracao120Hz < bounds.lower || newData.vibracao120Hz > bounds.upper
            : false);

          newData.isSpike = isSpike;

          avaliarDiagnostico(newData, isSpike);
          setChartData((prevData) => [...prevData, newData].slice(-200));
          logRef.current.push(newData);
          setLogCount(logRef.current.length);
          iqrRef.current.push(newData.vibracao120Hz);
          if (iqrRef.current.length > IQR_WINDOW) {
            iqrRef.current.shift();
          }

          const samples = buildVibrationSamples(newData.vibracao120Hz, isSpike);
          setFftData(buildSpectrum(samples));
        } catch (err) {
          console.error("Erro ao fazer parse dos dados recebidos via WebSocket", err);
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  const avaliarDiagnostico = (data, isSpike) => {
    const novosAlertas = [];
    let currentStatus = 'normal';

    if (data.vibracao120Hz > 2.0) {
      currentStatus = 'alerta';
      novosAlertas.push({
        id: Date.now() + 1,
        tipo: 'manutencao',
        mensagem: 'Assinatura de vibração (120Hz) fora do padrão. Realizar aperto estrutural.',
      });
      if (toastEnabled) {
        toast.warning('Atenção: Anomalia de Vibração Detectada!', { toastId: 'vib_alert' });
      }
    }

    if (data.temperatura > 80) {
      currentStatus = 'critico';
      novosAlertas.push({
        id: Date.now() + 2,
        tipo: 'aviso',
        mensagem: 'Elevação anômala de ΔT. Risco iminente de curto parcial entre espiras.',
      });
      if (toastEnabled) {
        toast.error('CRÍTICO: Risco de curto parcial por temperatura elevada!', { toastId: 'temp_crit' });
      }
    }

    if (isSpike) {
      currentStatus = currentStatus === 'critico' ? 'critico' : 'alerta';
      novosAlertas.push({
        id: Date.now() + 3,
        tipo: 'aviso',
        mensagem: 'Spike detectado por IQR na vibração. Verificar evento transitório.',
      });
      if (toastEnabled) {
        toast.warning('Spike detectado por IQR na vibração!', { toastId: `spike_${Date.now()}` });
      }
    }

    setSensorData({ ...data, status: currentStatus });
    
    if (novosAlertas.length > 0) {
      setAlertas((prev) => [...novosAlertas, ...prev].slice(0, 4));
    }
  };

  const handleAcknowledge = () => setAlertas([]);

  const handleSpikeTest = () => {
    spikeRef.current = true;
      if (toastEnabled) {
        toast.info('Spike de teste agendado para a próxima amostra.');
      }
  };

  const exportCsv = () => {
    if (!logRef.current.length) {
        if (toastEnabled) {
          toast.info('Sem dados para exportar.');
        }
      return;
    }

    const header = 'timestamp,corrente_primario,corrente_secundario,temperatura,vibracao_120hz';
    const rows = logRef.current.map((row) => (
      `${row.timestamp},${row.correntePrimario},${row.correnteSecundario},${row.temperatura},${row.vibracao120Hz}`
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
    ['temperatura'],
    chartControls.temperatura.yMin,
    chartControls.temperatura.yMax,
    chartControls.temperatura.clamp,
  );
  const correntesData = clampSeries(
    chartData,
    ['correntePrimario', 'correnteSecundario'],
    chartControls.correntes.yMin,
    chartControls.correntes.yMax,
    chartControls.correntes.clamp,
  );
  const vibracaoData = clampSeries(
    chartData,
    ['vibracao120Hz'],
    chartControls.vibracao.yMin,
    chartControls.vibracao.yMax,
    chartControls.vibracao.clamp,
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
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 mr-2 bg-gray-800 px-3 py-2 rounded-md border border-gray-700">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_#10B981]' : 'bg-red-500 shadow-[0_0_8px_#EF4444] animate-pulse'}`} />
            <span className="text-sm font-medium text-gray-200">{isConnected ? 'Conectado (WS)' : 'Desconectado'}</span>
          </div>
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
          <ExportButton logs={alertas} periodo="Tempo Real (Ao Vivo)" />
          <button onClick={handleSpikeTest} className="flex items-center gap-2 px-4 py-2 rounded-md font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors">
            <Activity className="w-4 h-4" /> Gerar Spike
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
            <Zap className="w-8 h-8 text-yellow-500" />
            <StatusLED value={sensorData.correntePrimario} thresholdWarning={1.2} thresholdCritical={1.8} />
          </div>
          <h2 className="text-sm text-gray-400 font-medium mb-1">Primário (220V)</h2>
          <div className="text-3xl font-bold text-white">
            {sensorData.correntePrimario} <span className="text-lg text-gray-500 font-normal">A</span>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <Zap className="w-8 h-8 text-emerald-500" />
            <StatusLED value={sensorData.correnteSecundario} thresholdWarning={9.5} thresholdCritical={11} />
          </div>
          <h2 className="text-sm text-gray-400 font-medium mb-1">Secundário (12V)</h2>
          <div className="text-3xl font-bold text-white">
            {sensorData.correnteSecundario} <span className="text-lg text-gray-500 font-normal">A</span>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <Thermometer className="w-8 h-8 text-red-500" />
            <StatusLED value={sensorData.temperatura} thresholdWarning={70} thresholdCritical={80} />
          </div>
          <h2 className="text-sm text-gray-400 font-medium mb-1">Temperatura (ΔT)</h2>
          <div className="text-3xl font-bold text-white">
            {sensorData.temperatura} <span className="text-lg text-gray-500 font-normal">°C</span>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <Activity className="w-8 h-8 text-purple-500" />
            <StatusLED value={sensorData.vibracao120Hz} thresholdWarning={1.5} thresholdCritical={2.0} />
          </div>
          <h2 className="text-sm text-gray-400 font-medium mb-1">Vibração (120Hz)</h2>
          <div className="text-3xl font-bold text-white">
            {sensorData.vibracao120Hz} <span className="text-lg text-gray-500 font-normal">g</span>
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
              <Knob label="Y Min" value={chartControls.temperatura.yMin} min={45} max={60} step={0.5} onChange={(value) => updateControl('temperatura', 'yMin', value)} />
              <Knob label="Y Max" value={chartControls.temperatura.yMax} min={45} max={70} step={0.5} onChange={(value) => updateControl('temperatura', 'yMax', value)} />
              <Knob label="Ticks" value={chartControls.temperatura.yTicks} min={3} max={10} step={1} onChange={(value) => updateControl('temperatura', 'yTicks', value)} />
              <button onClick={() => updateControl('temperatura', 'clamp', !chartControls.temperatura.clamp)} className={`px-3 py-1 rounded-md text-xs font-medium border ${chartControls.temperatura.clamp ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
                {chartControls.temperatura.clamp ? 'Limite ON' : 'Limite OFF'}
              </button>
            </div>
          </div>
          <div id="chart-delta-t" className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={temperaturaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis type="number" domain={getTimeDomain(temperaturaData, chartControls.temperatura.xWindow)} dataKey="timeMs" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={formatTimeLabel} />
                <YAxis {...buildAxisPropsRange(chartControls.temperatura.yMin, chartControls.temperatura.yMax, chartControls.temperatura.yTicks)} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={formatTimeLabel} contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#F3F4F6' }} itemStyle={{ color: '#F3F4F6' }} />
                <Line type="monotone" dataKey="temperatura" stroke="#EF4444" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h3 className="text-gray-200 font-medium">Dinâmica de Correntes (A)</h3>
            <div className="flex flex-wrap gap-3">
              <Knob label="X (s)" value={chartControls.correntes.xWindow} min={10} max={120} step={5} onChange={(value) => updateControl('correntes', 'xWindow', value)} />
              <Knob label="Y Min" value={chartControls.correntes.yMin} min={0} max={10} step={0.5} onChange={(value) => updateControl('correntes', 'yMin', value)} />
              <Knob label="Y Max" value={chartControls.correntes.yMax} min={5} max={20} step={0.5} onChange={(value) => updateControl('correntes', 'yMax', value)} />
              <Knob label="Ticks" value={chartControls.correntes.yTicks} min={3} max={10} step={1} onChange={(value) => updateControl('correntes', 'yTicks', value)} />
              <button onClick={() => updateControl('correntes', 'clamp', !chartControls.correntes.clamp)} className={`px-3 py-1 rounded-md text-xs font-medium border ${chartControls.correntes.clamp ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
                {chartControls.correntes.clamp ? 'Limite ON' : 'Limite OFF'}
              </button>
            </div>
          </div>
          <div id="chart-inrush" className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={correntesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis type="number" domain={getTimeDomain(correntesData, chartControls.correntes.xWindow)} dataKey="timeMs" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={formatTimeLabel} />
                <YAxis {...buildAxisPropsRange(chartControls.correntes.yMin, chartControls.correntes.yMax, chartControls.correntes.yTicks)} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={formatTimeLabel} contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#F3F4F6' }} itemStyle={{ color: '#F3F4F6' }} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="correntePrimario" name="I Primário" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="correnteSecundario" name="I Secundário" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-gray-200 font-medium">Vibração (g) com Spike</h3>
          <div className="flex flex-wrap gap-3">
            <Knob label="X (s)" value={chartControls.vibracao.xWindow} min={10} max={120} step={5} onChange={(value) => updateControl('vibracao', 'xWindow', value)} />
            <Knob label="Y Min" value={chartControls.vibracao.yMin} min={0} max={5} step={0.2} onChange={(value) => updateControl('vibracao', 'yMin', value)} />
            <Knob label="Y Max" value={chartControls.vibracao.yMax} min={1} max={15} step={0.5} onChange={(value) => updateControl('vibracao', 'yMax', value)} />
            <Knob label="Ticks" value={chartControls.vibracao.yTicks} min={3} max={10} step={1} onChange={(value) => updateControl('vibracao', 'yTicks', value)} />
            <button onClick={() => updateControl('vibracao', 'clamp', !chartControls.vibracao.clamp)} className={`px-3 py-1 rounded-md text-xs font-medium border ${chartControls.vibracao.clamp ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
              {chartControls.vibracao.clamp ? 'Limite ON' : 'Limite OFF'}
            </button>
          </div>
        </div>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={vibracaoData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis type="number" domain={getTimeDomain(vibracaoData, chartControls.vibracao.xWindow)} dataKey="timeMs" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={formatTimeLabel} />
              <YAxis {...buildAxisPropsRange(chartControls.vibracao.yMin, chartControls.vibracao.yMax, chartControls.vibracao.yTicks)} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip labelFormatter={formatTimeLabel} contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#F3F4F6' }} itemStyle={{ color: '#F3F4F6' }} />
              <Line type="linear" dataKey="vibracao120Hz" stroke="#4B5563" strokeWidth={1} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h3 className="text-gray-200 font-medium">Assinatura Vibracional (FFT)</h3>
          <div className="flex flex-wrap gap-3">
            <Knob label="X Max" value={chartControls.fft.xMax} min={100} max={500} step={10} onChange={(value) => updateControl('fft', 'xMax', value)} />
            <Knob label="Y Min" value={chartControls.fft.yMin} min={0} max={2} step={0.1} onChange={(value) => updateControl('fft', 'yMin', value)} />
            <Knob label="Y Max" value={chartControls.fft.yMax} min={0.5} max={5} step={0.1} onChange={(value) => updateControl('fft', 'yMax', value)} />
            <Knob label="Ticks" value={chartControls.fft.yTicks} min={3} max={10} step={1} onChange={(value) => updateControl('fft', 'yTicks', value)} />
          </div>
        </div>
        <div id="chart-fft" className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={fftData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis type="number" domain={[0, chartControls.fft.xMax]} dataKey="freq" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} unit="Hz" />
              <YAxis {...buildAxisPropsRange(chartControls.fft.yMin, chartControls.fft.yMax, chartControls.fft.yTicks)} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#F3F4F6' }} itemStyle={{ color: '#F3F4F6' }} />
              <Line type="monotone" dataKey="magnitude" stroke="#8B5CF6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
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