export function imagePath(path: string | null | undefined, defaultImage = '/polipharm.png'): string {
  if (!path || path.trim() === '') return defaultImage;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return path.startsWith('/') ? path : `/${path}`;
  
}