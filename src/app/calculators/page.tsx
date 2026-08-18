'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, Card, CardContent, CardHeader, Button, Input, Badge } from '@/components/ui';

type CalculatorTab = 'percentage' | 'weighted-average' | 'grade' | 'atar';

const TABS: { id: CalculatorTab; label: string; icon: string }[] = [
  { id: 'percentage', label: 'Percentage', icon: '%' },
  { id: 'weighted-average', label: 'Weighted Avg', icon: '\u03A3' },
  { id: 'grade', label: 'Grade', icon: '\u2713' },
  { id: 'atar', label: 'ATAR', icon: 'A' },
];

function parseNum(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

function PercentageCalculator() {
  const [mode, setMode] = useState<'of' | 'isWhat' | 'change'>('of');
  const [x, setX] = useState('');
  const [y, setY] = useState('');
  const [result, setResult] = useState<{ value: string; explanation: string } | null>(null);
  const [error, setError] = useState('');

  const calculate = () => {
    setError('');
    setResult(null);

    const numX = parseNum(x);
    const numY = parseNum(y);

    if (numX === null || numY === null) {
      setError('Please enter valid numbers for both fields.');
      return;
    }

    if (mode === 'change' && numX === 0) {
      setError('The original value cannot be zero when calculating percentage change.');
      return;
    }

    if (mode === 'isWhat' && numY === 0) {
      setError('The total cannot be zero when calculating what percent X is of Y.');
      return;
    }

    switch (mode) {
      case 'of': {
        const val = (numX / 100) * numY;
        setResult({
          value: val.toFixed(2),
          explanation: `${numX}% of ${numY} = (${numX} \u00F7 100) \u00D7 ${numY} = ${val.toFixed(2)}`,
        });
        break;
      }
      case 'isWhat': {
        const val = (numX / numY) * 100;
        setResult({
          value: `${val.toFixed(2)}%`,
          explanation: `${numX} is ${val.toFixed(2)}% of ${numY} (calculated as ${numX} \u00F7 ${numY} \u00D7 100)`,
        });
        break;
      }
      case 'change': {
        const val = ((numY - numX) / Math.abs(numX)) * 100;
        const direction = val >= 0 ? 'increase' : 'decrease';
        setResult({
          value: `${val.toFixed(2)}%`,
          explanation: `Change from ${numX} to ${numY} is a ${Math.abs(val).toFixed(2)}% ${direction} (calculated as (${numY} - ${numX}) \u00F7 |${numX}| \u00D7 100)`,
        });
        break;
      }
    }
  };

  const xLabel = mode === 'change' ? 'Original value (X)' : 'Percentage (X)';
  const yLabel = mode === 'change' ? 'New value (Y)' : 'Total (Y)';

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
        {([
          { key: 'of' as const, label: 'X% of Y' },
          { key: 'isWhat' as const, label: 'X is what % of Y' },
          { key: 'change' as const, label: '% change' },
        ]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => { setMode(opt.key); setResult(null); setError(''); }}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === opt.key
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={xLabel}
          type="number"
          value={x}
          onChange={(e) => { setX(e.target.value); setResult(null); setError(''); }}
          placeholder={mode === 'change' ? 'e.g. 50' : mode === 'of' ? 'e.g. 20' : 'e.g. 30'}
        />
        <Input
          label={yLabel}
          type="number"
          value={y}
          onChange={(e) => { setY(e.target.value); setResult(null); setError(''); }}
          placeholder={mode === 'change' ? 'e.g. 75' : 'e.g. 200'}
        />
      </div>

      <Button onClick={calculate} className="w-full">Calculate</Button>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {result && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-4">
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.value}</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{result.explanation}</p>
        </div>
      )}
    </div>
  );
}

interface WeightedAverageItem {
  id: string;
  name: string;
  score: string;
  weight: string;
}

