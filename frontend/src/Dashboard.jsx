import React, { useState, useEffect, useRef } from 'react';
import { Activity, Zap, Thermometer, AlertTriangle, CheckCircle, Power, RefreshCw } from 'lucide-react';
import './Dashboard.css';

const DashboardTema2 = () => {
  // Estados para armazenar os dados dos sensores
  const [sensorData, setSensorData] = useState({
    correntePrimario: 0.0, // Em Amperes (Inrush/Magnetização)
    correnteSecundario: 0.0, // Em Amperes
    temperatura: 25.0, // Em °C
    vibracao120Hz: 0.1, // Amplitude (g)
    status: 'online', 
  });

  const [isRunning, setIsRunning] = useState(true);
  const [alertas, setAlertas] = useState([]);
  const [connStatus, setConnStatus] = useState('disconnected');
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const closingRef = useRef(false);
  const runningRef = useRef(isRunning);

  const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

  useEffect(() => {
    runningRef.current = isRunning;
  }, [isRunning]);

  const normalizePayload = (payload) => {
    const data = payload || {};
    const toNumber = (value, fallback) => {
      if (value === undefined || value === null || value === '') return fallback;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? fallback : parsed;
    };

    return {
      correntePrimario: toNumber(
        data.correntePrimario ?? data.corrente_primario,
        sensorData.correntePrimario,
      ),
      correnteSecundario: toNumber(
        data.correnteSecundario ?? data.corrente_secundario,
        sensorData.correnteSecundario,
      ),
      temperatura: toNumber(data.temperatura, sensorData.temperatura),
      vibracao120Hz: toNumber(
        data.vibracao120Hz ?? data.vibracao_120hz ?? data.vibracao,
        sensorData.vibracao120Hz,
      ),
      status: data.status || 'online',
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

    setConnStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    closingRef.current = false;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const nextData = normalizePayload(payload);
        setSensorData(nextData);
        avaliarDiagnostico(nextData);
      } catch (error) {
        // Ignore malformed payloads to keep the dashboard running.
      }
    };

    ws.onclose = () => {
      if (closingRef.current || !runningRef.current) {
        closingRef.current = false;
        return;
      }
      setConnStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      setConnStatus('error');
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

  // Lógica de Apoio à Decisão (Diagnóstico Técnico)
  const avaliarDiagnostico = (data) => {
    const novosAlertas = [];

    // Lógica para vibração (afrouxamento de núcleo)
    if (data.vibracao120Hz > 2.0) {
      novosAlertas.push({
        id: Date.now() + 1,
        tipo: 'manutencao',
        mensagem: 'Manutenção: Assinatura de vibração (120Hz) com amplitude fora do padrão. Realizar aperto mecânico estrutural no núcleo magnético.',
      });
    }

    // Lógica para Temperatura e Degradação
    if (data.temperatura > 80) {
      novosAlertas.push({
        id: Date.now() + 2,
        tipo: 'aviso',
        mensagem: 'Aviso de Eficiência: Elevação anômala de ΔT. Risco iminente de curto parcial entre espiras.',
      });
    }

    setAlertas((prev) => [...novosAlertas, ...prev].slice(0, 4));
  };

  const handleAcknowledge = () => {
    setAlertas([]);
  };

  return (
    <div className="dashboard-container">
      {/* Header / Controles */}
      <div className="dashboard-header">
        <div className="header-titles">
          <h1 className="dashboard-title">Diagnóstico de Saúde de Transformadores</h1>
          <p className="dashboard-subtitle">Monitoramento Dinâmico - Tema 2</p>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setIsRunning(!isRunning)}
            className={`btn ${isRunning ? 'btn-stop' : 'btn-start'}`}
          >
            <Power className="icon-small" />
            {isRunning ? 'Parar Aquisição' : 'Iniciar Aquisição'}
          </button>
          <div className="btn btn-reset" style={{ cursor: 'default' }}>
            {connStatus === 'connected' && 'Socket Online'}
            {connStatus === 'connecting' && 'Conectando...'}
            {connStatus === 'disconnected' && 'Socket Offline'}
            {connStatus === 'error' && 'Erro no Socket'}
          </div>
          <button 
            onClick={handleAcknowledge}
            className="btn btn-reset"
          >
            <RefreshCw className="icon-small" />
            Reset de Alarmes
          </button>
        </div>
      </div>

      {/* Grid de Sensores */}
      <div className="sensor-grid">
        {/* Card Primário */}
        <div className="sensor-card">
          <Zap className="icon-large icon-yellow" />
          <h2 className="sensor-title">Primário (220V)</h2>
          <p className="sensor-desc">Corrente de Magnetização</p>
          <div className="sensor-value">
            {sensorData.correntePrimario} <span className="sensor-unit">A</span>
          </div>
        </div>

        {/* Card Secundário */}
        <div className="sensor-card">
          <Zap className="icon-large icon-green" />
          <h2 className="sensor-title">Secundário (12V)</h2>
          <p className="sensor-desc">Corrente de Saída</p>
          <div className="sensor-value">
            {sensorData.correnteSecundario} <span className="sensor-unit">A</span>
          </div>
        </div>

        {/* Card Temperatura */}
        <div className="sensor-card">
          <Thermometer className={`icon-large ${sensorData.temperatura > 75 ? 'icon-red' : 'icon-blue'}`} />
          <h2 className="sensor-title">Análise Térmica</h2>
          <p className="sensor-desc">Gradiente Térmico (ΔT)</p>
          <div className="sensor-value">
            {sensorData.temperatura} <span className="sensor-unit">°C</span>
          </div>
        </div>

        {/* Card Vibração */}
        <div className="sensor-card">
          <Activity className="icon-large icon-purple" />
          <h2 className="sensor-title">Assinatura FFT</h2>
          <p className="sensor-desc">Magnetostrição (120Hz)</p>
          <div className="sensor-value">
            {sensorData.vibracao120Hz} <span className="sensor-unit">g</span>
          </div>
        </div>
      </div>

      {/* Módulo de Inteligência e Diagnóstico */}
      <div className="diagnostic-module">
        <h2 className="diagnostic-title">
          <AlertTriangle className="icon-medium icon-yellow-dark" />
          Sugestões de Intervenção Técnica
        </h2>
        
        <div className="alert-list">
          {alertas.length === 0 ? (
            <div className="alert alert-normal">
              <CheckCircle className="icon-medium" />
              <span>Sistema operando dentro dos parâmetros nominais. Nenhuma anomalia detectada.</span>
            </div>
          ) : (
            alertas.map((alerta) => (
              <div 
                key={alerta.id} 
                className={`alert ${alerta.tipo === 'manutencao' ? 'alert-maintenance' : 'alert-warning'}`}
              >
                <AlertTriangle className="icon-medium alert-icon" />
                <span>{alerta.mensagem}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardTema2;