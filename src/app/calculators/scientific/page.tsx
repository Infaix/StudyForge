'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, Card, CardContent, Button } from '@/components/ui';

type AngleMode = 'deg' | 'rad';

interface HistoryEntry {
  expression: string;
  result: string;
}

function factorial(n: number): number {
  if (n < 0) return NaN;
  if (n === 0 || n === 1) return 1;
  if (n > 170) return Infinity;
  let result = 1;
  for (let i = 2; i <= Math.floor(n); i++) {
    result *= i;
  }
  return result;
}

function toRadians(value: number, mode: AngleMode): number {
  return mode === 'deg' ? (value * Math.PI) / 180 : value;
}

function fromRadians(value: number, mode: AngleMode): number {
  return mode === 'rad' ? value : (value * 180) / Math.PI;
}

export default function ScientificCalculatorPage() {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [angleMode, setAngleMode] = useState<AngleMode>('deg');
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [openParens, setOpenParens] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [isResultShown, setIsResultShown] = useState(false);

  const addHistory = useCallback((expr: string, result: string) => {
    setHistory((prev) => [{ expression: expr, result }, ...prev].slice(0, 10));
  }, []);

  const handleNumber = useCallback((num: string) => {
    if (isResultShown) {
      setDisplay(num);
      setExpression('');
      setIsResultShown(false);
    } else {
      setDisplay((prev) => (prev === '0' ? num : prev + num));
    }
  }, [isResultShown]);

  const handleDecimal = useCallback(() => {
    if (isResultShown) {
      setDisplay('0.');
      setExpression('');
      setIsResultShown(false);
      return;
    }
    setDisplay((prev) => (prev.includes('.') ? prev : prev + '.'));
  }, [isResultShown]);

  const handleOperator = useCallback((op: string) => {
    const symbol = op === '*' ? '×' : op === '/' ? '÷' : op;
    setExpression((prev) => prev + display + ' ' + symbol + ' ');
    setDisplay('0');
    setIsResultShown(false);
  }, [display]);

  const handleEquals = useCallback(() => {
    const fullExpr = expression + display;
    try {
      let evalExpr = fullExpr
        .replace(/×/g, '*')
        .replace(/÷/g, '/');

      const result = Function('"use strict"; return (' + evalExpr + ')')() as number;
      const resultStr = isNaN(result) ? 'Error' : isFinite(result) ? String(Math.round(result * 1e12) / 1e12) : 'Infinity';

      addHistory(fullExpr, resultStr);
      setDisplay(resultStr);
      setExpression('');
      setLastResult(resultStr);
      setIsResultShown(true);
    } catch {
      setDisplay('Error');
      setIsResultShown(true);
    }
  }, [expression, display, addHistory]);

  const handleClear = useCallback(() => {
    setDisplay('0');
    setExpression('');
    setIsResultShown(false);
    setOpenParens(0);
  }, []);

  const handleClearEntry = useCallback(() => {
    setDisplay('0');
    setIsResultShown(false);
  }, []);

  const handleBackspace = useCallback(() => {
    if (isResultShown) {
      handleClear();
      return;
    }
    setDisplay((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  }, [isResultShown, handleClear]);

  const handleNegate = useCallback(() => {
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : prev === '0' ? prev : '-' + prev));
  }, []);

  const handlePercent = useCallback(() => {
    const val = parseFloat(display);
    if (!isNaN(val)) {
      setDisplay(String(val / 100));
    }
  }, [display]);

  const handleScientific = useCallback((fn: string) => {
    const val = parseFloat(display);
    if (isNaN(val)) return;

    let result: number;
    let label = '';

    switch (fn) {
      case 'sin':
        result = Math.sin(toRadians(val, angleMode));
        label = `sin(${val})`;
        break;
      case 'cos':
        result = Math.cos(toRadians(val, angleMode));
        label = `cos(${val})`;
        break;
      case 'tan':
        result = Math.tan(toRadians(val, angleMode));
        label = `tan(${val})`;
        break;
      case 'ln':
        result = Math.log(val);
        label = `ln(${val})`;
        break;
      case 'log':
        result = Math.log10(val);
        label = `log(${val})`;
        break;
      case 'sqrt':
        result = Math.sqrt(val);
        label = `√(${val})`;
        break;
      case 'square':
        result = val * val;
        label = `(${val})²`;
        break;
      case 'cube':
        result = val * val * val;
        label = `(${val})³`;
        break;
      case 'factorial':
        result = factorial(val);
        label = `${val}!`;
        break;
      case 'pi':
        result = Math.PI;
        label = 'π';
        break;
      case 'e':
        result = Math.E;
        label = 'e';
        break;
      case 'inv':
        result = 1 / val;
        label = `1/(${val})`;
        break;
      default:
        return;
    }

    const resultStr = isNaN(result) ? 'Error' : isFinite(result) ? String(Math.round(result * 1e12) / 1e12) : 'Infinity';
    if (fn === 'pi' || fn === 'e') {
      setDisplay(resultStr);
      setIsResultShown(false);
    } else {
      addHistory(label, resultStr);
      setDisplay(resultStr);
      setIsResultShown(true);
    }
  }, [display, angleMode, addHistory]);

  const handleOpenParen = useCallback(() => {
    if (isResultShown) {
      setExpression('(');
      setDisplay('0');
      setIsResultShown(false);
    } else {
      setExpression((prev) => prev + '(');
    }
    setOpenParens((prev) => prev + 1);
  }, [isResultShown]);

  const handleCloseParen = useCallback(() => {
    if (openParens > 0) {
      setExpression((prev) => prev + display + ')');
      setDisplay('0');
      setOpenParens((prev) => prev - 1);
    }
  }, [openParens, display]);

  const handleMemory = useCallback((op: string) => {
    const val = parseFloat(display);
    switch (op) {
      case 'M+':
        setMemory((prev) => prev + (isNaN(val) ? 0 : val));
        break;
      case 'M-':
        setMemory((prev) => prev - (isNaN(val) ? 0 : val));
        break;
      case 'MR':
        setDisplay(String(memory));
        setIsResultShown(true);
        break;
      case 'MC':
        setMemory(0);
        break;
    }
  }, [display, memory]);

  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') handleNumber(e.key);
    else if (e.key === '.') handleDecimal();
    else if (e.key === '+') handleOperator('+');
    else if (e.key === '-') handleOperator('-');
    else if (e.key === '*') handleOperator('*');
    else if (e.key === '/') { e.preventDefault(); handleOperator('/'); }
    else if (e.key === 'Enter' || e.key === '=') handleEquals();
    else if (e.key === 'Escape') handleClear();
    else if (e.key === 'Backspace') handleBackspace();
    else if (e.key === '(') handleOpenParen();
    else if (e.key === ')') handleCloseParen();
    else if (e.key === '%') handlePercent();
  }, [handleNumber, handleDecimal, handleOperator, handleEquals, handleClear, handleBackspace, handleOpenParen, handleCloseParen, handlePercent]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [handleKeyboard]);

  const CalcButton: React.FC<{
    onClick: () => void;
    label: string;
    className?: string;
    span?: number;
  }> = ({ onClick, label, className = '', span = 1 }) => (
    <button
      onClick={onClick}
      className={`h-14 rounded-lg font-medium text-lg transition-all active:scale-95 ${className}`}
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      {label}
    </button>
  );

  return (
    <DashboardLayout>
      <PageHeader
        title="Scientific Calculator"
        description="Full-featured calculator with scientific functions"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button
                      variant={angleMode === 'deg' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setAngleMode('deg')}
                    >
                      DEG
                    </Button>
                    <Button
                      variant={angleMode === 'rad' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => setAngleMode('rad')}
                    >
                      RAD
                    </Button>
                  </div>
                  {memory !== 0 && (
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                      M: {memory}
                    </span>
                  )}
                </div>

                <div className="bg-gray-100 dark:bg-gray-900 rounded-xl p-4 min-h-[80px] flex flex-col items-end justify-end">
                  {expression && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-1 break-all text-right max-w-full">
                      {expression}
                    </div>
                  )}
                  <div className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white break-all text-right max-w-full overflow-hidden">
                    {display}
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <CalcButton onClick={() => handleMemory('MC')} label="MC" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleMemory('MR')} label="MR" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleMemory('M+')} label="M+" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleMemory('M-')} label="M-" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={handleClear} label="AC" className="text-xs bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/60" />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <CalcButton onClick={() => handleScientific('sin')} label="sin" className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60" />
                  <CalcButton onClick={() => handleScientific('cos')} label="cos" className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60" />
                  <CalcButton onClick={() => handleScientific('tan')} label="tan" className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60" />
                  <CalcButton onClick={handleOpenParen} label="(" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={handleCloseParen} label=")" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <CalcButton onClick={() => handleScientific('ln')} label="ln" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                  <CalcButton onClick={() => handleScientific('log')} label="log" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                  <CalcButton onClick={() => handleScientific('sqrt')} label="√" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                  <CalcButton onClick={() => handleScientific('square')} label="x²" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                  <CalcButton onClick={() => handleScientific('cube')} label="x³" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <CalcButton onClick={() => handleScientific('factorial')} label="x!" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                  <CalcButton onClick={() => handleScientific('pi')} label="π" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                  <CalcButton onClick={() => handleScientific('e')} label="e" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                  <CalcButton onClick={() => handleScientific('inv')} label="1/x" className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/60" />
                  <CalcButton onClick={handlePercent} label="%" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <CalcButton onClick={handleClearEntry} label="CE" className="text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/60" />
                  <CalcButton onClick={handleNegate} label="+/-" className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleNumber('7')} label="7" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleNumber('8')} label="8" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleNumber('9')} label="9" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <CalcButton onClick={() => handleOperator('/')} label="÷" className="text-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60" />
                  <CalcButton onClick={() => handleOperator('*')} label="×" className="text-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60" />
                  <CalcButton onClick={() => handleNumber('4')} label="4" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleNumber('5')} label="5" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleNumber('6')} label="6" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <CalcButton onClick={() => handleOperator('-')} label="−" className="text-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60" />
                  <CalcButton onClick={() => handleOperator('+')} label="+" className="text-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60" />
                  <CalcButton onClick={() => handleNumber('1')} label="1" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleNumber('2')} label="2" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleNumber('3')} label="3" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <CalcButton onClick={handleBackspace} label="⌫" className="text-xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={handleDecimal} label="." className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" />
                  <CalcButton onClick={() => handleNumber('0')} label="0" className="bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600" span={2} />
                  <CalcButton onClick={handleEquals} label="=" className="bg-blue-600 text-white hover:bg-blue-700 text-xl" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Memory</h3>
              <div className="flex gap-2 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => handleMemory('MC')} disabled={memory === 0}>
                  MC
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleMemory('MR')} disabled={memory === 0}>
                  MR
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleMemory('M+')}>
                  M+
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleMemory('M-')}>
                  M-
                </Button>
              </div>
              {memory !== 0 && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Stored: <span className="font-mono font-medium text-gray-900 dark:text-white">{memory}</span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">History</h3>
                {history.length > 0 && (
                  <button
                    onClick={() => setHistory([])}
                    className="text-xs text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No calculations yet</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {history.map((entry, i) => (
                    <div
                      key={i}
                      className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => { setDisplay(entry.result); setIsResultShown(true); }}
                    >
                      <div className="text-gray-500 dark:text-gray-400 truncate">{entry.expression}</div>
                      <div className="font-mono font-semibold text-gray-900 dark:text-white">= {entry.result}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Keyboard Shortcuts</h3>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">0-9</kbd> Numbers</p>
                <p><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">+ - * /</kbd> Operators</p>
                <p><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Enter</kbd> Equals</p>
                <p><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Escape</kbd> Clear</p>
                <p><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">Backspace</kbd> Delete</p>
                <p><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">( )</kbd> Parentheses</p>
                <p><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-gray-700 dark:text-gray-300">.</kbd> Decimal</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
