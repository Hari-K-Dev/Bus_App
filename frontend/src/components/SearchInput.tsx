import { useState, useEffect, useRef } from 'react';
import type { StopSearch } from '../types';
import { stopsApi } from '../services/api';

interface SearchInputProps {
  onStopSelect: (stop: StopSearch) => void;
}

export function SearchInput({ onStopSelect }: SearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StopSearch[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const stops = await stopsApi.search(query);
        setResults(stops);
        setIsOpen(true);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleSelect = (stop: StopSearch) => {
    onStopSelect(stop);
    setQuery(stop.stopName);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search for a bus stop..."
          className="w-full pl-12 pr-4 py-4 glass rounded-2xl text-white
                     placeholder-white/50 focus:outline-none focus:ring-2
                     focus:ring-accent/50 transition-all text-lg"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <ul className="absolute z-50 w-full mt-2 glass rounded-xl shadow-2xl
                       max-h-72 overflow-auto">
          {results.map((stop) => (
            <li
              key={stop.stopId}
              onClick={() => handleSelect(stop)}
              className="px-4 py-3 hover:bg-white/10 cursor-pointer transition-colors
                         border-b border-white/5 last:border-0"
            >
              <div className="text-white font-medium">{stop.stopName}</div>
              <div className="text-white/50 text-sm">Stop ID: {stop.stopId}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
