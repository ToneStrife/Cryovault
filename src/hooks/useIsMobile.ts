import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';
const TOUCH_QUERY = '(pointer: coarse)';

function subscribe(query: string, callback: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getMatches(query: string) {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

/** Tailwind `md` breakpoint and below (viewport < 768px). */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => getMatches(MOBILE_QUERY));

  useEffect(() => {
    return subscribe(MOBILE_QUERY, () => setIsMobile(getMatches(MOBILE_QUERY)));
  }, []);

  return isMobile;
}

/** Primary input is coarse (touch). */
export function useIsTouch() {
  const [isTouch, setIsTouch] = useState(() => getMatches(TOUCH_QUERY));

  useEffect(() => {
    return subscribe(TOUCH_QUERY, () => setIsTouch(getMatches(TOUCH_QUERY)));
  }, []);

  return isTouch;
}
