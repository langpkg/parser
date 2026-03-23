type ResultStatus = 'unset' | 'failed' | 'passed';
type ResultMode = 'unset' | 'token' | 'optional' | 'choice' | 'repeat' | 'seq' | 'pratt' | 'custom';
interface TokenSource {
    source_kind: 'token-source';
    kind: string;
    value?: string;
    span?: Span;
}
interface OptionalSource {
    source_kind: 'optional-source';
    result: Result | null;
}
interface ChoiceSource {
    source_kind: 'choice-source';
    atIndex: number;
    result: Result | null;
}
interface RepeatSource {
    source_kind: 'repeat-source';
    endsWithSep: boolean;
    result: Result[];
}
interface SequenceSource {
    source_kind: 'sequence-source';
    result: Result[];
}
interface PrattSource {
    source_kind: 'pratt-source';
    result: Result[];
}
interface CustomSource {
    source_kind: 'custom-source';
    name: string;
    data: unknown;
}
type ResultSource = TokenSource | OptionalSource | ChoiceSource | RepeatSource | SequenceSource | PrattSource | CustomSource | null;
declare class Result {
    span: Span;
    status: ResultStatus;
    source: ResultSource;
    mode: ResultMode;
    errors: ParseError[];
    constructor(status: ResultStatus, source: ResultSource | null, mode: ResultMode, span: Span);
    static create(status: ResultStatus, source: ResultSource | null, mode: ResultMode, span: Span): Result;
    static createAsToken(status: ResultStatus, source: Token | null, span: Span): Result;
    static createAsOptional(status: ResultStatus, source: Result | null, span: Span): Result;
    static createAsChoice(status: ResultStatus, source: Result | null, index: number, span: Span): Result;
    static createAsRepeat(status: ResultStatus, source: Result[] | null, span: Span, endsWithSep?: boolean): Result;
    static createAsSequence(status: ResultStatus, source: Result[] | null, span: Span): Result;
    static createAsPratt(status: ResultStatus, source: Result[], span: Span): Result;
    static createAsCustom(status: ResultStatus, name: string, data: unknown, span: Span): Result;
    isPassed(): boolean;
    isFailed(): boolean;
    isUnset(): boolean;
    isToken(): boolean;
    isOptional(): boolean;
    isChoice(): boolean;
    isRepeat(): boolean;
    isSequence(): boolean;
    isPratt(): boolean;
    isFullyPassed(): boolean;
    isOptionalPassed(): boolean;
    isCustom(tag?: string): boolean;
    getTokenKind(): string | undefined;
    getTokenSpan(): Span | undefined;
    getOptionalResult(): Result | null | undefined;
    getChoiceIndex(): number | undefined;
    getChoiceResult(): Result | null | undefined;
    getRepeatCount(): number | undefined;
    getRepeatResult(): Result[] | undefined;
    isRepeatEndsWithSep(): boolean | undefined;
    getSequenceCount(): number | undefined;
    getSequenceResult(): Result[] | undefined;
    getPrattResult(): Result[] | undefined;
    getCustomData(): unknown | undefined;
    getCustomName(): string | undefined;
    getTokenValue(): string | null | undefined;
    getTokenData(): Token | undefined;
    clone(): Result;
    hasErrors(): boolean;
    withError(e: ParseError): Result;
}

declare class Parser {
    rules: Map<string, Rule>;
    settings: ParserSettings;
    tokens: Token[];
    index: number;
    errors: ParseError[];
    ast: Result[];
    stats: ParseStatistics;
    private _compiled;
    private _ruleIndex;
    private _laTable;
    private _memo;
    private _depth;
    private _silentDepth;
    private _rootStart;
    private _startTime;
    private _debugLevel;
    private _ignoredSet;
    lastHandledRule: string;
    lastVisitedIndex: number;
    ruleStack: string[];
    constructor(rules: Rule[], settings?: ParserSettings);
    parse(tokens: Token[]): ParseResult;
    dispose(): void;
    isNextToken(kind: string, extra?: string[]): boolean;
    isPrevToken(kind: string, from?: number, extra?: string[]): boolean;
    isPrevRule(name: string): boolean;
    private _buildLookaheadSets;
    private _firstOfPattern;
    private _compilePattern;
    private _compileToken;
    private _compileRule;
    private _compileSeq;
    private _compileChoice;
    private _compileOptional;
    private _compileRepeat;
    private _compilePratt;
    private _compileConditional;
    private _compileAction;
    private _compileNot;
    private _compileLookahead;
    private _getMemo;
    private _setMemo;
    private _mkError;
    private _customErrorOr;
    private _addError;
    private _handleFatal;
    private _safeBuild;
    private _span;
    private _spanOf;
    private _skipIgnored;
    private _patStr;
    private _validateGrammar;
    private _normalizeSettings;
    private _reset;
}

