import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
        console.log('Service Worker registration:', registration);
        
        // Log when the service worker is ready
        navigator.serviceWorker.ready.then(() => {
          console.log('Service Worker is ready');
        });
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
        console.error('User Agent:', navigator.userAgent);
        console.error('Current URL:', window.location.href);
      });
  });
} else {
  console.error('Service Worker not supported in this browser');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);