function WeightedAverageCalculator() {
  const [items, setItems] = useState<WeightedAverageItem[]>([
    { id: crypto.randomUUID(), name: 'Assignment 1', score: '', weight: '' },
    { id: crypto.randomUUID(), name: 'Assignment 2', score: '', weight: '' },
  ]);
  const [result, setResult] = useState<{ value: string; explanation: string } | null>(null);
  const [error, setError] = useState('');

  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), name: `Item ${items.length + 1}`, score: '', weight: '' }]);
    setResult(null);
  };

  const removeItem = (id: string) => {
    if (items.length <= 2) return;
    setItems(items.filter((item) => item.id !== id));
    setResult(null);
  };

  const updateItem = (id: string, field: keyof WeightedAverageItem, value: string) => {
    setItems(items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
    setResult(null);
    setError('');
  };

  const calculate = () => {
    setError('');
    setResult(null);

    const parsed = items.map((item) => ({
      name: item.name,
      score: parseNum(item.score),
      weight: parseNum(item.weight),
    }));

    const hasEmpty = parsed.some((p) => p.score === null || p.weight === null);
    if (hasEmpty) {
      setError('Please fill in all scores and weights.');
      return;
    }

    const hasInvalid = parsed.some((p) => p.score! < 0 || p.score! > 100 || p.weight! <= 0);
    if (hasInvalid) {
      setError('Scores must be between 0 and 100. Weights must be greater than 0.');
      return;
    }

    const totalWeight = parsed.reduce((sum, p) => sum + p.weight!, 0);
    const weightedSum = parsed.reduce((sum, p) => sum + p.score! * p.weight!, 0);
    const avg = weightedSum / totalWeight;

    const breakdown = parsed
      .map((p) => `${p.name}: ${p.score} \u00D7 ${p.weight} = ${(p.score! * p.weight!).toFixed(1)}`)
      .join('\n');

    setResult({
      value: avg.toFixed(2),
      explanation: `(${parsed.map((p) => `${p.score} \u00D7 ${p.weight}`).join(' + ')}) \u00F7 ${totalWeight} = ${avg.toFixed(2)}\n\nBreakdown:\n${breakdown}`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Input
                label={index === 0 ? 'Name' : undefined}
                value={item.name}
                onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                placeholder="Item name"
              />
            </div>
            <div className="w-24 shrink-0">
              <Input
                label={index === 0 ? 'Score' : undefined}
                type="number"
                value={item.score}
                onChange={(e) => updateItem(item.id, 'score', e.target.value)}
                placeholder="0-100"
              />
            </div>
            <div className="w-24 shrink-0">
              <Input
                label={index === 0 ? 'Weight' : undefined}
                type="number"
                value={item.weight}
                onChange={(e) => updateItem(item.id, 'weight', e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
            {items.length > 2 && (
              <button
                onClick={() => removeItem(item.id)}
                className="mb-1 p-2 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                title="Remove item"
              >
                \u2715
              </button>
            )}
          </div>
        ))}
      </div>

      <Button variant="secondary" onClick={addItem} className="w-full">
        + Add Item
      </Button>

      <Button onClick={calculate} className="w-full">
        Calculate Weighted Average
      </Button>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {result && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-4">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.value}%</p>
            <Badge variant="info">Weighted Average</Badge>
          </div>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
            {result.explanation}
          </div>
        </div>
      )}
    </div>
  );
}

