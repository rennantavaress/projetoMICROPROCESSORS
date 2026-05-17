import React, { useState, useEffect } from 'react';
import { Activity, Zap, Thermometer, AlertTriangle, CheckCircle, Power, RefreshCw, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      const now = new Date();
      const timeString = `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

      const newData = {
        time: timeString,
        correntePrimario: parseFloat((Math.random() * (1.5 - 0.5) + 0.5).toFixed(2)),
        correnteSecundario: parseFloat((Math.random() * (10 - 8) + 8).toFixed(2)),
        temperatura: parseFloat((Math.random() * (85 - 40) + 40).toFixed(1)),
        vibracao120Hz: parseFloat((Math.random() * (2.5 - 0.1) + 0.1).toFixed(2)),
      };

      avaliarDiagnostico(newData);
      setChartData((prevData) => [...prevData, newData].slice(-20));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  const avaliarDiagnostico = (data) => {
    const novosAlertas = [];
    let currentStatus = 'normal';

    if (data.vibracao120Hz > 2.0) {
      currentStatus = 'alerta';
      novosAlertas.push({
        id: Date.now() + 1,
        tipo: 'manutencao',
        mensagem: 'Assinatura de vibração (120Hz) fora do padrão. Realizar aperto estrutural.',
      });
      toast.warning('Atenção: Anomalia de Vibração Detectada!', { toastId: 'vib_alert' });
    }

    if (data.temperatura > 80) {
      currentStatus = 'critico';
      novosAlertas.push({
        id: Date.now() + 2,
        tipo: 'aviso',
        mensagem: 'Elevação anômala de ΔT. Risco iminente de curto parcial entre espiras.',
      });
      toast.error('CRÍTICO: Risco de curto parcial por temperatura elevada!', { toastId: 'temp_crit' });
    }

    setSensorData({ ...data, status: currentStatus });
    
    if (novosAlertas.length > 0) {
      setAlertas((prev) => [...novosAlertas, ...prev].slice(0, 4));
    }
  };

  const handleAcknowledge = () => setAlertas([]);

  const solicitarRelatorioPDF = () => {
    toast.info("Solicitando geração de relatório PDF ao servidor...");
  };

  const StatusLED = ({ value, thresholdWarning, thresholdCritical }) => {
    let colorClass = 'bg-emerald-500 shadow-[0_0_8px_#10B981]';
    if (value >= thresholdCritical) colorClass = 'bg-red-500 shadow-[0_0_8px_#EF4444]';
    else if (value >= thresholdWarning) colorClass = 'bg-yellow-500 shadow-[0_0_8px_#F59E0B]';

    return <div className={`w-3 h-3 rounded-full ${colorClass}`} />;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6 font-sans">
      <ToastContainer position="top-right" autoClose={3000} theme="dark" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Diagnóstico de Saúde de Transformadores</h1>
          <p className="text-gray-400 text-sm mt-1">Supervisório IHM - Tema 2</p>
        </div>
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
          <button onClick={solicitarRelatorioPDF} className="flex items-center gap-2 px-4 py-2 rounded-md font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <FileText className="w-4 h-4" /> Exportar PDF
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
          <h3 className="text-gray-200 font-medium mb-6">Tendência Térmica (°C)</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="time" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis domain={['dataMin - 5', 'dataMax + 5']} stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#F3F4F6' }} itemStyle={{ color: '#F3F4F6' }} />
                <Line type="monotone" dataKey="temperatura" stroke="#EF4444" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
          <h3 className="text-gray-200 font-medium mb-6">Dinâmica de Correntes (A)</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="time" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#F3F4F6' }} itemStyle={{ color: '#F3F4F6' }} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="correntePrimario" name="I Primário" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="correnteSecundario" name="I Secundário" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
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