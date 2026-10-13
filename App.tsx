import { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ChevronDown, ChevronUp, Delete, FunctionSquare, History, Trash2, Sparkles, ArrowLeft, RotateCcw, X, Copy, Check, Calculator, ChartSpline, Move3D, Ruler, Sigma, Plus, Minus, ZoomIn, ZoomOut, Crosshair, LockKeyhole } from 'lucide-react';
import { api } from '@appdeploy/client';
import { Box } from 'lucide-react';
import nerdamer from 'nerdamer/all';

type Category = { name: string; items: string[] };
type Token =
  | { type: 'number'; value: string }
  | { type: 'constant'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'percent'; value: '%' }
  | { type: 'sqrt'; value: '√' }
  | { type: 'square'; value: '²' }
  | { type: 'lparen'; value: '(' }
  | { type: 'rparen'; value: ')' };

type Value = { value: number; text: string; isPercent?: boolean };
type CalculationOperation = {
  text: string;
  kind: 'percentage' | 'sqrt' | 'square' | 'division' | 'multiplication' | 'addition' | 'subtraction' | 'calculation';
  depth: number;
  precedence: number;
  order: number;
};
type EvalResult = { value: number; operations: CalculationOperation[] };
type HistoryEntry = { id: string; expression: string; result: string; timestamp: number; steps: string[] };
type TeachingStep = { heading: string; lines: string[] };

type AiStatus = 'solved' | 'needs_clarification' | 'incomplete' | 'unable_to_solve';

type AiStep = {
  type: 'problem_setup' | 'problem_decomposition' | 'method_selection' | 'interpretation' | 'case_analysis' | 'assumption' | 'formula' | 'definition' | 'substitution' | 'transformation' | 'expansion' | 'factorization' | 'simplification' | 'calculation' | 'conversion' | 'differentiation' | 'integration' | 'evaluation' | 'matrix_operation' | 'statistical_calculation' | 'numerical_iteration' | 'comparison' | 'conclusion' | 'final_calculation';
  label: string;
  expression: string;
  explanation: string;
};

type AiMathResult = {
  status: AiStatus;
  problem: string;
  domain: string;
  subdomain: string;
  difficulty: string;
  method: string;
  answerType: string;
  interpretation: string;
  steps: AiStep[];
  finalCalculation: string;
  answer: string;
  verification: string;
  verificationStatus?: 'passed' | 'failed' | 'partial' | 'not_checked';
  teachingNote: string;
  alternativeMethod: string;
};

const categories: Category[] = [
  { name: 'Basic Functions', items: ['(', ')', 'π', 'e', '√', 'x²', '1/x', '%', '±'] },
  { name: 'Symbolic Mathematics', items: [] },
  { name: 'Professional Mathematical Center', items: [] }
];
const HISTORY_KEY = 'netcalc-calculation-history';
const MAX_HISTORY_ITEMS = 200;
const AI_PLACEHOLDER = 'Enter a mathematics problem...';
type VisualMode = 'graph' | 'vectors' | 'geometry' | 'calculus' | 'surface' | 'solids';
type LocalAlgebraOperation = 'simplify' | 'expand' | 'factor' | 'solve';

async function runLocalAlgebra(raw: string, operation: LocalAlgebraOperation): Promise<string> {
  const expression = raw.trim();
  if (!expression) throw new Error('Enter an algebraic expression.');
  if (expression.length > 240) throw new Error('Keep expressions under 240 characters.');
  if (!/^[0-9xX+\-*/^().=\s]+$/.test(expression)) {
    throw new Error('Use numbers, the variable x, parentheses, and standard operators only.');
  }
  if ((expression.match(/=/g) || []).length > 1) throw new Error('Enter one equation at a time.');
  let depth = 0;
  for (const character of expression) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth < 0) throw new Error('Check the parentheses in your expression.');
  }
  if (depth !== 0) throw new Error('Check the parentheses in your expression.');
  if (/[+*/^=]\s*[) ]*$/.test(expression) || /(?:^|[=(])\s*[*/^=]/.test(expression)) {
    throw new Error('The expression appears incomplete. Check the operators and try again.');
  }
  if (operation === 'solve' && /[xX]/.test(expression) === false) {
    throw new Error('Enter an equation or expression containing x to solve for x.');
  }
  if (operation === 'solve' && expression.includes('=') && expression.split('=').some(side => !side.trim())) {
    throw new Error('Enter a complete equation on both sides of the equals sign.');
  }

  try {
    let output = '';
    if (operation === 'simplify') {
      // For polynomial expressions, prefer the expanded canonical form over a factored-but-equivalent form.
      // Keep rational expressions on the existing simplification path so denominator restrictions are preserved.
      if (!expression.includes('/') && !expression.includes('=')) {
        output = nerdamer(expression).expand().toString();
      } else {
        output = nerdamer('simplify(' + expression + ')').toString();
      }
      output = simplifySupportedRational(expression, output);
      output = normalizePolynomialDisplay(output);
    } else if (operation === 'expand') {
      output = nerdamer(expression).expand().toString();
    } else if (operation === 'factor') {
      output = nerdamer('factor(' + expression + ')').toString();
      const compactFactorInput = expression.replace(/\s+/g, '').replace(/[×]/g, '*').replace(/[−]/g, '-').replace(/[()]/g, '');
      const repeatedSquareAndLinear =
        compactFactorInput.match(/^x\^2\+([+-]?\d+)\*?x\+x\^2$/i) ||
        compactFactorInput.match(/^x\^2\+x\^2\+([+-]?\d+)\*?x$/i) ||
        compactFactorInput.match(/^([+-]?\d+)\*?x\+x\^2\+x\^2$/i);
      if (repeatedSquareAndLinear) {
        const coefficient = Number(repeatedSquareAndLinear[1]);
        const constant = Math.abs(coefficient) / 2;
        output = '2*x*(x' + (coefficient < 0 ? ' - ' : ' + ') + constant + ')';
      }
    } else {
      const equation = expression.includes('=') ? expression : expression + '=0';
      const solved: unknown = nerdamer.solveEquations(equation, 'x');
      const formatSolution = (item: unknown): string => {
        if (Array.isArray(item)) {
          if (item.length >= 2 && String(item[0]).toLowerCase() === 'x') {
            return 'x = ' + String(item[1]);
          }
          return item.map(formatSolution).filter(Boolean).join('\n');
        }
        const value = String(item ?? '').trim();
        if (!value || value === '[object Object]') return '';
        return /^x\s*=/.test(value) ? value : 'x = ' + value;
      };
      output = formatSolution(solved);
    }

    output = output.trim();
    if (!output || output === '[]' || output === 'undefined' || output === 'NaN') {
      throw new Error('No usable result was returned for this expression.');
    }
    return output;
  } catch (error) {
    if (error instanceof Error && /parentheses|incomplete|one equation|containing x|complete equation|usable result|numbers, the variable/.test(error.message)) {
      throw error;
    }
    throw new Error('The local engine could not process this expression. Check the syntax or try a simpler polynomial.');
  }
}

function checkLocalResult(input: string, result: string, operation: LocalAlgebraOperation): { status: 'passed' | 'partial' | 'failed'; message: string } {
  const normalizedInput = input.trim().replace(/[×]/g, '*').replace(/[−]/g, '-');
  if (operation === 'solve') {
    const lines = result.split(/\r?\n|\s*•\s*/).map(line => line.trim()).filter(Boolean);
    const candidates = lines.map(line => {
      const match = line.match(/^x\s*=\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[-+]?\d+\s*\/\s*\d+)$/i);
      if (!match) return NaN;
      const value = match[1].replace(/\s+/g, '');
      if (value.includes('/')) {
        const [numerator, denominator] = value.split('/').map(Number);
        return denominator === 0 ? NaN : numerator / denominator;
      }
      return Number(value);
    });
    if (!candidates.length || candidates.some(value => !Number.isFinite(value))) {
      return { status: 'partial', message: 'The solver returned candidates that this independent checker cannot safely parse. Substitution and solution completeness remain unverified.' };
    }
    const sides = (normalizedInput.includes('=') ? normalizedInput : normalizedInput + '=0').split('=');
    const checked = candidates.map(root => {
      const left = evaluateGraphExpression(sides[0], root);
      const right = evaluateGraphExpression(sides[1], root);
      return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-7 * Math.max(1, Math.abs(left), Math.abs(right));
    });
    if (checked.every(Boolean)) {
      return { status: 'passed', message: 'Independent numeric substitution passed for ' + candidates.length + ' candidate solution(s). This does not prove that all solutions were found.' };
    }
    return { status: 'failed', message: 'At least one numeric candidate failed independent substitution. Do not rely on this solution; check the equation and solver output.' };
  }
  const equationResidual = (source: string, x: number): number => {
    const parts = source.split('=');
    if (parts.length === 1) return evaluateGraphExpression(source, x);
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return NaN;
    return evaluateGraphExpression(parts[0], x) - evaluateGraphExpression(parts[1], x);
  };
  const inputIsEquation = normalizedInput.includes('=');
  const resultIsEquation = result.includes('=');
  if (inputIsEquation !== resultIsEquation) {
    return { status: 'partial', message: 'The local result changed equation form, so this checker cannot safely compare both sides. The result is shown, but equivalence remains unverified.' };
  }
  const points = [-3.25, -1.5, 0.25, 1.75, 3.5];
  let checked = 0;
  try {
    for (const x of points) {
      const originalValue = equationResidual(normalizedInput, x);
      const resultValue = equationResidual(result, x);
      if (!Number.isFinite(originalValue) || !Number.isFinite(resultValue)) continue;
      checked += 1;
      if (Math.abs(originalValue - resultValue) > 1e-7 * Math.max(1, Math.abs(originalValue), Math.abs(resultValue))) {
        return { status: 'failed', message: 'The independent numerical spot-check found a mismatch at x = ' + x + '. Do not rely on this result until the expression is reviewed.' };
      }
    }
  } catch {
    return { status: 'partial', message: 'The result was returned, but this checker cannot safely evaluate the expression. Equivalence remains unverified.' };
  }
  if (checked >= 3) {
    return { status: 'passed', message: 'Independent numerical spot-check passed at ' + checked + ' sample points. This is not a formal symbolic-equivalence proof.' };
  }
  return { status: 'partial', message: 'The result was returned, but not enough safe numeric sample points were available. Symbolic equivalence remains unverified.' };
}

function classifyLocalRequest(problem: string): { operation: LocalAlgebraOperation; expression: string } | null {
  const raw = problem.trim();
  const match = raw.match(/^(simplify|expand|factor|solve)(?:\s+for\s+x\s*[:,-]?\s*|\s*[:：-]\s*|\s+)([\s\S]+)$/i);
  if (!match) return null;
  const operation = match[1].toLowerCase() as LocalAlgebraOperation;
  const expression = match[2].trim()
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/[⁴]/g, '^4')
    .replace(/[×]/g, '*')
    .replace(/[−]/g, '-');
  if (!expression || expression.length > 240) return null;
  if (/[^\dxX+\-*\/^().=\s]/.test(expression)) return null;
  if ((expression.match(/=/g) || []).length > 1) return null;
  let depth = 0;
  for (const character of expression) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (depth < 0) return null;
  }
  if (depth !== 0 || /[+*\/^=]\s*$/.test(expression) || /(?:^|[=(])\s*[*/^=]/.test(expression)) return null;
  if (operation === 'solve' && !/[xX]/.test(expression)) return null;
  return { operation, expression };
}

function simplifySupportedRational(input: string, fallback: string): string {
  const compact = input.replace(/\s+/g, '').replace(/[×]/g, '*').replace(/[−]/g, '-').replace(/\*/g, '');
  const match = compact.match(/^\(?x\^2-(\d+(?:\.\d+)?)\)?\/\(?x\^2\+([+-]?\d+(?:\.\d+)?)x\+([+-]?\d+(?:\.\d+)?)\)?$/i);
  if (!match) return fallback;
  const numeratorConstant = Number(match[1]);
  const middleCoefficient = Number(match[2]);
  const denominatorConstant = Number(match[3]);
  if (!(numeratorConstant > 0 && denominatorConstant > 0)) return fallback;
  const root = Math.sqrt(numeratorConstant);
  const denominatorRoot = Math.sqrt(denominatorConstant);
  if (Math.abs(root - denominatorRoot) > 1e-10 || Math.abs(middleCoefficient - 2 * root) > 1e-10) return fallback;
  const value = String(root);
  return '(x-' + value + ')/(x+' + value + ')';
}

function buildLocalSolutionSteps(input: string, result: string, operation: LocalAlgebraOperation) {
  const displayResult = operation === 'simplify' || operation === 'expand' ? normalizePolynomialDisplay(result) : result;
  const base = [{ title: 'Given', expression: input.trim(), explanation: 'Original expression supplied.' }, { title: 'Local result', expression: displayResult, explanation: 'Result returned by the local symbolic engine.' }];
  const compact = input.replace(/\s+/g, '').replace(/[×]/g, '*').replace(/[−]/g, '-');
  if (operation === 'simplify' && !compact.includes('/') && !compact.includes('=') && !/[()]/.test(compact)) {
    const rawTerms = compact.match(/[+-]?[^+-]+/g) || [];
    const groups = new Map<number, { terms: string[]; coefficient: number }>();
    let validPolynomial = rawTerms.length > 1;
    for (const rawTerm of rawTerms) {
      const term = rawTerm.replace(/\*/g, '');
      const variableMatch = term.match(/^([+-]?)(\d*(?:\.\d+)?)x(?:\^(\d+))?$/i);
      const constantMatch = term.match(/^([+-]?)(\d+(?:\.\d+)?|\.\d+)$/);
      let power = 0;
      let coefficient = 0;
      if (variableMatch) {
        power = variableMatch[3] ? Number(variableMatch[3]) : 1;
        const magnitude = variableMatch[2] ? Number(variableMatch[2]) : 1;
        coefficient = (variableMatch[1] === '-' ? -1 : 1) * magnitude;
      } else if (constantMatch) {
        coefficient = (constantMatch[1] === '-' ? -1 : 1) * Number(constantMatch[2]);
      } else {
        validPolynomial = false;
        break;
      }
      const group = groups.get(power) || { terms: [], coefficient: 0 };
      group.terms.push(rawTerm);
      group.coefficient += coefficient;
      groups.set(power, group);
    }
    if (validPolynomial) {
      const ordered = [...groups.entries()].sort((a, b) => b[0] - a[0]);
      const groupedExpression = ordered.map(([, group]) => '(' + group.terms.map((term, index) => { const clean = term.replace(/\*/g, '').replace(/^\+/, ''); if (index === 0) return clean; return clean.startsWith('-') ? ' - ' + clean.slice(1) : ' + ' + clean; }).join('') + ')').join(' + ');
      const combinedExpression = ordered.map(([power, group]) => {
        const value = group.coefficient;
        if (value === 0) return '';
        const magnitude = Math.abs(value);
        const variable = power === 0 ? '' : 'x' + (power === 1 ? '' : '^' + power);
        return (value < 0 ? ' - ' : ' + ') + (variable && magnitude === 1 ? '' : String(magnitude)) + variable;
      }).join('').replace(/^ \+ /, '').trim();
      if (groupedExpression && combinedExpression) {
        return { detailed: true, steps: [
          { title: 'Given', expression: input.trim(), explanation: 'Original polynomial supplied.' },
          { title: 'Group like terms', expression: groupedExpression, explanation: 'Terms with the same power of x belong together.' },
          { title: 'Combine coefficients', expression: combinedExpression, explanation: 'Add the signed coefficients in each group.' },
          { title: 'Final answer', expression: displayResult, explanation: 'Expanded simplified polynomial returned by the local symbolic engine.' }
        ] };
      }
    }
  }
  if (operation === 'simplify') {
    const rational = compact.replace(/\*/g, '').match(/^\(?x\^2-(\d+(?:\.\d+)?)\)?\/\(?x\^2\+([+-]?\d+(?:\.\d+)?)x\+([+-]?\d+(?:\.\d+)?)\)?$/i);
    if (rational) {
      const square = Number(rational[1]);
      const middle = Number(rational[2]);
      const constant = Number(rational[3]);
      const root = Math.sqrt(square);
      if (square > 0 && Math.abs(root * root - constant) < 1e-10 && Math.abs(middle - 2 * root) < 1e-10) {
        const a = String(root);
        return { detailed: true, steps: [
          { title: 'Given', expression: input.trim(), explanation: 'Factor the numerator and denominator separately.' },
          { title: 'Difference of squares', expression: '(x-' + a + ')*(x+' + a + ')/(x+' + a + ')^2', explanation: 'Use x² − a² = (x − a)(x + a); the denominator is a perfect square.' },
          { title: 'Cancel the common factor', expression: '(x-' + a + ')/(x+' + a + ')', explanation: 'Cancel the common factor x + ' + a + '. The original denominator is zero at x = −' + a + '.' },
          { title: 'Result and restriction', expression: result + ', x ≠ -' + a, explanation: 'The simplified quotient is equivalent wherever the original expression is defined.' }
        ] };
      }
    }
  }
  if (operation === 'simplify') {
    const normalizedLikeTerms = compact.replace(/[()]/g, '');
    const repeatedSquareAndLinear =
      normalizedLikeTerms.match(/^x\^2\+([+-]?\d+)\*?x\+x\^2$/i) ||
      normalizedLikeTerms.match(/^x\^2\+x\^2\+([+-]?\d+)\*?x$/i) ||
      normalizedLikeTerms.match(/^([+-]?\d+)\*?x\+x\^2\+x\^2$/i);
    if (repeatedSquareAndLinear) {
      const coefficient = Number(repeatedSquareAndLinear[1]);
      const linearTerm = coefficient < 0 ? ' - ' + Math.abs(coefficient) + '*x' : ' + ' + coefficient + '*x';
      return {
        detailed: true,
        steps: [
          { title: 'Given', expression: input.trim(), explanation: 'Identify the two matching squared terms.' },
          { title: 'Group like terms', expression: 'x^2 + x^2' + linearTerm, explanation: 'Place the two x² terms together; keep the linear x term separate.' },
          { title: 'Combine squared terms', expression: '2*x^2' + linearTerm, explanation: 'Add their coefficients: 1 + 1 = 2.' },
          { title: 'Result', expression: result, explanation: 'Equivalent simplified expression returned by the local engine.' }
        ]
      };
    }
    const match = compact.match(/^([+-]?\d+)\*?x([+-])(\d+)\*?x$/);
    if (match) {
      const a = Number(match[1]); const b = Number(match[3]) * (match[2] === '-' ? -1 : 1);
      return { detailed: true, steps: [{ title: 'Given', expression: input.trim(), explanation: 'Identify the like terms.' }, { title: 'Combine coefficients', expression: '(' + a + (b < 0 ? ' - ' + Math.abs(b) : ' + ' + b) + ')*x', explanation: 'Add the coefficients of x.' }, { title: 'Simplify', expression: (a + b) + '*x', explanation: 'Combine the numerical coefficients.' },          { title: 'Result', expression: displayResult, explanation: 'Simplified result from the local engine.' }] };
    }
  }
  if (operation === 'solve') {
    const equationSides = compact.split('=');
    const rightIsZero = equationSides.length === 2 && /^\+?0+(?:\.0+)?$/.test(equationSides[1]);
    const polynomialSide = equationSides.length === 2 ? (rightIsZero ? equationSides[0] : equationSides[0] + '-(' + equationSides[1] + ')') : compact;
    const normalized = polynomialSide.replace(/\s+/g, '');
    const quadratic = normalized.match(/^([+-]?\d*)\*?x\^2([+-]\d*)\*?x([+-]\d+)$/i);
    if (quadratic) {
      const parseCoefficient = (value: string): number => value === '' || value === '+' ? 1 : value === '-' ? -1 : Number(value);
      const a = parseCoefficient(quadratic[1]);
      const b = parseCoefficient(quadratic[2]);
      const c = Number(quadratic[3]);
      const discriminant = b * b - 4 * a * c;
      if (a !== 0 && discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        const denominator = 2 * a;
        const roots = [(-b - root) / denominator, (-b + root) / denominator].sort((left, right) => left - right);
        const formatNumber = (value: number): string => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
        const rootsText = [...new Set(roots)].map(value => 'x = ' + formatNumber(value)).join(' • ');
        return { detailed: true, steps: [
          { title: 'Given', expression: input.trim(), explanation: 'Write the equation in the standard form ax² + bx + c = 0.' },
          { title: 'Identify coefficients', expression: 'a = ' + a + ', b = ' + b + ', c = ' + c, explanation: 'Read the coefficients of x², x, and the constant term.' },
          { title: 'Use the discriminant', expression: 'D = b² - 4ac = (' + b + ')² - 4(' + a + ')(' + c + ') = ' + discriminant, explanation: 'The discriminant determines the number and type of roots.' },
          { title: 'Apply the quadratic formula', expression: 'x = (-b ± √D)/(2a) = (' + (-b) + ' ± √' + discriminant + ')/' + denominator, explanation: 'Substitute a, b, and D into the quadratic formula.' },
          { title: 'Evaluate both roots', expression: rootsText, explanation: 'Evaluate the plus and minus cases separately.' },
          { title: 'Final answer', expression: rootsText, explanation: 'Both candidate roots are shown; the independent substitution check reports whether they pass.' }
        ] };
      }
    }
  }
  if (operation === 'factor') {
    const factorGroups = result.match(/\([^()]+\)/g) || [];
    if (factorGroups.length >= 2 && /x/.test(result)) {
      return { detailed: true, steps: [
        { title: 'Given', expression: input.trim(), explanation: 'Factor the polynomial into simpler multiplicative expressions.' },
        { title: 'Identify factors', expression: factorGroups.join(' × '), explanation: 'The local symbolic engine found these candidate factors.' },
        { title: 'Check by expansion', expression: input.trim() + ' = ' + input.trim(), explanation: 'Expand the factors and compare with the original polynomial; use the verification status below as an independent numerical check, not a formal proof.' },
        { title: 'Final factorization', expression: result, explanation: 'Equivalent factorized form returned by the local symbolic engine.' }
      ] };
    }
    const normalizedLikeTerms = compact.replace(/[()]/g, '');
    const repeatedSquareAndLinear =
      normalizedLikeTerms.match(/^x\^2\+([+-]?\d+)\*?x\+x\^2$/i) ||
      normalizedLikeTerms.match(/^x\^2\+x\^2\+([+-]?\d+)\*?x$/i) ||
      normalizedLikeTerms.match(/^([+-]?\d+)\*?x\+x\^2\+x\^2$/i);
    if (repeatedSquareAndLinear) {
      const coefficient = Number(repeatedSquareAndLinear[1]);
      const sign = coefficient < 0 ? ' - ' : ' + ';
      const magnitude = Math.abs(coefficient);
      const combined = '2*x^2' + sign + magnitude + '*x';
      const factored = '2*x*(x' + (coefficient < 0 ? ' - ' : ' + ') + magnitude / 2 + ')';
      return { detailed: true, steps: [
        { title: 'Given', expression: input.trim(), explanation: 'Find the common factor after combining like terms.' },
        { title: 'Combine like terms', expression: combined, explanation: 'Combine the two x² terms: x² + x² = 2x².' },
        { title: 'Take out the common factor', expression: factored, explanation: 'Factor out 2x from each term.' },
        { title: 'Result', expression: result, explanation: 'Equivalent factorized form returned by the local engine.' }
      ] };
    }
  }
  if (operation === 'expand') {
    const match = compact.match(/^\(x([+-]\d+)\)\*\(x([+-]\d+)\)$/);
    if (match) {
      const a = Number(match[1]); const b = Number(match[2]); const sign = (n: number) => n < 0 ? ' - ' + Math.abs(n) : ' + ' + n;
      return { detailed: true, steps: [{ title: 'Given', expression: input.trim(), explanation: 'Multiply the two binomials.' }, { title: 'Distribute', expression: 'x*x' + sign(b) + '*x' + sign(a) + '*x' + sign(a*b), explanation: 'Multiply every term in the first bracket by every term in the second.' }, { title: 'Combine like terms', expression: 'x^2' + sign(a+b) + '*x' + sign(a*b), explanation: 'Combine the x terms and constant product.' }, { title: 'Result', expression: result, explanation: 'Expanded result from the local engine.' }] };
    }
  }
  return { detailed: false, steps: base };
}

