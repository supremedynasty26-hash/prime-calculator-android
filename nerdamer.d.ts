declare module 'nerdamer/all' {
  interface NerdamerExpression {
    toString(): string;
    expand(): NerdamerExpression;
  }
  interface NerdamerStatic {
    (expression: string): NerdamerExpression;
    solveEquations(equation: string, variable?: string): unknown;
  }
  const nerdamer: NerdamerStatic;
  export default nerdamer;
}
