import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

// East African Countries with their codes and flag emojis
const eastAfricanCountries = [
    { code: '+250', country: 'Rwanda', flag: '🇷🇼', iso: 'RW' },
    { code: '+254', country: 'Kenya', flag: '🇰🇪', iso: 'KE' },
    { code: '+255', country: 'Tanzania', flag: '🇹🇿', iso: 'TZ' },
    { code: '+256', country: 'Uganda', flag: '🇺🇬', iso: 'UG' },
    { code: '+257', country: 'Burundi', flag: '🇧🇮', iso: 'BI' },
    { code: '+251', country: 'Ethiopia', flag: '🇪🇹', iso: 'ET' },
    { code: '+253', country: 'Djibouti', flag: '🇩🇯', iso: 'DJ' },
    { code: '+252', country: 'Somalia', flag: '🇸🇴', iso: 'SO' },
    { code: '+211', country: 'South Sudan', flag: '🇸🇸', iso: 'SS' },
];

interface CountryCodeSelectorProps {
    value?: string;
    onChange?: (code: string) => void;
    disabled?: boolean;
    className?: string;
    id?: string;
    error?: boolean;
}

// Standalone Country Code Selector Component
export const CountryCodeSelector = ({
    value = '+250',
    onChange,
    disabled = false,
    className = '',
    id,
    error = false,
}: CountryCodeSelectorProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedCode, setSelectedCode] = useState(value);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedCountry = eastAfricanCountries.find(c => c.code === selectedCode) || eastAfricanCountries[0];

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Update selected code when value prop changes
    useEffect(() => {
        if (value) {
            setSelectedCode(value);
        }
    }, [value]);

    const handleSelect = (code: string) => {
        setSelectedCode(code);
        setIsOpen(false);
        if (onChange) {
            onChange(code);
        }
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef} id={id}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
          flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-card 
          border rounded-lg
          hover:bg-muted 
          focus:outline-none focus:ring-2 focus:ring-ring
          transition-all duration-200
          ${error ? 'border-red-500 dark:border-red-400' : 'border-border'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          min-w-[100px] sm:min-w-[120px] max-w-[140px]
        `}
            >
                <span className="text-xl sm:text-2xl leading-none">{selectedCountry.flag}</span>
                <span className="font-medium text-foreground text-sm sm:text-base truncate">
                    {selectedCountry.code}
                </span>
                <ChevronDown
                    className={`h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0 ${isOpen ? 'transform rotate-180' : ''
                        }`}
                />
            </button>

            {isOpen && !disabled && (
                <div className="absolute z-50 mt-2 w-full min-w-[240px] sm:min-w-[280px] max-w-[320px] bg-card border border-border rounded-lg shadow-xl overflow-hidden left-0">
                    <div className="max-h-[280px] sm:max-h-[320px] overflow-y-auto">
                        {eastAfricanCountries.map((country) => (
                            <button
                                key={country.iso}
                                type="button"
                                onClick={() => handleSelect(country.code)}
                                className={`
                  w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 
                  hover:bg-muted 
                  transition-colors duration-150
                  ${selectedCode === country.code ? 'bg-primary/10' : ''}
                `}
                            >
                                <span className="text-2xl sm:text-3xl leading-none flex-shrink-0">{country.flag}</span>
                                <div className="flex-1 text-left min-w-0">
                                    <div className="font-medium text-foreground text-sm sm:text-base truncate">
                                        {country.country}
                                    </div>
                                    <div className="text-xs sm:text-sm text-muted-foreground">
                                        {country.code}
                                    </div>
                                </div>
                                {selectedCode === country.code && (
                                    <Check className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

interface PhoneInputWithCountryCodeProps {
    value?: string;
    onChange: (value: string, countryCode: string) => void;
    countryCode?: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    label?: string;
    required?: boolean;
    error?: string;
}

const PhoneInputWithCountryCode = ({
    value = '',
    onChange,
    countryCode = '+250',
    placeholder = 'XXX XXX XXX',
    disabled = false,
    className = '',
    label,
    required = false,
    error = '',
}: PhoneInputWithCountryCodeProps) => {
    const getLocalNumber = (fullNumber: string) => {
        if (!fullNumber) return '';
        return fullNumber.startsWith(countryCode)
            ? fullNumber.substring(countryCode.length)
            : fullNumber.replace(/^\+?\d*/, '');
    };

    const [localNumber, setLocalNumber] = useState(getLocalNumber(value));

    useEffect(() => {
        setLocalNumber(getLocalNumber(value));
    }, [value]);

    const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newLocalNumber = e.target.value.replace(/\D/g, '');
        setLocalNumber(newLocalNumber);
        onChange(`${countryCode}${newLocalNumber}`, countryCode);
    };

    const handleCountryCodeChange = (newCountryCode: string) => {
        onChange(`${newCountryCode}${localNumber}`, newCountryCode);
    };

    return (
        <div className={`space-y-2 ${className}`}>
            {label && (
                <label className="block text-sm font-medium text-foreground">
                    {label}
                    {required && <span className="text-danger ml-1">*</span>}
                </label>
            )}
            <div className="flex gap-2 w-full">
                <div className="flex-shrink-0">
                    <CountryCodeSelector
                        value={countryCode}
                        onChange={handleCountryCodeChange}
                        disabled={disabled}
                        error={!!error}
                    />
                </div>
                <input
                    type="tel"
                    value={localNumber}
                    onChange={handleLocalNumberChange}
                    placeholder={placeholder}
                    disabled={disabled}
                    required={required}
                    className={`
                        flex-1 min-w-0 px-3 sm:px-4 py-2 bg-card 
                        border rounded-lg
                        text-foreground text-sm sm:text-base
                        placeholder-gray-400 dark:placeholder-gray-500
                        focus:outline-none focus:ring-2 
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-all duration-200
                        ${error
                            ? 'border-red-500 dark:border-red-400 focus:ring-red-500 dark:focus:ring-red-400'
                            : 'border-border focus:ring-ring'
                        }
                    `}
                />
            </div>
            {error && (
                <p className="text-xs text-danger dark:text-red-400 mt-1">
                    {error}
                </p>
            )}
        </div>
    );
}
export default PhoneInputWithCountryCode;
