import { RraTaxCode, RRA_TAX_CODE_OPTIONS } from '../types/ebm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface RraTaxCodeSelectProps {
  value: RraTaxCode | null | undefined;
  onChange: (value: RraTaxCode) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function RraTaxCodeSelect({ value, onChange, error, disabled, className }: RraTaxCodeSelectProps) {
  return (
    <div className="space-y-2">
      <Select
        value={value ?? undefined}
        onValueChange={(v) => onChange(v as RraTaxCode)}
        disabled={disabled}
      >
        <SelectTrigger className={error ? 'border-red-500' : className}>
          <SelectValue placeholder="Select tax code" />
        </SelectTrigger>
        <SelectContent>
          {RRA_TAX_CODE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <span className="text-red-500 text-sm">{error}</span>}
    </div>
  );
}