function GradeCalculator() {
  const [currentGrade, setCurrentGrade] = useState('');
  const [targetGrade, setTargetGrade] = useState('');
  const [remainingWeight, setRemainingWeight] = useState('');
  const [result, setResult] = useState<{ value: string; achievable: boolean; explanation: string } | null>(null);
  const [error, setError] = useState('');

  const calculate = () => {
    setError('');
    setResult(null);

    const current = parseNum(currentGrade);
    const target = parseNum(targetGrade);
    const weight = parseNum(remainingWeight);

    if (current === null || target === null || weight === null) {
      setError('Please fill in all fields with valid numbers.');
      return;
    }

    if (current < 0 || current > 100) {
      setError('Current grade must be between 0 and 100.');
      return;
    }

    if (target < 0 || target > 100) {
      setError('Target grade must be between 0 and 100.');
      return;
    }

    if (weight <= 0 || weight > 100) {
      setError('Remaining weight must be between 1 and 100.');
      return;
    }

    const completedWeight = 100 - weight;
    const currentContribution = current * (completedWeight / 100);
    const requiredFromRemaining = (target - currentContribution) / (weight / 100);
    const achievable = requiredFromRemaining <= 100;

    const achievedSoFar = currentContribution;
    const targetContrib = target * (weight / 100);

    let explanation = `You have earned ${achievedSoFar.toFixed(2)} points from completed assessments (${current}% of ${completedWeight}%).\n`;
    explanation += `You need ${targetContrib.toFixed(2)} points from the remaining ${weight}% to reach ${target}%.\n`;
    explanation += `That means you need to score ${requiredFromRemaining.toFixed(2)}% on the remaining assessments.`;

    if (!achievable) {
      explanation += `\n\nThis exceeds 100%, so your target is not achievable. The maximum you can reach is ${(currentContribution + 100 * (weight / 100)).toFixed(2)}%.`;
    } else if (requiredFromRemaining < 0) {
      explanation += `\n\nYou have already secured your target grade!`;
    }

    setResult({
      value: requiredFromRemaining < 0 ? '0' : requiredFromRemaining.toFixed(2),
      achievable,
      explanation,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input
          label="Current Grade (%)"
          type="number"
          value={currentGrade}
          onChange={(e) => { setCurrentGrade(e.target.value); setResult(null); setError(''); }}
          placeholder="e.g. 78"
        />
        <Input
          label="Target Grade (%)"
          type="number"
          value={targetGrade}
          onChange={(e) => { setTargetGrade(e.target.value); setResult(null); setError(''); }}
          placeholder="e.g. 85"
        />
        <Input
          label="Remaining Weight (%)"
          type="number"
          value={remainingWeight}
          onChange={(e) => { setRemainingWeight(e.target.value); setResult(null); setError(''); }}
          placeholder="e.g. 40"
        />
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        Remaining weight is how much your unfinished assessments are worth (e.g., if exams are 40%, enter 40).
      </div>

      <Button onClick={calculate} className="w-full">Calculate</Button>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {result && (
        <div className={`rounded-lg p-4 ${result.achievable ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-2xl font-bold ${result.achievable ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {result.value}%
            </p>
            <Badge variant={result.achievable ? 'success' : 'danger'}>
              {result.achievable ? 'Achievable' : 'Not achievable'}
            </Badge>
          </div>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
            {result.explanation}
          </div>
        </div>
      )}
    </div>
  );
}

const ATAR_SUBJECTS = [1, 2, 3, 4, 5, 6];

function estimateATAR(aggregate: number): string {
  if (aggregate >= 210) return '99.95';
  if (aggregate >= 205) return '99.00';
  if (aggregate >= 200) return '97.00';
  if (aggregate >= 195) return '95.00';
  if (aggregate >= 190) return '92.00';
  if (aggregate >= 185) return '89.00';
  if (aggregate >= 180) return '86.00';
  if (aggregate >= 175) return '82.00';
  if (aggregate >= 170) return '78.00';
  if (aggregate >= 165) return '73.00';
  if (aggregate >= 160) return '68.00';
  if (aggregate >= 155) return '63.00';
  if (aggregate >= 150) return '57.00';
  if (aggregate >= 145) return '51.00';
  if (aggregate >= 140) return '45.00';
  if (aggregate >= 135) return '39.00';
  if (aggregate >= 130) return '34.00';
  if (aggregate >= 125) return '29.00';
  if (aggregate >= 120) return '24.00';
  if (aggregate >= 115) return '19.00';
  if (aggregate >= 110) return '14.00';
  if (aggregate >= 100) return '8.00';
  return '< 8.00';
}

function ATARCalculator() {
  const [scores, setScores] = useState<string[]>(Array(6).fill(''));
  const [activeSubjects, setActiveSubjects] = useState(4);
  const [result, setResult] = useState<{ aggregate: number; atar: string; explanation: string } | null>(null);
  const [error, setError] = useState('');

  const updateScore = (index: number, value: string) => {
    const updated = [...scores];
    updated[index] = value;
    setScores(updated);
    setResult(null);
    setError('');
  };

  const calculate = () => {
    setError('');
    setResult(null);

    const parsedScores = scores.slice(0, activeSubjects).map(parseNum);

    if (parsedScores.some((s) => s === null)) {
      setError('Please enter a study score for each active subject.');
      return;
    }

    if (parsedScores.some((s) => s! < 0 || s! > 50)) {
      setError('Study scores must be between 0 and 50.');
      return;
    }

    const numericScores = parsedScores as number[];
    const aggregate = numericScores.reduce((sum, s) => sum + s, 0);
    const atar = estimateATAR(aggregate);

    let explanation = `Your aggregate score is the sum of your top ${activeSubjects} study scores:\n`;
    explanation += numericScores.map((s, i) => `Subject ${i + 1}: ${s}`).join('\n');
    explanation += `\n\nAggregate = ${numericScores.join(' + ')} = ${aggregate}`;

    setResult({ aggregate, atar, explanation });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Number of Subjects
          </label>
          <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
            {[4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setActiveSubjects(n);
                  setResult(null);
                  setError('');
                }}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeSubjects === n
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                {n} Subjects
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ATAR_SUBJECTS.slice(0, activeSubjects).map((num, index) => (
            <Input
              key={index}
              label={`Subject ${num} Score`}
              type="number"
              min="0"
              max="50"
              value={scores[index]}
              onChange={(e) => updateScore(index, e.target.value)}
              placeholder="0-50"
            />
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        Enter your scaled study scores (each out of 50). In Victoria, ATAR is calculated from your best 4-6 VCE subject scores.
      </div>

      <Button onClick={calculate} className="w-full">Calculate ATAR Estimate</Button>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {result && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/30 p-4 space-y-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Estimated ATAR</p>
              <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{result.atar}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Aggregate</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{result.aggregate}</p>
            </div>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
            {result.explanation}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 italic">
            This is a simplified estimate only. Actual ATAR calculations use scaling, cohort data, and may differ.
          </p>
        </div>
      )}
    </div>
  );
}

const CALCULATOR_MAP: Record<CalculatorTab, React.FC> = {
  percentage: PercentageCalculator,
  'weighted-average': WeightedAverageCalculator,
  grade: GradeCalculator,
  atar: ATARCalculator,
};

export default function CalculatorsPage() {
  const [activeTab, setActiveTab] = useState<CalculatorTab>('percentage');
  const router = useRouter();

  const ActiveCalculator = CALCULATOR_MAP[activeTab];

  return (
    <DashboardLayout>
      <PageHeader
        title="Calculators"
        description="Useful calculators for grades, percentages, and more"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-56 shrink-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                <span className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 text-xs font-bold">
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {TABS.find((t) => t.id === activeTab)?.label} Calculator
              </h2>
            </CardHeader>
            <CardContent>
              <ActiveCalculator />
            </CardContent>
          </Card>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/calculators/scientific')}>
              <CardContent className="p-6">
                <div className="text-3xl mb-2">🔬</div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Scientific Calculator</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Trigonometry, logarithms, and scientific functions</p>
              </CardContent>
            </Card>
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/calculators/unit-converter')}>
              <CardContent className="p-6">
                <div className="text-3xl mb-2">🔄</div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Unit Converter</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Convert between units of measurement</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
