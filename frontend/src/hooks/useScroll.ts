import { useRef } from 'react';

export const useDragScroll = <T extends HTMLElement>() => {
  const scrollRef = useRef<T>(null);

  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    startX.current = e.clientX;
    scrollLeft.current = scrollRef.current.scrollLeft;
  };

  const onPointerUp = () => {
    isDragging.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const walk = e.clientX - startX.current;
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };

  return {
    scrollRef,
    onPointerDown,
    onPointerUp,
    onPointerMove,
  };
};
