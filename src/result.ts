// src/result.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import type * as Types from './types';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ TYPE ════════════════════════════════════════╗

    export type ResultStatus = 'unset' | 'failed' | 'passed';
    export type ResultMode   = 'unset' | 'token'  | 'optional' | 'choice' | 'repeat' | 'seq' | 'pratt' | 'custom';

    export interface TokenSource {
        source_kind         : 'token-source'
        kind                : string
        value?              : string
        span?               : Types.Span
    }

    export interface OptionalSource {
        source_kind         : 'optional-source'
        result              : Result | null
    }

    export interface ChoiceSource {
        source_kind         : 'choice-source'
        atIndex             : number
        result              : Result | null
    }

    export interface RepeatSource {
        source_kind         : 'repeat-source'
        endsWithSep         : boolean
        result              : Result[]
    }

    export interface SequenceSource {
        source_kind         : 'sequence-source'
        result              : Result[]
    }

    export interface PrattSource {
        source_kind         : 'pratt-source'
        result              : Result[] // [left, op-token, right] per fold
    }

    export interface CustomSource {
        source_kind         : 'custom-source'
        name                : string
        data: unknown
    }

    export type ResultSource =
        | TokenSource  | OptionalSource | ChoiceSource
        | RepeatSource | SequenceSource | PrattSource
        | CustomSource | null;

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CORE ════════════════════════════════════════╗

    export class Result {

        // ┌──────────────────────────────── INIT ──────────────────────────────┐

        public span     : Types.Span = { start: -99, end: -99 };
        public status   : ResultStatus = 'unset';
        public source   : ResultSource = null;
        public mode     : ResultMode = 'unset';
        public errors   : Types.ParseError[] = [];

        constructor(
            status      : ResultStatus,
            source      : ResultSource | null,
            mode        : ResultMode,
            span        : Types.Span,
        ) {
            this.status = status;
            this.source = source;
            this.mode   = mode;
            this.span   = span;
        }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── ──── ──────────────────────────────┐

            static create(
                status      : ResultStatus, source: ResultSource | null,
                mode        : ResultMode, span: Types.Span,
            ): Result {
                return new Result(status, source, mode, span);
            }

            static createAsToken(status: ResultStatus, source: Types.Token | null, span: Types.Span): Result {
                return Result.create(status, {
                    source_kind : 'token-source',
                    kind        : source?.kind  ?? 'unset',
                    value       : source?.value ?? undefined,
                    span,
                }, 'token', span);
            }

            static createAsOptional(status: ResultStatus, source: Result | null, span: Types.Span): Result {
                return Result.create(status, { source_kind: 'optional-source',  result: source },                       'optional', span);
            }

            static createAsChoice(status: ResultStatus, source: Result | null, index: number, span: Types.Span): Result {
                return Result.create(status, { source_kind: 'choice-source',    atIndex: index, result: source },       'choice',   span);
            }

            static createAsRepeat(status: ResultStatus, source: Result[] | null, span: Types.Span, endsWithSep = false): Result {
                return Result.create(status, { source_kind: 'repeat-source',    endsWithSep, result: source ?? [] },    'repeat',   span);
            }

            static createAsSequence(status: ResultStatus, source: Result[] | null, span: Types.Span): Result {
                return Result.create(status, { source_kind: 'sequence-source',  result: source ?? [] },                 'seq',      span);
            }

            static createAsPratt(status: ResultStatus, source: Result[], span: Types.Span): Result {
                return Result.create(status, { source_kind: 'pratt-source',     result: source },                       'pratt',    span);
            }

            static createAsCustom(status: ResultStatus, name: string, data: unknown, span: Types.Span): Result {
                return Result.create(status, { source_kind: 'custom-source',    name, data },                           'custom',   span);
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── ──── ──────────────────────────────┐

            isPassed()              : boolean { return this.status === 'passed';    }
            isFailed()              : boolean { return this.status === 'failed';    }
            isUnset()               : boolean { return this.status === 'unset';     }
            isToken()               : boolean { return this.mode   === 'token';     }
            isOptional()            : boolean { return this.mode   === 'optional';  }
            isChoice()              : boolean { return this.mode   === 'choice';    }
            isRepeat()              : boolean { return this.mode   === 'repeat';    }
            isSequence()            : boolean { return this.mode   === 'seq';       }
            isPratt()               : boolean { return this.mode   === 'pratt';     }

            isFullyPassed()         : boolean {
                if (!this.isPassed()) return false;
                if (this.isOptional() && !this.isOptionalPassed()) return false;
                return true;
            }

            isOptionalPassed()      : boolean {
                return this.isOptional() && (this.source as OptionalSource).result !== null;
            }

            isCustom(tag?: string)  : boolean {
                if (this.mode !== 'custom') return false;
                return tag ? (this.source as CustomSource).name === tag : true;
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── ──── ──────────────────────────────┐

            getTokenKind()          : string      | undefined   { return this.isToken()             ? (this.source as TokenSource).kind             : undefined; }
            getTokenSpan()          : Types.Span  | undefined   { return this.isToken()             ? (this.source as TokenSource).span             : undefined; }

            getOptionalResult()     : Result | null | undefined { return this.isOptionalPassed()    ? (this.source as OptionalSource).result        : undefined; }

            getChoiceIndex()        : number | undefined        { return this.isChoice()            ? (this.source as ChoiceSource).atIndex         : undefined; }
            getChoiceResult()       : Result | null | undefined { return this.isChoice()            ? (this.source as ChoiceSource).result          : undefined; }

            getRepeatCount()        : number   | undefined      { return this.isRepeat()            ? (this.source as RepeatSource).result.length   : undefined; }
            getRepeatResult()       : Result[] | undefined      { return this.isRepeat()            ? (this.source as RepeatSource).result          : undefined; }
            isRepeatEndsWithSep()   : boolean  | undefined      { return this.isRepeat()            ? (this.source as RepeatSource).endsWithSep     : undefined; }

            getSequenceCount()      : number   | undefined      { return this.isSequence()          ? (this.source as SequenceSource).result.length : undefined; }
            getSequenceResult()     : Result[] | undefined      { return this.isSequence()          ? (this.source as SequenceSource).result        : undefined; }

            getPrattResult()        : Result[] | undefined      { return this.isPratt()             ? (this.source as PrattSource).result           : undefined; }

            getCustomData()         : unknown  | undefined      { return this.isCustom()            ? (this.source as CustomSource).data            : undefined; }
            getCustomName()         : string   | undefined      { return this.isCustom()            ? (this.source as CustomSource).name            : undefined; }

            getTokenValue()         : string | null | undefined {
                if (!this.isToken()) return undefined;
                const v = (this.source as TokenSource).value;
                return v === undefined ? null : v;
            }

            getTokenData()          : Types.Token | undefined   {
                if (!this.isToken()) return undefined;
                const s = this.source as TokenSource;
                return { kind: s.kind, value: s.value!, span: s.span! };
            }

        // └────────────────────────────────────────────────────────────────────┘


        // ┌──────────────────────────────── ──── ──────────────────────────────┐

            clone(): Result {
                const r = new Result(this.status, this.source, this.mode, this.span);
                r.errors = [...this.errors];
                return r;
            }

            hasErrors(): boolean { return this.errors.length > 0; }
            withError(e: Types.ParseError): Result { this.errors.push(e); return this; }

        // └────────────────────────────────────────────────────────────────────┘

    }

// ╚══════════════════════════════════════════════════════════════════════════════════════╝