import { useState, useCallback } from 'react';
import { useModalContext } from '@/context/ModalContext';

export const useModal = (initialState: boolean = false) => {
  const [isOpen, setIsOpen] = useState(initialState);
  const { setOpenModal } = useModalContext();

  const openModal = useCallback(() => {
    setIsOpen(true);
    setOpenModal(true);
  }, [setOpenModal]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setOpenModal(false);
  }, [setOpenModal]);

  const toggleModal = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      setOpenModal(next);
      return next;
    });
  }, [setOpenModal]);

  return { isOpen, openModal, closeModal, toggleModal };
};
