export function imagePath(path: string | null | undefined, defaultImage = '/polipharm.png'): string {
  if (!path || path.trim() === '') return defaultImage;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const normalizedPath = path.replace(/\\/g, '/');
  const suffixMatch = normalizedPath.match(/([?#].*)$/);
  const suffix = suffixMatch?.[1] || '';
  const pathWithoutSuffix = suffix ? normalizedPath.slice(0, -suffix.length) : normalizedPath;
  const profileStorageIndex = pathWithoutSuffix.indexOf('storage/profile/');

  if (profileStorageIndex >= 0) {
    return `/static/profile/${pathWithoutSuffix.split('/').pop()}${suffix}`;
  }

  return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
}