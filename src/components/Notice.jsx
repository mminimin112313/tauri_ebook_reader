export function Notice({ children, tone = 'default' }) {
  if (!children) return null;
  return <div className={tone === 'error' ? 'notice error' : 'notice'}>{children}</div>;
}
