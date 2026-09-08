import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Erro não tratado no Alicerce:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'sans-serif', textAlign: 'center', background: '#f8fafc' }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>Algo deu errado</h1>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 12 }}>
              A página encontrou um erro inesperado e não conseguiu carregar. Recarregue a página; se continuar
              acontecendo, abra o Console do navegador (botão direito → Inspecionar → Console) e envie o erro.
            </p>
            <pre style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap', textAlign: 'left', background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              {String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