function normalizePolynomialDisplay(expression: string): string {
  const compact = expression.replace(/\s+/g, '').replace(/[×]/g, '*').replace(/[−]/g, '-');
  // Canonicalize simple univariate polynomials into descending powers for readable, consistent answers.
  if (!compact || compact.includes('/') || compact.includes('=') || /[()]/.test(compact)) return expression;
  const terms = compact.match(/[+-]?[^+-]+/g) || [];
  const coefficients = new Map<number, number>();
  for (const rawTerm of terms) {
    const term = rawTerm.replace(/\*/g, '');
    const variable = term.match(/^([+-]?)(\d*(?:\.\d+)?)x(?:\^(\d+))?$/i);
    const constant = term.match(/^([+-]?)(\d+(?:\.\d+)?|\.\d+)$/);
    let power = 0;
    let coefficient = 0;
    if (variable) {
      power = variable[3] ? Number(variable[3]) : 1;
      coefficient = (variable[1] === '-' ? -1 : 1) * (variable[2] ? Number(variable[2]) : 1);
    } else if (constant) {
      coefficient = (constant[1] === '-' ? -1 : 1) * Number(constant[2]);
    } else {
      return expression;
    }
    coefficients.set(power, (coefficients.get(power) || 0) + coefficient);
  }
  const ordered = [...coefficients.entries()].sort((a, b) => b[0] - a[0]);
  const output: string[] = [];
  for (const [power, coefficient] of ordered) {
    if (Math.abs(coefficient) < 1e-12) continue;
    const magnitude = Math.abs(coefficient);
    const variable = power === 0 ? '' : 'x' + (power === 1 ? '' : '^' + power);
    const body = (variable && magnitude === 1 ? '' : String(magnitude)) + variable;
    if (output.length === 0) output.push((coefficient < 0 ? '-' : '') + body);
    else output.push((coefficient < 0 ? ' - ' : ' + ') + body);
  }
  return output.join('') || '0';
}

function MathExpression({ expression, className }: { expression: string; className?: string }) {
  // Present linear factors in conventional algebra order without changing the underlying symbolic result.
  const factorOrderedExpression = expression.replace(/\(\s*(-?\d+(?:\.\d+)?)\s*\+\s*x\s*\)/gi, (_match, rawConstant: string) => {
    const constant = Number(rawConstant);
    if (constant === 0) return '(x)';
    return '(x ' + (constant < 0 ? '- ' + Math.abs(constant) : '+ ' + constant) + ')';
  });
  const displayExpression = normalizePolynomialDisplay(factorOrderedExpression);
  const html = displayExpression
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/([xX])\^(\d+)\b/g, '$1<sup>$2</sup>')
    .replace(/(^|[^\w])(\d+)\^(\d+)\b/g, '$1<span class="math-power-base">$2</span><sup>$3</sup>')
    // Use standard compact algebra notation for variable products and factors.
    .replace(/(\d+)\s*\*\s*([xX])\b/g, '$1$2')
    .replace(/([xX])\s*\*\s*\(/g, '$1(')
    .replace(/\*/g, ' × ')
    .replace(/\s*=\s*/g, ' = ')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s*-\s*/g, ' − ')
    .replace(/\s+/g, ' ')
    .trim();
  return <span
    className={className || 'local-math-expression'}
    role='math'
    aria-label={expression}
    dangerouslySetInnerHTML={{ __html: html }}
  />;
}

function LocalAlgebraWorkspace({ onSaveHistory }: { onSaveHistory: (operation: LocalAlgebraOperation, expression: string, result: string, steps: { title: string; expression: string; explanation: string }[], verification: string | null) => boolean }) {
  const [operation, setOperation] = useState<LocalAlgebraOperation>('simplify');
  const [expression, setExpression] = useState('x^2 + 2*x + x^2');
  const [result, setResult] = useState('');
  const [steps, setSteps] = useState<{ title: string; expression: string; explanation: string }[]>([]);
  const [hasDetailedSteps, setHasDetailedSteps] = useState(false);
  const [verification, setVerification] = useState<{ status: 'partial'; message: string } | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [historySaved, setHistorySaved] = useState(false);
  const [historySaveError, setHistorySaveError] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);
  const [algebraExpanded, setAlgebraExpanded] = useState(false);
  const run = async () => {
    if (running) return;
    setRunning(true);
    setError('');
    setResult('');
    setSteps([]);
    setVerification(null);
    setHistorySaved(false);
    setHistorySaveError(false);
    try {
      const value = await runLocalAlgebra(expression, operation);
      setResult(value);
      const breakdown = buildLocalSolutionSteps(expression, value, operation);
      setSteps(breakdown.steps);
      setHasDetailedSteps(breakdown.detailed);
      setVerification(checkLocalResult(expression, value, operation));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Local algebra could not process this expression.');
    } finally {
      setRunning(false);
    }
  };
  return <div className='local-algebra-workspace local-algebra-cards'>
    <section className={'local-algebra-card neumorphic' + (algebraExpanded ? ' is-expanded' : '')}>
      <button type='button' className='local-algebra-card-toggle' aria-expanded={algebraExpanded} onClick={() => setAlgebraExpanded(open => !open)}>
        <span className='local-algebra-card-icon'><Sigma size={20}/></span>
        <span className='local-algebra-card-title'><strong>Symbolic Mathematics</strong><small>Simplify · Expand · Factor · Solve</small></span>
        <span className='local-algebra-card-action'>{algebraExpanded ? 'Collapse' : 'Open'} {algebraExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}</span>
      </button>
      {algebraExpanded && <div className='local-algebra-card-content'>
    <div className='ai-intro'>Simplify, expand, factor, and solve supported algebra expressions directly on this device.</div>
    <div className='local-engine-operations' role='group' aria-label='Choose algebra operation'>
      {([
        { value: 'simplify', label: 'Simplify' },
        { value: 'expand', label: 'Expand' },
        { value: 'factor', label: 'Factor' },
        { value: 'solve', label: 'Solve' },
      ] as const).map(item => (
        <button
          key={item.value}
          type='button'
          className={'local-engine-operation neumorphic' + (operation === item.value ? ' is-selected' : '')}
          aria-pressed={operation === item.value}
          onClick={() => { setOperation(item.value); setResult(''); setSteps([]); setHasDetailedSteps(false); setVerification(null); setHistorySaved(false); setHistorySaveError(false); setError(''); }}
        >
          {item.label}
        </button>
      ))}
    </div>
    <label className='visual-field-label' htmlFor='local-algebra-expression'>Expression</label>
    <input id='local-algebra-expression' className='local-algebra-input' value={expression} maxLength={240} onChange={event => { setExpression(event.target.value); setResult(''); setSteps([]); setHasDetailedSteps(false); setVerification(null); setHistorySaved(false); setHistorySaveError(false); setError(''); }} onKeyDown={event => { if (event.key === 'Enter') run(); }} placeholder='e.g. x^2 - 5*x + 6' aria-describedby='local-expression-help'/>
    <div className='local-expression-preview' aria-live='polite'>
      <span>Math preview</span>
      <div><MathExpression expression={expression || ' '} /></div>
    </div>
    <small id='local-expression-help' className='local-expression-help'>Use ^ for powers and * for multiplication. The preview formats your expression; it does not change the calculation.</small>
    <button type='button' className='visual-launch neumorphic' onClick={() => void run()} disabled={running || !expression.trim()}>{running ? 'Exploring…' : 'Explore'}</button>
    {error && <div className='visual-error' role='alert'>{error}</div>}
    {result && <div className='local-algebra-result' aria-live='polite'>
      <span>Local result</span>
      <div className='local-result-math'><MathExpression expression={result} /></div>
      <div className='local-solution-breakdown'>
        <strong>Solution Breakdown</strong>
        {steps.map((step, index) => <div className='local-solution-step' key={step.title + index}>
          <span>{step.title}</span>
          <div className='local-step-math'><MathExpression expression={step.expression} /></div>
          <small>{step.explanation}</small>
        </div>)}
        {!hasDetailedSteps && <p className='local-steps-limitation'>Detailed intermediate derivation is not available for this expression. The displayed result is not a complete step-by-step proof.</p>}
      </div>
      {verification && <div className='local-verification' role='status'>
        <span>{verification.status === 'passed' ? 'Numerical spot-check · Passed' : verification.status === 'failed' ? 'Numerical spot-check · Failed' : 'Verification · Partial'}</span>
        <p>{verification.message}</p>
      </div>}
      <button type='button' className='visual-launch neumorphic' onClick={() => { const verificationText = verification ? verification.message : null; const saved = onSaveHistory(operation, expression, result, steps, verificationText); setHistorySaved(saved); setHistorySaveError(!saved); }} disabled={historySaved} aria-live='polite'>{historySaved ? 'Saved to history ✓' : 'Save to history'}</button>
      {historySaveError && <div className='visual-error' role='alert'>Could not save this symbolic result. Check device storage and try again.</div>}
    </div>}
      </div>}
    </section>
    <section className={'local-algebra-card neumorphic' + (visualOpen ? ' is-expanded' : '')}>
      <button type='button' className='local-algebra-card-toggle' aria-expanded={visualOpen} onClick={() => setVisualOpen(open => !open)}>
        <span className='local-algebra-card-icon'><ChartSpline size={20}/></span>
        <span className='local-algebra-card-title'><strong>Mathematical Visualizations</strong><small>Graphs · Vectors · Geometry · Calculus · 3D</small></span>
        <span className='local-algebra-card-action'>{visualOpen ? 'Collapse' : 'Open'} {visualOpen ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}</span>
      </button>
      <div className='local-algebra-visualization-entry' hidden={!visualOpen}>
      <div className='local-visualization-copy'><strong>Explore mathematics visually</strong><small>Explore graphs, vectors, geometry, calculus, 3D surfaces, and solids in one workspace.</small></div>
      </div>
      {visualOpen && <GraphWorkspace initialExpression={deriveVisualizationExpression(expression, steps.map(step => ({ expression: step.expression } as AiStep)))} onClose={() => setVisualOpen(false)} embedded />}
    </section>
  </div>;
}

function evaluateGraphExpression(raw: string, x: number): number {
  const normalized = raw.trim().replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '').replace(/[²]/g, '^2').replace(/[³]/g, '^3').replace(/[⁴]/g, '^4').replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('π', String(Math.PI)).replace(/(\d|\))\s*(?=x|\()/gi, '$1*');
  const source = normalized.replace(/\^/g, '**').replace(/\b(sin|cos|tan|sqrt|abs|log|ln|exp)\s*\(/gi, '$1(').replace(/\bx\b/gi, '(' + String(x) + ')').replace(/(\d|\))\s*\(/g, '$1*(');
  if (source.length > 180 || !/^[0-9eE.+\-*/()%\s,a-zA-Z]*$/.test(source)) throw new Error('Unsupported graph expression. Use x, numbers, + − × ÷, powers, and supported functions.');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Za-z]+|\*\*|[()+\-*/%,]/gi) || [];
  if (tokens.join('').replace(/,/g, '') !== source.replace(/\s/g, '').replace(/,/g, '')) throw new Error('Check the mathematical expression syntax.');
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const atom = (): number => {
    const t = take();
    if (t === '+') return atom();
    if (t === '-') return -atom();
    if (t === '(') { const v = sum(); if (take() !== ')') throw new Error('Missing closing parenthesis.'); return v; }
    if (/^\d/.test(t || '')) return Number(t);
    if (/^[a-z]+$/i.test(t || '')) {
      if (take() !== '(') throw new Error('Functions must use parentheses.');
      const v = sum(); if (take() !== ')') throw new Error('Missing function parenthesis.');
      const f: Record<string,(n:number)=>number> = {sin:Math.sin,cos:Math.cos,tan:Math.tan,sqrt:Math.sqrt,abs:Math.abs,log:Math.log10,ln:Math.log,exp:Math.exp};
      if (!f[t.toLowerCase()]) throw new Error('Unsupported function: ' + t);
      return f[t.toLowerCase()](v);
    }
    throw new Error('Unexpected token in graph expression.');
  };
  const power = (): number => { let v = atom(); if (peek() === '**') { take(); v = Math.pow(v, power()); } return v; };
  const product = (): number => { let v = power(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = take(); const b = power(); v = op === '*' ? v*b : op === '/' ? v/b : v%b; } return v; };
  const sum = (): number => { let v = product(); while (peek() === '+' || peek() === '-') { const op = take(); const b = product(); v = op === '+' ? v+b : v-b; } return v; };
  const result = sum();
  if (i !== tokens.length || !Number.isFinite(result)) return NaN;
  return result;
}

function deriveVisualizationExpression(problem: string, steps: AiStep[]): string {
  const candidates = [...steps.map(step => step.expression), problem];
  for (const candidate of candidates) {
    if (!candidate || !/x/i.test(candidate)) continue;
    const cleaned = candidate.replace(/\\(?:cdot|times)/g, '*').replace(/\\(?:left|right)/g, '').replace(/\\(?:left|right)\s*/g, '').replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)').replace(/[{}$]/g, '').replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4').replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').replaceAll('π', 'pi').replace(/(\d|\))\s*(?=x|\()/gi, '$1*').replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
    const sides = cleaned.split('=');
    const expression = (sides.find(side => /x/i.test(side) && /[+*/^()-]/.test(side)) || sides[0] || '').trim();
    if (expression.length < 150 && /[+*/^()-]/.test(expression) && !/[<>]/.test(expression) && !/\b(?:solve|find|derivative|integral|where|when)\b/i.test(expression)) return expression;
  }
  return 'x^2 - 5*x + 6';
}

