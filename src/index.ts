// @langpkg/parser
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import * as Types from './types';
    import * as core from './core';

    export { Parser } from './core';
    export { Result } from './result';

    export type {
        Span, Token, MiniToken, Pattern, Rule, Rules,
        ErrorHandler, RecoveryStrategy, BuildFunction,
        ParseResult, ParserSettings, ParseError, DebugLevel,
        PrattTable, PrefixHandler, InfixHandler,
        ConditionalContext, ConditionalPredicate,
    } from './types';

    export { ERRORS, globalTokenMap } from './types';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ MAIN ════════════════════════════════════════╗

    // ---------------------------------------------------------------------------
    // registerTokenMap  -  register global string-to-token mapping
    // ---------------------------------------------------------------------------

    /**
     * Register a global token map for string shorthand patterns.
     * After registration, you can use 'let', 'if', etc. directly in patterns.
     *
     * @example
     * registerTokenMap({
     *   'let': 'LET',
     *   'if': 'IF',
     *   '{': 'LBRACE',
     *   '}': 'RBRACE',
     *   '=': 'EQ',
     * });
     *
     * // Now you can write:
     * seq('let', 'IDENT', '=', rule('expr'))
     */
    export function registerTokenMap(map: Record<string, string>): void {
        Object.assign(Types.globalTokenMap, map);
    }

    // ---------------------------------------------------------------------------
    // parse()  -  same signature as before
    // ---------------------------------------------------------------------------

    export function parse(
        tokens: Types.Token[],
        rules: Types.Rules,
        settings?: Types.ParserSettings,
    ): Types.ParseResult {
        const parser = new core.Parser(rules, settings);
        try { return parser.parse(tokens); }
        finally { parser.dispose(); }
    }

    // ---------------------------------------------------------------------------
    // createRule  -  same as before
    // ---------------------------------------------------------------------------

    export function createRule(
        name: string,
        pattern: Types.Pattern,
        options: Types.Rule['options'] = {},
    ): Types.Rule {
        return { name, pattern, options: { name: false, ...options } as Types.Rule['options'] };
    }

    // ---------------------------------------------------------------------------
    // Pattern builders  -  same API
    // ---------------------------------------------------------------------------

    export function token(name: string, value?: string): Types.Pattern {
        if (!name) throw new Error('token(): name must be a non-empty string');
        return { type: 'token', name, value, silent: false };
    }

    export function optional(pattern: Types.Pattern): Types.Pattern {
        return { type: 'optional', pattern, silent: false };
    }

    export function choice(...patterns: Types.Pattern[]): Types.Pattern {
        if (!patterns.length) throw new Error('choice(): at least one pattern required');
        return { type: 'choice', patterns, silent: false };
    }

    export function repeat(
        pattern: Types.Pattern,
        min = 0,
        max = Infinity,
        separator?: Types.Pattern,
    ): Types.Pattern {
        if (min < 0) throw new Error('repeat(): min cannot be negative');
        if (max < min) throw new Error('repeat(): max cannot be less than min');
        return { type: 'repeat', pattern, min, max, separator, silent: false };
    }

    export function oneOrMore(pattern: Types.Pattern, separator?: Types.Pattern): Types.Pattern {
        return repeat(pattern, 1, Infinity, separator);
    }

    export function zeroOrMore(pattern: Types.Pattern, separator?: Types.Pattern): Types.Pattern {
        return repeat(pattern, 0, Infinity, separator);
    }

    export function zeroOrOne(pattern: Types.Pattern, separator?: Types.Pattern): Types.Pattern {
        return silent(repeat(pattern, 0, 1, separator));
    }

    export function seq(...patterns: Types.Pattern[]): Types.Pattern {
        if (!patterns.length) throw new Error('seq(): at least one pattern required');
        return { type: 'seq', patterns, silent: false };
    }

    export function rule(name: string): Types.Pattern;
    export function rule(name: string, params: Record<string, unknown>): Types.Pattern;
    export function rule(name: string, params?: Record<string, unknown>): Types.Pattern {
        if (!name) throw new Error('rule(): name must be a non-empty string');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { type: 'rule', name, params: params as any, silent: false };
    }

    export function silent<T extends Types.Pattern>(pattern: T): T {
        return { ...pattern, silent: true };
    }

    export function loud<T extends Types.Pattern>(pattern: T): T {
        return { ...pattern, silent: false };
    }

    /**
     * Build a Pratt expression parser inline in a rule.
     *
     * @example
     * const expr = pratt({
     *     prefix: new Map([
     *         ['NUM',   { bp: 0, parse: (_, tok) => Result.createAsToken('passed', tok, tok.span) }],
     *             ['MINUS', { bp: 70, parse: (p, tok) => {
     *                 const right = p.parse(...)   // handled via sub-rule
     *                 return Result.createAsPratt('passed', [right], right.span)
     *             }}],
     *         ]),
     *     infix: new Map([
     *         ['PLUS',  { lbp: 50, parse: (_, left, tok) => ... }],
     *         ['STAR',  { lbp: 60, parse: (_, left, tok) => ... }],
     *         ['STAR2', { lbp: 70, rbp: 69, parse: ... }], // right-associative
     *    ]),
     * });
     */
    export function pratt(table: Types.PrattTable): Types.Pattern {
        return { type: 'pratt', table, silent: false };
    }

    /**
     * Adds conditional execution to a pattern.
     * The predicate receives parser context and decides whether to continue.
     *
     * @param pattern     - The pattern to conditionally execute
     * @param predicate   - Function that receives parser context and returns true to continue
     * @returns Conditional pattern that evaluates predicate after inner pattern matches
     *
     * @example
     * // Only match if we're not too deep in the parse tree
     * pattern.if(ctx => ctx.depth < 10)
     *
     * // Only match if next token after match is LBRACE
     * token('IF').if(ctx => ctx.parser.isNextToken('LBRACE'))
     *
     * // Inspect full parser state
     * rule('expr').if(ctx => {
     *   return ctx.parser.errors.length === 0 && ctx.ruleStack.length < 5
     * })
     */
    export function conditional(
        pattern: Types.Pattern,
        predicate: Types.ConditionalPredicate,
    ): Types.Pattern {
        return { type: 'conditional', pattern, predicate, silent: false };
    }

    /**
     * Shorthand for conditional() - more natural syntax
     * @see conditional
     */
    export function when(
        pattern: Types.Pattern,
        predicate: Types.ConditionalPredicate,
    ): Types.Pattern {
        return conditional(pattern, predicate);
    }

    /**
     * Method-chaining style: pattern.if(predicate)
     * Extends Pattern type with .if() method for fluent API
     *
     * @note This is implemented as a utility function, not directly on Pattern
     *       Use: conditional(pattern, predicate) or when(pattern, predicate)
     */
    export function ifCondition(
        pattern: Types.Pattern,
        predicate: Types.ConditionalPredicate,
    ): Types.Pattern {
        return conditional(pattern, predicate);
    }

    /**
     * Action pattern - executes a side effect during parsing.
     * Useful for scope management, state tracking, and stateful parsing.
     *
     * @param fn - Function called during execution with access to parser state
     * @returns Action pattern that always succeeds
     *
     * @example
     * // Track parse state
     * seq(
     *   token('LBRACE'),
     *   action(p => p.symbolTable?.pushScope()),
     *   zeroOrMore(rule('stmt')),
     *   token('RBRACE'),
     *   action(p => p.symbolTable?.popScope())
     * )
     *
     * // Count custom metric
     * action(p => p.stats.customCounter = (p.stats.customCounter ?? 0) + 1)
     */
    export function action(fn: Types.ActionFunction): Types.Pattern {
        return { type: 'action', fn, silent: false };
    }

    /**
     * NOT pattern - succeeds if the inner pattern FAILS.
     * Useful for negative lookahead and validation checks.
     *
     * @param pattern - The pattern to negate
     * @returns NOT pattern
     *
     * @example
     * // Match any character except EOF
     * not(token('EOF'))
     *
     * // In a choice: match IDENT that is not a keyword
     * choice(
     *   not(choice(token('IF'), token('WHILE'), token('FOR'))),
     *   token('IDENT')
     * )
     */
    export function not(pattern: Types.Pattern): Types.Pattern {
        return { type: 'not', pattern, silent: false };
    }

    /**
     * Lookahead pattern - checks if inner pattern would match WITHOUT consuming tokens.
     * Common alias: peek()
     *
     * @param pattern - The pattern to lookahead check
     * @returns Lookahead pattern
     *
     * @example
     * // Only match expr if followed by RPAREN
     * seq(
     *   lookahead(seq(rule('expr'), token('RPAREN'))),
     *   rule('expr')
     * )
     *
     * // Safe token inspection
     * seq(
     *   token('IDENT'),
     *   when(lookahead(token('LPAREN')), ctx => ctx.parser.isNextToken('LPAREN'))
     * )
     */
    export function lookahead(pattern: Types.Pattern): Types.Pattern {
        return { type: 'lookahead', pattern, silent: false };
    }

    /**
     * Alias for lookahead() - more concise syntax.
     * @see lookahead
     */
    export function peek(pattern: Types.Pattern): Types.Pattern {
        return lookahead(pattern);
    }

    /** Convenience: build a PrattTable from plain objects. */
    export function buildPrattTable(spec: {
        prefix?: Record<string, Types.PrefixHandler>
        infix?: Record<string, Types.InfixHandler>
    }): Types.PrattTable {
        return {
            prefix: new Map(Object.entries(spec.prefix ?? {})),
            infix: new Map(Object.entries(spec.infix ?? {})),
        };
    }

    // ---------------------------------------------------------------------------
    // Pattern composition helpers
    // ---------------------------------------------------------------------------

    /**
     * Delimited list pattern - matches items separated by a delimiter.
     * Commonly used for comma-separated values, arguments, etc.
     *
     * @param item - The pattern for each list item
     * @param sep - The separator pattern (usually token(','))
     * @param options - {min?: number, trailingOk?: boolean}
     * @returns Composed pattern for delimited list
     *
     * @example
     * // Comma-separated identifiers (0+)
     * delimited(token('IDENT'), token('COMMA'))
     *
     * // Function arguments (1+ with optional trailing)
     * delimited(rule('expr'), token('COMMA'), {min: 1, trailingOk: true})
     *
     * // Array elements
     * between('[', delimited(rule('expr'), token('COMMA')), ']')
     */
    export function delimited(
        item: Types.Pattern,
        sep: Types.Pattern,
        options?: { min?: number; trailingOk?: boolean },
    ): Types.Pattern {
        const { min = 0, trailingOk = false } = options ?? {};

        // Build the core: first item(s)
        let core: Types.Pattern;
        if (min === 0) {
            // 0+ items: optional entire list
            if (trailingOk) {
                core = optional(seq(
                    repeat(item, 1, Infinity),
                    zeroOrMore(seq(sep, item)),
                    optional(sep),
                ));
            } else {
                core = optional(seq(
                    repeat(item, 1, Infinity),
                    zeroOrMore(seq(sep, item)),
                ));
            }
        } else if (min === 1) {
            // 1+ items
            if (trailingOk) {
                core = seq(
                    repeat(item, 1, Infinity),
                    zeroOrMore(seq(sep, item)),
                    optional(sep),
                );
            } else {
                core = seq(
                    repeat(item, 1, Infinity),
                    zeroOrMore(seq(sep, item)),
                );
            }
        } else {
            // min > 1
            if (trailingOk) {
                core = seq(
                    repeat(item, min, Infinity),
                    zeroOrMore(seq(sep, item)),
                    optional(sep),
                );
            } else {
                core = seq(
                    repeat(item, min, Infinity),
                    zeroOrMore(seq(sep, item)),
                );
            }
        }

        return core;
    }

    /**
     * Surrounded pattern - matches content between open and close delimiters.
     * Alias for between(open, content, close).
     *
     * @param content - The pattern for interior content
     * @param open - Opening delimiter
     * @param close - Closing delimiter
     * @returns Composed pattern: open, content, close
     *
     * @example
     * // Parenthesized expression
     * surrounded(rule('expr'), token('LPAREN'), token('RPAREN'))
     *
     * // Generic syntax with string shorthand
     * surrounded(rule('typeList'), '(', ')')
     */
    export function surrounded(
        content: Types.Pattern,
        open: Types.Pattern,
        close: Types.Pattern,
    ): Types.Pattern {
        return seq(open, content, close);
    }

    /**
     * Between pattern - matches content between left and right patterns.
     * Alias for surrounded but with more explicit name.
     *
     * @param left - Left sentinel pattern
     * @param content - Interior content pattern
     * @param right - Right sentinel pattern
     * @returns Composed pattern: left, content, right
     *
     * @example
     * // Array literal
     * between(token('LBRACK'), delimited(rule('expr'), token('COMMA')), token('RBRACK'))
     *
     * // Function call
     * between('(', delimited(rule('param'), ','), ')')
     */
    export function between(
        left: Types.Pattern,
        content: Types.Pattern,
        right: Types.Pattern,
    ): Types.Pattern {
        return seq(left, content, right);
    }

    // ---------------------------------------------------------------------------
    // Error helpers  -  same as before
    // ---------------------------------------------------------------------------

    export function error(
        cond: Types.ErrorHandler['cond'],
        msg: string,
        code?: string,
    ): Types.ErrorHandler {
        return { cond, msg, code: code ?? Types.ERRORS.RECOVERY_CUSTOM };
    }

    export const errorRecoveryStrategies = {
        skipUntil(tokens: string | string[]): Types.RecoveryStrategy {
            return { type: 'skipUntil', tokens: Array.isArray(tokens) ? tokens : [tokens] };
        },
    };

// ╚══════════════════════════════════════════════════════════════════════════════════════╝