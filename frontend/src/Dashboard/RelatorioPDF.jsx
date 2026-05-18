import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica' },
  header: { fontSize: 18, textAlign: 'center', marginBottom: 20, fontWeight: 'bold' },
  subHeader: { fontSize: 14, marginTop: 20, marginBottom: 10, borderBottom: '1 solid #ccc', paddingBottom: 5 },
  text: { fontSize: 11, textAlign: 'justify', lineHeight: 1.5, marginBottom: 10 },
  chartContainer: { marginVertical: 15, alignItems: 'center' },
  chartImage: { width: '90%', height: 'auto' },
  logRow: { flexDirection: 'row', borderBottom: '1 solid #eee', paddingVertical: 5 },
  logTime: { width: '25%', fontSize: 9, color: '#555' },
  logMessage: { width: '75%', fontSize: 9 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 9, textAlign: 'center', color: '#888' }
});

export const RelatorioPDF = ({ 
  graficoInrush, graficoDeltaT, graficoFFT, logs, periodo 
}) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.header}>Laudo Técnico: Diagnóstico de Transformadores</Text>
      <Text style={styles.text}>Período de Análise: {periodo}</Text>
      <Text style={styles.text}>
        Este documento apresenta o consolidado dos dados de monitoramento, incluindo a dinâmica de corrente, 
        análise térmica e espectro vibracional (FFT), em conformidade com as diretrizes do sistema supervisório.
      </Text>

      {/* Seção 1: Dinâmica de Corrente */}
      <View wrap={false}>
        <Text style={styles.subHeader}>1. Dinâmica de Corrente (Inrush e Carga)</Text>
        <View style={styles.chartContainer}>
          {graficoInrush ? <Image src={graficoInrush} style={styles.chartImage} /> : <Text style={styles.text}>Gráfico indisponível</Text>}
        </View>
      </View>

      {/* Seção 2: Análise Térmica */}
      <View wrap={false}>
        <Text style={styles.subHeader}>2. Análise Térmica (Gradiente ΔT)</Text>
        <View style={styles.chartContainer}>
          {graficoDeltaT ? <Image src={graficoDeltaT} style={styles.chartImage} /> : <Text style={styles.text}>Gráfico indisponível</Text>}
        </View>
      </View>

      {/* Seção 3: Espectro Vibracional */}
      <View wrap={false}>
        <Text style={styles.subHeader}>3. Espectro Vibracional FFT (120Hz)</Text>
        <View style={styles.chartContainer}>
          {graficoFFT ? <Image src={graficoFFT} style={styles.chartImage} /> : <Text style={styles.text}>Gráfico indisponível</Text>}
        </View>
      </View>

      {/* Seção 4: Logs de Inteligência (Com paginação automática) */}
      <Text style={styles.subHeader}>4. Registro de Alertas e Falhas</Text>
      {logs && logs.length > 0 ? (
        logs.map((log) => (
          <View style={styles.logRow} key={log.id} wrap={false}>
            <Text style={styles.logTime}>{new Date(log.id).toLocaleString()}</Text>
            <Text style={styles.logMessage}>[{log.tipo.toUpperCase()}] {log.mensagem}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.text}>Nenhuma anomalia registrada no período.</Text>
      )}

      {/* Numeração de Páginas */}
      <Text style={styles.footer} render={({ pageNumber, totalPages }) => (
        `Página ${pageNumber} de ${totalPages} - Sistema de Supervisão do PI`
      )} fixed />
    </Page>
  </Document>
);