function GraphWorkspace({ initialExpression, onClose, embedded = false }: { initialExpression: string; onClose: () => void; embedded?: boolean }) {
  const [mode, setMode] = useState<VisualMode>('graph');
  const [expression, setExpression] = useState(initialExpression.replace(/^\s*y\s*=\s*/i, '') || 'x^2 - 5*x + 6');
  const [xMin, setXMin] = useState(-10);
  const [xMax, setXMax] = useState(10);
  const [yMin, setYMin] = useState(-10);
  const [yMax, setYMax] = useState(10);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [traceX, setTraceX] = useState(2.5);
  const [showGrid, setShowGrid] = useState(true);
  const [error, setError] = useState('');
  const width = 340, height = 240, pad = 28;
  const samples = Array.from({length:241},(_,i)=>{const x=xMin+(xMax-xMin)*i/240;let y=NaN;try{y=evaluateGraphExpression(expression,x)}catch{}return {x,y};});
  const finite = samples.filter(p=>Number.isFinite(p.y) && Math.abs(p.y)<1e6);
  const maxAbs = Math.max(5,...finite.map(p=>Math.abs(p.y)));
  const visibleYMin = yMin, visibleYMax = yMax;
  const plotWidth = width - 2 * pad, plotHeight = height - 2 * pad;
  const sx = (x:number) => pad + (x-xMin)/(xMax-xMin)*plotWidth;
  const sy = (y:number) => height-pad-(y-visibleYMin)/(visibleYMax-visibleYMin)*plotHeight;
  const xTicks = Array.from({length:9},(_,i)=>xMin+(xMax-xMin)*i/8);
  const yTicks = Array.from({length:7},(_,i)=>yMin+(yMax-yMin)*i/6);
  const path = samples.map((p,i)=>!Number.isFinite(p.y)||Math.abs(p.y)>1e6?'':`${i===0||!Number.isFinite(samples[i-1].y)||Math.abs(samples[i-1].y)>1e6?'M':'L'} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`).filter(Boolean).join(' ');
  let traceY = NaN; try { traceY = evaluateGraphExpression(expression, traceX); } catch {}
  const roots = samples.reduce<number[]>((found, point, index) => {
    if (index === 0) return found;
    const previous = samples[index - 1];
    if (!Number.isFinite(previous.y) || !Number.isFinite(point.y) || previous.y * point.y > 0) return found;
    let left = previous.x;
    let right = point.x;
    let leftY = previous.y;
    let rightY = point.y;
    let root = Math.abs(leftY) < 1e-12 ? left : Math.abs(rightY) < 1e-12 ? right : (left + right) / 2;
    // Refine a sign-changing interval instead of reporting the nearest sample point.
    // If the function is undefined inside the interval (for example, at an asymptote),
    // retain a linear estimate and keep the UI label explicitly approximate.
    if (Math.abs(leftY) >= 1e-12 && Math.abs(rightY) >= 1e-12) {
      let validBracket = true;
      for (let iteration = 0; iteration < 28; iteration += 1) {
        const middle = (left + right) / 2;
        let middleY: number;
        try {
          middleY = evaluateGraphExpression(expression, middle);
        } catch {
          validBracket = false;
          break;
        }
        if (!Number.isFinite(middleY)) {
          validBracket = false;
          break;
        }
        root = middle;
        if (Math.abs(middleY) < 1e-10) break;
        if (leftY * middleY <= 0) {
          right = middle;
          rightY = middleY;
        } else {
          left = middle;
          leftY = middleY;
        }
      }
      if (!validBracket) {
        const denominator = rightY - leftY;
        root = Math.abs(denominator) > 1e-12 ? left - leftY * (right - left) / denominator : (left + right) / 2;
      }
    }
    if (found.every(existing => Math.abs(existing - root) > 0.15)) found.push(root);
    return found;
  }, []).slice(0, 8);
  const updateRange = (factor:number) => { const midX=(xMin+xMax)/2, spanX=(xMax-xMin)*factor; const midY=(yMin+yMax)/2, spanY=(yMax-yMin)*factor; setXMin(midX-spanX/2); setXMax(midX+spanX/2); setYMin(midY-spanY/2); setYMax(midY+spanY/2); setZoomLevel(level=>Math.max(0.1,Math.min(10,level/factor))); };
  const submit = () => { try { const probes = [-2, -0.5, 0, 0.5, 2]; let parsed = false; for (const probe of probes) { try { evaluateGraphExpression(expression, probe); parsed = true; break; } catch { /* Try another sample; some valid functions have restricted domains. */ } } if (!parsed) throw new Error('Check the expression syntax and supported functions.'); setError(''); } catch(e) { setError(e instanceof Error?e.message:'Unable to parse expression.'); } };
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const visualRootRef = useRef<HTMLDivElement | null>(null);
  const [showCalculatorKeypad, setShowCalculatorKeypad] = useState(false);
  const [keypadPosition, setKeypadPosition] = useState<{x:number;y:number}|null>(null);
  const [keypadFabPosition, setKeypadFabPosition] = useState<{x:number;y:number}|null>(null);
  const keypadDragRef = useRef<{pointerX:number;pointerY:number;originX:number;originY:number}|null>(null);
  const keypadFabDragRef = useRef<{pointerX:number;pointerY:number;originX:number;originY:number;moved:boolean}|null>(null);
  const suppressFabClickRef = useRef(false);
  const startKeypadFabDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    keypadFabDragRef.current = {pointerX:event.clientX,pointerY:event.clientY,originX:rect.left,originY:rect.top,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveKeypadFabDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = keypadFabDragRef.current;
    if (!drag) return;
    const dx = event.clientX-drag.pointerX;
    const dy = event.clientY-drag.pointerY;
    if (Math.abs(dx)>4 || Math.abs(dy)>4) drag.moved = true;
    if (!drag.moved) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    const height = event.currentTarget.getBoundingClientRect().height;
    setKeypadFabPosition({x:Math.max(6,Math.min(window.innerWidth-width-6,drag.originX+dx)),y:Math.max(70,Math.min(window.innerHeight-height-12,drag.originY+dy))});
  };
  const endKeypadFabDrag = () => {
    if (keypadFabDragRef.current?.moved) suppressFabClickRef.current = true;
    keypadFabDragRef.current = null;
  };
  const [keypadMessage, setKeypadMessage] = useState('Tap a number field, then use either keypad.');
  const startKeypadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    keypadDragRef.current = {pointerX:event.clientX,pointerY:event.clientY,originX:rect.left,originY:rect.top};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveKeypadDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = keypadDragRef.current;
    if (!drag) return;
    const width = Math.min(330, window.innerWidth - 20);
    const height = event.currentTarget.parentElement?.getBoundingClientRect().height ?? 300;
    setKeypadPosition({x:Math.max(6,Math.min(window.innerWidth-width-6,drag.originX+event.clientX-drag.pointerX)),y:Math.max(70,Math.min(window.innerHeight-height-76,drag.originY+event.clientY-drag.pointerY))});
  };
  const endKeypadDrag = () => { keypadDragRef.current = null; };
  useEffect(() => {
    visualRootRef.current?.querySelectorAll<HTMLInputElement>('input').forEach(input => {
      if (showCalculatorKeypad) input.setAttribute('inputmode', 'none');
      else input.removeAttribute('inputmode');
    });
  }, [showCalculatorKeypad, mode]);
  const handleCalculatorKey = (key: string) => {
    const input = activeInputRef.current;
    if (!input || !visualRootRef.current?.contains(input)) {
      setKeypadMessage('Tap a number field first.');
      return;
    }
    const isNumeric = input.type === 'number' || input.type === 'range';
    const oldValue = input.value;
    let nextValue = oldValue;
    if (key === 'AC') nextValue = isNumeric ? '0' : '';
    else if (key === 'DEL') nextValue = oldValue.slice(0, -1) || (isNumeric ? '0' : '');
    else if (key === '±') nextValue = String(-Number(oldValue || 0));
    else if (key === 'Next') {
      const fields = Array.from(visualRootRef.current.querySelectorAll<HTMLInputElement>('input[type="number"], input[type="text"]'));
      const next = fields[(fields.indexOf(input) + 1) % fields.length];
      next?.focus();
      setKeypadMessage(next ? 'Ready for the next field.' : 'Tap a number field first.');
      return;
    } else if (isNumeric) {
      if (['+', '×', '÷', '(', ')', '^', '='].includes(key)) {
        setKeypadMessage('This is a numeric field. Use digits, decimal, sign, DEL, AC, or Next.');
        return;
      }
      const started = input.dataset.calculatorPadStarted === 'true';
      nextValue = key === '.' ? (started ? (oldValue.includes('.') ? oldValue : oldValue + '.') : '0.') : key === '−' ? (oldValue.startsWith('-') ? oldValue.slice(1) : '-' + oldValue) : (started ? oldValue + key : key);
      input.dataset.calculatorPadStarted = 'true';
    } else {
      const start = input.selectionStart ?? oldValue.length;
      const end = input.selectionEnd ?? start;
      const inserted = key === '×' ? '*' : key === '÷' ? '/' : key === '−' ? '-' : key;
      nextValue = oldValue.slice(0, start) + inserted + oldValue.slice(end);
    }
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value');
    descriptor?.set?.call(input, nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (!isNumeric && key !== 'AC' && key !== 'DEL') {
      const cursor = nextValue.length;
      try { input.setSelectionRange(cursor, cursor); } catch { /* Number inputs do not expose text selection. */ }
    }
    setKeypadMessage('Entered ' + key + '. Values update as you type.');
  };
  return <div ref={visualRootRef} className={'visual-workspace neumorphic-inset' + (embedded ? ' visual-workspace-embedded' : ' visual-workspace-fullscreen')} onFocusCapture={event => {
    if (event.target instanceof HTMLInputElement) {
      activeInputRef.current = event.target;
      event.target.dataset.calculatorPadStarted = 'false';
      if (showCalculatorKeypad) event.target.setAttribute('inputmode', 'none');
      setKeypadMessage('Field selected. Use your phone keyboard or NetCalc keypad.');
    }
  }}>
    <div className='visual-head'><div><strong>Mathematical Visualizer</strong><small>Interactive local rendering</small></div><button className='visual-icon-button neumorphic' onClick={onClose} aria-label='Close visualizer'><X size={17}/></button></div>
    <div className='visual-mode-tabs' role='group' aria-label='Visualization modes'>{([{id:'graph',label:'2D Graph',icon:<ChartSpline size={14}/>},{id:'vectors',label:'Vectors',icon:<Move3D size={14}/>},{id:'geometry',label:'Geometry',icon:<Ruler size={14}/>},{id:'calculus',label:'Calculus',icon:<Sigma size={14}/>},{id:'surface',label:'3D Surface',icon:<Move3D size={14}/>},{id:'solids',label:'Solids',icon:<Box size={14}/>} ] as {id:VisualMode;label:string;icon:React.ReactNode}[]).map(item=><button type='button' key={item.id} aria-pressed={mode===item.id} className={'visual-mode '+(mode===item.id?'active':'')} onClick={()=>setMode(item.id)}>{item.icon}{item.label}</button>)}</div>
    <button type='button' className={'visual-keypad-toggle visual-keypad-fab neumorphic'+(showCalculatorKeypad?' is-open':'')} style={keypadFabPosition?{left:keypadFabPosition.x,top:keypadFabPosition.y,right:'auto',bottom:'auto'}:undefined} aria-label={showCalculatorKeypad ? 'Close NetCalc keypad' : 'Open NetCalc keypad'} title={showCalculatorKeypad ? 'Close keypad' : 'Open keypad'} aria-expanded={showCalculatorKeypad} onPointerDown={startKeypadFabDrag} onPointerMove={moveKeypadFabDrag} onPointerUp={endKeypadFabDrag} onPointerCancel={endKeypadFabDrag} onClick={() => { if (suppressFabClickRef.current) { suppressFabClickRef.current=false; return; } setShowCalculatorKeypad(open => !open); }}>{showCalculatorKeypad ? <X size={16}/> : <Calculator size={17}/>}</button>
    {showCalculatorKeypad && <div className={'visual-calculator-keypad visual-keypad-floating'+(keypadPosition?' visual-keypad-positioned':'')} style={keypadPosition?{left:keypadPosition.x,top:keypadPosition.y,right:'auto',bottom:'auto'}:undefined} role='group' aria-label='NetCalc numeric keypad'><div className='visual-keypad-panel-head visual-keypad-drag-handle' onPointerDown={startKeypadDrag} onPointerMove={moveKeypadDrag} onPointerUp={endKeypadDrag} onPointerCancel={endKeypadDrag} title='Drag to move keypad'><div><strong>NetCalc keypad</strong><small><Move3D size={11} style={{display:'inline',verticalAlign:'middle'}}/> Drag here to move</small></div><button type='button' className='visual-keypad-close' aria-label='Close keypad' onClick={() => setShowCalculatorKeypad(false)}><X size={17}/></button></div><div className='visual-keypad-hint' aria-live='polite'>{keypadMessage}</div><div className='visual-keypad-grid'>{['7','8','9','DEL','4','5','6','−','1','2','3','±','0','.','AC','Next','+','×','÷','(',')','^','='].map(key=><button type='button' key={key} className={key==='Next'?'visual-pad-next':''} onPointerDown={event => event.preventDefault()} onClick={() => handleCalculatorKey(key)}>{key}</button>)}</div></div>}
    {mode==='graph' ? <>
      <label className='visual-field-label' htmlFor='visual-expression'>Function y = f(x)</label><div className='visual-expression-row'><input id='visual-expression' value={expression} onChange={e=>{setExpression(e.target.value);setError('');}} onKeyDown={e=>{if(e.key==='Enter')submit();}}/><button className='visual-icon-button neumorphic' onClick={submit}>Plot</button></div>
      {error && <div className='visual-error' role='alert'>{error}</div>}
      <div className='visual-plot-wrap'><svg className='visual-plot' viewBox={`0 0 ${width} ${height}`} role='img' aria-label={'Graph of '+expression+', x range '+xMin.toFixed(2)+' to '+xMax.toFixed(2)+', y range '+yMin.toFixed(2)+' to '+yMax.toFixed(2)}>
        <defs><clipPath id='netcalc-graph-clip'><rect x={pad} y={pad} width={plotWidth} height={plotHeight}/></clipPath></defs>
        {showGrid && <g>{xTicks.map((tick,i)=><line key={'gx'+i} x1={sx(tick)} y1={pad} x2={sx(tick)} y2={height-pad} stroke='#d6e9e5' strokeWidth='.7'/ >)}{yTicks.map((tick,i)=><line key={'gy'+i} x1={pad} y1={sy(tick)} x2={width-pad} y2={sy(tick)} stroke='#d6e9e5' strokeWidth='.7'/ >)}</g>}
        <g clipPath='url(#netcalc-graph-clip)'><line x1={sx(0)} y1={pad} x2={sx(0)} y2={height-pad} stroke='#64748b' strokeWidth='1.4'/><line x1={pad} y1={sy(0)} x2={width-pad} y2={sy(0)} stroke='#64748b' strokeWidth='1.4'/><path d={path} fill='none' stroke='#4a22c7' strokeWidth='2.5' strokeLinejoin='round' strokeLinecap='round'/></g>
        {Number.isFinite(traceY)&&traceX>=xMin&&traceX<=xMax&&traceY>=visibleYMin&&traceY<=visibleYMax&&<g clipPath='url(#netcalc-graph-clip)'><line x1={sx(traceX)} y1={pad} x2={sx(traceX)} y2={height-pad} stroke='#2e8061' strokeDasharray='3 3'/><circle cx={sx(traceX)} cy={sy(traceY)} r='4.5' fill='#2e8061' stroke='#fff' strokeWidth='2'/></g>}
        <text x={pad} y={height-6} fontSize='9' fill='#64748b'>{xMin.toFixed(1)}</text><text x={width-pad} y={height-6} textAnchor='end' fontSize='9' fill='#64748b'>{xMax.toFixed(1)}</text><text x={width-8} y={sy(0)-6} textAnchor='end' fontSize='10' fill='#64748b'>x</text><text x={sx(0)+5} y={pad+8} fontSize='10' fill='#64748b'>y</text>
      </svg></div>
      <div className='visual-controls'><button type='button' className='visual-icon-button neumorphic' aria-label='Zoom in graph' onClick={()=>updateRange(0.7)}><ZoomIn size={14}/> Zoom in</button><button type='button' className='visual-icon-button neumorphic' aria-label='Zoom out graph' onClick={()=>updateRange(1.4)}><ZoomOut size={14}/> Zoom out</button><button type='button' className='visual-icon-button neumorphic' onClick={()=>{setXMin(-10);setXMax(10);setYMin(-10);setYMax(10);setZoomLevel(1);setTraceX(2.5);}}> <RotateCcw size={14}/> Reset</button><button type='button' className='visual-icon-button neumorphic' onClick={()=>setShowGrid(v=>!v)}>{showGrid?'Hide':'Show'} grid</button><span className='visual-zoom-status' aria-live='polite'>Zoom {zoomLevel.toFixed(2)}×</span></div>
      <div className='visual-readout'><span>Visible x range</span><strong>{xMin.toFixed(2)} to {xMax.toFixed(2)} · y range {yMin.toFixed(2)} to {yMax.toFixed(2)}</strong></div><label className='visual-field-label' htmlFor='trace-point'><Crosshair size={14} inline/> Trace point: x = {traceX.toFixed(2)}</label><input id='trace-point' className='visual-range' type='range' min={xMin} max={xMax} step={(xMax-xMin)/200} value={traceX} onChange={e=>setTraceX(Number(e.target.value))}/><div className='visual-readout'><span>x = {traceX.toFixed(3)}</span><strong>{Number.isFinite(traceY)?'f(x) = '+traceY.toFixed(5):'f(x) is undefined here'}</strong></div>
      <div className='visual-roots'><strong>Approximate x-intercepts</strong><div>{roots.length?roots.map((root,i)=><span key={i}>x ≈ {root.toFixed(3)}</span>):<span>No crossing detected in the current range.</span>}</div><small>Numerical estimates from the visible sample; not a proof that all roots have been found.</small></div>
    </> : mode==='vectors' ? <div className='visual-info-panel'><h3>Vector Explorer</h3><p>A vector is an arrow. Its horizontal component moves left or right; its vertical component moves down or up. Change the four values below to see the arrows and calculations update.</p><VectorWorkspace/></div> : mode==='geometry' ? <div className='visual-info-panel'><h3>Geometry canvas</h3><p>Coordinate-based constructions with live measurements and transformations.</p><GeometryWorkspace/></div> : mode==='solids' ? <div className='visual-info-panel'><h3>Solid geometry</h3><p>Explore dimensions, volume and surface area of common solids.</p><SolidWorkspace/></div> : mode==='calculus' ? <div className='visual-info-panel'><h3>Calculus explorer</h3><CalculusWorkspace expression={expression} x={traceX}/></div> : <div className='visual-info-panel'><h3>3D surface explorer</h3><p>Rotate and compare common two-variable surfaces.</p><SurfaceWorkspace/></div>}
  </div>;
}

