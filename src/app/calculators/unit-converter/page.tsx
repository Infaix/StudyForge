'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, Card, CardContent, Input, Button } from '@/components/ui';

type Category = 'length' | 'mass' | 'temperature' | 'volume' | 'speed' | 'area' | 'time' | 'data';

interface UnitDef {
  id: string;
  name: string;
  abbr: string;
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
}

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'length', label: 'Length', icon: '📏' },
  { id: 'mass', label: 'Mass', icon: '⚖️' },
  { id: 'temperature', label: 'Temperature', icon: '🌡️' },
  { id: 'volume', label: 'Volume', icon: '🧪' },
  { id: 'speed', label: 'Speed', icon: '🏎️' },
  { id: 'area', label: 'Area', icon: '📐' },
  { id: 'time', label: 'Time', icon: '⏱️' },
  { id: 'data', label: 'Data', icon: '💾' },
];

const UNITS: Record<Category, UnitDef[]> = {
  length: [
    { id: 'mm', name: 'Millimeter', abbr: 'mm', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
    { id: 'cm', name: 'Centimeter', abbr: 'cm', toBase: (v) => v * 0.01, fromBase: (v) => v / 0.01 },
    { id: 'm', name: 'Meter', abbr: 'm', toBase: (v) => v, fromBase: (v) => v },
    { id: 'km', name: 'Kilometer', abbr: 'km', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    { id: 'in', name: 'Inch', abbr: 'in', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    { id: 'ft', name: 'Foot', abbr: 'ft', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    { id: 'yd', name: 'Yard', abbr: 'yd', toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
    { id: 'mi', name: 'Mile', abbr: 'mi', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
    { id: 'nm', name: 'Nautical Mile', abbr: 'nmi', toBase: (v) => v * 1852, fromBase: (v) => v / 1852 },
  ],
  mass: [
    { id: 'mg', name: 'Milligram', abbr: 'mg', toBase: (v) => v * 0.000001, fromBase: (v) => v / 0.000001 },
    { id: 'g', name: 'Gram', abbr: 'g', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
    { id: 'kg', name: 'Kilogram', abbr: 'kg', toBase: (v) => v, fromBase: (v) => v },
    { id: 't', name: 'Metric Ton', abbr: 't', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    { id: 'oz', name: 'Ounce', abbr: 'oz', toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
    { id: 'lb', name: 'Pound', abbr: 'lb', toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
    { id: 'st', name: 'Stone', abbr: 'st', toBase: (v) => v * 6.35029, fromBase: (v) => v / 6.35029 },
  ],
  temperature: [
    { id: 'c', name: 'Celsius', abbr: '\u00B0C', toBase: (v) => v, fromBase: (v) => v },
    { id: 'f', name: 'Fahrenheit', abbr: '\u00B0F', toBase: (v) => (v - 32) * (5 / 9), fromBase: (v) => v * (9 / 5) + 32 },
    { id: 'k', name: 'Kelvin', abbr: 'K', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
  ],
  volume: [
    { id: 'ml', name: 'Milliliter', abbr: 'mL', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
    { id: 'l', name: 'Liter', abbr: 'L', toBase: (v) => v, fromBase: (v) => v },
    { id: 'gal_us', name: 'US Gallon', abbr: 'gal', toBase: (v) => v * 3.78541, fromBase: (v) => v / 3.78541 },
    { id: 'gal_uk', name: 'UK Gallon', abbr: 'imp gal', toBase: (v) => v * 4.54609, fromBase: (v) => v / 4.54609 },
    { id: 'qt', name: 'US Quart', abbr: 'qt', toBase: (v) => v * 0.946353, fromBase: (v) => v / 0.946353 },
    { id: 'pt', name: 'US Pint', abbr: 'pt', toBase: (v) => v * 0.473176, fromBase: (v) => v / 0.473176 },
    { id: 'cup', name: 'US Cup', abbr: 'cup', toBase: (v) => v * 0.236588, fromBase: (v) => v / 0.236588 },
    { id: 'fl_oz', name: 'US Fluid Ounce', abbr: 'fl oz', toBase: (v) => v * 0.0295735, fromBase: (v) => v / 0.0295735 },
    { id: 'tbsp', name: 'Tablespoon', abbr: 'tbsp', toBase: (v) => v * 0.0147868, fromBase: (v) => v / 0.0147868 },
    { id: 'tsp', name: 'Teaspoon', abbr: 'tsp', toBase: (v) => v * 0.00492892, fromBase: (v) => v / 0.00492892 },
  ],
  speed: [
    { id: 'ms', name: 'Meters/Second', abbr: 'm/s', toBase: (v) => v, fromBase: (v) => v },
    { id: 'kmh', name: 'Kilometers/Hour', abbr: 'km/h', toBase: (v) => v / 3.6, fromBase: (v) => v * 3.6 },
    { id: 'mph', name: 'Miles/Hour', abbr: 'mph', toBase: (v) => v * 0.44704, fromBase: (v) => v / 0.44704 },
    { id: 'kn', name: 'Knots', abbr: 'kn', toBase: (v) => v * 0.514444, fromBase: (v) => v / 0.514444 },
    { id: 'fts', name: 'Feet/Second', abbr: 'ft/s', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    { id: 'mach', name: 'Mach', abbr: 'Mach', toBase: (v) => v * 343, fromBase: (v) => v / 343 },
  ],
  area: [
    { id: 'mm2', name: 'Square Millimeter', abbr: 'mm\u00B2', toBase: (v) => v * 0.000001, fromBase: (v) => v / 0.000001 },
    { id: 'cm2', name: 'Square Centimeter', abbr: 'cm\u00B2', toBase: (v) => v * 0.0001, fromBase: (v) => v / 0.0001 },
    { id: 'm2', name: 'Square Meter', abbr: 'm\u00B2', toBase: (v) => v, fromBase: (v) => v },
    { id: 'km2', name: 'Square Kilometer', abbr: 'km\u00B2', toBase: (v) => v * 1000000, fromBase: (v) => v / 1000000 },
    { id: 'ha', name: 'Hectare', abbr: 'ha', toBase: (v) => v * 10000, fromBase: (v) => v / 10000 },
    { id: 'ac', name: 'Acre', abbr: 'ac', toBase: (v) => v * 4046.86, fromBase: (v) => v / 4046.86 },
    { id: 'sqft', name: 'Square Foot', abbr: 'ft\u00B2', toBase: (v) => v * 0.092903, fromBase: (v) => v / 0.092903 },
    { id: 'sqmi', name: 'Square Mile', abbr: 'mi\u00B2', toBase: (v) => v * 2589988.11, fromBase: (v) => v / 2589988.11 },
  ],
  time: [
    { id: 'ms_time', name: 'Millisecond', abbr: 'ms', toBase: (v) => v * 0.001, fromBase: (v) => v / 0.001 },
    { id: 's', name: 'Second', abbr: 's', toBase: (v) => v, fromBase: (v) => v },
    { id: 'min', name: 'Minute', abbr: 'min', toBase: (v) => v * 60, fromBase: (v) => v / 60 },
    { id: 'hr', name: 'Hour', abbr: 'hr', toBase: (v) => v * 3600, fromBase: (v) => v / 3600 },
    { id: 'day', name: 'Day', abbr: 'day', toBase: (v) => v * 86400, fromBase: (v) => v / 86400 },
    { id: 'wk', name: 'Week', abbr: 'wk', toBase: (v) => v * 604800, fromBase: (v) => v / 604800 },
    { id: 'mo', name: 'Month (30d)', abbr: 'mo', toBase: (v) => v * 2592000, fromBase: (v) => v / 2592000 },
    { id: 'yr', name: 'Year (365d)', abbr: 'yr', toBase: (v) => v * 31536000, fromBase: (v) => v / 31536000 },
  ],
  data: [
    { id: 'bit', name: 'Bit', abbr: 'bit', toBase: (v) => v, fromBase: (v) => v },
    { id: 'byte', name: 'Byte', abbr: 'B', toBase: (v) => v * 8, fromBase: (v) => v / 8 },
    { id: 'kb', name: 'Kilobyte', abbr: 'KB', toBase: (v) => v * 8192, fromBase: (v) => v / 8192 },
    { id: 'mb', name: 'Megabyte', abbr: 'MB', toBase: (v) => v * 8388608, fromBase: (v) => v / 8388608 },
    { id: 'gb', name: 'Gigabyte', abbr: 'GB', toBase: (v) => v * 8589934592, fromBase: (v) => v / 8589934592 },
    { id: 'tb', name: 'Terabyte', abbr: 'TB', toBase: (v) => v * 8796093022208, fromBase: (v) => v / 8796093022208 },
    { id: 'kib', name: 'Kibibyte', abbr: 'KiB', toBase: (v) => v * 8192, fromBase: (v) => v / 8192 },
    { id: 'mib', name: 'Mebibyte', abbr: 'MiB', toBase: (v) => v * 8388608, fromBase: (v) => v / 8388608 },
    { id: 'gib', name: 'Gibibyte', abbr: 'GiB', toBase: (v) => v * 8589934592, fromBase: (v) => v / 8589934592 },
  ],
};

const COMMON_CONVERSIONS: Record<Category, string[]> = {
  length: ['m', 'ft', 'km', 'mi'],
  mass: ['kg', 'lb', 'oz'],
  temperature: ['c', 'f', 'k'],
  volume: ['l', 'gal_us', 'cup', 'fl_oz'],
  speed: ['kmh', 'mph', 'ms'],
  area: ['m2', 'sqft', 'ac'],
  time: ['s', 'min', 'hr', 'day'],
  data: ['mb', 'gb', 'tb'],
};

function formatResult(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e12 || (abs < 1e-6 && abs > 0)) {
    return value.toExponential(6);
  }
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 6;
  return parseFloat(value.toFixed(decimals)).toString();
}

export default function UnitConverterPage() {
  const [category, setCategory] = useState<Category>('length');
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeUnit, setActiveUnit] = useState<string | null>(null);

  const units = useMemo(() => {
    if (!search.trim()) return UNITS[category];
    const q = search.toLowerCase();
    return UNITS[category].filter(
      (u) => u.name.toLowerCase().includes(q) || u.abbr.toLowerCase().includes(q)
    );
  }, [category, search]);

  const handleValueChange = useCallback((unitId: string, raw: string) => {
    setActiveUnit(unitId);
    setValues((prev) => {
      const updated = { ...prev, [unitId]: raw };
      const unitDefs = UNITS[category];
      const sourceUnit = unitDefs.find((u) => u.id === unitId);
      if (!sourceUnit) return updated;

      const numVal = parseFloat(raw);
      if (isNaN(numVal) || raw.trim() === '') {
        const cleared: Record<string, string> = {};
        for (const u of unitDefs) {
          cleared[u.id] = u.id === unitId ? raw : '';
        }
        return cleared;
      }

      const baseVal = sourceUnit.toBase(numVal);
      const result: Record<string, string> = {};
      for (const u of unitDefs) {
        result[u.id] = u.id === unitId ? raw : formatResult(u.fromBase(baseVal));
      }
      return result;
    });
  }, [category]);

  const setCategoryWithReset = (cat: Category) => {
    setCategory(cat);
    setValues({});
    setActiveUnit(null);
    setSearch('');
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Unit Converter"
        description="Convert between different units of measurement"
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-3">
              <nav className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryWithReset(cat.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      category === cat.id
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="text-base">{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                <Input
                  label="Search units"
                  placeholder="e.g. meter, kg, fahrenheit..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />

                {COMMON_CONVERSIONS[category].length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Common conversions</p>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_CONVERSIONS[category].map((uid) => {
                        const u = UNITS[category].find((def) => def.id === uid);
                        if (!u) return null;
                        return (
                          <Button
                            key={uid}
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveUnit(uid);
                              if (!values[uid]) {
                                handleValueChange(uid, '1');
                              }
                            }}
                            className={`text-xs ${activeUnit === uid ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : ''}`}
                          >
                            {u.abbr}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {units.map((unit) => (
                    <div
                      key={unit.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        activeUnit === unit.id
                          ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{unit.name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{unit.abbr}</span>
                      </div>
                      <input
                        type="number"
                        value={values[unit.id] ?? ''}
                        onChange={(e) => handleValueChange(unit.id, e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-lg font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                  ))}
                </div>

                {units.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    No units match &quot;{search}&quot;. Try a different search term.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
