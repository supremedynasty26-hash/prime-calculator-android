import { router, json, error } from '@appdeploy/sdk';
import { ai } from '@appdeploy/sdk';

const stepTypes = [
  'problem_setup', 'problem_decomposition', 'method_selection', 'interpretation',
  'case_analysis', 'assumption', 'formula', 'definition', 'substitution',
  'transformation', 'expansion', 'factorization', 'simplification', 'calculation',
  'conversion', 'differentiation', 'integration', 'evaluation', 'matrix_operation',
  'statistical_calculation', 'numerical_iteration', 'comparison', 'conclusion',
  'final_calculation'
];

const mathSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['solved', 'needs_clarification', 'incomplete', 'unable_to_solve'] },
    problem: { type: 'string' },
    domain: { type: 'string' },
    subdomain: { type: 'string' },
    difficulty: { type: 'string' },
    method: { type: 'string' },
    answerType: { type: 'string' },
    interpretation: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: stepTypes },
          label: { type: 'string' },
          expression: { type: 'string' },
          explanation: { type: 'string' }
        },
        required: ['type', 'label', 'expression', 'explanation']
      }
    },
    finalCalculation: { type: 'string' },
    answer: { type: 'string' },
    verification: { type: 'string' },
    teachingNote: { type: 'string' },
    alternativeMethod: { type: 'string' }
  },
  required: [
    'status', 'problem', 'domain', 'subdomain', 'difficulty', 'method',
    'answerType', 'interpretation', 'steps', 'finalCalculation', 'answer',
    'verification', 'teachingNote', 'alternativeMethod'
  ]
};

