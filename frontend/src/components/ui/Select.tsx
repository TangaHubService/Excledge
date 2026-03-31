import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
};

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  icon?: any;
  className?: string;
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  icon: Icon,
  className = "",
  disabled = false,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  const toggleOpen = () => {
    if (!disabled) setIsOpen(!isOpen);
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div className={`custom-select ${className}`} ref={containerRef}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={toggleOpen}
        disabled={disabled}
      >
        {Icon && <Icon size={16} className="trigger-icon" />}
        <span className="trigger-text">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} className={`chevron ${isOpen ? "open" : ""}`} />
      </button>

      {isOpen && (
        <div className="custom-select-menu">
          {options.length === 0 ? (
            <div className="custom-select-item" style={{ color: "var(--muted)", cursor: "default" }}>
              No options available
            </div>
          ) : (
            options.map((option) => (
              <div
                key={option.value}
                className={`custom-select-item ${option.value === value ? "selected" : ""}`}
                onClick={() => handleSelect(option.value)}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