interface Token {
    kind: string;
    value: string | null;
    span: Span;
}
interface MiniToken {
    kind: string;
    value: string | null;
}
interface Span {
    start: number;
    end: number;
}
/**
 * Conditional context passed to predicate function.
 * Provides access to parser state for conditional decision-making.
 */
interface ConditionalContext {
    parser: Parser;
    result: Result | null;
    index: number;
    depth: number;
    ruleStack: string[];
}
/**
 * Predicate function for conditional pattern execution.
 * Return true to continue with the pattern, false to fail.
 */
type ConditionalPredicate = (context: ConditionalContext) => boolean;
/**
 * Action function executed for side effects during parsing.
 * Called during pattern execution, can access and modify parser state.
 */
type ActionFunction = (parser: Parser) => void;
interface Pattern {
    type: 'token' | 'rule' | 'repeat' | 'choice' | 'seq' | 'optional' | 'pratt' | 'conditional' | 'action' | 'not' | 'lookahead';
    silent: boolean;
    value?: string;
    name?: string;
    min?: number;
    max?: number;
    patterns?: Pattern[];
    separator?: Pattern;
    pattern?: Pattern;
    table?: PrattTable;
    predicate?: ConditionalPredicate;
    fn?: ActionFunction;
    params?: Record<string, any>;
}
interface PrefixHandler {
    /** How tightly this prefix binds its right operand. */
    bp: number;
    parse: (parser: Parser, token: Token) => Result;
}
interface InfixHandler {
    /** Precedence level - left binding power. */
    lbp: number;
    /** Right binding power (lbp - 1 for right-associative). Defaults to lbp. */
    rbp?: number;
    parse: (parser: Parser, left: Result, token: Token) => Result;
}
interface PrattTable {
    prefix: Map<string, PrefixHandler>;
    infix: Map<string, InfixHandler>;
}
interface ErrorHandler {
    cond: number | ((parser: Parser, opt: {
        failedAt: number;
        tokenIndex: number;
        force?: boolean;
        prevRule?: string;
        prevInnerRule?: string;
    }) => boolean);
    msg: string;
    code?: string;
}
interface RecoveryStrategy {
    type: 'skipUntil' | 'synchronize';
    tokens?: string[];
    token?: string;
}
type BuildFunction = (matches: Result, parser: Parser) => Result;
interface Rule {
    name: string;
    pattern: Pattern;
    options?: {
        build?: BuildFunction;
        errors?: ErrorHandler[];
        recovery?: RecoveryStrategy;
        ignored?: string[];
        silent?: boolean;
    };
}
type Rules = Rule[];
interface ParseStatistics {
    tokensProcessed: number;
    rulesApplied: number;
    errorsRecovered: number;
    parseTimeMs: number;
}
interface ParseError {
    msg: string;
    code: string;
    span: Span;
    failedAt: number;
    tokenIndex: number;
    startIndex: number;
    prevRule: string;
    prevInnerRule?: string;
}
interface ParseResult {
    ast: Result[];
    errors: ParseError[];
    statistics?: ParseStatistics;
}
type DebugLevel = 'off' | 'errors' | 'rules' | 'patterns' | 'tokens' | 'verbose';
interface ParserSettings {
    startRule: string;
    errorRecovery?: {
        mode?: 'strict' | 'resilient';
        maxErrors?: number;
    };
    ignored?: string[];
    debug?: DebugLevel;
    maxDepth?: number;
}
declare const ERRORS: {
    readonly LEXICAL_ERROR: "LEXICAL_ERROR";
    readonly TOKEN_EXPECTED_EOF: "TOKEN_EXPECTED_EOF";
    readonly TOKEN_MISMATCH: "TOKEN_MISMATCH";
    readonly RULE_FAILED: "RULE_FAILED";
    readonly BUILD_FUNCTION_FAILED: "BUILD_FUNCTION_FAILED";
    readonly REPEAT_MIN_NOT_MET: "REPEAT_MIN_NOT_MET";
    readonly SEQUENCE_FAILED: "SEQUENCE_FAILED";
    readonly CUSTOM_ERROR: "CUSTOM_ERROR";
    readonly CHOICE_ALL_FAILED: "CHOICE_ALL_FAILED";
    readonly PRATT_NO_PREFIX: "PRATT_NO_PREFIX";
    readonly FATAL_ERROR: "FATAL_ERROR";
    readonly UNKNOWN_ERROR: "UNKNOWN_ERROR";
    readonly RECOVERY_CUSTOM: "RECOVERY_CUSTOM";
};
/**
 * Global registry mapping string literals to token kinds.
 * Example: {'let': 'LET', 'if': 'IF', '{': 'LBRACE'}
 * When registered, string patterns like seq('let', 'IDENT') will work.
 */