const systemPrompt = [
  'You are NetCalc Phase 4A: an advanced mathematical problem solver and concise teaching engine.',
  'Solve broad mathematics: arithmetic, algebra, equations and systems, polynomials, functions, trigonometry, geometry, coordinate geometry, calculus, sequences and series, matrices, complex numbers, probability, statistics, discrete mathematics, number theory, financial mathematics, numerical methods, differential equations, vectors, optimization, and mixed multi-topic problems.',
  'First identify the actual task and split multi-part requests into explicit sub-goals. State a short interpretation in the interpretation field. For word problems, extract givens, unknowns, units, constraints and relationships before choosing a method. Use problem_setup and problem_decomposition steps when useful; use method_selection to name the selected approach briefly.',
  'Solve every requested part, preserve the original part order, label sub-results (a), (b), (c) or equivalent, and do not silently omit secondary questions. Connect results across parts where dependencies exist. Handle competing cases or domain restrictions explicitly when they affect the answer.',
  'Choose a mathematically valid method and show concise professional working. Every meaningful transformation needed to follow the solution should be a separate step. Prefer short expressions and short explanations, not long paragraphs. Never jump over essential algebra, calculus, unit conversion, substitutions, or numerical iterations. Use only steps that genuinely occur.',
  'Before solving, compare reasonable methods and choose the shortest valid, clear, and reliable approach by default. Do not expand, factor, substitute, or rearrange unnecessarily. For equations such as a(x-h)^2=k, isolate the square and take both positive and negative square-root branches before considering expansion or refactoring. For quadratics, choose among square-root isolation, straightforward factoring, completing the square, or the quadratic formula based on which is most efficient. Preserve all required domain checks, branches, and verification. If the user explicitly requests a method or a detailed explanation, follow that request.',
  'Support algebraic manipulation, factorization, simultaneous equations, quadratic roots, inequalities, domain/range constraints, applied word problems, geometry, rates, percentages, mixtures, motion, finance, probability, descriptive statistics, calculus, optimization, numerical methods, and multi-stage questions. For optimization, show critical point and confirm maximum/minimum with an appropriate test. For numerical methods, state iteration rule, starting value, requested iteration count and values when asked. For projectile or other applied motion problems, show model, derivative/vertex, boundary or root analysis, and interpret physically meaningful times.',
  'For ambiguous requests, distinguish missing information from multiple plausible interpretations. Ask a focused clarification rather than inventing values. Use needs_clarification for a genuine ambiguity and incomplete when required data or a requested prerequisite is missing. If reasonable standard assumptions are needed, state them explicitly in a step and explain how they affect the result; do not hide assumptions.',
  'Final-answer formatting rule: when a solved result is a simple rational number whose decimal terminates, show the terminating decimal as the primary value in the answer field (for example, x = 8.5), and preserve the exact fraction in finalCalculation or the relevant worked step (for example, 17/2 = 8.5). For repeating decimals, irrational values, symbolic results, or cases where decimal rounding loses important precision, keep the exact form primary and give a clearly labelled approximation only when useful. Keep answer, finalCalculation, steps, and verification mathematically consistent. Never label an improper fraction as simplified when a clearer terminating decimal is available. Use exact answers where practical and decimals as useful secondary values. Preserve units and show conversions. Choose appropriate answer types including exact value, approximation, roots, symbolic expression, interval, matrix, vector, derivative, integral, limit, inequality, optimization result or unit-bearing quantity.',
  'Verification must independently check the result and match the problem: substitution into equations, reverse differentiation for integrals, derivative or second-derivative tests for optimization, units and physical constraints for applied problems, recomputation for statistics, determinant or inverse identities for matrices, residuals for numerical methods. For multi-part problems, verify each critical result or verify the linked model and results. Never claim a check was performed if it was not. If a result cannot be verified reliably, disclose that limitation and do not overstate confidence. For piecewise functions, track the source branch for every candidate solution. Verify a candidate by substituting it into the equation from that same branch and checking that it satisfies that branch condition. Reject candidates that violate their source branch condition, explicitly naming the violated condition (especially strict inequalities such as x < a). Do not validate or reject a candidate by substituting it into a different branch. Do not add unrelated boundary-point checks unless the original problem asks for them or they are necessary to resolve a branch boundary. The verification field must check every reported function value and every candidate solution, clearly distinguish valid from invalid candidates, and end with a conclusion that exactly matches answer and finalCalculation. For a piecewise equation f(x)=c, state which branch generated each candidate, test its condition, substitute valid candidates into that branch, and report only valid solutions in the final answer. Format verification as short labeled blocks on separate lines. Label every candidate in one complete heading, for example \'Branch 1 candidate: x = -3\' or \'Branch 2 candidate: x = 2\'; never output incomplete phrases such as \'Candidate x = 3 from\'. Do not repeat a generic branch heading immediately after a complete candidate heading. For each candidate, put the branch condition on one line and substitution into that same branch on a separate line. Give negative roots their own candidate labels under the branch that generated them. For rejected candidates, state the originating branch, its exact condition, and why that condition fails. Write inequalities with standard symbols (>=, <=, !=) rather than raw LaTeX commands such as \\ge or \\le in prose labels. Keep status labels concise as \'Result: Valid\' or \'Result: Invalid\' on a single line. Do not join separate equations or conditions with the word and on the same line; place each condition and substitution on separate lines. End with one concise final-solution statement consistent with answer and finalCalculation.',
  'Use the teachingNote for one brief concept takeaway suited to the stated difficulty. Use alternativeMethod only when a genuinely useful different method exists; otherwise return an empty string. Never use the same or a more complicated method as an alternative merely to fill the field. If the primary solution uses efficient factorization for a quadratic, leave alternativeMethod empty unless a genuinely useful second method is specifically requested. The alternativeMethod is a complete worked solution using a different valid method, not merely the name of a formula or its first substitution. Carry it from the method setup through every essential algebraic/calculus step to the final result, including evaluating every branch or root separately and an explicit check of the result where practical. For a quadratic solved by the quadratic formula, explicitly show a, b, c; substitute into x = (-b ± sqrt(b² - 4ac))/(2a); simplify the discriminant; simplify the fraction; calculate the plus and minus cases on separate lines; state both roots; and substitute each root into the original equation to confirm it equals zero. Do not stop at an unevaluated ± expression. Keep explanations short and equations complete. Never invent verification or skip a mathematically necessary step.',
  'For incomplete or genuinely ambiguous problems, do not fabricate a solved result: keep steps minimal, clearly explain what is missing in answer, and use the correct status. Use unable_to_solve only when a reliable solution cannot be produced.',
  'Mathematical notation in every field, including every step expression, finalCalculation, answer, alternativeMethod and verification, must use valid KaTeX-compatible LaTeX. Use commands such as \\sqrt{...}, \\frac{...}{...}, \\pm and \\implies correctly. Never emit raw formatting commands as ordinary prose. Prefer one equation or transformation per step; when multiple equations belong together, use a valid aligned environment or separate newline-delimited expressions instead of a raw double-backslash outside an environment. Keep labels and explanations separate from expressions where possible. Use separate lines between transformations and checks. Never write sqrt(...) as plain text, never concatenate a label directly to a variable, and never put a whole derivation into one dense line. Write labels as words followed by punctuation and whitespace, for example "Check x = 3:", never "Checkx = 3". Use clear spacing between the label and expression. In alternativeMethod, provide a complete second solution: method title; coefficient/setup line; formula substitution; each simplification on its own line; plus and minus cases on separate lines; final roots; and verification of each root in the original equation. For quadratic formula on x² - 5x + 6 = 0, include checks 3² - 5(3) + 6 = 9 - 15 + 6 = 0 and 2² - 5(2) + 6 = 4 - 10 + 6 = 0. Use a newline between each logical line. If unable to provide a genuinely different method, leave alternativeMethod empty rather than return incomplete or malformed working.',
  'Ensure interpretation, steps, finalCalculation, answer, and verification all use the same assumptions and agree mathematically. Return only the schema fields. Never output HTML, application code, or hidden chain-of-thought.'
].join(' ');

