import React, { useState } from 'react';
import { toPng } from 'html-to-image';
import { pdf } from '@react-pdf/renderer';
import { RelatorioPDF } from './RelatorioPDF';
import { Download } from 'lucide-react';

export const ExportButton = ({ logs, periodo }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const captureChart = async (elementId) => {
    const element = document.getElementById(elementId);
    if (!element) {
      console.warn(`Elemento com ID ${elementId} não encontrado na tela.`);
      return '';
    }
    
    // html-to-image lida nativamente com oklch do Tailwind v4
    return await toPng(element, { pixelRatio: 2, backgroundColor: '#111827' });
  };

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      const imgDeltaT = await captureChart('chart-delta-t');
      const imgInrush = await captureChart('chart-inrush');
      const imgFFT = await captureChart('chart-fft');

      const doc = <RelatorioPDF 
        graficoInrush={imgInrush} 
        graficoDeltaT={imgDeltaT} 
        graficoFFT={imgFFT} 
        logs={logs} 
        periodo={periodo} 
      />;

      const blob = await pdf(doc).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Laudo_Supervisao_Transformadores_${new Date().getTime()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Falha ao gerar relatório:', error);
      alert('Houve um erro ao gerar o PDF. Verifique o console.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button 
      onClick={handleExport} 
      disabled={isGenerating}
      className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${isGenerating ? 'bg-indigo-800 text-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
    >
      <Download className="w-4 h-4" />
      {isGenerating ? 'Processando Documento...' : 'Emitir Laudo PDF'}
    </button>
  );
};
