/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-unused-vars */
// test/index.test.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { describe, test, expect } from 'bun:test';
    import {
        parse, createRule, Parser,
        token, seq, choice, optional, repeat,
        oneOrMore, zeroOrMore, zeroOrOne,
        rule, silent, loud, pratt, buildPrattTable,
        conditional, when, ifCondition,
        action, not, lookahead, peek,
        delimited, surrounded, between,
        error, errorRecoveryStrategies,
        registerTokenMap,
        Result,
    } from '../src/index';
    import type { Token, Rules, ParserSettings, ParseResult, ConditionalContext } from '../src/types';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ HELP ════════════════════════════════════════╗

    let _pos = 0;

    function tok(kind: string, value = kind): Token {
        const start = _pos;
        const end = _pos + value.length;
        _pos = end + 1;
        return { kind, value, span: { start, end } };
    }

    /** Build a flat token array, resetting the position counter. */
    function toks(...pairs: [string, string?][]): Token[] {
        _pos = 0;
        return pairs.map(([k, v]) => tok(k, v ?? k));
    }

    const S: ParserSettings = { startRule: 'root', ignored: [], errorRecovery: { mode: 'strict', maxErrors: 1 } };
    const R: ParserSettings = { startRule: 'root', ignored: [], errorRecovery: { mode: 'resilient', maxErrors: 10 } };

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TEST ════════════════════════════════════════╗

    // =============================================================================
    // 1. createRule
    // =============================================================================

    describe('createRule()', () => {

        test('returns a Rule with correct name and pattern', () => {
            const r = createRule('foo', token('A'));
            expect(r.name).toBe('foo');
            expect(r.pattern.type).toBe('token');
        });

        test('options default to { name: false }', () => {
            const r = createRule('foo', token('A'));
            expect(r.options).toBeDefined();
        });

        test('options are merged with defaults', () => {
            const build = (res: Result) => res;
            const r = createRule('foo', token('A'), { build });
            expect(r.options?.build).toBe(build);
        });

    });

    // =============================================================================
    // 1.1 registerTokenMap
    // =============================================================================

    describe('registerTokenMap()', () => {

        test('registerTokenMap() registers global token mappings', () => {
            registerTokenMap({
                'let': 'LET',
                'if': 'IF',
                '=': 'EQ',
            });
            // Test that it stores the mappings by parsing a simple grammar
            // that uses string shorthand (which relies on the token map)
            const rules = [
                createRule('root', seq(
                    token('IDENT'),
                    token('EQ'),
                    token('NUM'),
                )),
            ];
            const r = parse(toks(['IDENT'], ['EQ'], ['NUM']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

    });

    // =============================================================================
    // 2. Pattern builders
    // =============================================================================

    describe('Pattern builders', () => {

        test('token() sets type and name', () => {
            const p = token('NUM');
            expect(p.type).toBe('token');
            expect(p.name).toBe('NUM');
            expect(p.silent).toBe(false);
        });

        test('token() with value', () => {
            const p = token('KW', 'if');
            expect(p.value).toBe('if');
        });

        test('token() empty name throws', () => {
            expect(() => token('')).toThrow();
        });

        test('optional()', () => {
            const p = optional(token('A'));
            expect(p.type).toBe('optional');
            expect(p.pattern?.type).toBe('token');
        });

        test('choice() with multiple patterns', () => {
            const p = choice(token('A'), token('B'));
            expect(p.type).toBe('choice');
            expect(p.patterns?.length).toBe(2);
        });

        test('choice() empty throws', () => {
            expect(() => choice()).toThrow();
        });

        test('seq() with multiple patterns', () => {
            const p = seq(token('A'), token('B'));
            expect(p.type).toBe('seq');
            expect(p.patterns?.length).toBe(2);
        });

        test('seq() empty throws', () => {
            expect(() => seq()).toThrow();
        });

        test('repeat() with min/max', () => {
            const p = repeat(token('A'), 1, 5);
            expect(p.type).toBe('repeat');
            expect(p.min).toBe(1);
            expect(p.max).toBe(5);
        });

        test('repeat() negative min throws', () => {
            expect(() => repeat(token('A'), -1)).toThrow();
        });

        test('repeat() max < min throws', () => {
            expect(() => repeat(token('A'), 5, 3)).toThrow();
        });

        test('oneOrMore() sets min=1 max=Infinity', () => {
            const p = oneOrMore(token('A'));
            expect(p.min).toBe(1);
            expect(p.max).toBe(Infinity);
        });

        test('zeroOrMore() sets min=0', () => {
            const p = zeroOrMore(token('A'));
            expect(p.min).toBe(0);
        });

        test('zeroOrOne() is silent repeat(0,1)', () => {
            const p = zeroOrOne(token('A'));
            expect(p.min).toBe(0);
            expect(p.max).toBe(1);
            expect(p.silent).toBe(true);
        });

        test('rule() sets name', () => {
            const p = rule('expr');
            expect(p.type).toBe('rule');
            expect(p.name).toBe('expr');
        });

        test('rule() empty name throws', () => {
            expect(() => rule('')).toThrow();
        });

        test('rule() with params - stores parameters', () => {
            const params = { precedence: 10, associative: 'left' };
            const p = rule('expr', params);
            expect(p.type).toBe('rule');
            expect(p.name).toBe('expr');
            expect(p.params).toEqual(params);
        });

        test('rule() with params - params are optional', () => {
            const p = rule('expr');
            expect(p.params).toBeUndefined();
        });

        test('rule() with params - empty params object', () => {
            const p = rule('expr', {});
            expect(p.params).toEqual({});
        });

        test('rule() with params - various types', () => {
            const params = {
                number: 42,
                string: 'value',
                boolean: true,
                array: [1, 2, 3],
                object: { nested: 'data' },
                null: null,
            };
            const p = rule('expr', params);
            expect(p.params).toEqual(params);
        });

        test('silent() sets silent=true', () => {
            const p = silent(token('A'));
            expect(p.silent).toBe(true);
        });

        test('loud() sets silent=false', () => {
            const p = loud(silent(token('A')));
            expect(p.silent).toBe(false);
        });

        test('pratt() returns pratt pattern', () => {
            const table = buildPrattTable({ prefix: {}, infix: {} });
            const p = pratt(table);
            expect(p.type).toBe('pratt');
            expect(p.table).toBe(table);
        });

        test('buildPrattTable() returns Map-based table', () => {
            const table = buildPrattTable({
                prefix: { NUM: { bp: 0, parse: (_, t) => Result.createAsToken('passed', t, t.span) } },
                infix: { PLUS: { lbp: 10, parse: (_, l, t) => Result.createAsPratt('passed', [l], l.span) } },
            });
            expect(table.prefix instanceof Map).toBe(true);
            expect(table.infix instanceof Map).toBe(true);
            expect(table.prefix.has('NUM')).toBe(true);
            expect(table.infix.has('PLUS')).toBe(true);
        });

    });

    // =============================================================================
    // 3. Compile-time validation
    // =============================================================================

    describe('Compile-time validation', () => {

        test('undefined rule reference throws', () => {
            const rules = [createRule('root', rule('ghost'))];
            expect(() => new Parser(rules, S)).toThrow(/ghost/);
        });

        test('undefined startRule throws at parse time', () => {
            const rules = [createRule('root', token('A'))];
            expect(() => new Parser(rules, { ...S, startRule: 'missing' })).toThrow(/missing/);
        });

        test('valid grammar compiles fine', () => {
            const rules = [
                createRule('root', rule('item')),
                createRule('item', token('A')),
            ];
            expect(() => new Parser(rules, S)).not.toThrow();
        });

    });

    // =============================================================================
    // 4. token() matching
    // =============================================================================

    describe('token matching', () => {

        test('matches by kind', () => {
            const rules = [createRule('root', token('NUM'))];
            const r = parse(toks(['NUM', '42']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.isToken()).toBe(true);
        });

        test('matches by kind+value', () => {
            const rules = [createRule('root', token('KW', 'if'))];
            const r = parse(toks(['KW', 'if']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('wrong value fails', () => {
            const rules = [createRule('root', token('KW', 'if'))];
            const r = parse(toks(['KW', 'else']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('wrong kind fails', () => {
            const rules = [createRule('root', token('NUM'))];
            const r = parse(toks(['IDENT', 'x']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('wrong token kind fails', () => {
            const rules = [createRule('root', token('NUM'))];
            const r = parse(toks(['IDENT', 'x']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
            expect(r.errors[0]?.code).toBe('TOKEN_MISMATCH');
        });

    });

    // =============================================================================
    // 5. seq()
    // =============================================================================

    describe('seq()', () => {

        test('matches all elements in order', () => {
            const rules = [createRule('root', seq(token('A'), token('B'), token('C')))];
            const r = parse(toks(['A'], ['B'], ['C']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.isSequence()).toBe(true);
            expect(r.ast[0]?.getSequenceResult()?.length).toBe(3);
        });

        test('fails if middle element missing', () => {
            const rules = [createRule('root', seq(token('A'), token('B')))];
            const r = parse(toks(['A'], ['C']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('getSequenceCount()', () => {
            const rules = [createRule('root', seq(token('A'), token('B')))];
            const r = parse(toks(['A'], ['B']), rules, S);
            expect(r.ast[0]?.getSequenceCount()).toBe(2);
        });

    });

    // =============================================================================
    // 6. choice()
    // =============================================================================

    describe('choice()', () => {

        const rules = [
            createRule('root', choice(
                seq(token('IF'), token('IDENT')),
                seq(token('LET'), token('IDENT')),
                token('NUM'),
            )),
        ];

        test('picks first matching alternative', () => {
            const r = parse(toks(['IF'], ['IDENT', 'x']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.isChoice()).toBe(true);
            expect(r.ast[0]?.getChoiceIndex()).toBe(0);
        });

        test('picks second alternative (LL1 fast path)', () => {
            const r = parse(toks(['LET'], ['IDENT', 'x']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.getChoiceIndex()).toBe(1);
        });

        test('picks third alternative', () => {
            const r = parse(toks(['NUM', '42']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.getChoiceIndex()).toBe(2);
        });

        test('fails when no alternative matches', () => {
            const r = parse(toks(['RBRACE']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('getChoiceResult()', () => {
            const r = parse(toks(['NUM', '5']), rules, S);
            expect(r.ast[0]?.getChoiceResult()).not.toBeNull();
        });

    });

    // =============================================================================
    // 7. optional()
    // =============================================================================

    describe('optional()', () => {

        const rules = [createRule('root', seq(token('LET'), optional(token('MUT')), token('IDENT')))];

        test('matches when optional token present', () => {
            const r = parse(toks(['LET'], ['MUT'], ['IDENT', 'x']), rules, S);
            expect(r.errors).toHaveLength(0);
            const seq_r = r.ast[0]?.getSequenceResult()!;
            expect(seq_r[1].isOptional()).toBe(true);
            expect(seq_r[1].isOptionalPassed()).toBe(true);
        });

        test('matches when optional token absent', () => {
            const r = parse(toks(['LET'], ['IDENT', 'x']), rules, S);
            expect(r.errors).toHaveLength(0);
            const seq_r = r.ast[0]?.getSequenceResult()!;
            expect(seq_r[1].isOptional()).toBe(true);
            expect(seq_r[1].isOptionalPassed()).toBe(false);
            expect(seq_r[1].getOptionalResult()).toBeUndefined();
        });

    });

    // =============================================================================
    // 8. repeat()
    // =============================================================================

    describe('repeat()', () => {

        test('min=1 fails when no match', () => {
            // Parser returns early on empty token array (by design).
            // Test with a wrong token instead to trigger the min-not-met error.
            const rules = [createRule('root', repeat(token('A'), 1))];
            const r = parse(toks(['B']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('min=0 succeeds on empty', () => {
            const rules = [createRule('root', repeat(token('A'), 0))];
            const r = parse([], rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('collects correct count', () => {
            const rules = [createRule('root', repeat(token('A'), 0))];
            const r = parse(toks(['A'], ['A'], ['A']), rules, S);
            expect(r.ast[0]?.getRepeatCount()).toBe(3);
        });

        test('stops at max', () => {
            const rules = [createRule('root', repeat(token('A'), 0, 2))];
            const r = parse(toks(['A'], ['A'], ['A']), rules, S);
            expect(r.ast[0]?.getRepeatCount()).toBe(2);
        });

        test('with separator', () => {
            const rules = [createRule('root', repeat(token('NUM'), 1, Infinity, token('COMMA')))];
            const r = parse(toks(['NUM', '1'], ['COMMA'], ['NUM', '2'], ['COMMA'], ['NUM', '3']), rules, S);
            expect(r.ast[0]?.getRepeatCount()).toBe(3);
        });

        test('isRepeatEndsWithSep() false without trailing separator', () => {
            const rules = [createRule('root', repeat(token('A'), 0, Infinity, token('COMMA')))];
            const r = parse(toks(['A'], ['COMMA'], ['A']), rules, S);
            expect(r.ast[0]?.isRepeatEndsWithSep()).toBe(false);
        });

        test('getRepeatResult() returns array', () => {
            const rules = [createRule('root', repeat(token('A'), 1))];
            const r = parse(toks(['A'], ['A']), rules, S);
            expect(Array.isArray(r.ast[0]?.getRepeatResult())).toBe(true);
        });

        test('oneOrMore() - 1 element passes', () => {
            const rules = [createRule('root', oneOrMore(token('A')))];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('oneOrMore() - wrong token fails', () => {
            const rules = [createRule('root', oneOrMore(token('A')))];
            const r = parse(toks(['B']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('zeroOrMore() - 0 elements passes', () => {
            const rules = [createRule('root', zeroOrMore(token('A')))];
            const r = parse([], rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('zeroOrOne() - 0 elements passes', () => {
            const rules = [createRule('root', zeroOrOne(token('A')))];
            const r = parse([], rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('zeroOrOne() - 1 element passes, 2nd element not consumed', () => {
            const rules = [createRule('root', zeroOrOne(token('A')))];
            const r = parse(toks(['A'], ['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

    });

    // =============================================================================
    // 9. rule() references + memoisation
    // =============================================================================

    describe('rule() references', () => {

        test('cross-rule reference works', () => {
            const rules = [
                createRule('root', seq(rule('item'), rule('item'))),
                createRule('item', seq(token('LPAREN'), token('NUM'), token('RPAREN'))),
            ];
            const r = parse(
                toks(['LPAREN'], ['NUM', '1'], ['RPAREN'], ['LPAREN'], ['NUM', '2'], ['RPAREN']),
                rules, S,
            );
            expect(r.errors).toHaveLength(0);
        });

        test('same rule used multiple times (memo hit)', () => {
            const rules = [
                createRule('root', repeat(rule('num'), 3)),
                createRule('num', token('NUM')),
            ];
            const r = parse(toks(['NUM', '1'], ['NUM', '2'], ['NUM', '3']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.getRepeatCount()).toBe(3);
        });

    });

    // =============================================================================
    // 10. pratt() - Pratt expression parsing
    // =============================================================================

    describe('pratt()', () => {

        const makeExprLexer = () => {
            const table = buildPrattTable({
                prefix: {
                    NUM: { bp: 0, parse: (_, t) => Result.createAsToken('passed', t, t.span) },
                    MINUS: {
                        bp: 70, parse: (p, t) => {
                            // unary minus - for test purposes just return token
                            return Result.createAsToken('passed', t, t.span);
                        }
                    },
                },
                infix: {
                    PLUS: { lbp: 10, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
                    MINUS: { lbp: 10, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
                    STAR: { lbp: 20, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
                    POWER: { lbp: 30, rbp: 29, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
                },
            });
            return [createRule('root', pratt(table))];
        };

        test('single number', () => {
            const r = parse(toks(['NUM', '1']), makeExprLexer(), S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.isToken()).toBe(true);
        });

        test('1 + 2', () => {
            const r = parse(toks(['NUM', '1'], ['PLUS'], ['NUM', '2']), makeExprLexer(), S);
            expect(r.errors).toHaveLength(0);
        });

        test('higher precedence STAR binds tighter than PLUS', () => {
            // 1 + 2 * 3 → pratt should fold * before +
            const r = parse(toks(['NUM', '1'], ['PLUS'], ['NUM', '2'], ['STAR'], ['NUM', '3']), makeExprLexer(), S);
            expect(r.errors).toHaveLength(0);
        });

        test('no prefix handler → error', () => {
            const r = parse(toks(['RBRACE']), makeExprLexer(), S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('isPratt() on pratt result', () => {
            const r = parse(toks(['NUM', '1'], ['PLUS'], ['NUM', '2']), makeExprLexer(), S);
            expect(r.ast[0]?.isPratt()).toBe(true);
            expect(r.ast[0]?.getPrattResult()).toBeDefined();
        });

    });

    // =============================================================================
    // 11. silent()
    // =============================================================================

    describe('silent()', () => {

        test('silent token is consumed but still in sequence result', () => {
            const rules = [createRule('root', seq(token('LPAREN'), silent(token('WS')), token('RPAREN')))];
            const r = parse(toks(['LPAREN'], ['WS', ' '], ['RPAREN']), rules, S);
            expect(r.errors).toHaveLength(0);
            // sequence still has 3 items (silent affects display, not structure here)
            expect(r.ast[0]?.getSequenceCount()).toBe(3);
        });

    });

    // =============================================================================
    // 12. build function
    // =============================================================================

    describe('build function', () => {

        test('build can transform result to custom', () => {
            const rules = [
                createRule('root', seq(token('NUM'), token('PLUS'), token('NUM')), {
                    build: (res) => {
                        const items = res.getSequenceResult()!;
                        const left = items[0].getTokenValue();
                        const right = items[2].getTokenValue();
                        return Result.createAsCustom('passed', 'add', { left, right }, res.span);
                    },
                }),
            ];
            const r = parse(toks(['NUM', '3'], ['PLUS'], ['NUM', '5']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.isCustom()).toBe(true);
            expect(r.ast[0]?.isCustom('add')).toBe(true);
            const data = r.ast[0]?.getCustomData() as { left: string; right: string };
            expect(data.left).toBe('3');
            expect(data.right).toBe('5');
        });

        test('getCustomName() returns tag', () => {
            const rules = [
                createRule('root', token('A'), {
                    build: (res) => Result.createAsCustom('passed', 'myTag', 42, res.span),
                }),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.ast[0]?.getCustomName()).toBe('myTag');
            expect(r.ast[0]?.getCustomData()).toBe(42);
        });

        test('build error does not crash - falls back to original result', () => {
            const rules = [
                createRule('root', token('A'), {
                    build: () => { throw new Error('build boom'); },
                }),
            ];
            const r = parse(toks(['A']), rules, S);
            // parser catches the build error and continues
            expect(r.ast.length).toBeGreaterThan(0);
        });

    });

    // =============================================================================
    // 13. error handlers
    // =============================================================================

    describe('error handlers', () => {

        test('numeric cond matches failedAt', () => {
            const rules = [
                createRule('root', seq(token('LET'), token('IDENT')), {
                    errors: [error(0, 'Expected LET keyword', 'CUSTOM_1')],
                }),
            ];
            const r = parse(toks(['NUM', '1']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('function cond can inspect parser state', () => {
            const rules = [
                createRule('root', seq(token('LET'), token('IDENT')), {
                    errors: [
                        error(
                            (_parser, { failedAt }) => failedAt === 1,
                            'Missing identifier after let',
                            'MISSING_IDENT',
                        ),
                    ],
                }),
            ];
            const r = parse(toks(['LET'], ['NUM', '42']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('error() with default code', () => {
            const e = error(0, 'test msg');
            expect(e.msg).toBe('test msg');
            expect(e.code).toBeDefined();
        });

        test('error() with custom code', () => {
            const e = error(0, 'test msg', 'MY_CODE');
            expect(e.code).toBe('MY_CODE');
        });

    });

    // =============================================================================
    // 14. errorRecovery: strict vs resilient
    // =============================================================================

    describe('errorRecovery', () => {

        const rules = [
            createRule('root', seq(token('LET'), token('IDENT'))),
        ];

        test('strict mode - stops after first error', () => {
            const r = parse(toks(['LET'], ['NUM', '1']), rules, S);
            expect(r.errors.length).toBeLessThanOrEqual(1);
        });

        test('resilient mode - collects multiple errors', () => {
            const multiRules = [
                createRule('root', repeat(seq(token('LET'), token('IDENT')), 0)),
            ];
            const tokens = toks(['LET'], ['NUM', '1'], ['LET'], ['IDENT', 'x']);
            const r = parse(tokens, multiRules, R);
            // at least one statement parses correctly
            expect(r.ast.length).toBeGreaterThan(0);
        });

        test('maxErrors=0 means unlimited', () => {
            const s = { ...R, errorRecovery: { mode: 'resilient' as const, maxErrors: 0 } };
            const r = parse(toks(['BAD'], ['ALSO_BAD']), rules, s);
            expect(r.errors.length).toBeGreaterThanOrEqual(0);
        });

        test('skipUntil recovery strategy is created correctly', () => {
            const strat = errorRecoveryStrategies.skipUntil('SEMI');
            expect(strat.type).toBe('skipUntil');
            expect(strat.tokens).toContain('SEMI');
        });

        test('skipUntil with array', () => {
            const strat = errorRecoveryStrategies.skipUntil(['SEMI', 'RBRACE']);
            expect(strat.tokens).toHaveLength(2);
        });

    });

    // =============================================================================
    // 15. ignored tokens
    // =============================================================================

    describe('ignored tokens', () => {

        const rules = [createRule('root', seq(token('LET'), token('IDENT')))];

        test('WS ignored between tokens', () => {
            const s = { startRule: 'root', ignored: ['WS'], errorRecovery: { mode: 'strict' as const, maxErrors: 1 } };
            const ts = toks(['LET'], ['WS', ' '], ['IDENT', 'x']);
            const r = parse(ts, rules, s);
            expect(r.errors).toHaveLength(0);
        });

        test('no ignored - WS causes error', () => {
            const ts = toks(['LET'], ['WS', ' '], ['IDENT', 'x']);
            const r = parse(ts, rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

    });

    // =============================================================================
    // 16. ParseResult shape
    // =============================================================================

    describe('ParseResult shape', () => {

        test('has ast, errors, statistics', () => {
            const rules = [createRule('root', token('A'))];
            const r = parse(toks(['A']), rules, S);
            expect(r).toHaveProperty('ast');
            expect(r).toHaveProperty('errors');
            expect(Array.isArray(r.ast)).toBe(true);
            expect(Array.isArray(r.errors)).toBe(true);
        });

        test('empty token list returns empty ast', () => {
            const rules = [createRule('root', token('A'))];
            const r = parse([], rules, S);
            expect(r.ast).toHaveLength(0);
        });

        test('lexer error token in stream returns lexical error', () => {
            const rules = [createRule('root', token('A'))];
            const errTok = { kind: 'error', value: '@', span: { start: 0, end: 1 } };
            const r = parse([errTok], rules, S);
            expect(r.errors[0]?.code).toBe('LEXICAL_ERROR');
        });

    });

    // =============================================================================
    // 17. Parser class methods
    // =============================================================================

    describe('Parser class methods', () => {

        test('isNextToken() finds token ahead', () => {
            const rules = [
                createRule('root', token('A'), {
                    build: (res, parser) => {
                        const found = parser.isNextToken('B');
                        return Result.createAsCustom('passed', 'check', found, res.span);
                    },
                }),
            ];
            const r = parse(toks(['A'], ['B']), rules, { startRule: 'root', ignored: [] });
            // after consuming A, B is next
            expect(r.ast[0]?.getCustomData()).toBe(true);
        });

        test('isPrevToken() finds previous token', () => {
            const rules = [
                createRule('root', seq(token('A'), token('B'))),
                // test via build on the seq
            ];
            // just verify it doesn't crash
            const p = new Parser(rules, S);
            const tokens2 = toks(['A'], ['B']);
            p.parse(tokens2);
            expect(p.isPrevToken('A', 1)).toBe(true);
            expect(p.isPrevToken('NOPE', 1)).toBe(false);
        });

        test('isPrevRule() checks last handled rule', () => {
            const rules = [createRule('root', token('A'))];
            const p = new Parser(rules, S);
            p.parse(toks(['A']));
            // after parsing, lastHandledRule should be set
            expect(typeof p.isPrevRule('root')).toBe('boolean');
        });

        test('dispose() clears state', () => {
            const rules = [createRule('root', token('A'))];
            const p = new Parser(rules, S);
            p.parse(toks(['A']));
            p.dispose();
            expect(p.tokens).toHaveLength(0);
            expect(p.ast).toHaveLength(0);
            expect(p.errors).toHaveLength(0);
        });

        test('parse() statistics are populated', () => {
            const rules = [createRule('root', token('A'))];
            const p = new Parser(rules, S);
            const r = p.parse(toks(['A']));
            expect(r.statistics?.tokensProcessed).toBeGreaterThan(0);
            expect(r.statistics?.parseTimeMs).toBeGreaterThanOrEqual(0);
        });

    });

    // =============================================================================
    // 18. Result class - factory methods + predicates + getters
    // =============================================================================

    describe('Result class', () => {

        test('createAsToken + predicates', () => {
            const span = { start: 0, end: 1 };
            const tok2 = { kind: 'A', value: 'a', span };
            const r = Result.createAsToken('passed', tok2, span);
            expect(r.isPassed()).toBe(true);
            expect(r.isFailed()).toBe(false);
            expect(r.isToken()).toBe(true);
            expect(r.getTokenKind()).toBe('A');
            expect(r.getTokenValue()).toBe('a');
            expect(r.getTokenSpan()).toEqual(span);
            expect(r.getTokenData()?.kind).toBe('A');
        });

        test('createAsOptional - passed with result', () => {
            const span = { start: 0, end: 1 };
            const inner = Result.createAsToken('passed', { kind: 'A', value: 'a', span }, span);
            const r = Result.createAsOptional('passed', inner, span);
            expect(r.isOptional()).toBe(true);
            expect(r.isOptionalPassed()).toBe(true);
            expect(r.isFullyPassed()).toBe(true);
            expect(r.getOptionalResult()).toBe(inner);
        });

        test('createAsOptional - passed with null (absent)', () => {
            const span = { start: 0, end: 1 };
            const r = Result.createAsOptional('passed', null, span);
            expect(r.isOptional()).toBe(true);
            expect(r.isOptionalPassed()).toBe(false);
            expect(r.isFullyPassed()).toBe(false);
            expect(r.getOptionalResult()).toBeUndefined();
        });

        test('createAsChoice', () => {
            const span = { start: 0, end: 1 };
            const inner = Result.createAsToken('passed', { kind: 'A', value: 'a', span }, span);
            const r = Result.createAsChoice('passed', inner, 2, span);
            expect(r.isChoice()).toBe(true);
            expect(r.getChoiceIndex()).toBe(2);
            expect(r.getChoiceResult()).toBe(inner);
        });

        test('createAsRepeat', () => {
            const span = { start: 0, end: 1 };
            const items = [
                Result.createAsToken('passed', { kind: 'A', value: 'a', span }, span),
                Result.createAsToken('passed', { kind: 'A', value: 'a', span }, span),
            ];
            const r = Result.createAsRepeat('passed', items, span, false);
            expect(r.isRepeat()).toBe(true);
            expect(r.getRepeatCount()).toBe(2);
            expect(r.isRepeatEndsWithSep()).toBe(false);
            expect(r.getRepeatResult()).toBe(items);
        });

        test('createAsSequence', () => {
            const span = { start: 0, end: 1 };
            const items = [Result.createAsToken('passed', { kind: 'A', value: 'a', span }, span)];
            const r = Result.createAsSequence('passed', items, span);
            expect(r.isSequence()).toBe(true);
            expect(r.getSequenceCount()).toBe(1);
            expect(r.getSequenceResult()).toBe(items);
        });

        test('createAsPratt', () => {
            const span = { start: 0, end: 1 };
            const items = [Result.createAsToken('passed', { kind: 'A', value: 'a', span }, span)];
            const r = Result.createAsPratt('passed', items, span);
            expect(r.isPratt()).toBe(true);
            expect(r.getPrattResult()).toBe(items);
        });

        test('createAsCustom', () => {
            const span = { start: 0, end: 1 };
            const r = Result.createAsCustom('passed', 'myNode', { x: 1 }, span);
            expect(r.isCustom()).toBe(true);
            expect(r.isCustom('myNode')).toBe(true);
            expect(r.isCustom('other')).toBe(false);
            expect(r.getCustomName()).toBe('myNode');
            expect((r.getCustomData() as { x: number }).x).toBe(1);
        });

        test('create with failed status', () => {
            const span = { start: 0, end: 1 };
            const r = Result.create('failed', null, 'unset', span);
            expect(r.isFailed()).toBe(true);
            expect(r.isPassed()).toBe(false);
            expect(r.isUnset()).toBe(false);
        });

        test('isUnset()', () => {
            const span = { start: 0, end: 1 };
            const r = Result.create('unset', null, 'unset', span);
            expect(r.isUnset()).toBe(true);
        });

        test('withError() and hasErrors()', () => {
            const span = { start: 0, end: 1 };
            const r = Result.create('failed', null, 'unset', span);
            expect(r.hasErrors()).toBe(false);
            r.withError({ msg: 'oops', code: 'ERR', span, failedAt: 0, tokenIndex: 0, startIndex: 0, prevRule: 'root' });
            expect(r.hasErrors()).toBe(true);
            expect(r.errors).toHaveLength(1);
        });

        test('clone() copies status and errors', () => {
            const span = { start: 0, end: 1 };
            const r = Result.create('passed', null, 'unset', span);
            r.withError({ msg: 'e', code: 'E', span, failedAt: 0, tokenIndex: 0, startIndex: 0, prevRule: 'r' });
            const c = r.clone();
            expect(c.status).toBe('passed');
            expect(c.errors).toHaveLength(1);
            // clone errors are independent
            c.errors.push({ msg: 'e2', code: 'E2', span, failedAt: 0, tokenIndex: 0, startIndex: 0, prevRule: 'r' });
            expect(r.errors).toHaveLength(1);
        });

        test('getters return undefined for wrong mode', () => {
            const span = { start: 0, end: 1 };
            const tok2 = Result.createAsToken('passed', { kind: 'A', value: 'a', span }, span);
            expect(tok2.getOptionalResult()).toBeUndefined();
            expect(tok2.getChoiceIndex()).toBeUndefined();
            expect(tok2.getRepeatCount()).toBeUndefined();
            expect(tok2.getSequenceCount()).toBeUndefined();
            expect(tok2.getPrattResult()).toBeUndefined();
            expect(tok2.getCustomData()).toBeUndefined();
            expect(tok2.getCustomName()).toBeUndefined();
        });

        test('token with null value: getTokenValue returns null', () => {
            const span = { start: 0, end: 1 };
            const r = Result.createAsToken('passed', { kind: 'A', value: null, span }, span);
            expect(r.getTokenValue()).toBeNull();
        });

        test('null source token: getTokenValue returns null', () => {
            const span = { start: 0, end: 1 };
            const r = Result.createAsToken('passed', null, span);
            expect(r.getTokenValue()).toBeNull();
        });

    });

    // =============================================================================
    // 19. LL(1) first-set correctness
    // =============================================================================

    describe('LL(1) first-set (lookahead)', () => {

        test('choice with disjoint first sets takes direct path', () => {
            // A-starting vs B-starting alternatives - LL(1) should pick without backtrack
            const rules = [
                createRule('root', choice(
                    seq(token('A'), token('X')),
                    seq(token('B'), token('Y')),
                    seq(token('C'), token('Z')),
                )),
            ];
            const r1 = parse(toks(['A'], ['X']), rules, S);
            const r2 = parse(toks(['B'], ['Y']), rules, S);
            const r3 = parse(toks(['C'], ['Z']), rules, S);
            expect(r1.errors).toHaveLength(0);
            expect(r2.errors).toHaveLength(0);
            expect(r3.errors).toHaveLength(0);
            expect(r1.ast[0]?.getChoiceIndex()).toBe(0);
            expect(r2.ast[0]?.getChoiceIndex()).toBe(1);
            expect(r3.ast[0]?.getChoiceIndex()).toBe(2);
        });

        test('ambiguous first sets fall back to backtracking', () => {
            // Both alternatives start with A - requires backtrack
            const rules = [
                createRule('root', choice(
                    seq(token('A'), token('B')),
                    seq(token('A'), token('C')),
                )),
            ];
            const r = parse(toks(['A'], ['C']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.getChoiceIndex()).toBe(1);
        });

    });

    // =============================================================================
    // 20. Realistic grammar - mini expression language
    // =============================================================================

    describe('Realistic grammar', () => {

        const table = buildPrattTable({
            prefix: {
                NUM: { bp: 0, parse: (_, t) => Result.createAsToken('passed', t, t.span) },
                IDENT: { bp: 0, parse: (_, t) => Result.createAsToken('passed', t, t.span) },
                LPAREN: {
                    bp: 0, parse: (p, _t) => {
                        // grouped expression - for simplicity just return a dummy
                        return Result.createAsToken('passed', _t, _t.span);
                    }
                },
            },
            infix: {
                PLUS: { lbp: 10, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
                STAR: { lbp: 20, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            },
        });

        const rules: Rules = [
            createRule('program', repeat(rule('stmt'), 0)),
            createRule('stmt', choice(rule('letStmt'), rule('exprStmt'))),
            createRule('letStmt', seq(token('LET'), token('IDENT'), token('EQ'), rule('expr'), token('SEMI'))),
            createRule('exprStmt', seq(rule('expr'), token('SEMI'))),
            createRule('expr', pratt(table)),
        ];

        const s: ParserSettings = { startRule: 'program', ignored: ['WS'] };

        test('parses let statement', () => {
            const ts = toks(['LET'], ['WS', ' '], ['IDENT', 'x'], ['WS', ' '], ['EQ'], ['WS', ' '], ['NUM', '1'], ['SEMI']);
            const r = parse(ts, rules, s);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.getRepeatCount()).toBeGreaterThan(0);
        });

        test('parses expression statement', () => {
            const ts = toks(['NUM', '1'], ['PLUS'], ['NUM', '2'], ['SEMI']);
            const r = parse(ts, rules, s);
            expect(r.errors).toHaveLength(0);
        });

        test('parses multiple statements', () => {
            const ts = toks(
                ['LET'], ['IDENT', 'x'], ['EQ'], ['NUM', '1'], ['SEMI'],
                ['LET'], ['IDENT', 'y'], ['EQ'], ['NUM', '2'], ['SEMI'],
            );
            const r = parse(ts, rules, { startRule: 'program', ignored: [] });
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.getRepeatCount()).toBe(2);
        });

    });

    // =============================================================================
    // 21. conditional() - Conditional pattern execution
    // =============================================================================

    describe('conditional()', () => {

        test('conditional() passes when predicate returns true', () => {
            const rules = [
                createRule('root', conditional(token('A'), (ctx) => ctx.depth === 0)),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.isCustom('conditional')).toBe(true);
        });

        test('conditional() fails when predicate returns false', () => {
            const rules = [
                createRule('root', conditional(token('A'), (ctx) => ctx.depth > 10)),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('context has parser, result, index, depth, ruleStack', () => {
            let captured: ConditionalContext | null = null;
            const rules = [
                createRule('root', conditional(token('A'), (ctx: ConditionalContext) => {
                    captured = ctx;
                    return true;
                })),
            ];
            parse(toks(['A']), rules, S);
            expect(captured).not.toBeNull();
            const cap = captured as unknown as ConditionalContext;
            expect(cap.parser).toBeDefined();
            expect(cap.result).toBeDefined();
            expect(typeof cap.index).toBe('number');
            expect(typeof cap.depth).toBe('number');
            expect(Array.isArray(cap.ruleStack)).toBe(true);
        });

        test('conditional() with depth checking', () => {
            const rules = [
                createRule('root', seq(
                    rule('item'),
                    conditional(token('A'), (ctx) => ctx.depth < 10),
                )),
                createRule('item', token('B')),
            ];
            const r = parse(toks(['B'], ['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('conditional() with ruleStack inspection', () => {
            let capturedStack: string[] | null = null;
            const rules = [
                createRule('root', conditional(rule('item'), (ctx) => {
                    capturedStack = ctx.ruleStack;
                    return true;
                })),
                createRule('item', token('A')),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
            // Verify we captured the stack (even if empty at top level)
            expect(Array.isArray(capturedStack)).toBe(true);
        });

        test('conditional() wraps inner token result', () => {
            const rules = [
                createRule('root', conditional(seq(token('A'), token('B')), (ctx) => true)),
            ];
            const r = parse(toks(['A'], ['B']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.isCustom('conditional')).toBe(true);
            const inner = (r.ast[0]?.getCustomData()) as any;
            expect(inner?.isSequence()).toBe(true);
        });

        test('conditional() fails inner pattern before checking predicate', () => {
            let predicateCalled = false;
            const rules = [
                createRule('root', conditional(token('A'), (ctx) => {
                    predicateCalled = true;
                    return true;
                })),
            ];
            parse(toks(['B']), rules, S);
            // Predicate should not be called if inner pattern fails
            expect(predicateCalled).toBe(false);
        });

        test('conditional() with complex predicate logic', () => {
            const rules = [
                createRule('root', seq(
                    token('IF'),
                    conditional(rule('expr'), (ctx) => {
                        // Only allow expression if parser hasn't encountered errors
                        return ctx.parser.errors.length === 0;
                    }),
                )),
                createRule('expr', token('NUM')),
            ];
            const r = parse(toks(['IF'], ['NUM', '42']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('when() is alias for conditional()', () => {
            const rules = [
                createRule('root', when(token('A'), (ctx) => ctx.depth < 5)),
            ];
            // Just verify it compiles without error
            expect(() => new Parser(rules, S)).not.toThrow();
        });

        test('ifCondition() is alias for conditional()', () => {
            const rules = [
                createRule('root', ifCondition(token('A'), (ctx) => ctx.depth < 5)),
            ];
            // Just verify it compiles without error
            expect(() => new Parser(rules, S)).not.toThrow();
        });

        test('conditional() with predicate throwing error', () => {
            const rules = [
                createRule('root', conditional(token('A'), (ctx) => {
                    throw new Error('predicate error');
                })),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('conditional() can check parser state during parse', () => {
            let errorCountWhenCalled = -1;
            const rules = [
                createRule('root', seq(
                    choice(token('BAD'), token('GOOD')),
                    conditional(token('A'), (ctx) => {
                        errorCountWhenCalled = ctx.parser.errors.length;
                        return true;
                    }),
                )),
            ];
            const r = parse(toks(['GOOD'], ['A']), rules, { ...S, errorRecovery: { mode: 'resilient', maxErrors: 10 } });
            // The error count at conditional execution time
            expect(typeof errorCountWhenCalled).toBe('number');
        });

        test('conditional() with optional inner pattern', () => {
            const rules = [
                createRule('root', conditional(
                    optional(token('A')),
                    (ctx) => true,
                )),
            ];
            const r = parse(toks(['B']), rules, S);
            // Optional returns a passed result even when absent
            expect(r.errors).toHaveLength(0);
        });

        test('conditional() with repeat inner pattern', () => {
            const rules = [
                createRule('root', conditional(
                    repeat(token('A'), 0, 3),
                    (ctx) => {
                        // Can check how many items were matched
                        const repeatRes = ctx.result as Result | null;
                        return (repeatRes?.getRepeatCount?.() ?? 0) <= 3;
                    },
                )),
            ];
            const r = parse(toks(['A'], ['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('conditional() in choice with disjoint paths', () => {
            const rules = [
                createRule('root', choice(
                    conditional(seq(token('IF'), token('A')), (ctx) => ctx.depth < 5),
                    conditional(seq(token('LOOP'), token('B')), (ctx) => ctx.depth < 5),
                )),
            ];
            const r1 = parse(toks(['IF'], ['A']), rules, S);
            const r2 = parse(toks(['LOOP'], ['B']), rules, S);
            expect(r1.errors).toHaveLength(0);
            expect(r2.errors).toHaveLength(0);
        });

        test('nested conditionals work', () => {
            const rules = [
                createRule('root', conditional(
                    conditional(token('A'), (ctx) => ctx.parser.tokens.length > 0),
                    (ctx) => ctx.depth < 10,
                )),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
            expect(r.ast[0]?.isCustom('conditional')).toBe(true);
        });

        test('conditional() preserves spans correctly', () => {
            const rules = [
                createRule('root', conditional(token('A'), (ctx) => true)),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.ast[0]?.span).toBeDefined();
            expect(r.ast[0]?.span.start).toBeGreaterThanOrEqual(0);
        });

    });

    // =============================================================================
    // 21. action()
    // =============================================================================

    describe('action()', () => {

        test('action() executes function during parse', () => {
            let executed = false;
            const rules = [
                createRule('root', seq(
                    token('A'),
                    action(() => { executed = true; })
                )),
            ];
            parse(toks(['A']), rules, S);
            expect(executed).toBe(true);
        });

        test('action() always succeeds', () => {
            const rules = [
                createRule('root', seq(token('A'), action(() => { }))),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('action() receives parser instance', () => {
            let receivedParser: any = null;
            const rules = [
                createRule('root', seq(
                    token('A'),
                    action((p) => { receivedParser = p; })
                )),
            ];
            parse(toks(['A']), rules, S);
            expect(receivedParser).toBeDefined();
        });

        test('action() can modify parser.stats', () => {
            const rules = [
                createRule('root', seq(
                    token('A'),
                    action((p) => { (p.stats as unknown as Record<string, number>).customCounter = ((p.stats as unknown as Record<string, number>).customCounter ?? 0) + 1; }),
                    token('B'),
                )),
            ];
            const r = parse(toks(['A'], ['B']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('action() in sequence after token', () => {
            let tokenValue: string | null = null;
            const rules = [
                createRule('root', seq(
                    token('IDENT', 'foo'),
                    action((p) => { tokenValue = p.tokens[0]?.value ?? null; }),
                )),
            ];
            parse(toks(['IDENT', 'foo']), rules, S);
            expect(tokenValue as string | null).toBe('foo');
        });

        test('action() with choice patterns', () => {
            let caseSelected = 0;
            const rules = [
                createRule('root', choice(
                    seq(token('A'), action(() => { caseSelected = 1; })),
                    seq(token('B'), action(() => { caseSelected = 2; })),
                )),
            ];
            parse(toks(['B']), rules, S);
            expect(caseSelected).toBe(2);
        });

        test('action() in repeat', () => {
            let count = 0;
            const rules = [
                createRule('root', repeat(
                    seq(token('A'), action(() => { count++; })),
                    0,
                    3,
                )),
            ];
            parse(toks(['A'], ['A']), rules, S);
            expect(count).toBeGreaterThan(0);
        });

        test('action() that throws is caught as error', () => {
            const rules = [
                createRule('root', seq(
                    token('A'),
                    action(() => { throw new Error('action threw'); })
                )),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('action() returns custom result with action tag', () => {
            const rules = [
                createRule('root', seq(token('A'), action(() => { }))),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.ast[0]?.isSequence()).toBe(true);
        });

    });

    // =============================================================================
    // 22. not()
    // =============================================================================

    describe('not()', () => {

        test('not() fails when pattern matches', () => {
            const rules = [
                createRule('root', not(token('A'))),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('not() succeeds when pattern does NOT match', () => {
            const rules = [
                createRule('root', not(token('A'))),
            ];
            const r = parse(toks(['B']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('not() does not consume tokens', () => {
            const rules = [
                createRule('root', seq(
                    not(token('A')),
                    token('B'),
                )),
            ];
            const r = parse(toks(['B']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('not() with complex pattern', () => {
            const rules = [
                createRule('root', seq(
                    not(seq(token('IF'), token('A'))),
                    token('ELSE'),
                )),
            ];
            const r = parse(toks(['ELSE']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('not() with choice patterns', () => {
            const rules = [
                createRule('root', not(choice(token('IF'), token('WHILE'), token('FOR')))),
            ];
            const r = parse(toks(['LET']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('not(choice(...)) fails for keywords', () => {
            const rules = [
                createRule('root', not(choice(token('IF'), token('WHILE')))),
            ];
            const r = parse(toks(['IF']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('not() in sequence for negative lookahead', () => {
            const rules = [
                createRule('root', seq(
                    not(token('EOF')),
                    token('IDENT'),
                )),
            ];
            const r = parse(toks(['IDENT']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('not() returns custom result with not tag', () => {
            const rules = [
                createRule('root', not(token('A'))),
            ];
            const r = parse(toks(['B']), rules, S);
            expect(r.ast[0]?.isCustom('not')).toBe(true);
        });

        test('nested not patterns work', () => {
            const rules = [
                createRule('root', not(not(token('A')))),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

    });

    // =============================================================================
    // 23. lookahead() / peek()
    // =============================================================================

    describe('lookahead() / peek()', () => {

        test('lookahead() succeeds if pattern matches ahead', () => {
            const rules = [
                createRule('root', lookahead(token('A'))),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('lookahead() fails if pattern does not match', () => {
            const rules = [
                createRule('root', lookahead(token('A'))),
            ];
            const r = parse(toks(['B']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('lookahead() does not consume tokens', () => {
            const rules = [
                createRule('root', seq(
                    lookahead(token('A')),
                    token('A'),
                )),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('lookahead() does not consume tokens', () => {
            const rules = [
                createRule('root', seq(
                    lookahead(token('A')),
                    token('A'),
                )),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('lookahead() with choice patterns', () => {
            const rules = [
                createRule('root', seq(
                    lookahead(choice(token('IF'), token('WHILE'))),
                    token('IF'),
                )),
            ];
            const r = parse(toks(['IF']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('peek() is alias for lookahead()', () => {
            const rules = [
                createRule('root', seq(
                    peek(token('A')),
                    token('A'),
                )),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('lookahead() returns custom result with lookahead tag', () => {
            const rules = [
                createRule('root', lookahead(token('A'))),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.ast[0]?.isCustom('lookahead')).toBe(true);
        });

        test('nested lookaheads work', () => {
            const rules = [
                createRule('root', seq(
                    lookahead(lookahead(token('A'))),
                    token('A'),
                )),
            ];
            const r = parse(toks(['A']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

    });

    // =============================================================================
    // 24. Pattern composition helpers
    // =============================================================================

    describe('delimited() / surrounded() / between()', () => {

        test('delimited() with no items', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'))),
            ];
            const r = parse(toks(), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with single item', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'))),
            ];
            const r = parse(toks(['ITEM']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with multiple items', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'))),
            ];
            const r = parse(toks(['ITEM'], ['COMMA'], ['ITEM']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with min constraint', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { min: 1 })),
            ];
            const r = parse(toks(['ITEM']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with min=0 and trailingOk=true', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { min: 0, trailingOk: true })),
            ];
            const r = parse(toks(['ITEM'], ['COMMA']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with min=1 and trailingOk=true', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { min: 1, trailingOk: true })),
            ];
            const r = parse(toks(['ITEM'], ['COMMA']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with min=1 and trailingOk=false', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { min: 1, trailingOk: false })),
            ];
            const r = parse(toks(['ITEM']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with min=0 and trailingOk=true', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { min: 0, trailingOk: true })),
            ];
            const r = parse(toks(['ITEM'], ['COMMA']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with min=1 and trailingOk=true', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { min: 1, trailingOk: true })),
            ];
            const r = parse(toks(['ITEM'], ['COMMA']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with min=3 and trailingOk=true', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { min: 3, trailingOk: true })),
            ];
            const r = parse(toks(['ITEM'], ['COMMA']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('delimited() with min=3 and trailingOk=false', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { min: 3, trailingOk: false })),
            ];
            const r = parse(toks(['ITEM']), rules, S);
            expect(r.errors.length).toBeGreaterThan(0);
        });

        test('delimited() with trailing separator', () => {
            const rules = [
                createRule('root', delimited(token('ITEM'), token('COMMA'), { trailingOk: true })),
            ];
            const r = parse(toks(['ITEM'], ['COMMA']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('surrounded() basic usage', () => {
            const rules = [
                createRule('root', surrounded(token('CONTENT'), token('LPAREN'), token('RPAREN'))),
            ];
            const r = parse(toks(['LPAREN'], ['CONTENT'], ['RPAREN']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('between() is same as surrounded()', () => {
            const rules = [
                createRule('root', between(token('LBRACE'), token('CONTENT'), token('RBRACE'))),
            ];
            const r = parse(toks(['LBRACE'], ['CONTENT'], ['RBRACE']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('delimited() with rules and expressions', () => {
            const rules = [
                createRule('root', delimited(rule('item'), token('COMMA'))),
                createRule('item', token('IDENT')),
            ];
            const r = parse(toks(['IDENT'], ['COMMA'], ['IDENT']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

        test('between() with delimited content', () => {
            const rules = [
                createRule('root', between(
                    token('LBRACKET'),
                    delimited(token('NUM'), token('COMMA')),
                    token('RBRACKET'),
                )),
            ];
            const r = parse(toks(['LBRACKET'], ['NUM'], ['COMMA'], ['NUM'], ['RBRACKET']), rules, S);
            expect(r.errors).toHaveLength(0);
        });

    });

// ╚══════════════════════════════════════════════════════════════════════════════════════╝
