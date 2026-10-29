import { useEffect, useRef, useState, type FormEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Link } from 'wouter';
import { ArrowUpRight, CornerDownLeft, LifeBuoy, Lock, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { HELP_QUICK_QUESTIONS, resolveHelpQuestion, type HelpAnswer } from '@/lib/help-desk-knowledge';

export const HELP_MAX_INPUT = 600;
export const HELP_MAX_EXCHANGES = 12;

type Exchange = { id: number; question: string; answer: HelpAnswer };

export default function HelpDesk({ initiallyOpen = false }: { initiallyOpen?: boolean } = {}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<Exchange[]>([]);
  const [error, setError] = useState('');
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  const topicRef = useRef<string | undefined>(undefined);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [history, open]);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const visible = window.visualViewport;
    const update = () => setViewport({ height: visible.height, top: visible.offsetTop });
    update();
    visible.addEventListener('resize', update);
    visible.addEventListener('scroll', update);
    return () => { visible.removeEventListener('resize', update); visible.removeEventListener('scroll', update); };
  }, [open]);

  const ask = (raw: string) => {
    const question = raw.trim().slice(0, HELP_MAX_INPUT);
    if (!question) { setError('Tulis pertanyaan terlebih dahulu.'); return; }
    const answer = resolveHelpQuestion(question, topicRef.current);
    if (answer.matched) topicRef.current = answer.topic;
    seq.current += 1;
    const id = seq.current;
    setHistory(h => [...h, { id, question, answer }].slice(-HELP_MAX_EXCHANGES));
    setDraft(''); setError('');
    inputRef.current?.focus();
  };
  const submit = (e: FormEvent) => { e.preventDefault(); ask(draft); };
  const reset = () => { setHistory([]); setDraft(''); setError(''); topicRef.current = undefined; inputRef.current?.focus(); };

  return <DialogPrimitive.Root open={open} onOpenChange={next => { setOpen(next); if (!next) setViewport(null); }}>
    {!open && <DialogPrimitive.Trigger asChild>
      <button type="button" data-testid="help-desk-trigger" aria-label="Buka Help Desk, pemandu aplikasi"
        className="fixed z-[45] inline-flex min-h-[48px] items-center gap-2 rounded-full border border-primary/30 bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_12px_32px_hsl(var(--foreground)/0.22)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden"
        style={{ right: 'max(16px, env(safe-area-inset-right))', bottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <LifeBuoy size={19} aria-hidden="true" /> Bantuan
      </button>
    </DialogPrimitive.Trigger>}
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-[hsl(var(--foreground)/0.28)] data-[state=open]:animate-in data-[state=open]:fade-in-0 print:hidden" />
      <DialogPrimitive.Content data-testid="help-desk-dialog" aria-describedby="help-desk-desc"
        onOpenAutoFocus={e => { e.preventDefault(); inputRef.current?.focus(); }}
        className="fixed z-[61] flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_24px_70px_hsl(var(--foreground)/0.28)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-3 print:hidden"
        style={{ right: 'max(12px, env(safe-area-inset-right))', bottom: viewport ? undefined : 'max(12px, env(safe-area-inset-bottom))',
          top: viewport ? viewport.top + Math.max(12, viewport.height - 652) : undefined,
          width: 'min(400px, calc(100vw - 24px))',
          height: viewport ? Math.min(640, Math.max(0, viewport.height - 24)) : 'min(640px, calc(100dvh - 24px))' }}>
        <header className="flex items-start gap-3 border-b border-border px-4 py-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"><LifeBuoy size={18} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="display text-base font-extrabold leading-tight">Help Desk</DialogPrimitive.Title>
            <p id="help-desk-desc" className="eyebrow mt-1 text-muted-foreground">Pemandu aplikasi / berbasis panduan</p>
          </div>
          <button type="button" data-testid="help-desk-reset" onClick={reset} aria-label="Mulai ulang percakapan" className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><RotateCcw size={17} /></button>
          <DialogPrimitive.Close asChild><button type="button" data-testid="help-desk-close" aria-label="Tutup Help Desk" className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><X size={18} /></button></DialogPrimitive.Close>
        </header>
        <div className="flex items-start gap-2 border-b border-border bg-muted/60 px-4 py-2 text-[11.5px] leading-snug text-muted-foreground" data-testid="help-desk-privacy">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>Jangan ketik kata sandi, kode, atau isi dokumen. Jawaban diambil dari panduan tetap, tidak membaca berkas Anda dan tidak memakai kuota AI.</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" role="log" aria-live="polite" aria-label="Percakapan Help Desk" data-testid="help-desk-log">
          {history.length === 0 && <div data-testid="help-desk-welcome">
            <p className="text-sm leading-relaxed">Halo. Saya pemandu berbasis panduan untuk mengenal fitur Gustafta: kasus SBU, Ruang Simpan, simulator, regulasi, dan lainnya. Pilih pertanyaan atau ketik sendiri.</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {HELP_QUICK_QUESTIONS.slice(0, 6).map((q, i) => <button key={q} type="button" data-testid={`help-desk-quick-${i}`} onClick={() => ask(q)} className="rounded-lg border border-border px-3 py-2.5 text-left text-[13px] font-semibold hover:border-primary/50 hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{q}</button>)}
            </div>
          </div>}
          <ol className="space-y-5">
            {history.map(({ id, question, answer }) => <li key={id} data-testid={`help-desk-exchange-${id}`} className="space-y-2">
              <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-xl rounded-br-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground" data-testid={`help-desk-question-${id}`}>{question}</p>
              <article className="rounded-xl rounded-bl-sm border border-border bg-background/60 p-3" data-testid={`help-desk-answer-${id}`}>
                <h3 className="text-sm font-bold">{answer.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{answer.summary}</p>
                {answer.steps.length > 0 && <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">{answer.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
                {answer.links.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{answer.links.map(l => <Link key={l.path + l.label} href={l.path} onClick={() => setOpen(false)} data-testid={`help-desk-link-${id}-${l.path.replace(/[^a-z0-9]+/gi, '-')}`} className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-primary/40 px-2.5 text-xs font-bold text-primary hover:bg-primary/10">{l.label}{l.requiresLogin ? <span className="inline-flex items-center gap-0.5 font-normal text-muted-foreground"><Lock size={11} aria-hidden="true" /> perlu masuk</span> : null}<ArrowUpRight size={13} aria-hidden="true" /></Link>)}</div>}
                <p className="eyebrow mt-3 text-muted-foreground" data-testid={`help-desk-source-${id}`}>Sumber: {answer.source}</p>
                {answer.related.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{answer.related.slice(0, 3).map((r, i) => <button key={r} type="button" data-testid={`help-desk-related-${id}-${i}`} onClick={() => ask(r)} className="rounded-full bg-secondary px-2.5 py-1.5 text-left text-xs font-semibold text-secondary-foreground hover:bg-accent">{r}</button>)}</div>}
              </article>
            </li>)}
          </ol>
          <div ref={endRef} />
        </div>
        <form onSubmit={submit} className="border-t border-border p-3">
          <label htmlFor="help-desk-input" className="sr-only">Pertanyaan tentang penggunaan aplikasi</label>
          <div className="flex gap-2">
            <input id="help-desk-input" ref={inputRef} data-testid="help-desk-input" className="field !py-2.5 !text-base" maxLength={HELP_MAX_INPUT} value={draft} autoComplete="off"
              onChange={e => { setDraft(e.target.value.slice(0, HELP_MAX_INPUT)); if (error) setError(''); }} placeholder="Contoh: cara membuat kasus" aria-invalid={!!error} aria-describedby={error ? 'help-desk-error' : undefined} />
            <button type="submit" data-testid="help-desk-send" disabled={!draft.trim()} aria-label="Kirim pertanyaan" className="btn btn-primary !min-h-[44px] !px-3.5"><CornerDownLeft size={16} /></button>
          </div>
          {error && <p id="help-desk-error" role="alert" className="mt-1.5 text-xs text-destructive">{error}</p>}
        </form>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