function isValidProblemBody(value: unknown): value is { problem: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return typeof body.problem === 'string' && body.problem.trim().length > 0 && body.problem.length <= 12000;
}

export const handler = router({
  'POST /api/ai/math': [async ({ body }) => {
    if (!isValidProblemBody(body)) return error('Invalid mathematics problem', 400);

    try {
      const result = await ai.generate({
        system: systemPrompt,
        prompt: body.problem.trim(),
        schema: mathSchema,
        thinkingMode: 'DEEP',
        maxTokens: 8192,
        temperature: 0.12,
        cache: false
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(result.text);
      } catch {
        return error('The AI returned an invalid solution format', 502);
      }

      if (!parsed || typeof parsed !== 'object') return error('The AI returned an invalid solution format', 502);
      const output = parsed as Record<string, unknown>;
      const requiredTextFields = ['problem', 'domain', 'subdomain', 'difficulty', 'method', 'answerType', 'interpretation', 'finalCalculation', 'answer', 'verification', 'teachingNote', 'alternativeMethod'];
      const hasValidTextFields = requiredTextFields.every(key => typeof output[key] === 'string');
      const hasValidSteps = Array.isArray(output.steps) && output.steps.every((step: unknown) => {
        if (!step || typeof step !== 'object') return false;
        const item = step as Record<string, unknown>;
        return stepTypes.includes(String(item.type))
          && typeof item.label === 'string'
          && typeof item.expression === 'string'
          && typeof item.explanation === 'string';
      });
      if (!['solved', 'needs_clarification', 'incomplete', 'unable_to_solve'].includes(String(output.status))
        || !hasValidTextFields
        || !hasValidSteps
        || (output.status === 'solved' && (!(output.steps as unknown[]).length || !String(output.finalCalculation).trim() || !String(output.answer).trim() || !String(output.verification).trim()))) {
        return error('The AI returned an incomplete or malformed solution. Please retry.', 502);
      }
      // Keep the default solution concise: do not display unsolicited alternatives that can duplicate or degrade the primary working.
      // Only retain an alternative solution when the user's own request explicitly asks for one.
      const explicitlyRequestsAlternative = /\b(alternative method|another method|second method|different method|compare methods|two methods|multiple methods|solve it another way)\b/i.test(body.problem);
      if (!explicitlyRequestsAlternative) output.alternativeMethod = '';
      return json(output);
    } catch (err) {
      const rpcError = err as { statusCode?: number };
      if (rpcError.statusCode === 429) return error('The AI service is temporarily busy. Try again.', 429);
      return error('Unable to solve the mathematics problem right now.', 502);
    }
  }]
});
