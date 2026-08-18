'use client';

import React, { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, Card, CardContent, CardHeader, Button, Input, Badge } from '@/components/ui';

type Subject = 'maths' | 'physics';

interface Formula {
  name: string;
  formula: React.ReactNode;
  variables: string;
  note: string;
  tags: string[];
}

interface Category {
  name: string;
  formulas: Formula[];
}

const mathsCategories: Category[] = [
  {
    name: 'Algebra',
    formulas: [
      {
        name: 'Quadratic Formula',
        formula: (
          <div className="flex flex-col items-center">
            <span>x =</span>
            <div className="text-center">
              <div className="border-b border-current pb-1 mb-1">-b &plusmn; &radic;(b&sup2; - 4ac)</div>
              <div>2a</div>
            </div>
          </div>
        ),
        variables: 'a, b, c are coefficients of ax&sup2; + bx + c = 0',
        note: 'Use to find the roots of any quadratic equation. The discriminant b&sup2; - 4ac determines the number of real solutions.',
        tags: ['quadratic', 'roots', 'discriminant'],
      },
      {
        name: 'Index Laws',
        formula: (
          <div className="space-y-1 text-sm">
            <div>a<sup>m</sup> &times; a<sup>n</sup> = a<sup>m+n</sup></div>
            <div>a<sup>m</sup> &divide; a<sup>n</sup> = a<sup>m-n</sup></div>
            <div>(a<sup>m</sup>)<sup>n</sup> = a<sup>mn</sup></div>
            <div>a<sup>0</sup> = 1 (a &ne; 0)</div>
            <div>a<sup>-n</sup> = 1/a<sup>n</sup></div>
            <div>a<sup>m/n</sup> = <sup>n</sup>&radic;(a<sup>m</sup>)</div>
          </div>
        ),
        variables: 'a is the base; m, n are exponents',
        note: 'Essential for simplifying expressions and solving exponential equations. Remember: these apply only when bases are the same.',
        tags: ['exponents', 'indices', 'powers', 'roots'],
      },
      {
        name: 'Difference of Two Squares',
        formula: (
          <span>a&sup2; - b&sup2; = (a + b)(a - b)</span>
        ),
        variables: 'a and b are any real numbers or expressions',
        note: 'Used to factorise expressions and simplify algebraic fractions. Recognise the pattern: two perfect squares separated by a minus sign.',
        tags: ['factorisation', 'factor', 'difference'],
      },
    ],
  },
  {
    name: 'Functions',
    formulas: [
      {
        name: 'Function Transformations',
        formula: (
          <div className="space-y-1 text-sm">
            <div>f(x) + k &mdash; shifts up by k</div>
            <div>f(x) - k &mdash; shifts down by k</div>
            <div>f(x + h) &mdash; shifts left by h</div>
            <div>f(x - h) &mdash; shifts right by h</div>
            <div>af(x) &mdash; vertical stretch by factor a</div>
            <div>f(bx) &mdash; horizontal stretch by factor 1/b</div>
          </div>
        ),
        variables: 'k is vertical shift, h is horizontal shift, a/b are stretch factors',
        note: 'Negative a reflects in x-axis; negative b reflects in y-axis. Apply horizontal transformations in reverse order of the sign.',
        tags: ['transformations', 'shifts', 'stretches', 'reflections', 'translations'],
      },
      {
        name: 'Domain and Range',
        formula: (
          <div className="space-y-1 text-sm">
            <div>Domain: all possible x-values (inputs)</div>
            <div>Range: all possible y-values (outputs)</div>
            <div>Inverse swaps domain and range</div>
          </div>
        ),
        variables: 'y = f(x), domain of f = range of f&sup1;',
        note: 'For polynomials, domain is all reals. For square roots, radicand &ge; 0. For fractions, denominator &ne; 0. For logs, argument > 0.',
        tags: ['domain', 'range', 'input', 'output'],
      },
      {
        name: 'Inverse Functions',
        formula: (
          <span>
            If y = f(x), then f<sup>-1</sup>(y) = x. To find: swap x and y, then solve for y.
          </span>
        ),
        variables: 'f&sup1; exists only if f is one-to-one (passes horizontal line test)',
        note: 'Graphically, f and f&sup1; are reflections in y = x. Verify: f(f&sup1;(x)) = x and f&sup1;(f(x)) = x.',
        tags: ['inverse', 'one-to-one', 'reflection', 'function'],
      },
    ],
  },
  {
    name: 'Calculus',
    formulas: [
      {
        name: 'Basic Differentiation Rules',
        formula: (
          <div className="space-y-1 text-sm">
            <div>d/dx [c] = 0 (constant)</div>
            <div>d/dx [x<sup>n</sup>] = nx<sup>n-1</sup> (power rule)</div>
            <div>d/dx [e<sup>x</sup>] = e<sup>x</sup></div>
            <div>d/dx [ln x] = 1/x</div>
            <div>d/dx [sin x] = cos x</div>
            <div>d/dx [cos x] = -sin x</div>
          </div>
        ),
        variables: 'n is a real constant, x is the variable',
        note: 'The power rule is the most commonly used. Combine with the other rules for more complex functions.',
        tags: ['differentiation', 'derivative', 'power rule', 'gradient'],
      },
      {
        name: 'Chain Rule',
        formula: (
          <span>
            d/dx [f(g(x))] = f'(g(x)) &middot; g'(x) &nbsp; or &nbsp; dy/dx = (dy/du)(du/dx)
          </span>
        ),
        variables: 'u = g(x) is the inner function, f is the outer function',
        note: 'Use when a function is composed of an inner and outer function. "Derivative of the outside, leave inside alone, times derivative of inside."',
        tags: ['chain rule', 'composite', 'derivative'],
      },
      {
        name: 'Product Rule',
        formula: (
          <span>
            d/dx [uv] = u'v + uv' &nbsp; where u and v are functions of x
          </span>
        ),
        variables: 'u = u(x), v = v(x)',
        note: 'Use when two functions of x are multiplied together. Remember: "derivative of first times second, plus first times derivative of second."',
        tags: ['product rule', 'multiplication', 'derivative'],
      },
      {
        name: 'Quotient Rule',
        formula: (
          <span>
            d/dx [u/v] = (u'v - uv')/v&sup2;
          </span>
        ),
        variables: 'u = u(x) is the numerator, v = v(x) is the denominator',
        note: 'Use when one function is divided by another. "Low d-high minus high d-low, over the square of what\'s below."',
        tags: ['quotient rule', 'division', 'derivative'],
      },
      {
        name: 'Integration Rules',
        formula: (
          <div className="space-y-1 text-sm">
            <div>&int; x<sup>n</sup> dx = x<sup>n+1</sup>/(n+1) + C &nbsp; (n &ne; -1)</div>
            <div>&int; 1/x dx = ln|x| + C</div>
            <div>&int; e<sup>x</sup> dx = e<sup>x</sup> + C</div>
            <div>&int; sin x dx = -cos x + C</div>
            <div>&int; cos x dx = sin x + C</div>
          </div>
        ),
        variables: 'C is the constant of integration',
        note: 'Integration is the reverse of differentiation. Always include +C for indefinite integrals. For definite integrals, evaluate F(b) - F(a).',
        tags: ['integration', 'antiderivative', 'indefinite', 'area'],
      },
      {
        name: 'Fundamental Theorem of Calculus',
        formula: (
          <span>
            &int;<sub>a</sub><sup>b</sup> f(x) dx = F(b) - F(a) &nbsp; where F'(x) = f(x)
          </span>
        ),
        variables: 'a is the lower limit, b is the upper limit, F is the antiderivative of f',
        note: 'Connects differentiation and integration. The definite integral equals the net signed area under the curve from a to b.',
        tags: ['fundamental theorem', 'definite integral', 'area'],
      },
    ],
  },
  {
    name: 'Probability',
    formulas: [
      {
        name: 'Basic Probability',
        formula: (
          <span>
            P(A) = number of favourable outcomes / total outcomes &nbsp; (equally likely)
          </span>
        ),
        variables: 'A is an event, 0 &le; P(A) &le; 1',
        note: 'For equally likely outcomes only. P(A\') = 1 - P(A). Use tree diagrams or Venn diagrams for combined events.',
        tags: ['probability', 'outcomes', 'basic'],
      },
      {
        name: 'Conditional Probability',
        formula: (
          <span>
            P(A|B) = P(A &cap; B) / P(B) &nbsp; where P(B) &gt; 0
          </span>
        ),
        variables: 'A|B means "A given B has occurred"',
        note: 'The probability of A occurring given that B has already occurred. Denominator is restricted to the condition.',
        tags: ['conditional', 'given', 'intersection'],
      },
      {
        name: "Bayes' Theorem",
        formula: (
          <span>
            P(A|B) = P(B|A)P(A) / P(B)
          </span>
        ),
        variables: 'P(B) = &Sigma; P(B|A<sub>i</sub>)P(A<sub>i</sub>) for partition A<sub>1</sub>, A<sub>2</sub>, ...',
        note: 'Reverses the direction of conditioning. Used to update probabilities when new evidence is obtained. Common in diagnostic tests.',
        tags: ['bayes', 'theorem', 'posterior', 'update'],
      },
      {
        name: 'Combinations',
        formula: (
          <span>
            <sup>n</sup>C<sub>r</sub> = n! / [r!(n - r)!]
          </span>
        ),
        variables: 'n = total items, r = items chosen, order does NOT matter',
        note: 'Use when the order of selection does not matter. E.g., choosing a committee of r people from n candidates.',
        tags: ['combinations', 'choose', 'selection', 'nCr'],
      },
      {
        name: 'Permutations',
        formula: (
          <span>
            <sup>n</sup>P<sub>r</sub> = n! / (n - r)!
          </span>
        ),
        variables: 'n = total items, r = items arranged, order DOES matter',
        note: 'Use when the order of arrangement matters. E.g., arranging r books on a shelf from n available books.',
        tags: ['permutations', 'arrangement', 'order', 'nPr'],
      },
    ],
  },
  {
    name: 'Statistics',
    formulas: [
      {
        name: 'Mean',
        formula: (
          <span>
            x&#772; = (&Sigma;x<sub>i</sub>) / n
          </span>
        ),
        variables: 'x&#772; is the mean, x<sub>i</sub> are individual values, n is the number of values',
        note: 'The arithmetic average. Sensitive to outliers. For grouped data, use x&#772; = (&Sigma;f<sub>i</sub>x<sub>i</sub>) / (&Sigma;f<sub>i</sub>).',
        tags: ['mean', 'average', 'centre'],
      },
      {
        name: 'Median',
        formula: (
          <span>
            Median = middle value when data is ordered. For even n: median = (x{'<sub>'}n/2{'</sub>'} + x{'<sub>'}n/2+1{'</sub>'}) / 2
          </span>
        ),
        variables: 'n = number of data points',
        note: 'The middle value of ordered data. More robust to outliers than the mean. For grouped data, use interpolation.',
        tags: ['median', 'middle', 'centre'],
      },
      {
        name: 'Standard Deviation',
        formula: (
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Population:</span> &sigma; = &radic;[&Sigma;(x<sub>i</sub> - &mu;)&sup2; / N]
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Sample:</span> s = &radic;[&Sigma;(x<sub>i</sub> - x&#772;)&sup2; / (n-1)]
            </div>
          </div>
        ),
        variables: '&sigma; = population SD, s = sample SD, &mu; = population mean, x&#772; = sample mean',
        note: 'Measures the spread/dispersion of data. Use n-1 for samples (Bessel\'s correction). Variance = SD&sup2;.',
        tags: ['standard deviation', 'variance', 'spread', 'dispersion'],
      },
      {
        name: 'Normal Distribution',
        formula: (
          <span>
            X ~ N(&mu;, &sigma;&sup2;) &nbsp; &nbsp; Z = (X - &mu;) / &sigma; &nbsp; (standardising)
          </span>
        ),
        variables: '&mu; = mean, &sigma;&sup2; = variance, Z ~ N(0,1) is the standard normal',
        note: 'Bell-shaped, symmetric distribution. ~68% within 1&sigma;, ~95% within 2&sigma;, ~99.7% within 3&sigma;. Use Z-tables for probabilities.',
        tags: ['normal', 'distribution', 'z-score', 'standardise', 'bell curve'],
      },
    ],
  },
  {
    name: 'Trigonometry',
    formulas: [
      {
        name: 'SOH CAH TOA',
        formula: (
          <div className="space-y-1 text-sm">
            <div>sin &theta; = opposite / hypotenuse</div>
            <div>cos &theta; = adjacent / hypotenuse</div>
            <div>tan &theta; = opposite / adjacent</div>
          </div>
        ),
        variables: '&theta; is an acute angle in a right-angled triangle',
        note: 'Applies only to right-angled triangles. Use to find missing sides or angles when you know two of the three sides.',
        tags: ['SOH', 'CAH', 'TOA', 'right triangle', 'basic trig'],
      },
      {
        name: 'Sine Rule',
        formula: (
          <span>
            a/sin A = b/sin B = c/sin C
          </span>
        ),
        variables: 'a, b, c are sides opposite to angles A, B, C',
        note: 'Use for non-right-angled triangles when you know a matching side-angle pair and one other element. Can also be written as sin A/a = sin B/b.',
        tags: ['sine rule', 'non-right', 'triangle'],
      },
      {
        name: 'Cosine Rule',
        formula: (
          <div className="space-y-1 text-sm">
            <div>a&sup2; = b&sup2; + c&sup2; - 2bc cos A</div>
            <div>cos A = (b&sup2; + c&sup2; - a&sup2;) / 2bc</div>
          </div>
        ),
        variables: 'a is the side opposite angle A; b, c are the other two sides',
        note: 'Use when you know three sides (SSS) or two sides and the included angle (SAS). A generalisation of Pythagoras\' theorem.',
        tags: ['cosine rule', 'non-right', 'triangle', 'SSS', 'SAS'],
      },
      {
        name: 'Key Trig Identities',
        formula: (
          <div className="space-y-1 text-sm">
            <div>sin&sup2;&theta; + cos&sup2;&theta; = 1</div>
            <div>tan &theta; = sin &theta; / cos &theta;</div>
            <div>1 + tan&sup2;&theta; = sec&sup2;&theta;</div>
            <div>1 + cot&sup2;&theta; = csc&sup2;&theta;</div>
          </div>
        ),
        variables: '&theta; is any angle',
        note: 'The Pythagorean identity sin&sup2;&theta; + cos&sup2;&theta; = 1 is the most important. Divide by cos&sup2;&theta; or sin&sup2;&theta; to derive the others.',
        tags: ['identities', 'pythagorean', 'tan', 'sin', 'cos'],
      },
    ],
  },
];

const physicsCategories: Category[] = [
  {
    name: 'Mechanics',
    formulas: [
      {
        name: "Newton's Second Law",
        formula: (
          <span>F = ma</span>
        ),
        variables: 'F = net force (N), m = mass (kg), a = acceleration (m/s&sup2;)',
        note: 'The net force on an object equals its mass times acceleration. F is the resultant of ALL forces. Direction matters &mdash; use a sign convention.',
        tags: ['newton', 'force', 'acceleration', 'second law'],
      },
      {
        name: 'Kinematics Equations (suvat)',
        formula: (
          <div className="space-y-1 text-sm">
            <div>v = u + at</div>
            <div>s = ut + &frac12;at&sup2;</div>
            <div>v&sup2; = u&sup2; + 2as</div>
            <div>s = (u + v)t / 2</div>
          </div>
        ),
        variables: 'u = initial velocity, v = final velocity, a = acceleration, s = displacement, t = time',
        note: 'Use for constant acceleration only (e.g., free fall, inclined planes). Each equation omits one variable &mdash; pick the right one for your knowns.',
        tags: ['suvat', 'kinematics', 'motion', 'constant acceleration', 'displacement'],
      },
      {
        name: 'Weight (Gravitational Force)',
        formula: (
          <span>
            W = mg
          </span>
        ),
        variables: 'W = weight (N), m = mass (kg), g &asymp; 9.8 m/s&sup2; (Earth)',
        note: 'Weight is the gravitational force on an object. Always acts downwards. g varies by location (e.g., g &asymp; 1.62 m/s&sup2; on the Moon).',
        tags: ['weight', 'gravity', 'gravitational force'],
      },
      {
        name: 'Momentum',
        formula: (
          <div className="space-y-1 text-sm">
            <div>p = mv</div>
            <div>F = &Delta;p / &Delta;t (Newton&apos;s second law form)</div>
          </div>
        ),
        variables: 'p = momentum (kg&middot;m/s), m = mass (kg), v = velocity (m/s)',
        note: 'Momentum is a vector. In collisions/explosions, total momentum is conserved (if no external forces). Impulse = F&Delta;t = &Delta;p.',
        tags: ['momentum', 'impulse', 'collision', 'conservation'],
      },
      {
        name: 'Friction',
        formula: (
          <span>
            F<sub>f</sub> = &mu;F<sub>N</sub>
          </span>
        ),
        variables: 'F<sub>f</sub> = frictional force, &mu; = coefficient of friction, F<sub>N</sub> = normal force',
        note: 'Use &mu;<sub>s</sub> for static (preventing motion) and &mu;<sub>k</sub> for kinetic (during motion). Friction always opposes the direction of motion.',
        tags: ['friction', 'coefficient', 'normal force'],
      },
    ],
  },
  {
    name: 'Energy',
    formulas: [
      {
        name: 'Work Done',
        formula: (
          <span>
            W = Fs cos &theta;
          </span>
        ),
        variables: 'W = work (J), F = force (N), s = displacement (m), &theta; = angle between F and s',
        note: 'Work is energy transferred by a force. If &theta; = 0&deg;, W = Fs (force in direction of motion). If &theta; = 90&deg;, W = 0 (no work done).',
        tags: ['work', 'energy', 'force', 'displacement'],
      },
      {
        name: 'Kinetic Energy',
        formula: (
          <span>
            KE = &frac12;mv&sup2;
          </span>
        ),
        variables: 'KE = kinetic energy (J), m = mass (kg), v = velocity (m/s)',
        note: 'Always non-negative. Depends on speed squared, so doubling speed quadruples KE. Important for work-energy theorem.',
        tags: ['kinetic', 'energy', 'motion', 'speed'],
      },
      {
        name: 'Gravitational Potential Energy',
        formula: (
          <span>
            GPE = mgh
          </span>
        ),
        variables: 'm = mass (kg), g &asymp; 9.8 m/s&sup2;, h = height above reference (m)',
        note: 'Measured relative to a reference level (often the ground). Near Earth\'s surface, use mgh. For large height changes, use GMm/r.',
        tags: ['potential energy', 'gravitational', 'height', 'stored energy'],
      },
      {
        name: 'Conservation of Energy',
        formula: (
          <span>
            E<sub>initial</sub> = E<sub>final</sub> (in an isolated system, no non-conservative forces)
          </span>
        ),
        variables: 'Total energy = KE + GPE + other forms',
        note: 'Energy cannot be created or destroyed, only transformed. For problems with friction, use E<sub>initial</sub> = E<sub>final</sub> + W<sub>friction</sub>.',
        tags: ['conservation', 'energy', 'isolated system'],
      },
      {
        name: 'Power',
        formula: (
          <div className="space-y-1 text-sm">
            <div>P = W/t</div>
            <div>P = Fv (when force and velocity are in the same direction)</div>
          </div>
        ),
        variables: 'P = power (W), W = work (J), t = time (s), F = force (N), v = velocity (m/s)',
        note: 'Power is the rate of energy transfer. 1 Watt = 1 Joule per second. P = Fv is especially useful for vehicles at constant speed.',
        tags: ['power', 'rate', 'work', 'energy'],
      },
    ],
  },
  {
    name: 'Electricity',
    formulas: [
      {
        name: "Ohm's Law",
        formula: (
          <span>
            V = IR
          </span>
        ),
        variables: 'V = voltage (V), I = current (A), R = resistance (&Omega;)',
        note: 'Only applies to ohmic conductors (constant R). For non-ohmic devices (diodes, bulbs), R changes with temperature/voltage.',
        tags: ['ohm', 'voltage', 'current', 'resistance'],
      },
      {
        name: 'Series Circuits',
        formula: (
          <div className="space-y-1 text-sm">
            <div>R<sub>total</sub> = R<sub>1</sub> + R<sub>2</sub> + ... + R<sub>n</sub></div>
            <div>I is the same through all components</div>
            <div>V<sub>total</sub> = V<sub>1</sub> + V<sub>2</sub> + ...</div>
          </div>
        ),
        variables: 'R = resistance, V = voltage drop across each component, I = current',
        note: 'In series, current is constant but voltage divides across components. Use V=IR for each component to find its voltage drop.',
        tags: ['series', 'resistors', 'voltage divider'],
      },
      {
        name: 'Parallel Circuits',
        formula: (
          <div className="space-y-1 text-sm">
            <div>1/R<sub>total</sub> = 1/R<sub>1</sub> + 1/R<sub>2</sub> + ... + 1/R<sub>n</sub></div>
            <div>V is the same across all branches</div>
            <div>I<sub>total</sub> = I<sub>1</sub> + I<sub>2</sub> + ...</div>
          </div>
        ),
        variables: 'R = resistance, V = voltage (same across branches), I = current in each branch',
        note: 'In parallel, voltage is constant but current divides. The total resistance is always less than the smallest individual resistance.',
        tags: ['parallel', 'resistors', 'current divider'],
      },
      {
        name: 'Electrical Power',
        formula: (
          <div className="space-y-1 text-sm">
            <div>P = VI</div>
            <div>P = I&sup2;R</div>
            <div>P = V&sup2;/R</div>
          </div>
        ),
        variables: 'P = power (W), V = voltage (V), I = current (A), R = resistance (&Omega;)',
        note: 'Three equivalent forms derived from P=VI and V=IR. Choose the form based on what is known. P=I&sup2;R shows power dissipated in a resistor.',
        tags: ['power', 'electrical', 'energy', 'dissipation'],
      },
      {
        name: "Kirchhoff's Laws",
        formula: (
          <div className="space-y-1 text-sm">
            <div><strong>KCL:</strong> &Sigma;I<sub>in</sub> = &Sigma;I<sub>out</sub> (at a junction)</div>
            <div><strong>KVL:</strong> &Sigma;V around any closed loop = 0</div>
          </div>
        ),
        variables: 'I = current, V = voltage',
        note: 'KCL (current law): charge is conserved at junctions. KVL (voltage law): energy is conserved around loops. These are fundamental for analysing any circuit.',
        tags: ['kirchhoff', 'KCL', 'KVL', 'junction', 'loop', 'circuit analysis'],
      },
    ],
  },
  {
    name: 'Waves',
    formulas: [
      {
        name: 'Wave Equation',
        formula: (
          <span>
            v = f&lambda;
          </span>
        ),
        variables: 'v = wave speed (m/s), f = frequency (Hz), &lambda; = wavelength (m)',
        note: 'Applies to all waves (mechanical and electromagnetic). Frequency is determined by the source; speed is determined by the medium.',
        tags: ['wave', 'speed', 'frequency', 'wavelength'],
      },
      {
        name: "Snell's Law (Refraction)",
        formula: (
          <span>
            n<sub>1</sub> sin &theta;<sub>1</sub> = n<sub>2</sub> sin &theta;<sub>2</sub>
          </span>
        ),
        variables: 'n = refractive index, &theta; = angle to the normal',
        note: 'n = c/v where c is speed of light in vacuum. When light enters a denser medium (higher n), it bends toward the normal. Total internal reflection occurs when &theta;<sub>1</sub> exceeds the critical angle.',
        tags: ['snell', 'refraction', 'refractive index', 'total internal reflection'],
      },
      {
        name: 'Frequency and Period',
        formula: (
          <span>
            f = 1/T &nbsp; and &nbsp; T = 1/f
          </span>
        ),
        variables: 'f = frequency (Hz), T = period (s)',
        note: 'Period is the time for one complete cycle. Frequency is the number of cycles per second. Inverse relationship.',
        tags: ['frequency', 'period', 'cycle'],
      },
    ],
  },
  {
    name: 'Fields',
    formulas: [
      {
        name: "Newton's Law of Universal Gravitation",
        formula: (
          <span>
            F = GMm / r&sup2;
          </span>
        ),
        variables: 'G = 6.674 &times; 10<sup>-11</sup> N&middot;m&sup2;/kg&sup2;, M and m are masses (kg), r = distance between centres (m)',
        note: 'Always attractive. G is very small, so significant only for large masses (planets, stars). Applicable to point masses or spheres.',
        tags: ['gravitational', 'universal gravitation', 'force', 'Newton'],
      },
      {
        name: 'Gravitational Field Strength',
        formula: (
          <span>
            g = GM / r&sup2;
          </span>
        ),
        variables: 'g = gravitational field strength (N/kg or m/s&sup2;), M = source mass, r = distance from centre',
        note: 'On Earth\'s surface, g &asymp; 9.8 N/kg. As r increases, g decreases. This is also the acceleration due to gravity.',
        tags: ['gravitational field', 'g', 'field strength'],
      },
      {
        name: "Coulomb's Law",
        formula: (
          <span>
            F = kq<sub>1</sub>q<sub>2</sub> / r&sup2;
          </span>
        ),
        variables: 'k = 8.99 &times; 10<sup>9</sup> N&middot;m&sup2;/C&sup2;, q<sub>1</sub>, q<sub>2</sub> are charges (C), r = distance between charges (m)',
        note: 'Attractive if charges are opposite, repulsive if same sign. Similar structure to gravitation but much stronger. k = 1/(4&pi;&epsilon;<sub>0</sub>).',
        tags: ['coulomb', 'electric force', 'charge', 'electrostatic'],
      },
      {
        name: 'Electric Field Strength',
        formula: (
          <div className="space-y-1 text-sm">
            <div>E = F/q (definition)</div>
            <div>E = kq/r&sup2; (point charge)</div>
            <div>E = V/d (uniform field)</div>
          </div>
        ),
        variables: 'E = electric field strength (N/C or V/m), F = force, q = test charge, V = voltage, d = distance',
        note: 'Direction: away from positive charges, toward negative charges. In a uniform field, the field lines are equally spaced and parallel.',
        tags: ['electric field', 'field strength', 'force per charge'],
      },
    ],
  },
];

const SUBJECT_DATA: Record<Subject, Category[]> = {
  maths: mathsCategories,
  physics: physicsCategories,
};

const SUBJECT_LABELS: Record<Subject, string> = {
  maths: 'Maths',
  physics: 'Physics',
};

const CATEGORY_ICONS: Record<string, string> = {
  Algebra: 'A',
  Functions: 'f(x)',
  Calculus: '\u222B',
  Probability: 'P',
  Statistics: '\u03C3',
  Trigonometry: '\u03B8',
  Mechanics: 'F',
  Energy: 'E',
  Electricity: 'V',
  Waves: '\u03BB',
  Fields: 'g',
};

function FormulaCard({ formula }: { formula: Formula }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {formula.name}
          </h3>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
            <div className="text-lg font-mono text-blue-800 dark:text-blue-200 text-center leading-relaxed">
              {formula.formula}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Variables
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {formula.variables}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              How to Use
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {formula.note}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FormulasPage() {
  const [subject, setSubject] = useState<Subject>('maths');
  const [search, setSearch] = useState('');
  const [activeCategories, setActiveCategories] = useState<string[]>([]);

  const categories = SUBJECT_DATA[subject];

  const allCategoryNames = useMemo(
    () => categories.map((c) => c.name),
    [categories]
  );

  const toggleCategory = (name: string) => {
    setActiveCategories((prev) =>
      prev.includes(name)
        ? prev.filter((c) => c !== name)
        : [...prev, name]
    );
  };

  const clearFilters = () => {
    setSearch('');
    setActiveCategories([]);
  };

  const filteredCategories = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();

    return categories
      .filter((cat) => activeCategories.length === 0 || activeCategories.includes(cat.name))
      .map((cat) => ({
        ...cat,
        formulas: cat.formulas.filter((f) => {
          if (!lowerSearch) return true;
          const searchableText = [
            f.name,
            f.note,
            f.variables,
            ...f.tags,
          ]
            .join(' ')
            .toLowerCase();
          return searchableText.includes(lowerSearch);
        }),
      }))
      .filter((cat) => cat.formulas.length > 0);
  }, [categories, search, activeCategories]);

  const totalResults = filteredCategories.reduce(
    (sum, cat) => sum + cat.formulas.length,
    0
  );

  const handleSubjectChange = (newSubject: Subject) => {
    setSubject(newSubject);
    setActiveCategories([]);
    setSearch('');
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Formula Reference"
        description="VCE Maths and Physics formulas at your fingertips"
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-1">
            {(['maths', 'physics'] as Subject[]).map((s) => (
              <button
                key={s}
                onClick={() => handleSubjectChange(s)}
                className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  subject === s
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-600 dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                {SUBJECT_LABELS[s]}
              </button>
            ))}
          </div>

          <Input
            placeholder="Search formulas, variables, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {allCategoryNames.map((name) => (
            <button
              key={name}
              onClick={() => toggleCategory(name)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                activeCategories.includes(name)
                  ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700'
              }`}
            >
              <span className="w-5 h-5 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-600 text-[10px] font-bold">
                {CATEGORY_ICONS[name] || name[0]}
              </span>
              {name}
            </button>
          ))}
          {(search || activeCategories.length > 0) && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              &times; Clear all
            </button>
          )}
        </div>

        {(search || activeCategories.length > 0) && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {totalResults} formula{totalResults !== 1 ? 's' : ''}
            {search && (
              <span>
                {' '}matching &ldquo;{search}&rdquo;
              </span>
            )}
          </p>
        )}

        {filteredCategories.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="text-4xl mb-4">{'\u2753'}</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No formulas found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Try adjusting your search or clearing the filters.
              </p>
              <Button variant="secondary" onClick={clearFilters}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map((cat) => (
              <div key={cat.name}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-bold">
                    {CATEGORY_ICONS[cat.name] || cat.name[0]}
                  </span>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {cat.name}
                  </h2>
                  <Badge variant="info">{cat.formulas.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {cat.formulas.map((formula) => (
                    <FormulaCard key={formula.name} formula={formula} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
