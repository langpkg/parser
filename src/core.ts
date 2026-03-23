// src/core.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import * as Types from './types';
    import { Result } from './result';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TYPE ════════════════════════════════════════╗

    // Compiled rule closure type
    type CompiledFn = (silent: boolean) => Result;

    // (Lookahead set) Set of token kinds that can START a given rule / pattern.
    type LASet = Set<string>;

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ INIT ════════════════════════════════════════╗

    // Shared sentinel - avoids allocating a new failed Result in silent mode
    const FAIL: Result = Result.create('failed', null, 'unset', { start: -1, end: -1 });

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    export class Parser {

        // ┌──────────────────────────────── INIT ──────────────────────────────┐

            /// public state (accessible from build functions / error handlers)

            public rules            : Map<string, Types.Rule>;
            public settings         : Types.ParserSettings;
            public tokens           : Types.Token[]         = [];
            public index            : number                = 0;
            public errors           : Types.ParseError[]    = [];
            public ast              : Result[]              = [];
            public stats            : Types.ParseStatistics = { tokensProcessed: 0, rulesApplied: 0, errorsRecovered: 0, parseTimeMs: 0 };

            /// compiled closures (built once in constructor)

            private _compiled       = new Map<string, CompiledFn>();
            private _ruleIndex      = new Map<string, number>();    // rule name → integer id

            // lookahead table
            private _laTable        = new Map<string, LASet>();     // rule name → first-set

            // memo cache (integer key)
            private _memo           = new Map<number, Types.MemoEntry>();

            // runtime state
            private _depth          : number = 0;
            private _silentDepth    : number = 0;     // >0 = in silent/backtrack mode
            private _rootStart      : number = 0;
            private _startTime      : number = 0;
            private _debugLevel     : Types.DebugLevel = 'off';
            private _ignoredSet     = new Set<string>();

            // context for error messages
            public lastHandledRule  : string = 'unknown';
            public lastVisitedIndex : number = 0;
            public ruleStack        : string[] = [];

            // compile everything once
            constructor(rules: Types.Rule[], settings?: Types.ParserSettings) {
                this.rules = new Map(rules.map(r => [r.name, r]));
                this.settings = this._normalizeSettings(settings);
                this._debugLevel = this.settings.debug!;
                this._ignoredSet = new Set(this.settings.ignored!);

                // Assign integer index to each rule (for memo key encoding)
                let idx = 0;
                for (const name of this.rules.keys()) this._ruleIndex.set(name, idx++);

                // Validate grammar references
                const issues = this._validateGrammar();
                if (issues.length) throw new Error(`Grammar validation failed:\n  ${issues.join('\n  ')}`);

                // Build LL(1) lookahead sets
                this._buildLookaheadSets();

                // Compile each rule into a closure
                for (const [name, rule] of this.rules) {
                    this._compiled.set(name, this._compilePattern(rule.pattern, rule));
                }
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── MAIN ──────────────────────────────┐

            // parse
            parse(tokens: Types.Token[]): Types.ParseResult {
                this._reset(tokens);
                this._startTime = Date.now();

                if (!tokens.length) return { ast: [], errors: [] };

                const errTok = tokens.find(t => t.kind === 'error');
                if (errTok) return {
                    ast: [], errors: [this._mkError(Types.ERRORS.LEXICAL_ERROR,
                        `Unexpected token '${errTok.value}'`, errTok.span, 0, 0, 'lexer')]
                };

                const startRule = this.rules.get(this.settings.startRule);
                if (!startRule) throw new Error(`Start rule '${this.settings.startRule}' not found`);

                const fn = this._compiled.get(this.settings.startRule)!;
                const maxErrors = this.settings.errorRecovery!.maxErrors!;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const resilient = this.settings.errorRecovery!.mode === 'resilient';

                try {
                    this._skipIgnored();

                    while (this.index < this.tokens.length) {
                        if (maxErrors > 0 && this.errors.length >= maxErrors) break;

                        const before = this.index;
                        this._rootStart = before;

                        const result = fn(false);

                        if (result.isPassed()) {
                            const final = startRule.options?.build
                                ? this._safeBuild(startRule.options.build, result)
                                : result;
                            if (final) this.ast.push(final);
                        }

                        if (this.index === before) break;

                        this._skipIgnored();
                    }
                } catch (e) {
                    this._handleFatal(e);
                }

                this.stats.parseTimeMs = Date.now() - this._startTime;
                return { ast: this.ast, errors: this.errors, statistics: this.stats };
            }

            // dispose
            dispose(): void {
                this._memo.clear();
                this._compiled.clear();
                this.tokens = [];
                this.ast = [];
                this.errors = [];
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── ──── ──────────────────────────────┐

            /// Public helpers (used from build functions and error handlers)

            isNextToken(kind: string, extra?: string[]): boolean {
                const ignored = new Set([...this._ignoredSet, ...(extra ?? [])]);
                for (let i = this.index; i < this.tokens.length; i++) {
                    const t = this.tokens[i];
                    if (t.kind === kind) return true;
                    if (!ignored.has(t.kind)) break;
                }
                return false;
            }

            isPrevToken(kind: string, from = -1, extra?: string[]): boolean {
                const ignored = new Set([...this._ignoredSet, ...(extra ?? [])]);
                const start = from < 0 ? this.index : from;
                for (let i = start - 1; i >= 0; i--) {
                    const t = this.tokens[i];
                    if (t.kind === kind) return true;
                    if (!ignored.has(t.kind)) break;
                }
                return false;
            }

            isPrevRule(name: string): boolean {
                return this.lastHandledRule === name;
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── ──── ──────────────────────────────┐

            /// Compile-time: build LL(1) first-sets

            private _buildLookaheadSets(): void {
                // Initialize all rules with empty sets
                for (const name of this.rules.keys()) this._laTable.set(name, new Set());

                // Fixed-point iteration (handles mutual recursion)
                let changed = true;
                while (changed) {
                    changed = false;
                    for (const [name, rule] of this.rules) {
                        const prev = this._laTable.get(name)!;
                        const next = this._firstOfPattern(rule.pattern);
                        for (const k of next) {
                            if (!prev.has(k)) { prev.add(k); changed = true; }
                        }
                    }
                }
            }

            private _firstOfPattern(p: Types.Pattern): LASet {
                const out: LASet = new Set();

                switch (p.type) {
                    case 'token':
                        out.add(p.name!);
                        break;

                    case 'rule': {
                        const set = this._laTable.get(p.name!);
                        if (set) for (const k of set) out.add(k);
                        break;
                    }

                    case 'seq':
                        // First of seq = first of first non-optional element
                        for (const child of (p.patterns ?? [])) {
                            for (const k of this._firstOfPattern(child)) out.add(k);
                            if (child.type !== 'optional') break;   // non-optional stops propagation
                        }
                        break;

                    case 'choice':
                        for (const child of (p.patterns ?? []))
                            for (const k of this._firstOfPattern(child)) out.add(k);
                        break;

                    case 'optional':
                    case 'repeat':
                    case 'conditional':
                    case 'not':
                    case 'lookahead':
                        if (p.pattern) for (const k of this._firstOfPattern(p.pattern)) out.add(k);
                        break;

                    case 'action':
                        // Action doesn't consume tokens, so it can't start a pattern
                        // The lookahead set remains empty
                        break;

                    case 'pratt':
                        if (p.table) for (const k of p.table.prefix.keys()) out.add(k);
                        break;
                }

                return out;
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── ──── ──────────────────────────────┐

            // Compile-time: turn a Pattern into a JS closure
            private _compilePattern(p: Types.Pattern, parentRule?: Types.Rule): CompiledFn {
                switch (p.type) {
                    case 'token': return this._compileToken(p, parentRule);
                    case 'rule': return this._compileRule(p, parentRule);
                    case 'seq': return this._compileSeq(p, parentRule);
                    case 'choice': return this._compileChoice(p, parentRule);
                    case 'repeat': return this._compileRepeat(p, parentRule);
                    case 'optional': return this._compileOptional(p, parentRule);
                    case 'pratt': return this._compilePratt(p, parentRule);
                    case 'conditional': return this._compileConditional(p, parentRule);
                    case 'action': return this._compileAction(p, parentRule);
                    case 'not': return this._compileNot(p, parentRule);
                    case 'lookahead': return this._compileLookahead(p, parentRule);
                    default: throw new Error(`Unknown pattern type: ${(p as Types.Pattern).type}`);
                }
            }

            // token
            private _compileToken(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const name = p.name!;
                const value = p.value;

                return (silent: boolean): Result => {
                    this.lastHandledRule = parent?.name ?? name;
                    this.lastVisitedIndex = this.index;

                    if (this.index >= this.tokens.length) {
                        if (silent) return FAIL;
                        throw this._mkError(Types.ERRORS.TOKEN_EXPECTED_EOF,
                            `Expected '${name}', got EOF`, this._span(), 0, this.index, this.lastHandledRule);
                    }

                    const tok = this.tokens[this.index];

                    if (tok.kind === name) {
                        if (value !== undefined && tok.value !== value) {
                            if (silent) return FAIL;
                            throw this._mkError(Types.ERRORS.TOKEN_MISMATCH,
                                `Expected '${name}' with value '${value}', got '${tok.value}'`,
                                tok.span, 0, this.index, this.lastHandledRule);
                        }
                        this.index++;
                        this.stats.tokensProcessed++;
                        return Result.createAsToken('passed', tok, tok.span);
                    }

                    if (silent) return FAIL;

                    const err = this._mkError(Types.ERRORS.TOKEN_MISMATCH,
                        `Expected '${name}', got '${tok.kind}'`,
                        tok.span, 0, this.index, this.lastHandledRule);

                    // apply custom error if parent rule has one
                    throw this._customErrorOr(parent, err);
                };
            }

            // rule reference
            private _compileRule(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const name = p.name!;

                return (silent: boolean): Result => {
                    const targetRule = this.rules.get(name);
                    if (!targetRule) throw new Error(`Rule '${name}' not found`);

                    const fn = this._compiled.get(name);
                    if (!fn) throw new Error(`Rule '${name}' not compiled`);

                    this.ruleStack.push(name);
                    this.stats.rulesApplied++;

                    const rIdx = this._ruleIndex.get(name) ?? 0;
                    const memoKey = (rIdx << 16) | this.index;
                    const cached = this._getMemo(memoKey);

                    if (cached) {
                        this.ruleStack.pop();
                        this.index = cached.endIndex;
                        return cached.result ?? FAIL;
                    }

                    const startIndex = this.index;
                    const savedErrors = this.errors.length;

                    const result = fn(silent);

                    if (!result.isFullyPassed()) {
                        this.index = startIndex;
                        this.ruleStack.pop();
                        if (silent) return FAIL;

                        const err = this._mkError(Types.ERRORS.RULE_FAILED,
                            `Rule '${name}' failed`, this._span(), 0, this.lastVisitedIndex, name);
                        throw this._customErrorOr(parent, err);
                    }

                    let final = result;
                    if (targetRule.options?.build) {
                        const built = this._safeBuild(targetRule.options.build, result);
                        if (built) final = built;
                    }

                    // cache successful result
                    this._setMemo(memoKey, final, this.index, savedErrors);

                    this.ruleStack.pop();
                    return final;
                };
            }

            // sequence
            private _compileSeq(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const fns = (p.patterns ?? []).map(child => this._compilePattern(child, parent));

                return (silent: boolean): Result => {
                    const startIndex = this.index;
                    const results: Result[] = [];

                    for (let i = 0; i < fns.length; i++) {
                        this._skipIgnored(parent?.options?.ignored);
                        const r = fns[i](silent);

                        if (!r.isPassed()) {
                            this.index = startIndex;
                            if (silent) return FAIL;

                            const err = this._mkError(Types.ERRORS.SEQUENCE_FAILED,
                                `Sequence failed at element ${i + 1}/${fns.length}`,
                                this._span(), i, this.lastVisitedIndex, this.lastHandledRule);
                            throw this._customErrorOr(parent, err);
                        }
                        results.push(r);
                    }

                    return Result.createAsSequence('passed', results, this._spanOf(results));
                };
            }

            // choice  (LL(1) fast path)
            private _compileChoice(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const alts = p.patterns ?? [];

                // Build per-alternative lookahead sets at compile time
                const altSets: LASet[] = alts.map(a => this._firstOfPattern(a));
                const fns = alts.map(a => this._compilePattern(a, parent));

                return (silent: boolean): Result => {
                    const startIndex = this.index;
                    this._silentDepth++;

                    // LL(1) fast path: if current token is unambiguously in one alternative,
                    // go there directly without trying others.
                    if (this.index < this.tokens.length) {
                        const kind = this.tokens[this.index].kind;
                        let unique = -1;
                        let ambiguous = false;

                        for (let i = 0; i < altSets.length; i++) {
                            if (altSets[i].has(kind)) {
                                if (unique >= 0) { ambiguous = true; break; }
                                unique = i;
                            }
                        }

                        if (!ambiguous && unique >= 0) {
                            this._silentDepth--;
                            const r = fns[unique](silent);
                            if (r.isFullyPassed()) return Result.createAsChoice('passed', r, unique, r.span);
                            // fell through - try full backtrack below
                            this.index = startIndex;
                            this._silentDepth++;
                        }
                    }

                    // Full backtrack: try each alternative in order
                    let best: { index: number; err: Types.ParseError | null; altIdx: number } | null = null;

                    for (let i = 0; i < fns.length; i++) {
                        this.index = startIndex;
                        const r = fns[i](true);

                        if (r.isFullyPassed()) {
                            this._silentDepth--;
                            return Result.createAsChoice('passed', r, i, r.span);
                        }

                        const progress = this.lastVisitedIndex - startIndex;
                        if (!best || progress > (best.index - startIndex)) {
                            best = { index: this.lastVisitedIndex, err: null, altIdx: i };
                        }
                    }

                    this._silentDepth--;
                    this.index = startIndex;

                    if (silent) return FAIL;

                    const err = this._mkError(Types.ERRORS.CHOICE_ALL_FAILED,
                        `Expected one of: ${alts.map(a => this._patStr(a)).join(' | ')}`,
                        this._span(), best?.altIdx ?? 0, this.lastVisitedIndex, this.lastHandledRule);
                    throw this._customErrorOr(parent, err);
                };
            }

            // optional
            private _compileOptional(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const fn = this._compilePattern(p.pattern!, parent);

                return (_silent: boolean): Result => {
                    const saved = this.index;
                    this._silentDepth++;
                    const r = fn(true);
                    this._silentDepth--;

                    if (r.isFullyPassed()) return Result.createAsOptional('passed', r, r.span);

                    this.index = saved;
                    return Result.createAsOptional('passed', null, this._span());
                };
            }

            // repeat
            private _compileRepeat(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const min = p.min ?? 0;
                const max = p.max ?? Infinity;
                const fn = this._compilePattern(p.pattern!, parent);
                const sepFn = p.separator ? this._compilePattern(p.separator, parent) : null;

                return (silent: boolean): Result => {
                    const results: Result[] = [];
                    let endsWithSep = false;
                    const startIndex = this.index;

                    while (results.length < max && this.index < this.tokens.length) {
                        const before = this.index;
                        this._silentDepth++;
                        const r = fn(true);
                        this._silentDepth--;

                        if (!r.isFullyPassed()) {
                            this.index = before;
                            endsWithSep = false;
                            break;
                        }

                        results.push(r);
                        endsWithSep = false;

                        if (this.index === before) break;   // no progress guard

                        if (sepFn && results.length < max && this.index < this.tokens.length) {
                            const sepBefore = this.index;
                            this._silentDepth++;
                            const sepR = sepFn(true);
                            this._silentDepth--;
                            if (!sepR.isFullyPassed()) { this.index = sepBefore; break; }
                            endsWithSep = true;
                        }
                    }

                    if (results.length < min) {
                        this.index = startIndex;
                        if (silent) return FAIL;
                        throw this._mkError(Types.ERRORS.REPEAT_MIN_NOT_MET,
                            `Expected at least ${min} occurrences, got ${results.length}`,
                            this._span(), 0, this.index, this.lastHandledRule);
                    }

                    return Result.createAsRepeat('passed', results, this._spanOf(results), endsWithSep);
                };
            }

            // pratt
            private _compilePratt(p: Types.Pattern, _parent?: Types.Rule): CompiledFn {
                const table = p.table!;

                return (silent: boolean): Result => {
                    if (this.index >= this.tokens.length) {
                        if (silent) return FAIL;
                        throw this._mkError(Types.ERRORS.PRATT_NO_PREFIX,
                            'Expected an expression', this._span(), 0, this.index, 'pratt');
                    }

                    const tok = this.tokens[this.index];
                    const prefix = table.prefix.get(tok.kind);

                    if (!prefix) {
                        if (silent) return FAIL;
                        throw this._mkError(Types.ERRORS.PRATT_NO_PREFIX,
                            `Unexpected token '${tok.kind}' in expression`, tok.span, 0, this.index, 'pratt');
                    }

                    this.index++;
                    let left = prefix.parse(this, tok);
                    if (!left.isPassed()) return silent ? FAIL : left;

                    while (this.index < this.tokens.length) {
                        this._skipIgnored();
                        if (this.index >= this.tokens.length) break;

                        const next = this.tokens[this.index];
                        const infix = table.infix.get(next.kind);
                        if (!infix || infix.lbp <= 0) break;

                        // Check if caller wants to stop here (binding power check)
                        // done by the calling context passing min bp - we use a stack instead.
                        // For nested pratt calls (e.g. right-associative), callers re-enter
                        // with a new pratt() pattern with the right min bp.
                        this.index++;
                        left = infix.parse(this, left, next);
                        if (!left.isPassed()) break;
                    }

                    return left;
                };
            }

            // conditional
            private _compileConditional(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const innerFn = this._compilePattern(p.pattern!, parent);
                const predicate = p.predicate!;

                return (silent: boolean): Result => {
                    const startIndex = this.index;

                    // Execute the inner pattern
                    let innerResult: Result;
                    if (silent) {
                        // In silent mode, try the pattern silently
                        this._silentDepth++;
                        innerResult = innerFn(true);
                        this._silentDepth--;
                    } else {
                        // In normal mode, execute and let errors propagate
                        innerResult = innerFn(false);
                    }

                    // Check if inner pattern passed
                    if (!innerResult.isFullyPassed()) {
                        // Inner pattern failed - backtrack and fail
                        this.index = startIndex;
                        if (silent) return FAIL;
                        // In non-silent mode, innerFn already threw the error
                        return innerResult;
                    }

                    // Inner pattern succeeded - evaluate the predicate
                    try {
                        const context: Types.ConditionalContext = {
                            parser: this,
                            result: innerResult,
                            index: this.index,           // Index AFTER inner pattern matched
                            depth: this._depth,
                            ruleStack: [...this.ruleStack],
                        };

                        const conditionMet = predicate(context);

                        if (conditionMet) {
                            // Predicate passed - return wrapped result
                            return Result.createAsCustom('passed', 'conditional', innerResult, innerResult.span);
                        } else {
                            // Predicate failed - backtrack and fail
                            this.index = startIndex;
                            if (silent) return FAIL;

                            const err = this._mkError(Types.ERRORS.RULE_FAILED,
                                `Conditional predicate returned false`, this._span(), 0, this.lastVisitedIndex, this.lastHandledRule);
                            throw this._customErrorOr(parent, err);
                        }
                    } catch (e) {
                        // Predicate threw an error - backtrack and fail
                        this.index = startIndex;
                        if (silent) return FAIL;

                        const errorMsg = e instanceof Error ? e.message : String(e);
                        const err = this._mkError(Types.ERRORS.RULE_FAILED,
                            `Conditional predicate threw: ${errorMsg}`, this._span(), 0, this.lastVisitedIndex, this.lastHandledRule);
                        throw this._customErrorOr(parent, err);
                    }
                };
            }

            // action
            private _compileAction(p: Types.Pattern, _parent?: Types.Rule): CompiledFn {
                const fn = p.fn!;

                return (_silent: boolean): Result => {
                    // Always execute the action, even in silent mode
                    // Actions are designed to be side-effect functions
                    try {
                        fn(this);
                    } catch (e) {
                        // If action throws, convert to parse error
                        const errorMsg = e instanceof Error ? e.message : String(e);
                        throw this._mkError(Types.ERRORS.RULE_FAILED,
                            `Action function threw: ${errorMsg}`, this._span(), 0, this.index, 'action');
                    }

                    // Actions always succeed with no token consumption
                    return Result.createAsCustom('passed', 'action', null, this._span());
                };
            }

            // not
            private _compileNot(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const innerFn = this._compilePattern(p.pattern!, parent);

                return (silent: boolean): Result => {
                    const startIndex = this.index;

                    // Try the inner pattern in silent mode
                    this._silentDepth++;
                    const innerResult = innerFn(true);
                    this._silentDepth--;

                    if (innerResult.isFullyPassed()) {
                        // Inner pattern matched - NOT should fail
                        this.index = startIndex;
                        if (silent) return FAIL;

                        const err = this._mkError(Types.ERRORS.RULE_FAILED,
                            `NOT pattern failed - inner pattern matched`, this._span(), 0, startIndex, this.lastHandledRule);
                        throw this._customErrorOr(parent, err);
                    } else {
                        // Inner pattern did NOT match - NOT succeeds
                        this.index = startIndex;
                        return Result.createAsCustom('passed', 'not', null, this._span());
                    }
                };
            }

            // lookahead
            private _compileLookahead(p: Types.Pattern, parent?: Types.Rule): CompiledFn {
                const innerFn = this._compilePattern(p.pattern!, parent);

                return (silent: boolean): Result => {
                    const startIndex = this.index;

                    // Try the inner pattern in silent mode
                    this._silentDepth++;
                    const innerResult = innerFn(true);
                    this._silentDepth--;

                    // Always restore index (lookahead never consumes)
                    this.index = startIndex;

                    if (innerResult.isFullyPassed()) {
                        // Lookahead succeeded - return result but index unchanged
                        return Result.createAsCustom('passed', 'lookahead', null, this._span());
                    } else {
                        // Lookahead failed
                        if (silent) return FAIL;

                        const err = this._mkError(Types.ERRORS.RULE_FAILED,
                            `Lookahead pattern failed`, this._span(), 0, startIndex, this.lastHandledRule);
                        throw this._customErrorOr(parent, err);
                    }
                };
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── MEMO ──────────────────────────────┐

            /// (integer keys - no string alloc)

            private _getMemo(key: number): Types.MemoEntry | null {
                const e = this._memo.get(key);
                if (!e) return null;
                // invalidate if error count changed since caching
                if (e.errorCount !== this.errors.length) { this._memo.delete(key); return null; }
                return e;
            }

            private _setMemo(key: number, result: Result, endIndex: number, _savedErrors: number): void {
                this._memo.set(key, { result, endIndex, errorCount: this.errors.length });
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── ERRS ──────────────────────────────┐

            private _mkError(
                code: string, msg: string, span: Types.Span,
                failedAt: number, tokenIndex: number, prevRule: string,
                prevInnerRule?: string,
            ): Types.ParseError {
                return {
                    code, msg, span, failedAt, tokenIndex,
                    startIndex: this._rootStart, prevRule,
                    prevInnerRule: prevInnerRule ?? this.ruleStack.at(-1) ?? 'unknown'
                };
            }

            private _customErrorOr(rule: Types.Rule | undefined, def: Types.ParseError): Types.ParseError {
                if (!rule?.options?.errors) return def;

                for (const h of rule.options.errors) {
                    let match = false;
                    if (typeof h.cond === 'number') {
                        match = def.failedAt === h.cond;
                    } else if (typeof h.cond === 'function') {
                        try { match = h.cond(this, { failedAt: def.failedAt, tokenIndex: def.tokenIndex }); }
                        catch { /* ignore */ }
                    }
                    if (match) return this._mkError(h.code ?? Types.ERRORS.CUSTOM_ERROR, h.msg,
                        def.span, def.failedAt, def.tokenIndex, def.prevRule, def.prevInnerRule);
                }
                return def;
            }

            private _addError(e: Types.ParseError): void {
                if (this._silentDepth > 0) return;
                const max = this.settings.errorRecovery!.maxErrors!;
                if (max > 0 && this.errors.length >= max) return;
                if (this.settings.errorRecovery!.mode === 'strict' && this.errors.length > 0) return;
                // deduplicate by span start
                if (this.errors.some(x => x.span?.start === e.span?.start)) return;
                this.errors.push(e);
            }

            private _handleFatal(e: unknown): void {
                if (e && typeof e === 'object' && 'msg' in e && 'code' in e) {
                    this._addError(e as Types.ParseError);
                } else if (e instanceof Error) {
                    this._addError(this._mkError(Types.ERRORS.FATAL_ERROR, e.message,
                        this._span(), 0, this.index, this.lastHandledRule));
                }
            }

            private _safeBuild(fn: Types.BuildFunction, r: Result): Result {
                try { return fn(r, this); }
                catch (e) {
                    const err = this._mkError(Types.ERRORS.BUILD_FUNCTION_FAILED,
                        e instanceof Error ? e.message : String(e),
                        this._span(), 0, this.index, this.lastHandledRule);
                    this._addError(err);
                    return r;
                }
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── UTIL ──────────────────────────────┐

            private _span(): Types.Span {
                if (!this.tokens.length) return { start: 0, end: 0 };
                if (this.index >= this.tokens.length) {
                    const last = this.tokens[this.tokens.length - 1];
                    return { start: last.span.end, end: last.span.end };
                }
                return this.tokens[this.index].span;
            }

            private _spanOf(results: Result[]): Types.Span {
                if (!results.length) return this._span();
                return { start: results[0].span.start, end: results[results.length - 1].span.end };
            }

            private _skipIgnored(extra?: string[]): void {
                const set = extra ? new Set([...this._ignoredSet, ...extra]) : this._ignoredSet;
                while (this.index < this.tokens.length && set.has(this.tokens[this.index].kind)) {
                    this.index++;
                    this.stats.tokensProcessed++;
                }
            }

            private _patStr(p: Types.Pattern): string {
                switch (p.type) {
                    case 'token': return p.name!;
                    case 'rule': return p.name!;
                    case 'seq': return `(${(p.patterns ?? []).map(x => this._patStr(x)).join(' ')})`;
                    case 'choice': return (p.patterns ?? []).map(x => this._patStr(x)).join(' | ');
                    case 'optional': return `${this._patStr(p.pattern!)}?`;
                    case 'repeat': return `${this._patStr(p.pattern!)}*`;
                    case 'conditional': return `${this._patStr(p.pattern!)}.if(...)`;
                    case 'action': return 'action(...)';
                    case 'not': return `!${this._patStr(p.pattern!)}`;
                    case 'lookahead': return `lookahead(${this._patStr(p.pattern!)})`;
                    case 'pratt': return 'expr';
                    default: return p.type;
                }
            }

            private _validateGrammar(): string[] {
                const issues: string[] = [];
                const names = new Set(this.rules.keys());

                const checkPattern = (p: Types.Pattern, ruleName: string): void => {
                    if (p.type === 'rule' && !names.has(p.name!))
                        issues.push(`Rule '${ruleName}' references undefined rule '${p.name}'`);
                    for (const child of [p.pattern, ...(p.patterns ?? [])]) {
                        if (child) checkPattern(child, ruleName);
                    }
                    if (p.separator) checkPattern(p.separator, ruleName);
                };

                for (const [name, rule] of this.rules) checkPattern(rule.pattern, name);

                if (!this.rules.has(this.settings.startRule))
                    issues.push(`Start rule '${this.settings.startRule}' is not defined`);

                return issues;
            }

            private _normalizeSettings(s?: Types.ParserSettings): Types.ParserSettings {
                return {
                    startRule: s?.startRule ?? 'root',
                    errorRecovery: { mode: s?.errorRecovery?.mode ?? 'strict', maxErrors: s?.errorRecovery?.maxErrors ?? 1 },
                    ignored: s?.ignored ?? ['ws'],
                    debug: s?.debug ?? 'off',
                    maxDepth: s?.maxDepth ?? 1000,
                };
            }

            private _reset(tokens: Types.Token[]): void {
                this.tokens = tokens;
                this.index = 0;
                this.errors = [];
                this.ast = [];
                this._depth = 0;
                this._silentDepth = 0;
                this._rootStart = 0;
                this.ruleStack = [];
                this._memo.clear();
                this.stats = { tokensProcessed: 0, rulesApplied: 0, errorsRecovered: 0, parseTimeMs: 0 };
            }

        // └────────────────────────────────────────────────────────────────────┘

    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