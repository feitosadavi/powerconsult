"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
  label: string;
  searchHandler(query: string): Promise<any>;
  type: "veiculo";
  choosenVehicles: string[];
  setChoosenVehicles: React.Dispatch<React.SetStateAction<string[]>>;
}
import Image from "next/image";

function insertIcons(
  items: string[],
  iconsMap: Record<string, string>
): { label: React.ReactNode; value: string }[] {
  return items.map((item) => {
    const match = item.match(/\{([^}]+)\}\s*$/);
    if (!match) {
      return { label: item.trim(), value: item };
    }

    const inside = match[1];
    const banks = inside
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const labelBase = item.replace(/\s*\{[^}]*\}\s*$/, "").trim();

    const icons = banks.map((b) =>
      iconsMap[b] ? (
        <Image
          key={b}
          src={iconsMap[b]}
          width={30}
          height={30}
          alt={b}
          style={{
            display: "inline-block",
            verticalAlign: "middle",
            marginLeft: 4,
          }}
        />
      ) : (
        b
      )
    );

    const labelWithIcons = (
      <span>
        {labelBase}
        {icons.length > 0 && (
          <span style={{ marginLeft: 8 }}>
            {icons.map((icon, idx) => (
              <React.Fragment key={idx}>{icon}</React.Fragment>
            ))}
          </span>
        )}
      </span>
    );
    return { label: labelWithIcons, value: item };
  });
}

export const Combobox: React.FC<Props> = ({
  label,
  searchHandler,
  type,
  choosenVehicles,
  setChoosenVehicles,
}) => {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<
    { label: React.ReactNode; value: string }[]
  >([]);
  const [query, setQuery] = React.useState<string | undefined>();

  const toggleValue = React.useCallback((currentValue: string) => {
    setChoosenVehicles((prev) => {
      // if present, remove immutably; otherwise add immutably
      if (prev.includes(currentValue))
        return prev.filter((v) => v !== currentValue);
      return [...prev, currentValue];
    });
  }, []);

  React.useEffect(() => {
    if (!query) return;
    //   // isFirstRender.current = false;
    //   setOptions([]);
    //   return;
    // }

    const handler = setTimeout(async () => {
      const res = (await searchHandler(query)) as any;

      if (type === "veiculo") {
        const _options = insertIcons(res as string[], {
          itau: "/itau-logo.png",
          bancopan: "/bancopan-logo.svg",
        });
        setOptions(_options);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {choosenVehicles.length > 0
            ? choosenVehicles
                ?.join(", ")
                .replace(/{[^}]*}/g, "")
                .trim()
            : label}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command className="w-full">
          <CommandInput
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search framework..."
            className="h-9"
          />
          <CommandList>
            <CommandEmpty>No framework found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={toggleValue}
                >
                  {option.label}
                  <Check
                    className={cn(
                      "ml-auto",
                      choosenVehicles.includes(option.value)
                        ? "opacity-100"
                        : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
