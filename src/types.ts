// src/types.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import type { Parser } from './core';
    import { Result } from './result';

    export { Result };

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TYPE ════════════════════════════════════════╗

    // ---------------------------------------------------------------------------
    // Token & position
    // ---------------------------------------------------------------------------

    export interface Token {
        kind            : string
        value           : string | null
        span            : Span
    }

    export interface MiniToken {
        kind            : string
        value           : string | null
    }

    export interface Span {
        start           : number
        end             : number
    }

    // ---------------------------------------------------------------------------
    // Pattern  (same public API - pratt added as new type)
    // ---------------------------------------------------------------------------

    /**
     * Conditional context passed to predicate function.
     * Provides access to parser state for conditional decision-making.
     */
    export interface ConditionalContext {
        parser          : Parser            // Full parser instance
        result          : Result | null     // Result from inner pattern (if any)
        index           : number            // Current token index
        depth           : number            // Rule nesting depth
        ruleStack       : string[]          // Current rule call stack
    }

    /**
     * Predicate function for conditional pattern execution.
     * Return true to continue with the pattern, false to fail.
     */
    export type ConditionalPredicate = (context: ConditionalContext) => boolean;

    /**
     * Action function executed for side effects during parsing.
     * Called during pattern execution, can access and modify parser state.
     */
    export type ActionFunction = (parser: Parser) => void;

    export interface Pattern {
        type            : 'token' | 'rule' | 'repeat' | 'choice' | 'seq' | 'optional' | 'pratt' | 'conditional' | 'action' | 'not' | 'lookahead'
        silent          : boolean
        value?          : string                // token exact-value match
        name?           : string                // token name / rule name
        min?            : number                // repeat
        max?            : number                // repeat
        patterns?       : Pattern[]             // seq, choice
        separator?      : Pattern               // repeat separator
        pattern?        : Pattern               // optional / repeat / conditional / not / lookahead / action item
        table?          : PrattTable            // pratt
        predicate?      : ConditionalPredicate  // conditional predicate
        fn?             : ActionFunction        // action function
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        params?         : Record<string, any>   // rule parameters
    }

    // ---------------------------------------------------------------------------
    // Pratt expression parsing
    // ---------------------------------------------------------------------------

    export interface PrefixHandler {
        /** How tightly this prefix binds its right operand. */
        bp              : number
        parse           : (parser: Parser, token: Token) => Result
    }

    export interface InfixHandler {
        /** Precedence level - left binding power. */
        lbp             : number
        /** Right binding power (lbp - 1 for right-associative). Defaults to lbp. */
        rbp?: number
        parse           : (parser: Parser, left: Result, token: Token) => Result
    }

    export interface PrattTable {
        prefix          : Map<string, PrefixHandler>
        infix           : Map<string, InfixHandler>
    }

    // ---------------------------------------------------------------------------
    // Rules
    // ---------------------------------------------------------------------------

    export interface ErrorHandler {
        cond            : number | ((parser: Parser, opt: {
            failedAt        : number
            tokenIndex      : number
            force?          : boolean
            prevRule?       : string
            prevInnerRule?  : string
        }) => boolean)
        msg             : string
        code?           : string
    }

    export interface RecoveryStrategy {
        type            : 'skipUntil' | 'synchronize'
        tokens?         : string[]
        token?          : string
    }

    export type BuildFunction = (matches: Result, parser: Parser) => Result;

    export interface Rule {
        name            : string
        pattern         : Pattern
        options?        : {
            build?          : BuildFunction
            errors?         : ErrorHandler[]
            recovery?       : RecoveryStrategy
            ignored?        : string[]
            silent?         : boolean
        }
    }

    /**
     * Global token mapping for string shorthand support.
     * Maps string literals to token kinds: {'let': 'LET', 'if': 'IF'}
     */
    export const tokenMap: Record<string, string> = {};

    export type Rules = Rule[];

    // ---------------------------------------------------------------------------
    // Parser I/O
    // ---------------------------------------------------------------------------

    export interface ParseStatistics {
        tokensProcessed     : number
        rulesApplied        : number
        errorsRecovered     : number
        parseTimeMs         : number
    }

    export interface ParseError {
        msg                 : string
        code                : string
        span                : Span
        failedAt            : number
        tokenIndex          : number
        startIndex          : number
        prevRule            : string
        prevInnerRule?      : string
    }

    export interface ParseResult {
        ast                 : Result[]
        errors              : ParseError[]
        statistics?         : ParseStatistics
    }

    export type DebugLevel = 'off' | 'errors' | 'rules' | 'patterns' | 'tokens' | 'verbose';

    export interface ParserSettings {
        startRule           : string
        errorRecovery?      : { mode?: 'strict' | 'resilient'; maxErrors?: number }
        ignored?            : string[]
        debug?              : DebugLevel
        maxDepth?           : number
    }

    // ---------------------------------------------------------------------------
    // Internal: integer-keyed memo  (Chevrotain-style, no string alloc per lookup)
    // ---------------------------------------------------------------------------

    /**
     * Key encoding: (ruleIndex << 16) | tokenIndex
     * Gives us O(1) Map lookup without string concatenation.
     * Supports up to 65535 rules and 65535 tokens - more than enough.
     */
    export type MemoKey = number;

    export interface MemoEntry {
        result              : Result | null
        endIndex            : number
        errorCount          : number    // invalidate if error count changed
    }

    // ---------------------------------------------------------------------------
    // Error codes
    // ---------------------------------------------------------------------------

    export const ERRORS = {
        LEXICAL_ERROR           : 'LEXICAL_ERROR',
        TOKEN_EXPECTED_EOF      : 'TOKEN_EXPECTED_EOF',
        TOKEN_MISMATCH          : 'TOKEN_MISMATCH',
        RULE_FAILED             : 'RULE_FAILED',
        BUILD_FUNCTION_FAILED   : 'BUILD_FUNCTION_FAILED',
        REPEAT_MIN_NOT_MET      : 'REPEAT_MIN_NOT_MET',
        SEQUENCE_FAILED         : 'SEQUENCE_FAILED',
        CUSTOM_ERROR            : 'CUSTOM_ERROR',
        CHOICE_ALL_FAILED       : 'CHOICE_ALL_FAILED',
        PRATT_NO_PREFIX         : 'PRATT_NO_PREFIX',
        FATAL_ERROR             : 'FATAL_ERROR',
        UNKNOWN_ERROR           : 'UNKNOWN_ERROR',
        RECOVERY_CUSTOM         : 'RECOVERY_CUSTOM',
    } as const;

    // ---------------------------------------------------------------------------
    // Global token map for string shorthand support
    // ---------------------------------------------------------------------------

    /**
     * Global registry mapping string literals to token kinds.
     * Example: {'let': 'LET', 'if': 'IF', '{': 'LBRACE'}
     * When registered, string patterns like seq('let', 'IDENT') will work.
     */
    export const globalTokenMap: Record<string, string> = {};

// ╚══════════════════════════════════════════════════════════════════════════════════════╝

