import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import 'swiper/swiper-bundle.css';
import 'flatpickr/dist/flatpickr.css';
import App from './App.tsx';
import { AppWrapper } from '@/components/common/PageMeta.tsx';
import { ThemeProvider } from '@/context/ThemeContext.tsx';
import { LoadingProvider } from '@/context/LoadingContext.tsx';
import { ModalProvider } from '@/context/ModalContext.tsx';
import { FullScreenProvider } from '@/context/FullScreenContext.tsx';

// fonts
import '@fontsource/noto-sans-thai/300.css';
import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-sans-thai/700.css';

import i18n from './i18n';
import { useLanguageStore } from './store/language';

// ----------------------
// language init
// ----------------------
const language = useLanguageStore.getState().language;
i18n.changeLanguage(language);

// ----------------------
// RENDER
// ----------------------
createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <FullScreenProvider>
        <ThemeProvider>
          <LoadingProvider>
            <ModalProvider>
              <AppWrapper>
                <App />
              </AppWrapper>
            </ModalProvider>
          </LoadingProvider>
        </ThemeProvider>
      </FullScreenProvider>
  </StrictMode>
);
