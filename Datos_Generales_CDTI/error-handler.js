// error-handler.js - Manejo centralizado de errores con retry y logging

/**
 * Niveles de log
 */
export const LogLevel = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error'
};

/**
 * Configuración del error handler
 */
const config = {
    enableConsoleLog: true,
    enableUserNotifications: true,
    defaultRetries: 3,
    retryDelay: 1000 // ms base para backoff exponencial
};

/**
 * Log estructurado con contexto
 * @param {string} level - Nivel del log
 * @param {string} message - Mensaje
 * @param {Object} context - Contexto adicional
 */
export function log(level, message, context = {}) {
    if (!config.enableConsoleLog) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        ...context
    };

    switch (level) {
        case LogLevel.ERROR:
            console.error(`[${timestamp}] ERROR:`, message, context);
            break;
        case LogLevel.WARN:
            console.warn(`[${timestamp}] WARN:`, message, context);
            break;
        case LogLevel.INFO:
            console.info(`[${timestamp}] INFO:`, message, context);
            break;
        case LogLevel.DEBUG:
            console.debug(`[${timestamp}] DEBUG:`, message, context);
            break;
    }

    return logEntry;
}

/**
 * Maneja un error y lo muestra al usuario si es necesario
 * @param {Error} error - Error capturado
 * @param {string} context - Contexto donde ocurrió el error
 * @param {Object} options - Opciones adicionales
 */
export function handleError(error, context = 'Unknown', options = {}) {
    const {
        showToUser = true,
        userMessage = null,
        severity = 'error'
    } = options;

    // Log del error
    log(LogLevel.ERROR, `Error en ${context}`, {
        error: error.message,
        stack: error.stack,
        code: error.code
    });

    // Mostrar al usuario si está habilitado
    if (config.enableUserNotifications && showToUser) {
        const displayMessage = userMessage || getErrorMessage(error, context);
        showErrorToUser(displayMessage, severity);
    }

    return error;
}

/**
 * Obtiene un mensaje de error amigable basado en el tipo de error
 * @param {Error} error - Error
 * @param {string} context - Contexto
 * @returns {string} Mensaje amigable
 */
function getErrorMessage(error, context) {
    // Errores de Firebase Auth
    if (error.code?.startsWith('auth/')) {
        switch (error.code) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
                return 'Contraseña incorrecta. Por favor, inténtelo de nuevo.';
            case 'auth/user-not-found':
                return 'Usuario no encontrado. Verifique sus credenciales.';
            case 'auth/too-many-requests':
                return 'Demasiados intentos fallidos. Por favor, espere unos minutos.';
            case 'auth/network-request-failed':
                return 'Error de conexión. Verifique su conexión a internet.';
            default:
                return `Error de autenticación: ${error.message}`;
        }
    }

    // Errores de Firestore
    if (error.code?.startsWith('permission-denied')) {
        return 'No tiene permisos para realizar esta acción.';
    }

    if (error.code?.startsWith('unavailable')) {
        return 'Servicio temporalmente no disponible. Por favor, inténtelo más tarde.';
    }

    // Error genérico
    return `Error en ${context}: ${error.message}`;
}

/**
 * Muestra un error al usuario en la interfaz
 * @param {string} message - Mensaje a mostrar
 * @param {string} severity - Severidad ('error', 'warning', 'info')
 */
function showErrorToUser(message, severity = 'error') {
    // Intentar usar el modal si existe
    if (typeof window !== 'undefined' && window.showMessageBox) {
        const title = severity === 'error' ? 'Error' :
            severity === 'warning' ? 'Advertencia' : 'Información';
        window.showMessageBox(title, message);
        return;
    }

    // Fallback a alert
    alert(message);
}

/**
 * Ejecuta una operación con retry automático en caso de fallo
 * @param {Function} operation - Función async a ejecutar
 * @param {Object} options - Opciones de retry
 * @returns {Promise} Resultado de la operación
 */
export async function withRetry(operation, options = {}) {
    const {
        maxRetries = config.defaultRetries,
        retryDelay = config.retryDelay,
        context = 'Operación',
        shouldRetry = (error) => isRetryableError(error)
    } = options;

    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            log(LogLevel.DEBUG, `${context}: Intento ${attempt + 1}/${maxRetries + 1}`);

            const result = await operation();

            if (attempt > 0) {
                log(LogLevel.INFO, `${context}: Éxito después de ${attempt} reintentos`);
            }

            return result;

        } catch (error) {
            lastError = error;

            // No reintentar si es el último intento
            if (attempt === maxRetries) {
                break;
            }

            // Verificar si el error es reintenible
            if (!shouldRetry(error)) {
                log(LogLevel.WARN, `${context}: Error no reintenible`, { error: error.message });
                break;
            }

            // Calcular delay con backoff exponencial
            const delay = retryDelay * Math.pow(2, attempt);
            log(LogLevel.WARN, `${context}: Fallo en intento ${attempt + 1}, reintentando en ${delay}ms`, {
                error: error.message
            });

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // Todos los intentos fallaron
    handleError(lastError, context);
    throw lastError;
}

/**
 * Determina si un error es reintenible
 * @param {Error} error - Error a evaluar
 * @returns {boolean} true si es reintenible
 */
function isRetryableError(error) {
    // Errores de red son reintenibles
    if (error.code === 'auth/network-request-failed') return true;
    if (error.message?.includes('network')) return true;
    if (error.message?.includes('timeout')) return true;

    // Firestore unavailable es reintenible
    if (error.code === 'unavailable') return true;

    // Errores de permisos NO son reintenibles
    if (error.code?.includes('permission-denied')) return false;

    // Errores de validación NO son reintenibles
    if (error.code?.startsWith('auth/invalid-')) return false;

    // Por defecto, reintentar errores desconocidos
    return true;
}

/**
 * Wrapper para funciones async que maneja errores automáticamente
 * @param {Function} fn - Función async
 * @param {string} context - Contexto de la operación
 * @returns {Function} Función wrapped
 */
export function withErrorHandling(fn, context) {
    return async function (...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            handleError(error, context);
            throw error;
        }
    };
}

/**
 * Configura el error handler
 * @param {Object} newConfig - Nueva configuración
 */
export function configure(newConfig) {
    Object.assign(config, newConfig);
}

// Exponer globalmente
if (typeof window !== 'undefined') {
    window.errorHandler = {
        log,
        handleError,
        withRetry,
        withErrorHandling,
        configure,
        LogLevel
    };
}