function VectorWorkspace() {
 const [ax,setAx]=useState(2),[ay,setAy]=useState(3),[bx,setBx]=useState(-1),[by,setBy]=useState(4);
 const [draftAx,setDraftAx]=useState('2'),[draftAy,setDraftAy]=useState('3'),[draftBx,setDraftBx]=useState('-1'),[draftBy,setDraftBy]=useState('4');
 const [showSteps,setShowSteps]=useState(true);
 const sumX=ax+bx, sumY=ay+by, dot=ax*bx+ay*by;
 const magA=Math.hypot(ax,ay), magB=Math.hypot(bx,by);
 const ox=150, oy=100;
 const maxX=Math.max(1,Math.abs(ax),Math.abs(bx),Math.abs(sumX));
 const maxY=Math.max(1,Math.abs(ay),Math.abs(by),Math.abs(sumY));
 const scaleX=Math.min(18,132/maxX), scaleY=Math.min(18,82/maxY);
 const point=(x:number,y:number)=>`${ox+x*scaleX},${oy-y*scaleY}`;
 const coord=(x:number,y:number)=>({x:ox+x*scaleX,y:oy-y*scaleY});
 const aTip=coord(ax,ay), bTip=coord(bx,by), resultTip=coord(sumX,sumY);
 const shiftedMid=coord(ax+bx/2,ay+by/2);
 const labelPosition=(p:{x:number;y:number},offset:number)=>({x:p.x>244?p.x-8:p.x<56?p.x+8:p.x+(p.x>=ox?5:-5),y:p.y<18?p.y+12:p.y>182?p.y-10:p.y+offset,anchor:p.x>244?'end':p.x<56?'start':p.x>=ox?'start':'end'});
 const arrowHeadPath=(from:{x:number;y:number},to:{x:number;y:number},size:number,perpendicularOffset:number)=>{const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length,px=-uy,py=ux,tipX=to.x+px*perpendicularOffset,tipY=to.y+py*perpendicularOffset,baseX=tipX-ux*size,baseY=tipY-uy*size,halfWidth=size*.32;return `M ${tipX} ${tipY} L ${baseX+px*halfWidth} ${baseY+py*halfWidth} L ${baseX-px*halfWidth} ${baseY-py*halfWidth} Z`;};
 const aLabel=labelPosition(aTip,ay>=0?-7:13), bLabel=labelPosition(bTip,by>=0?13:-7), sumLabel=labelPosition(resultTip,sumY>=0?-8:14);
 const shiftedLabel=labelPosition(shiftedMid,by>=0?12:-9);
 const loadExample=()=>{setAx(3);setAy(4);setBx(1);setBy(2);setDraftAx('3');setDraftAy('4');setDraftBx('1');setDraftBy('2');setShowSteps(true);};
 return <div className='vector-learning'>
  <div className='vector-intro-card'><strong>Start with a guided example</strong><p>Try A = (3, 4) and B = (1, 2). You can change the numbers at any time.</p><button type='button' className='visual-icon-button neumorphic' onClick={loadExample}>Load guided example</button></div>
  <div className='vector-legend'><span><i className='vector-dot vector-a'/> A · purple</span><span><i className='vector-dot vector-b'/> B · green from origin</span><span><i className='vector-dot vector-shift'/> B′ · teal dashed, translated B</span><span><i className='vector-dot vector-sum'/> A + B · orange dashed</span></div><p className='vector-tip-note'><strong>Tip-to-tail:</strong> B′ is the same vector B moved so its tail starts at A’s tip. The orange arrow from the origin is the sum A + B.</p>
  <svg viewBox='0 0 300 200' className='visual-plot vector-plot' role='img' aria-label={`Vector diagram. A = (${ax}, ${ay}), B = (${bx}, ${by}), B shifted to A's tip, and resultant A + B = (${sumX}, ${sumY}). Tick labels show approximate coordinate values.`}>
   <defs>
    <marker id='vec-arrow-a' markerWidth='6' markerHeight='6' refX='5.5' refY='3' orient='auto'><path d='M0,0 L6,3 L0,6 L1.2,3 z' fill='#4a22c7'/></marker>
    <marker id='vec-arrow-b' markerWidth='6' markerHeight='6' refX='5.5' refY='3' orient='auto'><path d='M0,0 L6,3 L0,6 L1.2,3 z' fill='#2e8061'/></marker>
    <marker id='vec-arrow-shift' markerWidth='5' markerHeight='5' refX='4.2' refY='2.5' orient='auto'><path d='M0,0 L5,2.5 L0,5 z' fill='#168c8c'/></marker>
    <marker id='vec-arrow-sum' markerWidth='5' markerHeight='5' refX='4.2' refY='2.5' orient='auto'><path d='M0,0 L5,2.5 L0,5 z' fill='#c46b29'/></marker>
   </defs>
   {Array.from({length:11},(_,i)=><g key={i}>
    <line x1={i*30} y1='0' x2={i*30} y2='200' stroke='#d6e9e5' strokeWidth='.6'/>
    <line x1='0' y1={i*20} x2='300' y2={i*20} stroke='#d6e9e5' strokeWidth='.6'/>
   </g>)}
   <line x1='0' y1={oy} x2='300' y2={oy} stroke='#64748b' strokeWidth='1'/>
   <line x1={ox} y1='0' x2={ox} y2='200' stroke='#64748b' strokeWidth='1'/>
   {Array.from({length:9},(_,i)=>i+1).map(i=><g key={'xtick'+i}>
    <line x1={ox+(i-5)*30} y1={oy-3} x2={ox+(i-5)*30} y2={oy+3} stroke='#64748b' strokeWidth='.8'/>
    {i!==5&&<text x={ox+(i-5)*30} y='194' textAnchor='middle' fontSize='7' fill='#667873'>{((i-5)*30/scaleX).toFixed(1).replace(/\.0$/,'')}</text>}
   </g>)}
   {Array.from({length:9},(_,i)=>i+1).map(i=><g key={'ytick'+i}>
    <line x1={ox-3} y1={oy+(i-5)*20} x2={ox+3} y2={oy+(i-5)*20} stroke='#64748b' strokeWidth='.8'/>
    {i!==5&&<text x={ox+5} y={oy+(i-5)*20-2} fontSize='7' fill='#667873'>{((5-i)*20/scaleY).toFixed(1).replace(/\.0$/,'')}</text>}
   </g>)}
   <line x1={ox} y1={oy} x2={aTip.x} y2={aTip.y} stroke='#4a22c7' strokeWidth='1.2' strokeLinecap='round' markerEnd='url(#vec-arrow-a)'/>
   <line x1={ox} y1={oy} x2={bTip.x} y2={bTip.y} stroke='#2e8061' strokeWidth='1.2' strokeLinecap='round' markerEnd='url(#vec-arrow-b)'/>
   <line x1={aTip.x} y1={aTip.y} x2={resultTip.x} y2={resultTip.y} stroke='#168c8c' strokeWidth='1.2' strokeDasharray='5 3' strokeLinecap='round'/>
   <line x1={ox} y1={oy} x2={resultTip.x} y2={resultTip.y} stroke='#c46b29' strokeWidth='1.2' strokeDasharray='4 3' strokeLinecap='round'/>
   <path d={arrowHeadPath(aTip,resultTip,5.5,-2.0)} fill='#168c8c'/>
   <path d={arrowHeadPath({x:ox,y:oy},resultTip,5.5,2.0)} fill='#c46b29'/>
   <circle cx={ox} cy={oy} r='2.5' fill='#34433f'/>
   <text className='vector-point-label' x={aLabel.x} y={aLabel.y} textAnchor={aLabel.anchor} fill='#4a22c7'>A ({ax}, {ay})</text>
   <text className='vector-point-label' x={bLabel.x} y={bLabel.y} textAnchor={bLabel.anchor} fill='#2e8061'>B ({bx}, {by})</text>
   <text className='vector-point-label' x={shiftedLabel.x} y={shiftedLabel.y} textAnchor={shiftedLabel.anchor} fill='#168c8c'>B′</text>
   <text className='vector-point-label' x={sumLabel.x} y={sumLabel.y} textAnchor={sumLabel.anchor} fill='#a9561e'>A + B ({sumX}, {sumY})</text>
   <text x='290' y='94' fontSize='8' fill='#64748b'>x</text><text x='156' y='10' fontSize='8' fill='#64748b'>y</text>
  </svg>
  <div className='vector-controls'>{[{label:'aₓ',value:ax,draft:draftAx,setDraft:setDraftAx,set:setAx,help:'A horizontal'},{label:'aᵧ',value:ay,draft:draftAy,setDraft:setDraftAy,set:setAy,help:'A vertical'},{label:'bₓ',value:bx,draft:draftBx,setDraft:setDraftBx,set:setBx,help:'B horizontal'},{label:'bᵧ',value:by,draft:draftBy,setDraft:setDraftBy,set:setBy,help:'B vertical'}].map(item=><label key={item.label}><span><strong>{item.label}</strong><small>{item.help}</small></span><input aria-label={`${item.label} ${item.help} component`} type='text' inputMode='text' value={item.draft} onFocus={e=>{e.currentTarget.select();}} onChange={e=>{const raw=e.target.value;item.setDraft(raw);if(raw.trim()!==''&&raw!=='-'&&raw!=='.'&&raw!=='-. '&&Number.isFinite(Number(raw)))item.set(Number(raw));}} onBlur={()=>{const raw=item.draft.trim();if(raw!==''&&raw!=='-'&&raw!=='.'&&Number.isFinite(Number(raw))){item.set(Number(raw));item.setDraft(String(Number(raw)));}else item.setDraft(String(item.value));}} /></label>)}</div>
  <div className='visual-readout'><span>Vector addition · A + B</span><strong>({ax} + ({bx}), {ay} + ({by})) = ({sumX}, {sumY})</strong><small>Add the horizontal parts together, then add the vertical parts.</small></div>
  <div className='visual-readout'><span>Dot product · A · B</span><strong>({ax} × {bx}) + ({ay} × {by}) = {dot}</strong><small>Multiply matching components, then add the two products.</small></div>
  <div className='visual-readout'><span>Vector magnitudes · arrow lengths</span><strong>|A| = √({ax}² + {ay}²) = {magA.toFixed(3)}</strong><strong>|B| = √({bx}² + {by}²) = {magB.toFixed(3)}</strong><small>Square both components, add them, then take the square root.</small></div>
  <button type='button' className='vector-steps-toggle' aria-expanded={showSteps} onClick={()=>setShowSteps(v=>!v)}>{showSteps?'Hide':'Show'} worked steps</button>
  {showSteps&&<div className='vector-steps'><h4>Worked example</h4><ol><li><strong>Read the components.</strong><span>A = ({ax}, {ay}); B = ({bx}, {by}).</span></li><li><strong>Add x-components.</strong><span>{ax} + ({bx}) = {sumX}.</span></li><li><strong>Add y-components.</strong><span>{ay} + ({by}) = {sumY}.</span></li><li><strong>Combine the answers.</strong><span>A + B = ({sumX}, {sumY}).</span></li><li><strong>Calculate the dot product.</strong><span>{ax} × ({bx}) + {ay} × ({by}) = {dot}.</span></li></ol><p>These values update automatically when you edit a component.</p></div>}
 </div>;
}

function GeometryWorkspace() {
 const [radius,setRadius]=useState(4),[ax,setAx]=useState(1),[ay,setAy]=useState(1),[bx,setBx]=useState(7),[by,setBy]=useState(2),[cx,setCx]=useState(3),[cy,setCy]=useState(7);
 const [dx,setDx]=useState(0),[dy,setDy]=useState(0),[rotation,setRotation]=useState(0);
 const rotate=(x:number,y:number)=>{const a=rotation*Math.PI/180;return {x:x*Math.cos(a)-y*Math.sin(a)+dx,y:x*Math.sin(a)+y*Math.cos(a)+dy};};
 const pts=[rotate(ax,ay),rotate(bx,by),rotate(cx,cy)];
 const minX=Math.min(...pts.map(p=>p.x)), maxX=Math.max(...pts.map(p=>p.x));
 const minY=Math.min(...pts.map(p=>p.y)), maxY=Math.max(...pts.map(p=>p.y));
 const spanX=Math.max(1,maxX-minX), spanY=Math.max(1,maxY-minY);
 const unitScale=Math.min(15,220/(spanX+1.2),130/(spanY+1.6));
 const centerX=(minX+maxX)/2, centerY=(minY+maxY)/2;
 const sx=(x:number)=>150+(x-centerX)*unitScale, sy=(y:number)=>95-(y-centerY)*unitScale;
 const axisX=sx(0), axisY=sy(0);
 const dist=(p:{x:number;y:number},q:{x:number;y:number})=>Math.hypot(p.x-q.x,p.y-q.y);
 const area=Math.abs((pts[0].x*(pts[1].y-pts[2].y)+pts[1].x*(pts[2].y-pts[0].y)+pts[2].x*(pts[0].y-pts[1].y))/2);
 return <>
  <div className='visual-plot-wrap'><svg viewBox='0 0 300 190' className='visual-plot' role='img' aria-label={`Coordinate triangle with auto-scaled axes. A (${pts[0].x.toFixed(1)}, ${pts[0].y.toFixed(1)}), B (${pts[1].x.toFixed(1)}, ${pts[1].y.toFixed(1)}), C (${pts[2].x.toFixed(1)}, ${pts[2].y.toFixed(1)}).` }>
   {Array.from({length:11},(_,i)=><g key={i}><line x1={i*30} y1='0' x2={i*30} y2='190' stroke='#d6e9e5' strokeWidth='.6'/><line x1='0' y1={i*19} x2='300' y2={i*19} stroke='#d6e9e5' strokeWidth='.6'/></g>)}
   {axisY>=0&&axisY<=190&&<line x1='0' y1={axisY} x2='300' y2={axisY} stroke='#64748b' strokeWidth='1'/>}{axisX>=0&&axisX<=300&&<line x1={axisX} y1='0' x2={axisX} y2='190' stroke='#64748b' strokeWidth='1'/>}
   <polygon points={pts.map(p=>`${sx(p.x)},${sy(p.y)}`).join(' ')} fill='rgba(74,34,199,.10)' stroke='#4a22c7' strokeWidth='1.6'/>
   {pts.map((p,i)=>{const px=sx(p.x),py=sy(p.y),anchor=px>244?'end':'start',labelX=px>244?px-6:px+6,labelY=py<24?py+14:py-6;return <g key={i}><circle cx={px} cy={py} r='4' fill='#2e8061'/><text x={labelX} y={labelY} textAnchor={anchor} fontSize='9' fill='#34433f'>{String.fromCharCode(65+i)}({p.x.toFixed(1)},{p.y.toFixed(1)})</text></g>;})}
  </svg></div>
  <div className='geometry-coordinates'>{[['Aₓ',ax,setAx],['Aᵧ',ay,setAy],['Bₓ',bx,setBx],['Bᵧ',by,setBy],['Cₓ',cx,setCx],['Cᵧ',cy,setCy]].map(([label,value,setter])=><label key={String(label)}>{String(label)}<input type='number' value={Number(value)} onChange={e=>(setter as (n:number)=>void)(Math.max(-8,Math.min(8,Number(e.target.value)||0)))}/></label>)}</div>
  <button type='button' className='visual-icon-button neumorphic' aria-label='Reset geometry test values' onClick={()=>{setAx(2);setAy(2);setBx(7);setBy(3);setCx(4);setCy(7);setDx(0);setDy(0);setRotation(0);}}>Reset test values</button>
  <label className='visual-field-label'>Translate X: {dx}</label><input className='visual-range' type='range' min='-4' max='4' value={dx} onChange={e=>setDx(Number(e.target.value))}/>
  <label className='visual-field-label'>Translate Y: {dy}</label><input className='visual-range' type='range' min='-4' max='4' value={dy} onChange={e=>setDy(Number(e.target.value))}/>
  <label className='visual-field-label'>Rotate: {rotation}°</label><input className='visual-range' type='range' min='0' max='360' value={rotation} onChange={e=>setRotation(Number(e.target.value))}/>
  <div className='visual-readout'><span>Triangle side lengths</span><strong>AB {dist(pts[0],pts[1]).toFixed(3)} · BC {dist(pts[1],pts[2]).toFixed(3)} · CA {dist(pts[2],pts[0]).toFixed(3)}</strong><strong>Area = {area.toFixed(3)} square units</strong></div>
  <label className='visual-field-label'>Circle radius: {radius}</label><input className='visual-range' type='range' min='1' max='8' value={radius} onChange={e=>setRadius(Number(e.target.value))}/>
  <div className='visual-readout'><span>Circle measurements</span><strong>Area = {(Math.PI*radius*radius).toFixed(3)} square units</strong><strong>Circumference = {(2*Math.PI*radius).toFixed(3)} units</strong></div>
 </>;
}

function SolidWorkspace() {
 const [kind,setKind]=useState('cylinder');
 const [radius,setRadius]=useState(3),[height,setHeight]=useState(6),[length,setLength]=useState(5),[width,setWidth]=useState(4);
 const volume=kind==='sphere'?(4/3)*Math.PI*radius**3:kind==='cylinder'?Math.PI*radius**2*height:kind==='cone'?Math.PI*radius**2*height/3:length*width*height;
 const area=kind==='sphere'?4*Math.PI*radius**2:kind==='cylinder'?2*Math.PI*radius*(radius+height):kind==='cone'?Math.PI*radius*(radius+Math.sqrt(radius**2+height**2)):2*(length*width+length*height+width*height);
 return <>
  <label className='visual-field-label' htmlFor='solid-kind'>Solid type</label><select id='solid-kind' className='surface-select' value={kind} onChange={e=>setKind(e.target.value)}><option value='sphere'>Sphere</option><option value='cylinder'>Cylinder</option><option value='cone'>Cone</option><option value='cuboid'>Cuboid</option></select>
  <div className='visual-plot-wrap'><svg viewBox='0 0 300 180' className='visual-plot' role='img' aria-label={`${kind} solid preview`}>
   {kind==='sphere'?<><ellipse cx='150' cy='88' rx='62' ry='62' fill='rgba(46,128,97,.13)' stroke='#2e8061' strokeWidth='2'/><ellipse cx='150' cy='88' rx='62' ry='22' fill='none' stroke='#4a22c7' strokeDasharray='4 3'/><ellipse cx='150' cy='88' rx='22' ry='62' fill='none' stroke='#2e8061' strokeDasharray='4 3'/></>:kind==='cylinder'?<><path d='M90 45 A60 17 0 0 1 210 45 L210 125 A60 17 0 0 1 90 125 Z' fill='rgba(46,128,97,.12)' stroke='#2e8061' strokeWidth='2'/><ellipse cx='150' cy='45' rx='60' ry='17' fill='rgba(74,34,199,.08)' stroke='#4a22c7' strokeWidth='2'/><ellipse cx='150' cy='125' rx='60' ry='17' fill='none' stroke='#2e8061' strokeWidth='2'/></>:kind==='cone'?<><path d='M150 25 L82 130 A68 20 0 0 0 218 130 Z' fill='rgba(46,128,97,.12)' stroke='#2e8061' strokeWidth='2'/><ellipse cx='150' cy='130' rx='68' ry='20' fill='rgba(74,34,199,.08)' stroke='#4a22c7' strokeWidth='2'/><line x1='150' y1='25' x2='150' y2='130' stroke='#4a22c7' strokeDasharray='4 3'/></>:<><path d='M75 65 L175 65 L225 35 L125 35 Z' fill='rgba(46,128,97,.10)' stroke='#2e8061' strokeWidth='2'/><path d='M75 65 L175 65 L175 125 L75 125 Z' fill='rgba(46,128,97,.14)' stroke='#2e8061' strokeWidth='2'/><path d='M175 65 L225 35 L225 95 L175 125 Z' fill='rgba(46,128,97,.08)' stroke='#2e8061' strokeWidth='2'/><path d='M125 35 L125 95 L75 125' fill='none' stroke='#4a22c7' strokeWidth='2' strokeDasharray='4 3'/></>}
  </svg></div>
  {kind!=='cuboid'&&<><label className='visual-field-label'>Radius: {radius}</label><input className='visual-range' type='range' min='1' max='10' step='.5' value={radius} onChange={e=>setRadius(Number(e.target.value))}/></>}
  {kind!=='sphere'&&<><label className='visual-field-label'>Height: {height}</label><input className='visual-range' type='range' min='1' max='12' step='.5' value={height} onChange={e=>setHeight(Number(e.target.value))}/></>}
  {kind==='cuboid'&&<div className='calculus-bounds'><label>Length<input type='number' min='1' value={length} onChange={e=>setLength(Math.max(1,Number(e.target.value)||1))}/></label><label>Width<input type='number' min='1' value={width} onChange={e=>setWidth(Math.max(1,Number(e.target.value)||1))}/></label></div>}
  <div className='visual-readout'><span>Volume</span><strong>{volume.toFixed(3)} cubic units</strong><span>Surface area</span><strong>{area.toFixed(3)} square units</strong><small>{kind==='sphere'?'V = 4πr³/3 · A = 4πr²':kind==='cylinder'?'V = πr²h · A = 2πr(r+h)':kind==='cone'?'V = πr²h/3 · A = πr(r + √(r²+h²))':'V = lwh · A = 2(lw+lh+wh)'}</small></div>
 </>;
}

