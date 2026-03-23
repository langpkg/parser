/* eslint-disable @typescript-eslint/no-this-alias */
//
// bench/index.bench.ts
//
// Run      : bun run bench
// devDeps  : bun add @langpkg/lexer chevrotain mitata --save-dev
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { bench, group, run } from 'mitata';
    import {
        createRule,
        token, seq, choice, optional, zeroOrMore, rule,
        pratt, buildPrattTable, Result,
    } from '../src/index';
    import { Parser } from '../src/core';
    import type { Token as LPToken, Rules, ParserSettings } from '../src/types';

    import { compile, keywords } from '@langpkg/lexer';  // adjust path as needed

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    // ─────────────────────────────────────────────────────────────────────────────
    // Chevrotain setup
    // ─────────────────────────────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createToken, Lexer: ChevLexer, CstParser } = require('chevrotain');

    // token defs (mirror the grammar below)
    const T = {
        WS: createToken({ name: 'WS', pattern: /[ \t\r\n]+/, group: 'SKIPPED' }),
        SLASH2: createToken({ name: 'SLASH2', pattern: /\/\/[^\n]*/, group: 'SKIPPED' }),
        FN: createToken({ name: 'FN', pattern: /fn/ }),
        LET: createToken({ name: 'LET', pattern: /let/ }),
        CONST: createToken({ name: 'CONST', pattern: /const/ }),
        RETURN: createToken({ name: 'RETURN', pattern: /return/ }),
        IF: createToken({ name: 'IF', pattern: /if/ }),
        ELSE: createToken({ name: 'ELSE', pattern: /else/ }),
        IDENT: createToken({ name: 'IDENT', pattern: /[a-zA-Z_$][a-zA-Z0-9_$]*/ }),
        NUMBER: createToken({ name: 'NUMBER', pattern: /0|[1-9][0-9]*/ }),
        STRING: createToken({ name: 'STRING', pattern: /"(?:\\.|[^"\\])*"/ }),
        GTE: createToken({ name: 'GTE', pattern: />=/ }),
        LTE: createToken({ name: 'LTE', pattern: /<=/ }),
        EQ2: createToken({ name: 'EQ2', pattern: /==/ }),
        NEQ: createToken({ name: 'NEQ', pattern: /!=/ }),
        AND: createToken({ name: 'AND', pattern: /&&/ }),
        OR: createToken({ name: 'OR', pattern: /\|\|/ }),
        ARROW: createToken({ name: 'ARROW', pattern: /=>/ }),
        EQ: createToken({ name: 'EQ', pattern: /=/ }),
        PLUS: createToken({ name: 'PLUS', pattern: /\+/ }),
        MINUS: createToken({ name: 'MINUS', pattern: /-/ }),
        STAR: createToken({ name: 'STAR', pattern: /\*/ }),
        SLASH: createToken({ name: 'SLASH', pattern: /\// }),
        SEMI: createToken({ name: 'SEMI', pattern: /;/ }),
        COMMA: createToken({ name: 'COMMA', pattern: /,/ }),
        COLON: createToken({ name: 'COLON', pattern: /:/ }),
        DOT: createToken({ name: 'DOT', pattern: /\./ }),
        LPAREN: createToken({ name: 'LPAREN', pattern: /\(/ }),
        RPAREN: createToken({ name: 'RPAREN', pattern: /\)/ }),
        LBRACE: createToken({ name: 'LBRACE', pattern: /\{/ }),
        RBRACE: createToken({ name: 'RBRACE', pattern: /\}/ }),
        LBRACK: createToken({ name: 'LBRACK', pattern: /\[/ }),
        RBRACK: createToken({ name: 'RBRACK', pattern: /\]/ }),
    };

    // Chevrotain requires tokens with longer alternatives declared first
    const allTokens = [
        T.WS, T.SLASH2,
        T.GTE, T.LTE, T.EQ2, T.NEQ, T.AND, T.OR, T.ARROW,
        T.FN, T.LET, T.CONST, T.RETURN, T.IF, T.ELSE,
        T.IDENT, T.NUMBER, T.STRING,
        T.EQ, T.PLUS, T.MINUS, T.STAR, T.SLASH,
        T.SEMI, T.COMMA, T.COLON, T.DOT,
        T.LPAREN, T.RPAREN, T.LBRACE, T.RBRACE, T.LBRACK, T.RBRACK,
    ];

    const chevLexer = new ChevLexer(allTokens);

    class ChevParser extends CstParser {
        constructor() {
            super(allTokens, { recoveryEnabled: true });
            const $ = this;

            $.RULE('program', () => { $.MANY(() => $.SUBRULE($.stmt)); });
            $.RULE('stmt', () => {
                $.OR([
                    { ALT: () => $.SUBRULE($.letStmt) },
                    { ALT: () => $.SUBRULE($.fnDecl) },
                    { ALT: () => $.SUBRULE($.ifStmt) },
                    { ALT: () => $.SUBRULE($.retStmt) },
                    { ALT: () => $.SUBRULE($.exprStmt) },
                ]);
            });
            $.RULE('letStmt', () => {
                $.OR([{ ALT: () => $.CONSUME(T.LET) }, { ALT: () => $.CONSUME(T.CONST) }]);
                $.CONSUME(T.IDENT);
                $.OPTION(() => { $.CONSUME(T.COLON); $.CONSUME2(T.IDENT); });
                $.OPTION2(() => { $.CONSUME(T.EQ); $.SUBRULE($.expr); });
                $.CONSUME(T.SEMI);
            });
            $.RULE('fnDecl', () => {
                $.CONSUME(T.FN); $.CONSUME(T.IDENT);
                $.CONSUME(T.LPAREN);
                $.OPTION(() => $.SUBRULE($.params));
                $.CONSUME(T.RPAREN);
                $.OPTION2(() => { $.CONSUME(T.ARROW); $.CONSUME2(T.IDENT); });
                $.CONSUME(T.LBRACE); $.MANY(() => $.SUBRULE($.stmt)); $.CONSUME(T.RBRACE);
            });
            $.RULE('params', () => {
                $.SUBRULE($.param);
                $.MANY(() => { $.CONSUME(T.COMMA); $.SUBRULE2($.param); });
            });
            $.RULE('param', () => {
                $.CONSUME(T.IDENT);
                $.OPTION(() => { $.CONSUME(T.COLON); $.CONSUME2(T.IDENT); });
            });
            $.RULE('ifStmt', () => {
                $.CONSUME(T.IF); $.SUBRULE($.expr);
                $.CONSUME(T.LBRACE); $.MANY(() => $.SUBRULE($.stmt)); $.CONSUME(T.RBRACE);
                $.OPTION(() => {
                    $.CONSUME(T.ELSE);
                    $.CONSUME2(T.LBRACE); $.MANY2(() => $.SUBRULE2($.stmt)); $.CONSUME2(T.RBRACE);
                });
            });
            $.RULE('retStmt', () => { $.CONSUME(T.RETURN); $.OPTION(() => $.SUBRULE($.expr)); $.CONSUME(T.SEMI); });
            $.RULE('exprStmt', () => { $.SUBRULE($.expr); $.CONSUME(T.SEMI); });
            $.RULE('expr', () => {
                $.SUBRULE($.primary);
                $.OPTION(() => {
                    $.OR([
                        { ALT: () => $.CONSUME(T.PLUS) },
                        { ALT: () => $.CONSUME(T.MINUS) },
                        { ALT: () => $.CONSUME(T.STAR) },
                        { ALT: () => $.CONSUME(T.SLASH) },
                        { ALT: () => $.CONSUME(T.EQ2) },
                        { ALT: () => $.CONSUME(T.NEQ) },
                        { ALT: () => $.CONSUME(T.GTE) },
                        { ALT: () => $.CONSUME(T.LTE) },
                        { ALT: () => $.CONSUME(T.AND) },
                        { ALT: () => $.CONSUME(T.OR) },
                    ]);
                    $.SUBRULE2($.primary);
                });
            });
            $.RULE('primary', () => {
                $.OR([
                    { ALT: () => { $.CONSUME(T.IDENT); $.OPTION(() => { $.CONSUME(T.LPAREN); $.OPTION2(() => $.SUBRULE($.args)); $.CONSUME(T.RPAREN); }); } },
                    { ALT: () => $.CONSUME(T.NUMBER) },
                    { ALT: () => $.CONSUME(T.STRING) },
                ]);
            });
            $.RULE('args', () => { $.SUBRULE($.expr); $.MANY(() => { $.CONSUME(T.COMMA); $.SUBRULE2($.expr); }); });

            this.performSelfAnalysis();
        }
    }

    const chevParser = new ChevParser();

    // ─────────────────────────────────────────────────────────────────────────────
    // @langpkg/parser grammar  (same language, same complexity)
    // ─────────────────────────────────────────────────────────────────────────────

    const exprTable = buildPrattTable({
        prefix: {
            IDENT: { bp: 0, parse: (_, t) => Result.createAsToken('passed', t, t.span) },
            NUMBER: { bp: 0, parse: (_, t) => Result.createAsToken('passed', t, t.span) },
            STRING: { bp: 0, parse: (_, t) => Result.createAsToken('passed', t, t.span) },
        },
        infix: {
            PLUS: { lbp: 10, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            MINUS: { lbp: 10, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            STAR: { lbp: 20, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            SLASH: { lbp: 20, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            EQ2: { lbp: 5, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            NEQ: { lbp: 5, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            GTE: { lbp: 5, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            LTE: { lbp: 5, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            AND: { lbp: 3, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
            OR: { lbp: 2, parse: (_, l, t) => Result.createAsPratt('passed', [l, Result.createAsToken('passed', t, t.span)], l.span) },
        },
    });

    const lpRules: Rules = [
        createRule('program', zeroOrMore(rule('stmt'))),
        createRule('stmt', choice(rule('letStmt'), rule('fnDecl'), rule('ifStmt'), rule('retStmt'), rule('exprStmt'))),
        createRule('letStmt', seq(
            choice(token('LET'), token('CONST')),
            token('IDENT'),
            optional(seq(token('EQ'), rule('expr'))),
            token('SEMI'),
        )),
        createRule('fnDecl', seq(
            token('FN'), token('IDENT'),
            token('LPAREN'), optional(rule('params')), token('RPAREN'),
            token('LBRACE'), zeroOrMore(rule('stmt')), token('RBRACE'),
        )),
        createRule('params', seq(token('IDENT'), zeroOrMore(seq(token('COMMA'), token('IDENT'))))),
        createRule('ifStmt', seq(
            token('IF'), rule('expr'),
            token('LBRACE'), zeroOrMore(rule('stmt')), token('RBRACE'),
            optional(seq(token('ELSE'), token('LBRACE'), zeroOrMore(rule('stmt')), token('RBRACE'))),
        )),
        createRule('retStmt', seq(token('RETURN'), optional(rule('expr')), token('SEMI'))),
        createRule('exprStmt', seq(rule('expr'), token('SEMI'))),
        createRule('expr', pratt(exprTable)),
    ];

    const lpSettings: ParserSettings = {
        startRule: 'program',
        ignored: ['WS', 'COMMENT'],
        errorRecovery: { mode: 'resilient', maxErrors: 100 },
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // Input generation  (realistic)
    // ─────────────────────────────────────────────────────────────────────────────

    const kw = keywords({ KW: ['fn', 'let', 'const', 'return', 'if', 'else'] });
    const lexer = compile({
        WS: /[ \t\r]+/,
        NL: { match: /\n/, lineBreaks: true },
        COMMENT: /\/\/[^\n]*/,
        NUMBER: /0|[1-9][0-9]*/,
        STRING: { match: /"(?:\\.|[^"\\])*"/, lineBreaks: false },
        IDENT: { match: /[a-zA-Z_$][a-zA-Z0-9_$]*/, type: kw },
        GTE: '>=', LTE: '<=', EQ2: '==', NEQ: '!=', AND: '&&', OR: '||', ARROW: '=>',
        EQ: '=', PLUS: '+', MINUS: '-', STAR: '*', SLASH: '/',
        SEMI: ';', COMMA: ',', COLON: ':', DOT: '.',
        LPAREN: '(', RPAREN: ')', LBRACE: '{', RBRACE: '}', LBRACK: '[', RBRACK: ']',
    });

    function makeSource(stmts: number): string {
        const lines: string[] = [];
        for (let i = 0; i < stmts; i++) {
            switch (i % 5) {
                case 0: lines.push(`let x${i} = ${i};`); break;
                case 1: lines.push(`const y${i} = x${i - 1} + ${i};`); break;
                case 2: lines.push(`fn add${i}(a, b) { return a + b; }`); break;
                case 3: lines.push(`if x${i} >= ${i} { let z${i} = x${i} + 1; }`); break;
                case 4: lines.push(`// comment\nx${i} == ${i};`); break;
            }
        }
        return lines.join('\n');
    }

    // Convert @langpkg/lexer tokens to LP token format (strip NL trivia).
    function toLPTokens(src: string): LPToken[] {
        lexer.reset(src);
        const out: LPToken[] = [];
        let t;
        while ((t = lexer.next()) !== undefined) {
            if (t.type === 'NL') continue;   // NL is not in ignored list, merge with WS
            out.push({ kind: t.type, value: t.value, span: { start: t.offset, end: t.offset + t.text.length } });
        }
        return out;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Source code once per size
    // ─────────────────────────────────────────────────────────────────────────────

    const SIZES = [100, 500, 2000];

    const inputs = SIZES.map(n => {
        const src = makeSource(n);
        return { n, src };
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Compile parsers ONCE before benchmark
    // ─────────────────────────────────────────────────────────────────────────────

    const lpParser = new Parser(lpRules, lpSettings);

    // ─────────────────────────────────────────────────────────────────────────────
    // Benchmark
    // ─────────────────────────────────────────────────────────────────────────────

    for (const { n, src } of inputs) {
        group(`${n} statements`, () => {

            bench('@langpkg/parser', () => {
                const tokens = toLPTokens(src);
                lpParser.parse(tokens);
            });

            bench('chevrotain', () => {
                const tokens = chevLexer.tokenize(src).tokens;
                chevParser.input = tokens;
                chevParser.program();
            });

        });
    }

    await run();

// ╚══════════════════════════════════════════════════════════════════════════════════════╝