declare const globalTokenMap: Record<string, string>;

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
declare function registerTokenMap(map: Record<string, string>): void;
declare function parse(tokens: Token[], rules: Rules, settings?: ParserSettings): ParseResult;
declare function createRule(name: string, pattern: Pattern, options?: Rule['options']): Rule;
declare function token(name: string, value?: string): Pattern;
declare function optional(pattern: Pattern): Pattern;
declare function choice(...patterns: Pattern[]): Pattern;
declare function repeat(pattern: Pattern, min?: number, max?: number, separator?: Pattern): Pattern;
declare function oneOrMore(pattern: Pattern, separator?: Pattern): Pattern;
declare function zeroOrMore(pattern: Pattern, separator?: Pattern): Pattern;
declare function zeroOrOne(pattern: Pattern, separator?: Pattern): Pattern;
declare function seq(...patterns: Pattern[]): Pattern;
declare function rule(name: string): Pattern;
declare function rule(name: string, params: Record<string, unknown>): Pattern;
declare function silent<T extends Pattern>(pattern: T): T;
declare function loud<T extends Pattern>(pattern: T): T;
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
declare function pratt(table: PrattTable): Pattern;
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
declare function conditional(pattern: Pattern, predicate: ConditionalPredicate): Pattern;
/**
 * Shorthand for conditional() - more natural syntax
 * @see conditional
 */
declare function when(pattern: Pattern, predicate: ConditionalPredicate): Pattern;
/**
 * Method-chaining style: pattern.if(predicate)
 * Extends Pattern type with .if() method for fluent API
 *
 * @note This is implemented as a utility function, not directly on Pattern
 *       Use: conditional(pattern, predicate) or when(pattern, predicate)
 */
declare function ifCondition(pattern: Pattern, predicate: ConditionalPredicate): Pattern;
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
declare function action(fn: ActionFunction): Pattern;
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
declare function not(pattern: Pattern): Pattern;
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
declare function lookahead(pattern: Pattern): Pattern;
/**
 * Alias for lookahead() - more concise syntax.
 * @see lookahead
 */
declare function peek(pattern: Pattern): Pattern;
/** Convenience: build a PrattTable from plain objects. */
declare function buildPrattTable(spec: {
    prefix?: Record<string, PrefixHandler>;
    infix?: Record<string, InfixHandler>;
}): PrattTable;
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
declare function delimited(item: Pattern, sep: Pattern, options?: {
    min?: number;
    trailingOk?: boolean;
}): Pattern;
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
declare function surrounded(content: Pattern, open: Pattern, close: Pattern): Pattern;
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
declare function between(left: Pattern, content: Pattern, right: Pattern): Pattern;
declare function error(cond: ErrorHandler['cond'], msg: string, code?: string): ErrorHandler;
declare const errorRecoveryStrategies: {
    skipUntil(tokens: string | string[]): RecoveryStrategy;
};

export { type BuildFunction, type ConditionalContext, type ConditionalPredicate, type DebugLevel, ERRORS, type ErrorHandler, type InfixHandler, type MiniToken, type ParseError, type ParseResult, Parser, type ParserSettings, type Pattern, type PrattTable, type PrefixHandler, type RecoveryStrategy, Result, type Rule, type Rules, type Span, type Token, action, between, buildPrattTable, choice, conditional, createRule, delimited, error, errorRecoveryStrategies, globalTokenMap, ifCondition, lookahead, loud, not, oneOrMore, optional, parse, peek, pratt, registerTokenMap, repeat, rule, seq, silent, surrounded, token, when, zeroOrMore, zeroOrOne };