function SurfaceWorkspace() {
  const [surface,setSurface] = useState('saddle');
  const [angle,setAngle] = useState(32);
  const [tilt,setTilt] = useState(24);
  const [resolution,setResolution] = useState(8);
  const presets: Record<string,(x:number,y:number)=>number> = {
    saddle:(x,y)=>x*x-y*y,
    bowl:(x,y)=>x*x+y*y,
    wave:(x,y)=>Math.sin(x)*Math.cos(y),
    cone:(x,y)=>Math.sqrt(x*x+y*y),
  };
  const project = (x:number,y:number,z:number) => {
    const a=angle*Math.PI/180, t=tilt*Math.PI/180;
    const u=x*Math.cos(a)-y*Math.sin(a);
    const v=x*Math.sin(a)+y*Math.cos(a);
    const verticalScale=surface==='cone'?18:10;
    return {x:150+u*22,y:104+v*9-z*verticalScale*Math.cos(t)};
  };
  const lines: React.ReactNode[]=[];
  if(surface==='cone'){
    // A cone is clearer with radial generators and circular level curves than a Cartesian grid.
    for(let ring=1;ring<=resolution;ring++){
      const radius=2*ring/resolution;
      const pts=[];
      for(let i=0;i<=96;i++){
        const theta=2*Math.PI*i/96;
        const x=radius*Math.cos(theta), y=radius*Math.sin(theta);
        const p=project(x,y,presets.cone(x,y));
        pts.push(`${i===0?'M':'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
      }
      lines.push(<path key={`cone-ring-${ring}`} d={pts.join(' ')} fill='none' stroke='#2e8061' strokeOpacity='.68' strokeWidth='.85'/>);
    }
    for(let spoke=0;spoke<resolution*2;spoke++){
      const theta=2*Math.PI*spoke/(resolution*2);
      const pts=[];
      for(let i=0;i<=48;i++){
        const radius=2*i/48, x=radius*Math.cos(theta), y=radius*Math.sin(theta);
        const p=project(x,y,presets.cone(x,y));
        pts.push(`${i===0?'M':'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
      }
      lines.push(<path key={`cone-spoke-${spoke}`} d={pts.join(' ')} fill='none' stroke='#4a22c7' strokeOpacity='.72' strokeWidth='.85'/>);
    }
  }else{
    for(let row=0;row<=resolution;row++){
      const fixed=-2+4*row/resolution;
      for(const axis of ['x','y'] as const){
        const pts=[];
        for(let i=0;i<=48;i++){
          const moving=-2+4*i/48;
          const x=axis==='x'?moving:fixed, y=axis==='x'?fixed:moving;
          const p=project(x,y,presets[surface](x,y)); pts.push(`${i===0?'M':'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
        }
        lines.push(<path key={`${axis}-${row}`} d={pts.join(' ')} fill='none' stroke={axis==='x'?'#4a22c7':'#2e8061'} strokeOpacity={.35+row/resolution*.45} strokeWidth='.85'/>);
      }
    }
  }
  return <div className='surface-workspace'>
    <label className='visual-field-label' htmlFor='surface-preset'>Surface model</label>
    <select id='surface-preset' value={surface} onChange={e=>setSurface(e.target.value)} className='surface-select'><option value='saddle'>Saddle · z = x² − y²</option><option value='bowl'>Paraboloid · z = x² + y²</option><option value='wave'>Wave · z = sin(x) cos(y)</option><option value='cone'>Cone · z = √(x² + y²)</option></select>
    <div className='visual-plot-wrap'><svg className='visual-plot surface-plot' viewBox='0 0 300 210' role='img' aria-label={`Projected 3D surface ${surface}`}>{lines}<circle cx='150' cy='104' r='2.5' fill='#c46b29'/></svg></div>
    <label className='visual-field-label'>Rotation: {angle}°</label><input className='visual-range' type='range' min='0' max='90' value={angle} onChange={e=>setAngle(Number(e.target.value))}/>
    <label className='visual-field-label'>Tilt: {tilt}°</label><input className='visual-range' type='range' min='10' max='55' value={tilt} onChange={e=>setTilt(Number(e.target.value))}/>
    <label className='visual-field-label'>Grid density: {resolution}</label><input className='visual-range' type='range' min='4' max='14' value={resolution} onChange={e=>setResolution(Number(e.target.value))}/>
    <p className='visual-disclaimer'>Locally rendered projected wireframe for learning; this is not a WebGL renderer and the displayed perspective is illustrative.</p>
  </div>;
}

function CalculusWorkspace({ expression, x }: { expression:string; x:number }) {
  const [a,setA] = useState(0);
  const [b,setB] = useState(2);
  const [tangent,setTangent] = useState(true);
  let y=NaN, derivative=NaN, integral=NaN, tangentPath='';
  let tangentMin=0, tangentMax=1;
  const tangentYToSvg=(value:number)=>130-((value-tangentMin)/(tangentMax-tangentMin))*110;
  try {
    y=evaluateGraphExpression(expression,x);
    const h=0.0005;
    derivative=(evaluateGraphExpression(expression,x+h)-evaluateGraphExpression(expression,x-h))/(2*h);
    if(Number.isFinite(y)&&Number.isFinite(derivative)) {
      const tangentStart=y-2*derivative, tangentEnd=y+2*derivative;
      const padding=Math.max(1,Math.abs(tangentEnd-tangentStart)*0.12);
      tangentMin=Math.min(tangentStart,tangentEnd,y)-padding;
      tangentMax=Math.max(tangentStart,tangentEnd,y)+padding;
      const pts=Array.from({length:41},(_,i)=>{const tx=x-2+4*i/40;const ty=y+derivative*(tx-x);return `${150+(tx-x)*55},${tangentYToSvg(ty)}`;});
      tangentPath=`M ${pts.join(' L ')}`;
    }
    const n=400, step=(b-a)/n; let sum=evaluateGraphExpression(expression,a)+evaluateGraphExpression(expression,b);
    for(let i=1;i<n;i++) sum+=(i%2===0?2:4)*evaluateGraphExpression(expression,a+i*step);
    integral=sum*step/3;
  } catch { y=NaN; derivative=NaN; integral=NaN; }
  return <div className='visual-info-panel'>
    <p>Numerical calculus tools for the function in the 2D Graph tab. Results use finite differences and Simpson’s rule.</p>
    <div className='visual-readout'><span>At x = {x.toFixed(3)}</span><strong>{Number.isFinite(y)?`f(x) ≈ ${y.toFixed(6)}`:'Function is undefined at this point'}</strong><strong>{Number.isFinite(derivative)?`f′(x) ≈ ${derivative.toFixed(6)}`:'Derivative unavailable'}</strong></div>
    <label className='visual-toggle'><input type='checkbox' checked={tangent} onChange={e=>setTangent(e.target.checked)}/> Show tangent-line preview</label>
    <div className='visual-plot-wrap'><svg viewBox='0 0 300 150' className='visual-plot' role='img' aria-label='Numerical tangent line preview'><line x1='10' y1='116' x2='290' y2='116' stroke='#aab8b5'/><line x1='150' y1='10' x2='150' y2='140' stroke='#aab8b5'/>{tangent&&Number.isFinite(y)&&Number.isFinite(derivative)&&<path d={tangentPath} fill='none' stroke='#4a22c7' strokeWidth='2.5'/>}{Number.isFinite(y)&&<circle cx='150' cy={tangentYToSvg(y)} r='4' fill='#2e8061'/>}<text x='12' y='14' fontSize='9' fill='#64748b'>Tangent preview</text></svg></div>
    <div className='calculus-bounds'><label>Lower bound a<input type='number' value={a} onChange={e=>setA(Number(e.target.value))}/></label><label>Upper bound b<input type='number' value={b} onChange={e=>setB(Number(e.target.value))}/></label></div>
    <div className='visual-readout'><span>Definite integral from {a} to {b}</span><strong>{Number.isFinite(integral)?`∫ f(x) dx ≈ ${integral.toFixed(6)}`:'Integral unavailable for this range'}</strong></div>
    <p className='visual-disclaimer'>Numerical approximations only. Discontinuities or highly oscillatory functions can reduce accuracy; this does not replace symbolic integration.</p>
  </div>;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Result is not finite');
  const clean = value === 0 ? 0 : value;
  return Number(clean.toPrecision(12)).toString();
}

function normalizeInput(input: string): string {
  return input.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-').trim();
}

function tokenize(input: string): Token[] {
  const source = normalizeInput(input);
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      let dots = 0;
      while (i < source.length && /[0-9.]/.test(source[i])) {
        if (source[i] === '.') dots += 1;
        i += 1;
      }
      if (dots > 1) throw new Error('Invalid decimal number');
      tokens.push({ type: 'number', value: source.slice(start, i) });
      continue;
    }

    if (ch === 'π' || ch === 'e') {
      tokens.push({ type: 'constant', value: ch });
      i += 1;
      continue;
    }

    if (ch === '+' || ch === '-') {
      tokens.push({ type: 'operator', value: ch });
      i += 1;
      continue;
    }

    if (ch === '*' || ch === '×') {
      tokens.push({ type: 'operator', value: '*' });
      i += 1;
      continue;
    }

    if (ch === '/' || ch === '÷') {
      tokens.push({ type: 'operator', value: '/' });
      i += 1;
      continue;
    }

    if (ch === '%') {
      tokens.push({ type: 'percent', value: '%' });
      i += 1;
      continue;
    }

    if (ch === '√') {
      tokens.push({ type: 'sqrt', value: '√' });
      i += 1;
      continue;
    }

    if (ch === '²') {
      tokens.push({ type: 'square', value: '²' });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')' });
      i += 1;
      continue;
    }

    if (/[A-Za-z]/.test(ch) || '^!°|∛³'.includes(ch)) {
      throw new Error('Unsupported operation');
    }

    throw new Error('Invalid calculation');
  }

  return tokens;
}

function evaluateBasicExpression(input: string): EvalResult {
  const tokens = tokenize(input);
  if (!tokens.length) throw new Error('Enter a calculation');

  let index = 0;
  let operationOrder = 0;
  let groupDepth = 0;
  const operations: CalculationOperation[] = [];
  const recordOperation = (text: string, kind: CalculationOperation['kind'], precedence: number, depth = groupDepth) => {
    operations.push({ text, kind, depth, precedence, order: operationOrder++ });
  };

  const canStartValue = (token?: Token) =>
    Boolean(token && ['number', 'constant', 'sqrt', 'lparen'].includes(token.type));
  const canEndValue = (token?: Token) =>
    Boolean(token && ['number', 'constant', 'rparen', 'percent', 'square'].includes(token.type));

  const parseExpression = (): Value => {
    let left = parseTerm();

    while (index < tokens.length && (tokens[index].value === '+' || tokens[index].value === '-')) {
      const op = tokens[index].value as '+' | '-';
      index += 1;
      const right = parseTerm();
      const adjustment = right.isPercent ? left.value * right.value : right.value;
      const value = op === '+' ? left.value + adjustment : left.value - adjustment;
      if (!Number.isFinite(value)) throw new Error('Result is not finite');

      if (right.isPercent) {
        recordOperation(
          right.text + ' of ' + formatNumber(left.value) + ' = ' + formatNumber(adjustment),
          'percentage',
          1
        );
      }

      const text = formatNumber(left.value) + ' ' + (op === '-' ? '−' : '+') + ' ' + formatNumber(adjustment);
      recordOperation(text + ' = ' + formatNumber(value), op === '+' ? 'addition' : 'subtraction', 3);
      left = { value, text: '(' + text + ')' };
    }

    return left;
  };

  const parseTerm = (): Value => {
    let left = parseUnary();

    while (index < tokens.length && (tokens[index].value === '*' || tokens[index].value === '/')) {
      const op = tokens[index].value as '*' | '/';
      index += 1;
      const right = parseUnary();
      if (op === '/' && right.value === 0) throw new Error('Cannot divide by zero');

      const value = op === '*' ? left.value * right.value : left.value / right.value;
      if (!Number.isFinite(value)) throw new Error('Result is not finite');

      const symbol = op === '*' ? '×' : '÷';
      const text = formatNumber(left.value) + ' ' + symbol + ' ' + formatNumber(right.value);
      recordOperation(text + ' = ' + formatNumber(value), op === '*' ? 'multiplication' : 'division', 2);
      left = { value, text: '(' + text + ')' };
    }

    return left;
  };

  const parseUnary = (): Value => {
    if (tokens[index]?.type === 'operator' && (tokens[index].value === '+' || tokens[index].value === '-')) {
      const op = tokens[index].value;
      index += 1;
      const inner = parseUnary();
      return {
        value: op === '-' ? -inner.value : inner.value,
        text: op + inner.text,
        isPercent: inner.isPercent,
      };
    }
    return parsePrimary();
  };

  const parsePrimary = (): Value => {
    const token = tokens[index];
    if (!token) throw new Error('Incomplete calculation');

    if (token.type === 'number') {
      index += 1;
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new Error('Invalid number');

      let result: Value = { value, text: token.value };
      if (tokens[index]?.type === 'square') {
        index += 1;
        const squared = value * value;
        if (!Number.isFinite(squared)) throw new Error('Result is not finite');
        result = { value: squared, text: token.value + '²' };
        recordOperation(token.value + '² = ' + formatNumber(squared), 'square', 0);
      }
      if (tokens[index]?.type === 'percent') {
        index += 1;
        result = { value: result.value / 100, text: result.text + '%', isPercent: true };
      }
      return result;
    }

    if (token.type === 'constant') {
      index += 1;
      const value = token.value === 'π' ? Math.PI : Math.E;
      let result: Value = { value, text: token.value };
      if (tokens[index]?.type === 'square') {
        index += 1;
        result = { value: value * value, text: token.value + '²' };
        recordOperation(token.value + '² = ' + formatNumber(result.value), 'square', 0);
      }
      if (tokens[index]?.type === 'percent') {
        index += 1;
        result = { value: result.value / 100, text: result.text + '%', isPercent: true };
      }
      return result;
    }

    if (token.type === 'sqrt') {
      index += 1;
      let argument: Value;
      if (tokens[index]?.type === 'lparen') {
        index += 1;
        groupDepth += 1;
        argument = parseExpression();
        if (tokens[index]?.type !== 'rparen') throw new Error('Missing closing parenthesis');
        index += 1;
        groupDepth -= 1;
      } else {
        argument = parsePrimary();
      }
      if (argument.value < 0) throw new Error('Square root requires a non-negative number');

      const value = Math.sqrt(argument.value);
      recordOperation('√' + argument.text + ' = ' + formatNumber(value), 'sqrt', 0);
      return { value, text: '√(' + argument.text + ')' };
    }

    if (token.type === 'lparen') {
      index += 1;
      groupDepth += 1;
      const inner = parseExpression();
      if (tokens[index]?.type !== 'rparen') throw new Error('Missing closing parenthesis');
      index += 1;
      groupDepth -= 1;

      let result: Value = { value: inner.value, text: '(' + inner.text + ')', isPercent: inner.isPercent };
      if (tokens[index]?.type === 'square') {
        index += 1;
        const squared = result.value * result.value;
        if (!Number.isFinite(squared)) throw new Error('Result is not finite');
        result = { value: squared, text: result.text + '²' };
        recordOperation(result.text + ' = ' + formatNumber(squared), 'square', 0);
      }
      if (tokens[index]?.type === 'percent') {
        index += 1;
        result = { value: result.value / 100, text: result.text + '%', isPercent: true };
      }
      return result;
    }

    throw new Error('Unexpected input');
  };

  const result = parseExpression();
  if (index < tokens.length) {
    const previous = tokens[index - 1];
    const next = tokens[index];
    if (canEndValue(previous) && canStartValue(next)) throw new Error('Invalid calculation');
    throw new Error('Unsupported operation');
  }

  return { value: result.value, operations };
}

function evaluateExpression(input: string, angleMode: 'DEG' | 'RAD' | 'GRAD' = 'DEG'): EvalResult {
  const source = normalizeInput(input).replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  const tokens: string[] = [];
  const pattern = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|sin|cos|tan|cot|sec|csc|asin|acos|atan|arcsin|arccos|arctan|log10|log|ln|sqrt|cbrt|abs|mod|pi|π|e|[()+\-*/^%!²³∛√]/gi;
  let cursor = 0;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) { cursor += 1; continue; }
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (!match || match.index !== cursor) throw new Error('Unsupported character or function near: ' + source.slice(cursor, cursor + 8));
    tokens.push(match[0]);
    cursor = pattern.lastIndex;
  }
  if (!tokens.length) throw new Error('Enter a calculation');
  const ops: CalculationOperation[] = [];
  let index = 0;
  const record = (label: string, kind: CalculationOperation['kind'] = 'calculation', precedence = 0) => ops.push({text: label,kind,depth:0,precedence,order:ops.length});
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const isFn = (s?: string) => Boolean(s && /^(sin|cos|tan|cot|sec|csc|asin|acos|atan|arcsin|arccos|arctan|log10|log|ln|sqrt|cbrt|abs|mod)$/i.test(s));
  const finite = (n: number) => { if (!Number.isFinite(n)) throw new Error('Result is not finite'); return n; };
  const fact = (n: number) => { if (n < 0 || !Number.isInteger(n)) throw new Error('Factorial requires a non-negative integer'); if (n > 170) throw new Error('Factorial is limited to 170!'); let v=1; for(let i=2;i<=n;i++) v*=i; return v; };
  const parseAdd = (): Value => {
    let left = parseMul();
    while (peek() === '+' || peek() === '-') {
      const op = take()!; const right = parseMul(); const v=finite(op==='+'?left.value+right.value:left.value-right.value);
      record(formatNumber(left.value)+' '+op+' '+formatNumber(right.value)+' = '+formatNumber(v),op==='+'?'addition':'subtraction',3);
      left={value:v,text:'('+left.text+' '+op+' '+right.text+')'};
    }
    return left;
  };
  const parseMul = (): Value => {
    let left = parseUnary();
    while (['*','/','%','mod'].includes((peek()||'').toLowerCase())) {
      const op=take()!.toLowerCase(); const right=parseUnary();
      if ((op==='/'||op==='mod'||op==='%') && right.value===0) throw new Error(op==='/'?'Cannot divide by zero':'Modulo by zero is undefined');
      const v=finite(op==='*'?left.value*right.value:op==='/'?left.value/right.value:left.value%right.value);
      record(formatNumber(left.value)+' '+(op==='*'?'×':op==='/'?'÷':'mod')+' '+formatNumber(right.value)+' = '+formatNumber(v),op==='*'?'multiplication':op==='/'?'division':'calculation',2);
      left={value:v,text:'('+left.text+' '+op+' '+right.text+')'};
    }
    return left;
  };
  const parseUnary = (): Value => {
    if (peek()==='+' || peek()==='-') { const op=take()!; const a=parseUnary(); return {value:op==='-'?-a.value:a.value,text:op+a.text}; }
    return parsePower();
  };
  const parsePower = (): Value => {
    let left=parsePostfix();
    if (peek()==='^') { take(); const right=parseUnary(); const v=finite(Math.pow(left.value,right.value)); record(formatNumber(left.value)+' ^ '+formatNumber(right.value)+' = '+formatNumber(v),'calculation',1); left={value:v,text:'('+left.text+'^'+right.text+')'}; }
    return left;
  };
  const parsePostfix = (): Value => {
    let v=parsePrimary();
    while (peek()==='!' || peek()==='²' || peek()==='³' || peek()==='%') {
      const op=take()!;
      if(op==='!') { const n=fact(v.value); record(formatNumber(v.value)+'! = '+formatNumber(n)); v={value:n,text:v.text+'!'}; }
      else if(op==='²'||op==='³') { const n=finite(Math.pow(v.value,op==='²'?2:3)); record(v.text+op+' = '+formatNumber(n),'square'); v={value:n,text:v.text+op}; }
      else { v={value:v.value/100,text:v.text+'%',isPercent:true}; }
    }
    return v;
  };
  const parsePrimary = (): Value => {
    const token=peek();
    if(!token) throw new Error('Incomplete calculation');
    if(token==='(') { take(); const v=parseAdd(); if(peek()!==')') throw new Error('Missing closing parenthesis'); take(); return {value:v.value,text:'('+v.text+')',isPercent:v.isPercent}; }
    if(token==='√'||token==='∛') { take(); let a:Value; if(peek()==='(') a=parsePrimary(); else a=parsePrimary(); if(token==='√'&&a.value<0) throw new Error('Square root requires a non-negative number'); const n=finite(token==='√'?Math.sqrt(a.value):Math.cbrt(a.value)); record(token+a.text+' = '+formatNumber(n),'sqrt'); return {value:n,text:token+'('+a.text+')'}; }
    if(isFn(token)) {
      const fn=take()!.toLowerCase();
      let arg:Value;
      if(peek()==='(') { take(); arg=parseAdd(); if(peek()!==')') throw new Error('Missing closing parenthesis in function argument'); take(); } else arg=parseUnary();
      const x=arg.value; let n:number;
      const rad=angleMode==='DEG'?x*Math.PI/180:angleMode==='GRAD'?x*Math.PI/200:x;
      const fromRad=(a:number)=>angleMode==='DEG'?a*180/Math.PI:angleMode==='GRAD'?a*200/Math.PI:a;
      if(fn==='sin') n=Math.sin(rad); else if(fn==='cos') n=Math.cos(rad); else if(fn==='tan') { if(Math.abs(Math.cos(rad))<1e-14) throw new Error('tan is undefined at this angle'); n=Math.tan(rad); }
      else if(fn==='cot') { if(Math.abs(Math.sin(rad))<1e-14) throw new Error('cot is undefined at this angle'); n=1/Math.tan(rad); }
      else if(fn==='sec') { if(Math.abs(Math.cos(rad))<1e-14) throw new Error('sec is undefined at this angle'); n=1/Math.cos(rad); }
      else if(fn==='csc') { if(Math.abs(Math.sin(rad))<1e-14) throw new Error('csc is undefined at this angle'); n=1/Math.sin(rad); }
      else if(['asin','arcsin'].includes(fn)) { if(Math.abs(x)>1) throw new Error('Inverse sine requires a value from -1 to 1'); n=fromRad(Math.asin(x)); }
      else if(['acos','arccos'].includes(fn)) { if(Math.abs(x)>1) throw new Error('Inverse cosine requires a value from -1 to 1'); n=fromRad(Math.acos(x)); }
      else if(['atan','arctan'].includes(fn)) n=fromRad(Math.atan(x));
      else if(fn==='log10'||fn==='log') { if(x<=0) throw new Error('Logarithm requires a positive number'); n=Math.log10(x); }
      else if(fn==='ln') { if(x<=0) throw new Error('Natural logarithm requires a positive number'); n=Math.log(x); }
      else if(fn==='sqrt') { if(x<0) throw new Error('Square root requires a non-negative number'); n=Math.sqrt(x); }
      else if(fn==='cbrt') n=Math.cbrt(x);
      else if(fn==='abs') n=Math.abs(x);
      else throw new Error('Unsupported function');
      n=finite(n); record(fn+'('+formatNumber(x)+') = '+formatNumber(n),'calculation',0); return {value:n,text:fn+'('+arg.text+')'};
    }
    if(/^(pi|π|e)$/i.test(token)) { take(); const n=token.toLowerCase()==='e'?Math.E:Math.PI; return {value:n,text:token}; }
    if(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) { take(); const n=Number(token); if(!Number.isFinite(n)) throw new Error('Invalid number'); return {value:n,text:token}; }
    if(/^[A-Za-z]+$/.test(token)) throw new Error('Unknown function: '+token);
    throw new Error('Unexpected input: '+token);
  };
  const result=parseAdd();
  if(index<tokens.length) throw new Error('Unexpected input: '+tokens[index]);
  return {value:finite(result.value),operations:ops};
}

function cleanStepText(step: string): string {
  const parts = step.split(' = ');
  if (parts.length !== 2) return step;
  const left = parts[0].replace(/\s+/g, ' ').replace(/\(+/g, '(').replace(/\)+/g, ')').trim();
  return left + ' = ' + parts[1];
}

function teachingHeading(operation: CalculationOperation): string {
  if (operation.depth > 1) return 'Parentheses';
  if (operation.depth === 1 && (operation.kind === 'addition' || operation.kind === 'subtraction')) return 'Parentheses';
  if (operation.kind === 'percentage') return 'Percentage';
  if (operation.kind === 'sqrt') return 'Square root';
  if (operation.kind === 'square') return 'Square';
  if (operation.kind === 'division') return 'Division';
  if (operation.kind === 'multiplication') return 'Multiplication';
  if (operation.kind === 'addition') return 'Addition';
  if (operation.kind === 'subtraction') return 'Subtraction';
  return 'Calculation';
}

function buildTeachingSteps(operations: CalculationOperation[]): TeachingStep[] {
  const ordered = [...operations].sort((a, b) => b.depth - a.depth || a.precedence - b.precedence || a.order - b.order);
  const groups: TeachingStep[] = [];

  ordered.forEach(operation => {
    const text = cleanStepText(operation.text);
    const heading = teachingHeading(operation);
    const last = groups[groups.length - 1];

    if (last && last.heading === heading) {
      last.lines.push(text);
    } else {
      groups.push({ heading, lines: [text] });
    }
  });

  return groups;
}

function containsMathMarkup(value: string): boolean {
  return /\\(?:frac|dfrac|tfrac|sqrt|text|mathrm|mathbf|begin|end|left|right|cdot|times|div|pm|leq|geq|neq|approx|sum|prod|int|lim|sin|cos|tan|log|ln|det|implies|Rightarrow|rightarrow|leftarrow|therefore)|[\^_{}]/.test(value);
}

function normalizeLatexSource(value: string): string {
  return value.replace(/\$/g, '')
    // Strip math wrappers without damaging LaTeX commands or row separators inside environments.
    .replace(/\\\\\[|\\\\\]|\\\\\(|\\\\\)/g, '')
    .replace(/\\displaystyle\s*/g, '')
    .replace(/\\left\b/g, '')
    .replace(/\\right\b/g, '')
    .replace(/\bsqrt\s*\(([^()]*)\)/g, '\\\\sqrt{$1}')
    .replace(/\\\\begin\s*\{cases\}/g, '\\\\begin{cases}')
    .replace(/\\\\end\s*\{cases\}/g, '\\\\end{cases}');
}

function renderMath(value: string, displayMode = false): string {
  const source = normalizeLatexSource(value.trim());
  if (!source || !containsMathMarkup(source)) return '';
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: true,
      strict: false,
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return '';
  }
}

function MathDisplay({ value, display = false, className = '' }: { value: string; display?: boolean; className?: string }) {
  const source = normalizeLatexSource(value.trim());
  if (!source) return null;
  // KaTeX environments such as cases/aligned must be rendered as a single block; splitting their rows breaks the environment.
  if (/\\begin\s*\{(?:cases|aligned|array|matrix|pmatrix|bmatrix)\}/.test(source)) {
    const html = renderMath(source, true);
    return html
      ? <span className={'math-rendered ' + className} dangerouslySetInnerHTML={{ __html: html }} />
      : <span className={className}>{source}</span>;
  }
  // Split only on actual line breaks, never on LaTeX command backslashes.
  const lines = source.split(/\r?\n+/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    return <span className={'math-rendered ' + className}>{lines.map((line, index) => {
      const html = renderMath(line, display);
      const fallback = line.replace(/\\implies\b/g, '⇒').replace(/\\Rightarrow\b/g, '⇒').replace(/\\rightarrow\b/g, '→').replace(/\\leftarrow\b/g, '←');
      return <span key={index} className={html ? 'math-rendered-line' : 'math-rendered-line math-rendered-fallback'}>{html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : fallback}{index < lines.length - 1 && <br />}</span>;
    })}</span>;
  }
  const html = renderMath(source, display);
  if (!html) {
    const fallback = source.replace(/\\implies\b/g, '⇒').replace(/\\Rightarrow\b/g, '⇒').replace(/\\rightarrow\b/g, '→').replace(/\\leftarrow\b/g, '←');
    return <span className={className}>{fallback}</span>;
  }
  return <span className={'math-rendered ' + className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function AlternativeMethodDisplay({ value }: { value: string }) {
  const normalized = value
    .replace(/\\\[\s*([\s\S]*?)\\\]/g, '$1')
    .replace(/\\\(\s*([\s\S]*?)\\\)/g, '$1')
    .replace(/\\displaystyle\s*/g, '')
    .replace(/\bsqrt\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '\\sqrt{$1}')
    .replace(/\bCheck\s*(?=x\s*=)/gi, 'Check ')
    .replace(/\s+(?=(?:Case\s*[12]:|Roots?\s+are\b|Verification\b|For\s+x\s*=|Check\s+x\s*=))/gi, '\n')
    .replace(/\.\s+(?=(?:Case\s*[12]:|Roots?\s+are\b|Verification\b|For\s+x\s*=|Check\s+x\s*=))/gi, '.\n')
    .trim();
  const lines = normalized
    .split(/\n+|(?<=[.;])\s+(?=[A-Z])/)
    .map(line => line.trim())
    .filter(Boolean);

  return (
    <div className="ai-alternative-lines">
      {lines.map((line, index) => {
        const checkMatch = line.match(/^Check\s*x\s*=\s*([^:]+)\s*:?\s*(.*)$/i);
        if (checkMatch) {
          const label = 'Check x = ' + checkMatch[1].trim();
          const equation = checkMatch[2].trim();
          return (
            <div key={index} className="ai-alternative-equation ai-alternative-check">
              <div className="ai-alternative-prefix">{label}</div>
              {equation && <MathDisplay value={equation} display className="ai-alternative-math" />}
            </div>
          );
        }

        const hasFormulaMarkup = containsMathMarkup(line);
        if (!hasFormulaMarkup) return <p key={index} className="ai-alternative-text">{line}</p>;

        const prefixMatch = line.match(/^([^:=]{1,48}:)\s*(?=(?:x|[a-zA-Z])\s*=)/);
        const prefix = prefixMatch?.[1] ?? '';
        const formula = prefix ? line.slice(prefix.length).trim() : line;
        const cleanedFormula = formula
          .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, '$1')
          .replace(/\\,/g, '\\,')
          .replace(/\\;/g, '\\;');

        return (
          <div key={index} className="ai-alternative-equation">
            {prefix && <div className="ai-alternative-prefix">{prefix}</div>}
            <MathDisplay value={cleanedFormula} display className="ai-alternative-math" />
          </div>
        );
      })}
    </div>
  );
}

function VerificationDisplay({ value }: { value: string }) {
  const lines = value
    .replace(/\\geq?\b/g, '>=')
    .replace(/\\leq?\b/g, '<=')
    .replace(/\\neq\b/g, '!=')
    .replace(/Result:\s*(Valid|Invalid)\b/gi, 'Result $1')
    .replace(/\bCheck\s*(?=x\s*=)/gi, 'Check ')
    .replace(/\s*:\s*(?=\s*[^\n]*[=])/g, ':\n')
    .replace(/\s+(?=(?:Branch\s*[12]\b|Valid\s*:|Invalid\.?\s*$|Invalid for this branch\.?|Final solution\b|Evaluate f\s*\())/gim, '\n')
    .replace(/\s+(?=x\s*=\s*[-+]?\d+(?:\.\d+)?\s+(?:satisfies|does not satisfy|is valid|is invalid)\b)/gi, '\n')
    .replace(/\s+and\s+(?=(?:x\s*=|[-+]?\d+\s*(?:\\geq|\\leq|>=|<=|<|>|\\neq|!=|=)))/gi, '\n')
    .replace(/\s+or\s+(?=x\s*=)/gi, '\nor ')
    .replace(/Candidate\s+(x\s*=\s*[-+]?\d+(?:\.\d+)?)\s+from\s+Branch\s*([12])/gi, 'Branch $2 candidate: $1')
    .replace(/\bBranch\s*1\s*:\s*(?=x\s*=\s*-)/gi, 'Branch 1 candidate (negative root):\n')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])|;\s+/)
    .map(line => line.trim())
    .filter(Boolean);

  return (
    <div className="ai-verification-lines">
      {lines.map((line, index) => {
        const checkMatch = line.match(/^Check\s*(x\s*=\s*[^:]+)\s*:?\s*(.*)$/i);
        if (checkMatch) {
          const label = 'Check ' + checkMatch[1].trim();
          const equation = checkMatch[2].trim();
          return (
            <div key={index} className="ai-verification-line ai-verification-check">
              <div className="ai-verification-label">{label}</div>
              {equation && <MathDisplay value={equation} display className="ai-verification-equation" />}
            </div>
          );
        }
        return (
          <div key={index} className="ai-verification-line">
            <MathDisplay value={line} />
          </div>
        );
      })}
    </div>
  );
}

function renderError(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid calculation';
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<HistoryEntry>;
  return typeof entry.id === 'string'
    && typeof entry.expression === 'string'
    && typeof entry.result === 'string'
    && typeof entry.timestamp === 'number'
    && Number.isFinite(entry.timestamp)
    && (entry.steps === undefined || (Array.isArray(entry.steps) && entry.steps.every(step => typeof step === 'string')));
}

function isAiStep(value: unknown): value is AiStep {
  if (!value || typeof value !== 'object') return false;
  const step = value as Record<string, unknown>;
  const validTypes = new Set([
    'problem_setup','problem_decomposition','method_selection','interpretation','case_analysis','assumption',
    'formula','definition','substitution','transformation','expansion','factorization',
    'simplification','calculation','conversion','differentiation','integration',
    'evaluation','matrix_operation','statistical_calculation','numerical_iteration','comparison','conclusion','final_calculation'
  ]);
  return typeof step.type === 'string'
    && validTypes.has(step.type)
    && typeof step.label === 'string'
    && typeof step.expression === 'string'
    && typeof step.explanation === 'string';
}

function isAiMathResult(value: unknown): value is AiMathResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  const status = result.status;
  const validStatus = status === 'solved' || status === 'needs_clarification' || status === 'incomplete' || status === 'unable_to_solve';
  return validStatus
    && typeof result.problem === 'string'
    && typeof result.domain === 'string'
    && typeof result.subdomain === 'string'
    && typeof result.difficulty === 'string'
    && typeof result.method === 'string'
    && typeof result.answerType === 'string'
    && typeof result.interpretation === 'string'
    && typeof result.teachingNote === 'string'
    && typeof result.alternativeMethod === 'string'
    && Array.isArray(result.steps)
    && result.steps.every(isAiStep)
    && typeof result.finalCalculation === 'string'
    && typeof result.answer === 'string'
    && typeof result.verification === 'string';
}

function App() {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [expression, setExpression] = useState('');
  const [angleMode, setAngleMode] = useState<'DEG' | 'RAD' | 'GRAD'>(() => {
    try { const saved = window.localStorage.getItem('netcalc-angle-mode'); return saved === 'RAD' || saved === 'GRAD' ? saved : 'DEG'; } catch { return 'DEG'; }
  });
  const [cursorPosition, setCursorPosition] = useState(0);
  const [steps, setSteps] = useState<string[]>([]);
  const [workingExpanded, setWorkingExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [scientificOpen, setScientificOpen] = useState(false);
  const [scientificPosition, setScientificPosition] = useState<{x:number;y:number}|null>(null);
  const scientificDragRef = useRef<{pointerX:number;pointerY:number;originX:number;originY:number;moved:boolean;wasOpen:boolean}|null>(null);
  const scientificSuppressClickRef = useRef(false);
  const startScientificFabDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    scientificDragRef.current = {pointerX:event.clientX,pointerY:event.clientY,originX:rect.left,originY:rect.top,moved:false,wasOpen:scientificOpen};
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Continue with bubbled pointer events if capture is unavailable. */ }
  };
  const moveScientificFabDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = scientificDragRef.current;
    if (!drag) return;
    const dx = event.clientX-drag.pointerX;
    const dy = event.clientY-drag.pointerY;
    if (Math.abs(dx)>3 || Math.abs(dy)>3) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setScientificPosition({x:Math.max(6,Math.min(window.innerWidth-rect.width-6,drag.originX+dx)),y:Math.max(76,Math.min(window.innerHeight-rect.height-8,drag.originY+dy))});
  };
  const endScientificFabDrag = () => {
    if (scientificDragRef.current?.moved) scientificSuppressClickRef.current = true;
    scientificDragRef.current = null;
  };
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openSymbolGroup, setOpenSymbolGroup] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyStepsOpen, setHistoryStepsOpen] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [historyStorageError, setHistoryStorageError] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = window.localStorage.getItem(HISTORY_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isHistoryEntry).slice(0, MAX_HISTORY_ITEMS).map(entry => ({ ...entry, steps: Array.isArray(entry.steps) ? entry.steps : [entry.expression, '= ' + entry.result] })) : [];
    } catch {
      return [];
    }
  });

  const [aiOpen, setAiOpen] = useState(false);
  const [localAlgebraOpen, setLocalAlgebraOpen] = useState(false);
  const [aiProblem, setAiProblem] = useState('');
  const [aiResult, setAiResult] = useState<AiMathResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiEngineStatus, setAiEngineStatus] = useState<'local' | 'online' | null>(null);
  const [aiCopied, setAiCopied] = useState<'answer' | 'working' | null>(null);
  const [visualOpen, setVisualOpen] = useState(false);


  useEffect(() => {
    const updateConnectivity = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);



  const editorRef = useRef<HTMLTextAreaElement>(null);
  const aiRequestRef = useRef(0);
  const expressionRef = useRef(expression);
  const instantStepsRef = useRef<string[]>([]);
  const historyRef = useRef<HistoryEntry[]>(history);
  expressionRef.current = expression;
  historyRef.current = history;

  // Commit durable history before updating visible state, so a storage failure never
  // makes an unsaved save/delete/clear look successful.
  const saveSymbolicHistory = (operation: LocalAlgebraOperation, sourceExpression: string, resultText: string, symbolicSteps: { title: string; expression: string; explanation: string }[], verificationText: string | null): boolean => {
    const operationLabel = operation.charAt(0).toUpperCase() + operation.slice(1);
    const historyExpression = sourceExpression.trim();
    const historySteps = [operationLabel + ': ' + historyExpression, ...symbolicSteps.flatMap(step => ['STEP:' + step.title, step.expression, step.explanation]), '= ' + resultText, ...(verificationText ? ['Verification: ' + verificationText] : [])];
    const existing = historyRef.current.find(item => item.expression === historyExpression && item.result === resultText && item.steps[0] === operationLabel + ': ' + historyExpression);
    if (existing) return true;
    const entry: HistoryEntry = { id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8), expression: historyExpression, result: resultText, timestamp: Date.now(), steps: historySteps };
    return commitHistory([entry, ...historyRef.current]);
  };

  const commitHistory = (next: HistoryEntry[]): boolean => {
    try {
      const bounded = next.slice(0, MAX_HISTORY_ITEMS);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(bounded));
      historyRef.current = bounded;
      setHistory(bounded);
      setHistoryStorageError(false);
      return true;
    } catch {
      setHistoryStorageError(true);
      return false;
    }
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      setHistoryStorageError(false);
    } catch {
      // Calculations remain available, but failed persistence must be visible.
      setHistoryStorageError(true);
    }
  }, [history]);

  // Live preview is derived from the same deterministic evaluator as the equals action.
  // Incomplete expressions stay quiet while the user is still typing.
  const instantSteps = (() => {
    if (!expression.trim()) return [] as string[];
    try {
      const result = evaluateExpression(expression, angleMode);
      if (!Number.isFinite(result.value)) return [] as string[];
      const resultText = formatNumber(result.value);
      const teachingSteps = buildTeachingSteps(result.operations);
      return [
        expression,
        ...teachingSteps.flatMap(group => ['STEP:' + group.heading, ...group.lines]),
        '= ' + resultText,
      ];
    } catch {
      return [] as string[];
    }
  })();
  instantStepsRef.current = instantSteps;
  const visibleSteps = steps.length > 0 ? steps : instantSteps;
  const instantAnswer = instantSteps.find(step => step.startsWith('= '))?.slice(2) ?? null;
  const completedAnswer = steps.find(step => step.startsWith('= '))?.slice(2) ?? null;
  const displayedAnswer = completedAnswer ?? instantAnswer;
  const hasWorking = visibleSteps.some(step => step.startsWith('STEP:'));

  const saveCurrentCalculation = () => {
    const currentExpression = expression.trim();
    const currentSteps = instantSteps;
    const answerLine = currentSteps.find(step => step.startsWith('= '));
    if (!currentExpression || !answerLine || currentSteps.length < 2) return;
    const resultText = answerLine.slice(2);
    const existing = history.find(item => item.expression === currentExpression && item.result === resultText);
    if (existing) return;
    const entry: HistoryEntry = { id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8), expression: currentExpression, result: resultText, timestamp: Date.now(), steps: [currentExpression, ...currentSteps.filter(step => step !== currentExpression), '✓ CALCULATED'] };
    const next = [entry, ...historyRef.current.filter(item => item.expression !== currentExpression)];
    commitHistory(next);
  };

  const clearWorkspace = () => {
    setExpression('');
    setCursorPosition(0);
    setSteps([]);
    setError(null);
    setSelectedFunction(null);
    setWorkingExpanded(false);
  };

  const updateExpression = (next: string, cursor = next.length) => {
    setExpression(next);
    setCursorPosition(cursor);
    setSteps([]);
    setError(null);
    setSelectedFunction(null);
    setWorkingExpanded(false);
  };

  const insertAtCursor = (value: string) => {
    const next = expression.slice(0, cursorPosition) + value + expression.slice(cursorPosition);
    updateExpression(next, cursorPosition + value.length);
  };

  const insertSymbol = (symbol: string) => {
    setFunctionsOpen(false);
    insertAtCursor(symbol);
  };

  const moveCursor = (direction: 'left' | 'right') => {
    const next = direction === 'left'
      ? Math.max(0, cursorPosition - 1)
      : Math.min(expression.length, cursorPosition + 1);
    setCursorPosition(next);
    requestAnimationFrame(() => editorRef.current?.setSelectionRange(next, next));
  };

  const applyPastedExpression = (raw: string) => {
    const pasted = raw.trim();
    if (!pasted) return;

    const next = expression.slice(0, cursorPosition) + pasted + expression.slice(cursorPosition);
    updateExpression(next, cursorPosition + pasted.length);

    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(cursorPosition + pasted.length, cursorPosition + pasted.length);
    });
  };

  const calculate = () => {
    if (!expression.trim()) {
      setError('Enter a calculation');
      return;
    }

    try {
      const result = evaluateExpression(expression, angleMode);
      if (!Number.isFinite(result.value)) throw new Error('Result is not finite');

      const resultText = formatNumber(result.value);
      const teachingSteps = buildTeachingSteps(result.operations);

      setSteps([
        ...teachingSteps.flatMap(group => ['STEP:' + group.heading, ...group.lines]),
        '= ' + resultText,
        '✓ CALCULATED',
      ]);
      setWorkingExpanded(false);

      const entry: HistoryEntry = {
        id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
        expression, result: resultText, timestamp: Date.now(),
        steps: [expression, ...teachingSteps.flatMap(group => ['STEP:' + group.heading, ...group.lines]), '= ' + resultText, '✓ CALCULATED'],
      };
      commitHistory([entry, ...historyRef.current.filter(item => item.expression !== expression)]);
      setError(null);
      setSelectedFunction(null);
    } catch (err) {
      setSteps([]);
      setError(renderError(err));
    }
  };

  const restoreHistory = (entry: HistoryEntry) => {
    setFunctionsOpen(false);
    setHistoryOpen(false);
    updateExpression(entry.expression);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(entry.expression.length, entry.expression.length);
    });
  };

  const deleteHistoryEntry = (id: string) => {
    const next = historyRef.current.filter(item => item.id !== id);
    if (commitHistory(next)) setConfirmClearHistory(false);
  };

  const clearHistory = () => {
    if (commitHistory([])) setConfirmClearHistory(false);
  };

  const closeAi = () => {
    aiRequestRef.current += 1;
    setAiOpen(false);
    setAiLoading(false);
    setAiError(null);
    setAiResult(null);
    setAiEngineStatus(null);
    setVisualOpen(false);
    setAiProblem('');
  };

  const openAi = () => {
    setFunctionsOpen(false);
    setOpenCategory(null);
    setOpenSymbolGroup(null);
    setAiOpen(true);
    setAiError(null);
  };

  const solveAi = async (requestedProblem?: string) => {
    const problem = (requestedProblem ?? aiProblem).trim();
    if (!problem) {
      setAiError('Enter a mathematics problem.');
      return;
    }
    if (aiLoading) return;

    const requestId = aiRequestRef.current + 1;
    aiRequestRef.current = requestId;
    setAiLoading(true);
    setAiError(null);
    // Keep the last successful result in state during a new request. It remains
    // available if this request fails, rather than being discarded prematurely.
    setAiCopied(null);
    setAiEngineStatus(null);
    setVisualOpen(false);

    const localRequest = classifyLocalRequest(problem);
    if (localRequest) {
      setAiEngineStatus('local');
      try {
        const normalizedExpression = localRequest.expression;
        const value = await runLocalAlgebra(normalizedExpression, localRequest.operation);
        if (requestId !== aiRequestRef.current) return;
        const check = checkLocalResult(normalizedExpression, value, localRequest.operation);
        const breakdown = buildLocalSolutionSteps(normalizedExpression, value, localRequest.operation);
        const localSteps: AiStep[] = breakdown.steps.map((step, index) => ({
          type: index === 0 ? 'problem_setup' : index === breakdown.steps.length - 1 ? 'conclusion' : 'transformation',
          label: step.title,
          expression: step.expression,
          explanation: step.explanation
        }));
        const localResult: AiMathResult = {
          status: 'solved',
          problem,
          domain: 'Algebra',
          subdomain: localRequest.operation,
          difficulty: 'Local',
          method: 'Local symbolic engine (Nerdamer)',
          answerType: localRequest.operation === 'solve' ? 'Candidate solution set' : 'Symbolic expression',
          interpretation: 'Recognized a supported algebra command and processed it locally in this browser. No online AI request was made.',
          steps: localSteps,
          finalCalculation: value,
          answer: value,
          verification: check.message,
          verificationStatus: check.status,
          teachingNote: breakdown.detailed ? 'Review each displayed transformation; the independent numeric check is not a formal symbolic proof.' : 'The local engine returned a result, but complete intermediate derivation is not available for this expression.',
          alternativeMethod: ''
        };
        setAiResult(localResult);
      } catch (err) {
        if (requestId !== aiRequestRef.current) return;
        setAiError(err instanceof Error ? err.message : 'The local algebra engine could not process this request. No online request was sent.');
      } finally {
        if (requestId === aiRequestRef.current) setAiLoading(false);
      }
      return;
    }

    setAiEngineStatus('online');
    try {
      const response = await api.post('/api/ai/math', { problem });
      if (requestId !== aiRequestRef.current) return;

      const data: unknown = response.data;
      if (!isAiMathResult(data)) {
        throw new Error('Unable to format the solution. Try again.');
      }

      if (data.status === 'solved' && (!data.steps.length || !data.finalCalculation.trim() || !data.answer.trim() || !data.verification.trim())) {
        throw new Error('The mathematical result was incomplete or inconsistent. Try again.');
      }
      // The AI service supplies its own verification narrative; NetCalc has not
      // independently verified arbitrary online solutions, so label that honestly.
      setAiResult({ ...data, verificationStatus: 'not_checked' });
    } catch (err) {
      if (requestId !== aiRequestRef.current) return;
      setAiError(err instanceof Error ? err.message : 'Online mathematical processing failed. Your previous work is preserved; retry only when you choose.');
    } finally {
      if (requestId === aiRequestRef.current) setAiLoading(false);
    }
  };

  const copyAiText = async (kind: 'answer' | 'working') => {
    if (!aiResult) return;
    const text = kind === 'answer'
      ? aiResult.answer
      : aiResult.steps.map(step => step.expression).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setAiCopied(kind);
      window.setTimeout(() => setAiCopied(current => current === kind ? null : current), 1600);
    } catch {
      setAiError('Copy is unavailable on this device.');
    }
  };

  const useAiAnswerInCalculator = () => {
    if (!aiResult || aiResult.status !== 'solved') return;
    const value = aiResult.answer.trim();
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return;
    updateExpression(value);
    setAiOpen(false);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const selectFunction = (fn: string) => {
    setFunctionsOpen(false);
    setError(null);

    if (fn === 'Professional Mathematical Center') {
      return;
    }

    if (fn === 'π' || fn === 'e' || fn === '√') {
      insertAtCursor(fn);
      return;
    }

    if (fn === 'x²') {
      if (!expression.trim()) {
        setSelectedFunction(fn);
        setError('Enter a value or expression first');
        return;
      }
      updateExpression('(' + expression + ')²');
      setSelectedFunction(fn);
      return;
    }

    if (fn === '1/x') {
      if (!expression.trim()) {
        setSelectedFunction(fn);
        setError('Enter a value or expression first');
        return;
      }
      updateExpression('1/(' + expression + ')');
      setSelectedFunction(fn);
    }
  };

  const onKey = (value: string) => {
    if (value === 'AC') {
      clearWorkspace();
      return;
    }

    if (value === 'DEL' || value === '←') {
      if (cursorPosition <= 0) return;
      const next = expression.slice(0, cursorPosition - 1) + expression.slice(cursorPosition);
      const nextCursor = cursorPosition - 1;
      updateExpression(next, nextCursor);
      requestAnimationFrame(() => editorRef.current?.setSelectionRange(nextCursor, nextCursor));
      return;
    }
    if (value === '→') {
      if (cursorPosition >= expression.length) return;
      const next = expression.slice(0, cursorPosition) + expression.slice(cursorPosition + 1);
      updateExpression(next, cursorPosition);
      requestAnimationFrame(() => editorRef.current?.setSelectionRange(cursorPosition, cursorPosition));
      return;
    }

    if (value === '=') {
      calculate();
      return;
    }

    if (value === '±') {
      if (!expression.trim()) {
        insertAtCursor('−');
        return;
      }

      const before = expression.slice(0, cursorPosition);
      const match = before.match(/(?:\d+(?:\.\d*)?|\.\d+|π|e|\([^()]*\))$/);
      if (!match) {
        insertAtCursor('−');
        return;
      }

      let start = before.length - match[0].length;
      let operand = match[0];
      const unaryMinusIndex = start - 1;
      const charBeforeUnaryMinus = unaryMinusIndex > 0 ? before[unaryMinusIndex - 1] : '';
      const hasUnaryMinus =
        before[unaryMinusIndex] === '−'
        && (unaryMinusIndex === 0 || /[+−×÷(]/.test(charBeforeUnaryMinus));

      if (hasUnaryMinus) {
        start = unaryMinusIndex;
        operand = before.slice(start);
      }

      const replacement = operand.startsWith('−') ? operand.slice(1) : '−' + operand;
      const next = expression.slice(0, start) + replacement + expression.slice(cursorPosition);
      updateExpression(next, start + replacement.length);
      return;
    }

    if (value === '√') {
      insertAtCursor('√');
      return;
    }

    if (value === '%') {
      insertAtCursor('%');
      return;
    }

    insertAtCursor(value);
  };

  return (
    <main className={'app-shell ' + (aiOpen ? 'ai-mode' : '')}>
      <div className={'connectivity-notice ' + (isOnline ? 'connectivity-online' : 'connectivity-offline')} role='status' aria-live='polite'>
        <span className='connectivity-dot' aria-hidden='true' />
        {isOnline ? 'Online · local calculator remains available; online mathematics runs only when requested.' : 'Offline · calculator and saved history remain on this device. Online mathematics is unavailable; nothing will be sent or queued.'}
      </div>
      {!aiOpen && !localAlgebraOpen ? (
        <section className='board-shell neumorphic-inset'>
          <div className='board-toolbar'>
            <div className='board-hint'>
              {functionsOpen ? 'Select a function, constant, or Professional Mathematical Center.' : 'Calculation board • clear working stays here'}
            </div>
            <button type='button' className='angle-mode-card neumorphic' onClick={() => setAngleMode(current => { const next = current === 'DEG' ? 'RAD' : current === 'RAD' ? 'GRAD' : 'DEG'; try { window.localStorage.setItem('netcalc-angle-mode', next); } catch { /* Mode still works for this session. */ } return next; })} aria-label={'Angle mode ' + angleMode + '. Tap to switch to ' + (angleMode === 'DEG' ? 'RAD' : angleMode === 'RAD' ? 'GRAD' : 'DEG')} title='Tap to cycle DEG → RAD → GRAD'>
              <span>{angleMode}</span><ChevronDown size={12}/>
            </button>
            <button
              className={'function-card neumorphic ' + (functionsOpen ? 'active' : '')
              }onClick={() => setFunctionsOpen(previous => !previous)}
              aria-label='Open calculator functions'
            >
              <FunctionSquare size={15} />
              <span>Functions</span>
              {functionsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>

          {scientificOpen && (
            <div className='scientific-panel neumorphic' style={scientificPosition ? {left:scientificPosition.x,top:scientificPosition.y,right:'auto',bottom:'auto'} : {left:12,top:146,right:'auto',bottom:'auto'}}>
              <div className='scientific-panel-head' onPointerDown={event => { if((event.target as HTMLElement).closest('button'))return; const rect=event.currentTarget.parentElement?.getBoundingClientRect(); if(!rect)return; event.preventDefault(); scientificDragRef.current={pointerX:event.clientX,pointerY:event.clientY,originX:rect.left,originY:rect.top,moved:false}; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { const drag=scientificDragRef.current; if(!drag)return; const dx=event.clientX-drag.pointerX,dy=event.clientY-drag.pointerY; if(Math.abs(dx)>3||Math.abs(dy)>3)drag.moved=true; if(!drag.moved)return; const panel=event.currentTarget.parentElement; const rect=panel?.getBoundingClientRect(); if(!rect)return; setScientificPosition({x:Math.max(6,Math.min(window.innerWidth-rect.width-6,drag.originX+dx)),y:Math.max(70,Math.min(window.innerHeight-rect.height-8,drag.originY+dy))}); }} onPointerUp={() => {scientificDragRef.current=null;}} onPointerCancel={() => {scientificDragRef.current=null;}} onLostPointerCapture={() => {scientificDragRef.current=null;}}><span>Scientific Functions · {angleMode}</span><button type='button' onPointerDown={event=>event.stopPropagation()} onClick={()=>setScientificOpen(false)} aria-label='Close Scientific Functions'><X size={16}/></button></div>
              <div className='scientific-panel-scroll'>
                {([{title:'Trigonometry',items:[['sin','sin('],['cos','cos('],['tan','tan('],['cot','cot('],['sec','sec('],['csc','csc(']]},{title:'Inverse trig',items:[['sin⁻¹','asin('],['cos⁻¹','acos('],['tan⁻¹','atan(']]},{title:'Logarithms',items:[['log','log('],['log10','log10('],['ln','ln(']]},{title:'Roots and powers',items:[['√','√('],['∛','∛('],['x²','²'],['xʸ','^'],['10ˣ','10^('],['eˣ','e^('],['x³','³']]},{title:'Other essential functions',items:[['abs','abs('],['!','!'],['1/x','1/('],['mod','mod']]},{title:'Grouping & symbols',items:[['(','('],[')',')'],['{','{'],['}','}'],['/','/'],['\\','\\'],['#','#']]},{title:'Constants',items:[['π','π'],['e','e']]}] as {title:string;items:[string,string][]}[]).map(group=><div key={group.title}><div className='scientific-group-title'>{group.title}</div><div className='scientific-function-grid'>{group.items.map(([label,token])=><button key={label} type='button' onClick={()=>{const current=expressionRef.current; let insertion=token; if(label==='x²')insertion='²'; else if(label==='!')insertion='!'; else if(label==='1/x')insertion='1/('; else if(label==='xʸ')insertion='^'; else if(label==='10ˣ')insertion='10^('; else if(label==='eˣ')insertion='e^('; else if(label==='x³')insertion='³'; else if(label==='mod')insertion=' mod '; applyPastedExpression(insertion); setScientificOpen(false); setError(null);}}>{label}</button>)}</div></div>)}
                <div className='scientific-angle-note'>Trigonometric functions use the selected {angleMode} mode. Inserted functions close this card.</div>
              </div>
            </div>
          )}

          {functionsOpen && (
            <div className='function-popover neumorphic'>
              <div className='function-scroll'>
                {categories.map((category, categoryIndex) => {
                  const expanded = openCategory === category.name;
                  const categoryKey = category.name + '-' + categoryIndex;

                  return (
                    <div key={categoryKey} className='category-block'>
                      <button
                        className={'category-row ' + (category.name === 'Basic Functions' ? 'category-row-basic' : category.name === 'Symbolic Mathematics' ? 'category-row-symbolic' : 'category-row-professional')}
                        onClick={() => {
                          if (category.name === 'Professional Mathematical Center') {
                            setOpenCategory(null);
                            return;
                          }
                          if (category.name === 'Symbolic Mathematics') {
                            setFunctionsOpen(false);
                            setOpenCategory(null);
                            setLocalAlgebraOpen(true);
                            return;
                          }
                          setOpenCategory(expanded ? null : category.name);
                        }}
                      >
                        <span className='category-title-with-icon'>
                          {category.name === 'Professional Mathematical Center' ? <LockKeyhole size={14} /> : category.name === 'Symbolic Mathematics' ? <Sigma size={14} /> : null}
                          <span>{category.name}</span>
                          {category.name === 'Professional Mathematical Center' && <small className='coming-soon-label'>Coming Soon</small>}
                        </span>
                        {category.name === 'Professional Mathematical Center' ? <LockKeyhole size={14} /> : expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      {expanded ? (
                        <div className='subdrawer'>
                          {category.items.map(item => (
                            <button key={item} className='subitem neumorphic' onClick={() => selectFunction(item)}>
                              {item}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <div className='category-block history-block'>
                  <button className='category-row history-row' onClick={() => {
                      setHistoryOpen(previous => {
                        if (previous) setHistoryStepsOpen(false);
                        return !previous;
                      });
                      setConfirmClearHistory(false);
                    }}
                    aria-expanded={historyOpen}
                  >
                    <span className='history-title'><History size={14} /><span>Calculation History</span><span className='history-count'>{history.length} saved</span></span>
                    {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {historyOpen && (
                    <div className='history-drawer'>
                      {historyStorageError && <div className='visual-error' role='alert'>History could not be saved to this device. Your current history was left unchanged; check browser storage settings and try again.</div>}
                      {history.length === 0 ? (
                        <div className='history-empty'>
                          <History size={20} />
                          <strong>No calculations yet</strong>
                          <span>Your completed calculations will appear here.</span>
                        </div>
                      ) : (
                        <>
                          <div className='history-list'>
                            {history.map(entry => (
                              <div key={entry.id} className='history-item neumorphic'>
                                <button className='history-restore' onClick={() => restoreHistory(entry)} aria-label={'Restore ' + entry.expression}>
                                  <span className='history-expression'>{entry.expression}</span><span className='history-result'>= {entry.result}</span><span className='history-time'>{new Date(entry.timestamp).toLocaleString()}</span>
                                </button>
                                <button className='history-delete' onClick={() => deleteHistoryEntry(entry.id)} aria-label={'Delete ' + entry.expression + ' from history'}><Trash2 size={13} /></button>
                                <details className='history-working' onToggle={event => setHistoryStepsOpen(event.currentTarget.open)}><summary>View worked steps</summary><div className='history-working-body'>{(entry.steps?.length ? entry.steps : [entry.expression, '= ' + entry.result]).map((line, stepIndex) => line.startsWith('STEP:') ? <div key={stepIndex} className='history-working-heading'>{line.slice(5)}</div> : <div key={stepIndex} className='history-working-line'>{line}</div>)}</div></details>
                              </div>
                            ))}
                          </div>

                          {confirmClearHistory ? (
                            <div className='history-confirm neumorphic'>
                              <span>Clear all {history.length} calculations?</span>
                              <div className='history-confirm-actions'>
                                <button className='history-cancel' onClick={() => setConfirmClearHistory(false)}>Cancel</button>
                                <button className='history-confirm-delete' onClick={clearHistory}>Clear all</button>
                              </div>
                            </div>
                          ) : (
                            <button className='history-clear' onClick={() => setConfirmClearHistory(true)}>
                              <Trash2 size={13} />
                              <span>Clear all history</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            className='math-board'
            aria-label='Main calculator board'
            tabIndex={0}
            onKeyDown={event => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveCursor('left');
              }
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveCursor('right');
              }
              if (event.key === 'Backspace') {
                event.preventDefault();
                onKey('DEL');
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                calculate();
              }
            }}
          >
            <div className='display-label-row'>
              <div className='problem-label'>{selectedFunction || 'Calculation'}</div>
            </div>

            <div className='expression-display' aria-label='Editable calculator expression'>
              <textarea
                ref={editorRef}
                className='expression-input'
                value={expression}
                aria-label='Calculator expression input'
                inputMode='decimal'
                autoCapitalize='off'
                autoCorrect='off'
                spellCheck={false}
                placeholder='Enter a calculation'
                onChange={event => {
                  const value = event.target.value;
                  setExpression(value);
                  setCursorPosition(event.target.selectionStart ?? value.length);
                  setSelectedFunction(null);
                  setSteps([]);
                  setError(null);
                }}
                onSelect={event => setCursorPosition(event.currentTarget.selectionStart ?? expression.length)}
                onClick={event => setCursorPosition(event.currentTarget.selectionStart ?? expression.length)}
                onKeyUp={event => setCursorPosition(event.currentTarget.selectionStart ?? expression.length)}
                onPaste={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  applyPastedExpression(event.clipboardData.getData('text'));
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    calculate();
                  }
                }}
              />
            </div>

            <div className='instant-answer-block' aria-live='polite'>
              {displayedAnswer !== null && (
                <div className='instant-answer-row'>
                  <strong className='instant-answer-value'>{displayedAnswer}</strong>
                  {instantAnswer !== null && <button type='button' className='save-history-mini' onClick={saveCurrentCalculation} disabled={history.some(item => item.expression === expression.trim() && item.result === instantAnswer)}>{history.some(item => item.expression === expression.trim() && item.result === instantAnswer) ? 'Saved ✓' : 'Save to History'}</button>}
                </div>
              )}
              {error && <div className='calculation-error' role='alert' aria-live='assertive'>{error}</div>}
              {hasWorking && (
                <button className='working-toggle neumorphic' onClick={() => setWorkingExpanded(value => !value)} aria-expanded={workingExpanded}>
                  <span>{workingExpanded ? 'Hide step-by-step working' : 'Show step-by-step working'}</span>
                  {workingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
            </div>
            {workingExpanded && (
            <div className='steps' aria-live='polite'>
              {visibleSteps.map((step, index) => {
                if (step === '✓ CALCULATED') {
                  return <div key={step + '-' + index} className='verified-inline'>Calculated ✓</div>;
                }

                if (step.startsWith('= ')) {
                  return (
                    <div key={step + '-' + index} className='step answer-step final-answer'>
                      <span className='math-line'>{step.slice(2)}</span>
                    </div>
                  );
                }

                if (step.startsWith('STEP:')) {
                  const heading = step.slice(5);
                  const stepNumber = visibleSteps.slice(0, index).filter(item => item.startsWith('STEP:')).length + 1;
                  return (
                    <div key={step + '-' + index} className={'step step-accent-' + ((stepNumber % 4) + 1) + ' structured-step'}>
                      <div className='step-heading'>Step {stepNumber} — {heading}</div>
                    </div>
                  );
                }

                return (
                  <div key={step + '-' + index} className='step step-math-line'>
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {(steps.length > 0 || instantSteps.length > 0 || error) && (
            <button className='workspace-delete neumorphic' onClick={clearWorkspace} aria-label='Clear calculation'>
              <Delete size={16} />
            </button>
          )}
        </section>
      ) : aiOpen ? (
        <section className='ai-shell neumorphic-inset' aria-label='Professional Mathematical Center workspace'>
          <div className='ai-toolbar'>
            <button className='ai-back neumorphic' onClick={closeAi} aria-label='Return to calculator'>
              <ArrowLeft size={16} />
              <span>Calculator</span>
            </button>
            <div className='ai-title-block'>
              <div className='ai-title'><Sparkles size={17} />Professional Mathematical Center</div>
              <div className='ai-subtitle'>Universal Mathematics</div>
            </div>
            <button className='ai-close neumorphic' onClick={closeAi} aria-label='Close Professional Mathematical Center'>
              <X size={16} />
            </button>
          </div>

          <div className='ai-workspace'>
            <div className='ai-intro'>Understand, classify, calculate, and verify problems across professional mathematics.</div>
            <textarea
              id='ai-problem'
              className='ai-problem-input neumorphic-inset'
              value={aiProblem}
              aria-label='Mathematics problem input'
              placeholder={AI_PLACEHOLDER}
              onChange={event => {
                setAiProblem(event.target.value);
                setAiError(null);
              }}
              onKeyDown={event => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void solveAi();
                }
              }}
            />

            <div className='ai-actions'>
              <button className='ai-solve neumorphic' onClick={() => void solveAi()} disabled={aiLoading}>
                <Sparkles size={15} />
                <span>{aiLoading ? 'Working...' : 'Explore Logically'}</span>
              </button>
              <button
                className='ai-clear neumorphic'
                onClick={() => {
                  aiRequestRef.current += 1;
                  setAiProblem('');
                  setAiResult(null);
                  setAiError(null);
                  setAiEngineStatus(null);
                  setAiLoading(false);
                }}
                disabled={aiLoading}
              >
                <X size={14} />
                <span>Clear</span>
              </button>
            </div>

            <div className='ai-examples'>
              <div className='ai-section-label'>Examples</div>
              <div className='ai-example-grid'>
                {[
                  'Solve x² - 5x + 6 = 0',
                  'Find the derivative of x^2 + 3x',
                  'A car travels 120 km in 2 hours. What is its average speed?',
                  'Find the area of a circle with radius 7',
                ].map(example => (
                  <button
                    key={example}
                    className='ai-example neumorphic'
                    onClick={() => {
                      setAiProblem(example);
                      setAiError(null);
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {aiLoading && (
              <div className='ai-status-card neumorphic' aria-live='polite'>
                <div className='ai-status-title'>{aiEngineStatus === 'local' ? 'Calculating locally' : 'Online mathematical processing'}</div>
                <div className='ai-status-text'>{aiEngineStatus === 'local' ? 'Using the local symbolic engine. No AI request is sent.' : 'Your explicit Explore Logically action is using the existing online mathematics service. No automatic retry will be made.'}</div>
              </div>
            )}

            {aiError && (
              <div className='ai-error-card neumorphic' role='alert'>
                <div className='ai-status-title'>{aiEngineStatus === 'local' ? 'Local algebra unavailable' : 'Online mathematics unavailable'}</div>
                <div className='ai-status-text'>{aiError}</div>
                <button className='ai-retry neumorphic' onClick={() => void solveAi()} disabled={aiLoading}>
                  <RotateCcw size={14} />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className='ai-result-card neumorphic'>
                <div className='ai-result-problem'>{aiResult.problem}</div>
                {aiEngineStatus && <div className='local-algebra-note' role='status'>{aiEngineStatus === 'local' ? 'Calculated locally · No online AI request' : 'Processed online · User initiated'}</div>}
                {aiResult.status === 'solved' && <div className='visual-entry-row'><button className='visual-launch neumorphic' onClick={() => setVisualOpen(v => !v)}><ChartSpline size={15}/><span>{visualOpen ? 'Hide Mathematics Visualizer' : 'Visualize Mathematics'}</span>{visualOpen ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}</button></div>}
                {visualOpen && <GraphWorkspace initialExpression={deriveVisualizationExpression(aiProblem, aiResult.steps)} onClose={() => setVisualOpen(false)}/>}
                {aiResult.interpretation && (
                  <div className='ai-interpretation'><span>Problem interpretation</span><div>{aiResult.interpretation}</div></div>
                )}

                <div className='ai-meta-grid'>
                  <div className='ai-meta-item'>
                    <span>Domain</span>
                    <strong>{aiResult.domain}</strong>
                  </div>
                  <div className='ai-meta-item'>
                    <span>Subtype</span>
                    <strong>{aiResult.subdomain}</strong>
                  </div>
                  <div className='ai-meta-item'>
                    <span>Level</span>
                    <strong>{aiResult.difficulty}</strong>
                  </div>
                  <div className='ai-meta-item'>
                    <span>Method</span>
                    <strong>{aiResult.method}</strong>
                  </div>
                </div>

                {aiResult.status !== 'solved' && (
                  <div className='ai-state-banner'>
                    <strong>
                      {aiResult.status === 'incomplete'
                        ? 'More information is required.'
                        : aiResult.status === 'needs_clarification'
                          ? 'Clarification is required.'
                          : 'The problem could not be solved reliably.'}
                    </strong>
                    <div>{aiResult.answer}</div>
                  </div>
                )}

                <div className='ai-section'>
                  <div className='ai-section-topline'><div className='ai-section-label'>Solution Breakdown</div><button className='ai-copy-working neumorphic' onClick={() => void copyAiText('working')} aria-label='Copy working'>{aiCopied === 'working' ? <Check size={12} /> : <Copy size={12} />}<span>{aiCopied === 'working' ? 'Copied' : 'Copy Working'}</span></button></div>
                  <div className='ai-step-list'>
                    {aiResult.steps.length === 0 ? (
                      <div className='ai-no-steps'>No mathematical steps available.</div>
                    ) : (
                      aiResult.steps.map((step, index) => (
                        <div key={index} className='ai-step'>
                          <div className='ai-step-heading'>
                            <span className='ai-step-number'>Step {index + 1}</span>
                            <span className='ai-step-type'>{step.label || step.type.replaceAll('_', ' ')}</span>
                          </div>
                          <div className='ai-step-expression'><MathDisplay value={step.expression} display /></div>
                          {step.explanation && <div className='ai-step-explanation'>{step.explanation}</div>}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {aiResult.finalCalculation && (
                  <div className='ai-final-calculation'>
                    <span>Final Calculation</span>
                    <strong><MathDisplay value={aiResult.finalCalculation} display /></strong>
                  </div>
                )}

                <div className='ai-answer'>
                  <span>Answer</span>
                  <strong><MathDisplay value={aiResult.answer} display /></strong>
                  <small>{aiResult.answerType}</small><div className='ai-result-actions'><button className='ai-result-action neumorphic' onClick={() => void copyAiText('answer')} aria-label='Copy answer'>{aiCopied === 'answer' ? <Check size={13} /> : <Copy size={13} />}<span>{aiCopied === 'answer' ? 'Copied' : 'Copy Answer'}</span></button>{aiResult.status === 'solved' && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(aiResult.answer.trim()) && <button className='ai-result-action neumorphic' onClick={useAiAnswerInCalculator} aria-label='Use answer in calculator'><Calculator size={13} /><span>Use in Calculator</span></button>}</div>
                </div>

                {aiResult.verification && (
                  <div className='ai-verification'>
                    <span>Verify Solution · {aiResult.verificationStatus === 'passed' ? 'numeric check passed' : aiResult.verificationStatus === 'failed' ? 'check failed' : aiResult.verificationStatus === 'partial' ? 'partial check' : 'not independently checked'}</span>
                    <small>{aiEngineStatus === 'local' ? 'Local numeric checks are not formal symbolic proofs.' : 'AI-reported verification is not independently checked by NetCalc.'}</small>
                    <strong><VerificationDisplay value={aiResult.verification} /></strong>
                  </div>
                )}

                {aiResult.teachingNote && (
                  <div className='ai-teaching-note'><span>Key idea</span><div>{aiResult.teachingNote}</div></div>
                )}

                {aiResult.alternativeMethod && aiResult.status === 'solved' && !((/factor/i.test(aiResult.method) || /greatest common factor|factoring out/i.test(aiResult.steps.map(step => step.explanation + ' ' + step.label).join(' '))) && /quadratic formula/i.test(aiResult.alternativeMethod)) && !/(?:^|\\s)(?:frac|sqrt)\\s*(?:\\{|\\d)/i.test(aiResult.alternativeMethod.replace(/\\\\(?:frac|sqrt)\\b/g, '')) && (
                  <div className='ai-alternative-method'><span>Alternative method</span><AlternativeMethodDisplay value={aiResult.alternativeMethod} /></div>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className='ai-shell neumorphic-inset local-engine-screen' aria-label='Symbolic Mathematics workspace'>
          <div className='ai-toolbar'>
            <button className='ai-back neumorphic' onClick={() => setLocalAlgebraOpen(false)} aria-label='Return to calculator'>
              <ArrowLeft size={16} />
              <span>Calculator</span>
            </button>
            <div className='ai-title-block'>
              <div className='ai-title'><Sigma size={17} />Symbolic Mathematics</div>
            </div>
            <button className='ai-close neumorphic' onClick={() => setLocalAlgebraOpen(false)} aria-label='Close Algebra'>
              <X size={16} />
            </button>
          </div>
          <div className='ai-workspace'>
            <LocalAlgebraWorkspace onSaveHistory={saveSymbolicHistory} />
          </div>
        </section>
      )}

      {!aiOpen && !localAlgebraOpen && !historyStepsOpen && <section className='keypad neumorphic'>
        <div className='key-row key-row-five'>
          <button type='button' className={'scientific-fab neumorphic ' + (scientificOpen ? 'open ' : '') + (scientificPosition ? 'scientific-fab-positioned' : '')} style={scientificPosition ? {left:scientificPosition.x,top:scientificPosition.y,right:'auto',bottom:'auto'} : undefined} onPointerDown={startScientificFabDrag} onPointerMove={moveScientificFabDrag} onPointerUp={endScientificFabDrag} onPointerCancel={endScientificFabDrag} onLostPointerCapture={endScientificFabDrag} onClick={() => { if(scientificSuppressClickRef.current){scientificSuppressClickRef.current=false;return;} setScientificOpen(value => !value); setFunctionsOpen(false); }} aria-expanded={scientificOpen} aria-label='Scientific Functions: drag to move or tap to open' title='Drag to move · tap to open'><Sigma size={16}/><span>SCI</span><span className='scientific-drag-grip' aria-hidden='true'>⠿</span></button>
          {['←', '→', 'DEL', 'AC'].map(key => (
            <button key={key} className={key === 'DEL' ? 'key utility delete-inline' : 'key operator-key'} onClick={() => onKey(key)} aria-label={key}>
              {key === 'DEL' ? <Delete size={18} /> : key}
            </button>
          ))}
        </div>

        <div className='key-row'>{['7', '8', '9', '÷'].map(key => <button key={key} className='key' onClick={() => onKey(key)}>{key}</button>)}</div>
        <div className='key-row'>{['4', '5', '6', '×'].map(key => <button key={key} className='key' onClick={() => onKey(key)}>{key}</button>)}</div>
        <div className='key-row'>{['1', '2', '3', '−'].map(key => <button key={key} className='key' onClick={() => onKey(key)}>{key}</button>)}</div>

        <div className='key-row key-row-bottom'>
          <button className='key zero-key' onClick={() => onKey('0')}>0</button>
          <button className='key' onClick={() => onKey('.')}>.</button>
          <button className='key operator-key add-key' onClick={() => onKey('+')}>+</button>
          <button className='key equals' onClick={() => onKey('=')}>=</button>
        </div>
      </section>}
      {!aiOpen && !localAlgebraOpen && (
        <div className='ad-slot-placeholder' aria-label='Advertisement placement' role='note'>
          <span className='ad-slot-label'>SPONSORED</span>
          <span>Ad space reserved · Ads not enabled yet</span>
        </div>
      )}
    </main>
  );
}

export default App;
