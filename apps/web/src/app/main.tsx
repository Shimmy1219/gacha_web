import { createRoot } from 'react-dom/client';

import '../index.css';
import { App } from './App';
import { AppProviders } from './AppProviders';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Failed to find root element');
}

const root = createRoot(container);

root.render(
  <AppProviders>
    <App />
  </AppProviders>
);

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const sendSkipWaitingMessage = (registration: ServiceWorkerRegistration) => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting) {
          sendSkipWaitingMessage(registration);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              sendSkipWaitingMessage(registration);
            }
          });
        });
      })
      .catch((error) => {
        console.error('Failed to register service worker', error);
      });
  });
};

registerServiceWorker();
