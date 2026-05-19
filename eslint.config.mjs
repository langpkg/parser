// eslint.config.mjs
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { defineConfig }    from 'eslint/config';
    import stylistic           from '@stylistic/eslint-plugin';
    import tseslint            from 'typescript-eslint';
    import js                  from '@eslint/js';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔═══════════════════════════════════════ CONST ════════════════════════════════════════╗

    const rules                                   = {
        "curly"                                   : "off",
        "@stylistic/semi"                         : ["warn", "always"],
        "@typescript-eslint/no-empty-function"    : "off",
        "@typescript-eslint/naming-convention"    : [
            "warn",
            {
                "selector"                        : "variable",
                "format"                          : ["snake_case", "camelCase"],
                "filter"                          : {
                    "match"                       : false,
                    "regex"                       : "^_"
                }
            },
            {
                "selector"                        : "function",
                "format"                          : ["camelCase"]
            },
            {
                "selector"                        : "method",
                "format"                          : ["camelCase"]
            },
            {
                "selector"                        : "typeLike",
                "format"                          : ["PascalCase"]
            },
            {
                "selector"                        : "import",
                "format"                          : ["camelCase", "PascalCase"]
            },
            {
                "selector"                        : "variable",
                "modifiers"                       : ["const"],
                "format"                          : ["UPPER_CASE", "snake_case", "camelCase"],
                "filter"                          : {
                    "match"                       : false,
                    "regex"                       : "^_"
                }
            },
            {
                "selector"                        : "enumMember",
                "format"                          : ["PascalCase"]
            }
        ],
        "@typescript-eslint/no-unused-vars"       : [
            "error",
            {
                "argsIgnorePattern"               : "^_"
            }
        ]
    };

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CONF ════════════════════════════════════════╗

    export default defineConfig(

        js.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.stylistic,

        {
            ignores     : ['**/.vscode-test', '**/out', 'dist/', 'node_modules/', '.git/'],
            plugins     : { '@stylistic': stylistic },
            rules       : rules,
        }
    );

// ╚══════════════════════════════════════════════════════════════════════════════════════╝
