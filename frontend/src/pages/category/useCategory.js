import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';

// Loads GET /categories/:id (places -> units). reload() refetches without the loading flash.
export default function useCategory(id) {
  const [cat, setCat] = useState(null);
  const [error, setError] = useState('');
  const live = useRef(0); // latest request wins
  const reload = useCallback(() => {
    const n = ++live.current;
    return api.getCategory(id).then((c) => n === live.current && setCat(c)).catch((e) => n === live.current && setError(e.message));
  }, [id]);
  useEffect(() => { setCat(null); setError(''); reload(); return () => { live.current += 1; }; }, [reload]);
  return { cat, error, reload };
}
