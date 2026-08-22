import { createContext, useContext, useState, ReactNode } from 'react';

interface ModalContextType {
  isOpenModal: boolean;
  setOpenModal: (value: boolean) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpenModal, setOpenModal] = useState(false);

  return <ModalContext.Provider value={{ isOpenModal, setOpenModal }}>{children}</ModalContext.Provider>;
};

// Hook สะดวกสำหรับเรียกใช้
export const useModalContext = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};

export const useModalContextOptional = () => useContext(ModalContext);
