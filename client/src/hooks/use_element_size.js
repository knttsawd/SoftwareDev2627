import { useEffect, useState } from 'react';

// An element's size, { width, height } in pixels, kept up to date as it changes
// (ResizeObserver): its content box, or with box "border" its whole box, borders included.
// Both are 0 until it's measured, or where ResizeObserver is missing.
export function use_element_size(element_ref, box = 'content') {
  const [size, set_size] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = element_ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const border_box = entry.borderBoxSize?.[0];
      if (box === 'border' && border_box) set_size({ width: border_box.inlineSize, height: border_box.blockSize });
      else set_size({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element_ref, box]);

  return size;
}
