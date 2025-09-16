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

type Option = {
  value: string;
  label: string;
};

interface Props {
  label: string;
  searchHandler<T>(query: string): Promise<T>;
  type: "veiculo";
}

export const Combobox: React.FC<Props> = ({ label, searchHandler, type }) => {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [options, setOptions] = React.useState([""]);

  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const handler = setTimeout(async () => {
      const res = (await searchHandler(query)) as any;
      if (type === "veiculo") {
        Object.keys(res).map((res) => {});
        const reducedArr = res.reduce((acc: any, curr: any) => {
          if (!acc.includes(curr)) acc.push(curr);
          return acc;
        }, []);

        setOptions(res.map((value) => {}));
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
          {value
            ? options.find((option) => option.value === value)?.label
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
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  {option.label}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === option.value ? "opacity-100" : "opacity-0"
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
