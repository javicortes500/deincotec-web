// auth.js - Módulo de autenticación Firebase

import { getAuth, signInAnonymously, signInWithCustomToken, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getState, setState } from './state-manager.js';
import { log, handleError, LogLevel } from './error-handler.js';

/**
 * Inicializa el sistema de autenticación
 * @param {Object} firebaseApp - Instancia de Firebase App
 * @param {string} initialToken - Token inicial opcional
 * @returns {Promise<Object>} Auth instance y userId
 */
export async function initializeAuth(firebaseApp, initialToken = null) {
    log(LogLevel.INFO, 'Inicializando autenticación...');

    const auth = getAuth(firebaseApp);
    setState('firebase.auth', auth);

    try {
        // Esperar a que el estado de autenticación esté listo
        const user = await new Promise((resolve) => {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                unsubscribe();

                // Si hay un token inicial, intentar autenticar con él
                if (initialToken && !user) {
                    try {
                        await signInWithCustomToken(auth, initialToken);
                        log(LogLevel.INFO, 'Autenticado con custom token');
                    } catch (error) {
                        log(LogLevel.WARN, 'Fallo autenticación con custom token', { error: error.message });
                    }
                }

                // Si aún no hay usuario, hacer login anónimo
                if (!auth.currentUser) {
                    await signInAnonymously(auth);
                    log(LogLevel.INFO, 'Autenticado anónimamente');
                }

                resolve(auth.currentUser);
            });
        });

        const userId = user?.uid || crypto.randomUUID();

        // Actualizar estado
        setState('auth.ready', true);
        setState('auth.user', user);
        setState('auth.isAdmin', !user.isAnonymous);

        log(LogLevel.INFO, 'Autenticación inicializada', { userId, isAnonymous: user.isAnonymous });

        return { auth, userId };

    } catch (error) {
        handleError(error, 'Inicialización de Auth', {
            userMessage: 'Error al iniciar sesión. Por favor, recargue la página.'
        });
        throw error;
    }
}

/**
 * Autentica un cliente con su contraseña
 * @param {string} clientPassword - Contraseña del cliente (es su clientId)
 * @returns {Promise<Object>} Datos del cliente
 */
export async function authenticateClient(clientPassword) {
    log(LogLevel.INFO, 'Autenticando cliente...', { clientId: clientPassword });

    try {
        const auth = getState('firebase.auth');
        const db = getState('firebase.db');

        if (!auth || !db) {
            throw new Error('Firebase no inicializado');
        }

        // Verificar que existe un documento de usuario con ese ID
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
        const userDocRef = doc(db, 'usuarios', clientPassword);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            throw new Error('INVALID_PASSWORD');
        }

        const userData = userDoc.data();

        // Verificar que el usuario está activo
        if (userData.activo === false) {
            throw new Error('USER_INACTIVE');
        }

        // Actualizar estado
        setState('client.id', clientPassword);
        setState('client.authenticated', true);
        setState('client.data', userData);

        log(LogLevel.INFO, 'Cliente autenticado exitosamente', {
            clientId: clientPassword,
            nombre: userData.nombre
        });

        return userData;

    } catch (error) {
        if (error.message === 'INVALID_PASSWORD') {
            handleError(
                new Error('Contraseña incorrecta'),
                'Autenticación de cliente',
                { userMessage: 'Contraseña incorrecta. Por favor, verifique e intente nuevamente.' }
            );
        } else if (error.message === 'USER_INACTIVE') {
            handleError(
                new Error('Usuario inactivo'),
                'Autenticación de cliente',
                { userMessage: 'Su cuenta ha sido desactivada. Contacte con el administrador.' }
            );
        } else {
            handleError(error, 'Autenticación de cliente');
        }
        throw error;
    }
}

/**
 * Login de administrador con email y contraseña
 * @param {string} email - Email del administrador
 * @param {string} password - Contraseña
 * @returns {Promise<Object>} Información del usuario admin
 */
export async function loginAdmin(email, password) {
    log(LogLevel.INFO, 'Iniciando sesión admin...', { email });

    try {
        const auth = getState('firebase.auth');

        if (!auth) {
            throw new Error('Firebase Auth no inicializado');
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // Actualizar estado
        setState('auth.user', userCredential.user);
        setState('auth.isAdmin', true);

        log(LogLevel.INFO, 'Admin autenticado exitosamente', {
            email: userCredential.user.email
        });

        return userCredential.user;

    } catch (error) {
        // Manejar errores específicos de Firebase Auth
        let userMessage;

        switch (error.code) {
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
                userMessage = 'Correo o contraseña incorrectos.';
                break;
            case 'auth/user-not-found':
                userMessage = 'Usuario no encontrado. Cree el usuario en Firebase Console.';
                break;
            case 'auth/too-many-requests':
                userMessage = 'Demasiados intentos fallidos. Espere unos minutos.';
                break;
            default:
                userMessage = `Error de autenticación: ${error.message}`;
        }

        handleError(error, 'Login Admin', { userMessage });
        throw error;
    }
}

/**
 * Cierra la sesión del usuario actual
 * @returns {Promise<void>}
 */
export async function logout() {
    log(LogLevel.INFO, 'Cerrando sesión...');

    try {
        const auth = getState('firebase.auth');

        if (!auth) {
            log(LogLevel.WARN, 'Auth no disponible para logout');
            return;
        }

        // Cerrar sesión en Firebase
        await signOut(auth);

        // Resetear estado (se hará en main.js al recargar)
        log(LogLevel.INFO, 'Sesión cerrada exitosamente');

        // Recargar página para limpiar estado
        window.location.reload();

    } catch (error) {
        handleError(error, 'Logout', {
            userMessage: 'Error al cerrar sesión. Por favor, recargue la página.'
        });
        throw error;
    }
}

/**
 * Verifica si el usuario actual es administrador
 * @returns {boolean} true si es admin
 */
export function isAdmin() {
    const user = getState('auth.user');
    return user && !user.isAnonymous && getState('auth.isAdmin');
}

/**
 * Obtiene el UID del usuario actual
 * @returns {string|null} UID del usuario
 */
export function getCurrentUserId() {
    return getState('auth.user')?.uid || null;
}

// Exponer funciones globalmente
if (typeof window !== 'undefined') {
    window.auth = {
        initialize: initializeAuth,
        authenticateClient,
        loginAdmin,
        logout,
        isAdmin,
        getCurrentUserId
    };
}
