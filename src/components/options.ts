import { useEffect, useState } from 'react';
import { ComboboxOption } from '@grafana/ui';

export function useOptions<T extends string | number>(
    getOptions: () => Promise<T[]>,
    deps: React.DependencyList,
) {
  const [options, setOptions] = useState<ComboboxOption<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(undefined);

    getOptions()
      .then((values) => {
        if (!cancelled) {
          setOptions(values.map((value) => ({
            label: String(value),
            value,
          })));
        }
      })
      .catch((err) => {
          if (!cancelled) {
            setError(err);
            setOptions([]);
          }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, deps);

  return { options, loading, error };
}
