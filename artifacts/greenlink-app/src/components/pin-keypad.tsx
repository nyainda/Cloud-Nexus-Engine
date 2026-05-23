import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PinKeypadProps {
  pin: string;
  onChange: (pin: string) => void;
  onSubmit: () => void;
  loading?: boolean;
}

export default function PinKeypad({ pin, onChange, onSubmit, loading }: PinKeypadProps) {
  const handlePress = (num: number) => {
    if (pin.length < 6) {
      onChange(pin + num);
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      onChange(pin.slice(0, -1));
    }
  };

  return (
    <div className="w-full max-w-[280px] mx-auto select-none">
      <div className="flex justify-center gap-3 mb-6 h-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-colors ${
              i < pin.length ? "bg-primary border-primary" : "bg-transparent border-input"
            }`}
          />
        ))}
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <Button
            key={num}
            variant="outline"
            size="lg"
            className="h-16 text-2xl font-medium rounded-2xl bg-card border-border hover:bg-accent hover:text-accent-foreground"
            onClick={() => handlePress(num)}
            disabled={loading}
          >
            {num}
          </Button>
        ))}
        <Button
          variant="outline"
          size="lg"
          className="h-16 text-2xl font-medium rounded-2xl bg-card border-border hover:bg-accent hover:text-accent-foreground text-destructive"
          onClick={handleBackspace}
          disabled={loading || pin.length === 0}
        >
          <Delete className="h-6 w-6" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-16 text-2xl font-medium rounded-2xl bg-card border-border hover:bg-accent hover:text-accent-foreground"
          onClick={() => handlePress(0)}
          disabled={loading}
        >
          0
        </Button>
        <Button
          variant="default"
          size="lg"
          className="h-16 text-lg font-medium rounded-2xl"
          onClick={onSubmit}
          disabled={loading || pin.length < 4}
        >
          {loading ? "..." : "OK"}
        </Button>
      </div>
    </div>
  );
}
