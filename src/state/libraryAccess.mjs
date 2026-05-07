export function formatGrantedAccess(access) {
  const count = Array.isArray(access?.granted_roots) ? access.granted_roots.length : 0;
  if (count === 0) return 'No folder access';
  return `${count} ${count === 1 ? 'folder' : 'folders'} allowed`;
}
