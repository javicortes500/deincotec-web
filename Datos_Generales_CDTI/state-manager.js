// state-manager.js - Gestor centralizado de estado de la aplicación

/**
 * Estado centralizado de la aplicación
 */
const appState = {
    // Cliente
    client: {
        id: null,
        authenticated: false,
        data: null
    },

    // Autenticación
    auth: {
        ready: false,
        user: null,
        isAdmin: false
    },

    // Datos del formulario
    data: {
        loaded: false,
        current: {},
        isDirty: false,
        lastSaved: null
    },

    // Estado de la UI
    ui: {
        currentPage: 1,
        currentView: 'client', // 'client' | 'admin'
        isSaving: false,
        isLoading: false
    },

    // Validación
    validation: {
        pageErrors: new Map(), // Map<pageNumber, errors[]>
        fieldErrors: new Map()  // Map<fieldId, error>
    },

    // Firebase
    firebase: {
        app: null,
        db: null,
        auth: null,
        unsubscribe: null
    }
};

/**
 * Listeners suscritos a cambios de estado
 */
const stateListeners = new Map();
let listenerIdCounter = 0;

/**
 * Actualiza el estado de la aplicación
 * @param {string} path - Ruta del estado (ej: 'client.id', 'ui.currentPage')
 * @param {any} value - Nuevo valor
 */
export function setState(path, value) {
    const keys = path.split('.');
    let current = appState;

    // Navegar hasta el penúltimo nivel
    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }

    // Establecer el valor
    const lastKey = keys[keys.length - 1];
    const oldValue = current[lastKey];
    current[lastKey] = value;

    // Notificar a los listeners
    notifyListeners(path, value, oldValue);

    console.debug(`[State] ${path} = `, value);
}

/**
 * Obtiene un valor del estado
 * @param {string} path - Ruta del estado (ej: 'client.id')
 * @returns {any} Valor del estado
 */
export function getState(path) {
    const keys = path.split('.');
    let current = appState;

    for (const key of keys) {
        if (current === undefined || current === null) return undefined;
        current = current[key];
    }

    return current;
}

/**
 * Obtiene todo el estado (para debugging)
 * @returns {Object} Estado completo
 */
export function getAllState() {
    return { ...appState };
}

/**
 * Suscribe un listener a cambios en un path específico
 * @param {string} path - Ruta a observar
 * @param {Function} callback - Función a llamar cuando cambia el valor
 * @returns {number} ID del listener (para desuscribirse)
 */
export function subscribe(path, callback) {
    const listenerId = listenerIdCounter++;

    if (!stateListeners.has(path)) {
        stateListeners.set(path, new Map());
    }

    stateListeners.get(path).set(listenerId, callback);

    return listenerId;
}

/**
 * Desuscribe un listener
 * @param {string} path - Ruta observada
 * @param {number} listenerId - ID del listener
 */
export function unsubscribe(path, listenerId) {
    if (stateListeners.has(path)) {
        stateListeners.get(path).delete(listenerId);
    }
}

/**
 * Notifica a los listeners sobre cambios de estado
 * @param {string} path - Ruta que cambió
 * @param {any} newValue - Nuevo valor
 * @param {any} oldValue - Valor anterior
 */
function notifyListeners(path, newValue, oldValue) {
    // Notificar listeners exactos para este path
    if (stateListeners.has(path)) {
        for (const callback of stateListeners.get(path).values()) {
            try {
                callback(newValue, oldValue, path);
            } catch (error) {
                console.error(`[State] Error en listener para ${path}:`, error);
            }
        }
    }

    // Notificar listeners de paths padre (ej: si cambió 'client.id', notificar a 'client')
    const pathParts = path.split('.');
    for (let i = pathParts.length - 1; i > 0; i--) {
        const parentPath = pathParts.slice(0, i).join('.');
        if (stateListeners.has(parentPath)) {
            for (const callback of stateListeners.get(parentPath).values()) {
                try {
                    callback(getState(parentPath), null, parentPath);
                } catch (error) {
                    console.error(`[State] Error en listener padre para ${parentPath}:`, error);
                }
            }
        }
    }
}

/**
 * Resetea el estado a valores iniciales
 */
export function resetState() {
    appState.client = { id: null, authenticated: false, data: null };
    appState.data = { loaded: false, current: {}, isDirty: false, lastSaved: null };
    appState.ui = { currentPage: 1, currentView: 'client', isSaving: false, isLoading: false };
    appState.validation.pageErrors.clear();
    appState.validation.fieldErrors.clear();

    console.log('[State] Estado reseteado');
}

/**
 * Marca el estado como "dirty" (con cambios sin guardar)
 */
export function markDirty() {
    setState('data.isDirty', true);
}

/**
 * Marca el estado como "clean" (cambios guardados)
 */
export function markClean() {
    setState('data.isDirty', false);
    setState('data.lastSaved', new Date());
}

// Exponer funciones globalmente para uso desde otros módulos
if (typeof window !== 'undefined') {
    window.appState = {
        get: getState,
        set: setState,
        getAll: getAllState,
        subscribe,
        unsubscribe,
        reset: resetState,
        markDirty,
        markClean
    };
}
