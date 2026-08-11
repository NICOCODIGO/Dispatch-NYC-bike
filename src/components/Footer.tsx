import { useDispatch } from '../store/useDispatch';

export function Footer() {
  const version = useDispatch((s) => s.version);
  const dropped = useDispatch((s) => s.dropped);

  return (
    <footer className="mt-16 border-t border-[var(--line)]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-x-8 gap-y-2 px-5 py-6 text-[12px] text-[var(--ink-soft)] sm:px-8">
        <p className="max-w-[62ch]">
          Station data from the operator&rsquo;s public GBFS feed. Not affiliated with or endorsed
          by any operator.
        </p>
        <p className="num">
          GBFS {version ?? '—'}
          {dropped.noStatus > 0 && ` · ${dropped.noStatus} described but not reporting`}
          {dropped.noInfo > 0 && ` · ${dropped.noInfo} reporting but undescribed`}
        </p>
      </div>
    </footer>
  );
}
