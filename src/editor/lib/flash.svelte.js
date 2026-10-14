export const flash = $state({ kind: null, message: '', action: undefined });

export function showFlash(kind, message, action) {
    flash.kind = kind;
    flash.message = message;
    flash.action = action;
}

export function clearFlash() {
    flash.kind = null;
    flash.message = '';
    flash.action = undefined;
}
