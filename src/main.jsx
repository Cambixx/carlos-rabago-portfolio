import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/space-grotesk';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './styles.css';
import App from './App.jsx';
import I18nProvider from './i18n/I18nProvider';

// Se espera a las webfonts (o como mucho 800 ms) antes de pintar: si el boot se
// pintara con la fuente de reserva, al llegar la buena las líneas se reajustarían
// y todo el bloque saltaría (layout shift).
const fontsReady = Promise.all([
    document.fonts.load('400 12px "Space Mono"'),
    document.fonts.load('700 12px "Space Mono"'),
    document.fonts.load('700 40px "Space Grotesk Variable"'),
]).catch(() => {});

Promise.race([fontsReady, new Promise((resolve) => setTimeout(resolve, 800))]).then(() => {
    createRoot(document.getElementById('root')).render(
        <StrictMode>
            <I18nProvider>
                <App />
            </I18nProvider>
        </StrictMode>,
    );
});
