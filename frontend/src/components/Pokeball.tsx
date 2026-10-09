export function Pokeball({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="pb-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="1" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="#f8fafc" />
      <path d="M3 32a29 29 0 0 1 58 0z" fill="url(#pb-top)" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#0b0a12" strokeWidth="4" />
      <path d="M3 32h58" stroke="#0b0a12" strokeWidth="4" />
      <circle cx="32" cy="32" r="9.5" fill="#f8fafc" stroke="#0b0a12" strokeWidth="4" />
      <circle cx="32" cy="32" r="4" fill="#fff" stroke="#cbd5e1" strokeWidth="1.5" />
    </svg>
  );
}
