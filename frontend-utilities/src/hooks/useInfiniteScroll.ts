import { useEffect, useRef } from 'react';

interface Props {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function useInfiniteScroll({ hasMore, loading, onLoadMore }: Props) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = loadMoreRef.current;

    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];

        if (first.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      {
        threshold: 0.1,
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  return {
    loadMoreRef,
  };
}
