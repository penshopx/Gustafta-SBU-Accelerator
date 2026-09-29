import React from 'react';
import { CircleAlert } from 'lucide-react';

export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3" aria-label="Memuat data">{Array.from({ length: rows }).map((_, i) => <div key={i} className="surface flex items-center gap-4 p-5"><div className="loading-block h-10 w-10" /><div className="flex-1 space-y-2"><div className="loading-block h-3 w-1/3" /><div className="loading-block h-2.5 w-2/3" /></div></div>)}</div>;
}

export function ErrorState({ retry, message }: { retry: () => void; message?: string }) {
  return <div className="surface p-9 text-center"><CircleAlert className="mx-auto mb-4 text-[#bb5451]" size={26} /><h3 className="font-bold text-lg">Data belum dapat ditampilkan</h3><p className="mt-2 text-sm text-[#58708a]">{message || 'Koneksi sedang terganggu. Coba muat ulang data.'}</p><button data-testid="button-retry" onClick={retry} className="btn btn-outline mt-5">Coba lagi</button></div>;
}