import React, { useState, useEffect } from 'react';
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

  // Simulação de recebimento de dados
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      const newData = {
        correntePrimario: (Math.random() * (1.5 - 0.5) + 0.5).toFixed(2),
        correnteSecundario: (Math.random() * (10 - 8) + 8).toFixed(2),
        temperatura: (Math.random() * (85 - 40) + 40).toFixed(1),
        vibracao120Hz: (Math.random() * (2.5 - 0.1) + 0.1).toFixed(2),
        status: 'online',
      };
      setSensorData(newData);
      avaliarDiagnostico(newData);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

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