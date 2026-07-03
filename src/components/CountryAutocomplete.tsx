'use client';

import { useState, useRef, useEffect } from 'react';
import { COUNTRIES } from '@/lib/constants/countries';

interface CountryAutocompleteProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CountryAutocomplete({
  id,
  name,
  value,
  onChange,
  placeholder = 'Search country...',
  disabled = false,
}: CountryAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCountries = COUNTRIES.filter(c =>
    c.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <input
        id={id}
        name={name}
        type="text"
        className="input"
        placeholder={placeholder}
        value={inputValue}
        disabled={disabled}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        style={{ width: '100%' }}
        autoComplete="off"
      />
      
      {isOpen && !disabled && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '200px',
            overflowY: 'auto',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            marginTop: '4px',
            padding: '4px',
            listStyle: 'none',
            zIndex: 1000,
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {filteredCountries.length > 0 ? (
            filteredCountries.map(country => (
              <li
                key={country}
                onClick={() => {
                  setInputValue(country);
                  onChange(country);
                  setIsOpen(false);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  borderRadius: 'var(--radius-sm)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {country}
              </li>
            ))
          ) : (
            <li style={{ padding: '8px 12px', fontSize: '14px', color: 'var(--text-muted)' }}>
              No countries found
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
