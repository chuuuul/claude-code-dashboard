import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { useAuthStore } from './store/authStore';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root')!;

// Bootstrap application with token refresh
(async () => {
  const { refreshTokens } = useAuthStore.getState();
  await refreshTokens();

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>
  );
})();
