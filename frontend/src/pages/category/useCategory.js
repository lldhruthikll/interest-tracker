import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';

// Loads GET /categories/:id (places -> units). reload() refetches without the loading flash.
export default function useCategory(id) {
  const [cat, setCat] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => api.getCategory(id).then(setCat).catch((e) => setError(e.message)), [id]);
  useEffect(() => { setCat(null); setError(''); reload(); }, [reload]);
  return { cat, error, reload };
}
