const originalEmitWarning = process.emitWarning;
let suppressed = false;

/**
 * Don't emit the NODE_TLS_REJECT_UNAUTHORIZED warning
 */
export function suppressTlsWarning() {
    if(suppressed)
        return;

    suppressed = true;

    process.emitWarning = (warning, ...args) => {
        if (typeof warning === "string" && warning.includes('NODE_TLS_REJECT_UNAUTHORIZED')) {
            // node will only emit the warning once
            // https://github.com/nodejs/node/blob/82f89ec8c1554964f5029fab1cf0f4fad1fa55a8/lib/_tls_wrap.js#L1378-L1384
            process.emitWarning = originalEmitWarning;

            return;
        }

        return originalEmitWarning.call(process, warning, ...args)
    }
}
