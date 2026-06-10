"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

/**
 * SearchBar — debounced (300ms) controlled search input.
 * Props: { onSearch, placeholder, initialValue }
 */
export default function SearchBar({
  onSearch,
  placeholder = "Search by name or phone…",
  initialValue = "",
}) {
  const [value, setValue] = useState(initialValue);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch?.(value.trim()), 300);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="h-11 w-full rounded-pill border border-hairline bg-canvas pl-10 pr-10 text-[15px] text-ink outline-none placeholder:text-mute focus:border-primary"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-mute transition hover:bg-canvas-soft-2"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
