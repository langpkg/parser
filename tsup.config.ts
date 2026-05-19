// tsup.config.ts
//
// Made with ❤️ by Maysara.



// ╔════════════════════════════════════════ PACK ════════════════════════════════════════╗

    import { defineConfig } from 'tsup';

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔═══════════════════════════════════════ CONST ════════════════════════════════════════╗

    const rules        = {
        "clean"        : true,
        "dts"          : true,
        "entry"        : ["src/index.ts"],
        "format"       : ["esm", "cjs"],
        "minify"       : true,
        "sourcemap"    : false,
        "splitting"    : false,
        "treeshake"    : true,
        "external"     : ['bun'],
        "target"       : 'es2022',
        "outDir"       : 'dist',
    };

// ╚══════════════════════════════════════════════════════════════════════════════════════╝



// ╔════════════════════════════════════════ CONF ════════════════════════════════════════╗

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export default defineConfig(rules as any);

// ╚══════════════════════════════════════════════════════════════════════════════════════╝
