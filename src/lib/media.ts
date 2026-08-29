import { useEffect, useState } from 'react';

/**
 * True on devices with no hover — touch tablets, mostly.
 *
 * The rail's hover-to-peek gesture does not exist there, so a coarse pointer
 * keeps the rail expanded and flowing beside the content instead of collapsed
 * with unreachable labels.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches,
  );

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(hover: none)');
    const onChange = () => setCoarse(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return coarse;
}
