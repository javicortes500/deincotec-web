// firestore-service.js - Servicio de Firestore con retry y debouncing

import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getState, setState, markDirty, markClean } from './state-manager.js';
import { log, handleError, withRetry, LogLevel } from './error-handler.js';

// Debounce timer para guardado
let saveDebounceTimer = null;
const SAVE_DEBOUNCE_DELAY = 10000; // 10 segundos

/**
 * Inicializa Firestore
 * @param {Object} firebaseApp - Instancia de Firebase App
 * @returns {Object} Instancia de Firestore
 */
export function initializeFirestore(firebaseApp) {
    log(LogLevel.INFO, 'Inicializando Firestore...');

    const db = getFirestore(firebaseApp);
    setState('firebase.db', db);

    log(LogLevel.INFO, 'Firestore inicializado');
    return db;
}

/**
 * Carga los datos de un cliente con listener en tiempo real
 * @param {string} clientId - ID del cliente
 * @param {Function} onDataChange - Callback cuando cambian los datos
 * @returns {Function} Función para desuscribirse
 */
export function loadClientData(clientId, onDataChange) {
    log(LogLevel.INFO, 'Cargando datos del cliente...', { clientId });

    const db = getState('firebase.db');
    if (!db) {
        throw new Error('Firestore no inicializado');
    }

    setState('ui.isLoading', true);

    const docRef = doc(db, 'clientes', clientId);

    // Listener en tiempo real
    const unsubscribe = onSnapshot(
        docRef,
        (docSnap) => {
            try {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    log(LogLevel.DEBUG, 'Datos del cliente cargados', {
                        clientId,
                        hasData: !!data
                    });

                    // Actualizar estado
                    setState('data.current', data);
                    setState('data.loaded', true);
                    setState('ui.isLoading', false);

                    // Callback
                    if (onDataChange) {
                        onDataChange(data);
                    }
                } else {
                    log(LogLevel.INFO, 'No existen datos previos, creando documento nuevo');

                    // Crear documento vacío
                    setDoc(docRef, {
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                    }).then(() => {
                        setState('data.current', {});
                        setState('data.loaded', true);
                        setState('ui.isLoading', false);
                    }).catch(error => {
                        handleError(error, 'Creación de documento cliente');
                        setState('ui.isLoading', false);
                    });
                }
            } catch (error) {
                handleError(error, 'Procesamiento de datos del cliente');
                setState('ui.isLoading', false);
            }
        },
        (error) => {
            handleError(error, 'Listener de datos del cliente', {
                userMessage: 'Error al cargar datos. Verifique su conexión.'
            });
            setState('ui.isLoading', false);
        }
    );

    // Guardar función de desuscripción
    setState('firebase.unsubscribe', unsubscribe);

    return unsubscribe;
}

/**
 * Guarda los datos del cliente en Firestore con retry
 * @param {string} clientId - ID del cliente
 * @param {Object} data - Datos a guardar
 * @param {boolean} showFeedback - Mostrar feedback al usuario
 * @returns {Promise<void>}
 */
export async function saveClientData(clientId, data, showFeedback = true) {
    log(LogLevel.INFO, 'Guardando datos del cliente...', {
        clientId,
        showFeedback
    });

    const db = getState('firebase.db');
    if (!db) {
        throw new Error('Firestore no inicializado');
    }

    // Evitar guardados simultáneos
    const isSaving = getState('ui.isSaving');
    if (isSaving) {
        log(LogLevel.WARN, 'Ya hay un guardado en progreso, ignorando');
        return;
    }

    setState('ui.isSaving', true);

    try {
        const docRef = doc(db, 'clientes', clientId);

        // Añadir timestamp
        const dataToSave = {
            ...data,
            updatedAt: serverTimestamp()
        };

        // Guardar con retry
        await withRetry(
            () => setDoc(docRef, dataToSave, { merge: true }),
            {
                context: 'Guardado de datos',
                maxRetries: 3
            }
        );

        log(LogLevel.INFO, '✅ Datos guardados exitosamente');

        // Actualizar estado
        markClean();

        // Mostrar feedback si está habilitado
        if (showFeedback && typeof window !== 'undefined' && window.showAutosaveIndicator) {
            window.showAutosaveIndicator('Datos guardados', 'success');
        }

    } catch (error) {
        handleError(error, 'Guardado de datos', {
            userMessage: 'Error al guardar datos. Los cambios no se guardaron.',
            showToUser: showFeedback
        });

        // Mostrar feedback de error
        if (showFeedback && typeof window !== 'undefined' && window.showAutosaveIndicator) {
            window.showAutosaveIndicator('Error al guardar', 'error');
        }

        throw error;
    } finally {
        setState('ui.isSaving', false);
    }
}

/**
 * Guarda datos con debounce (auto-guardado)
 * @param {string} clientId - ID del cliente
 * @param {Object} data - Datos a guardar
 */
export function saveClientDataDebounced(clientId, data) {
    // Cancelar timer anterior
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
    }

    // Marcar como dirty
    markDirty();

    // Crear nuevo timer
    saveDebounceTimer = setTimeout(() => {
        log(LogLevel.DEBUG, '💾 Auto-guardado (después de 10s de inactividad)');
        saveClientData(clientId, data, false).catch(error => {
            log(LogLevel.ERROR, 'Error en auto-guardado', { error: error.message });
        });
    }, SAVE_DEBOUNCE_DELAY);
}

/**
 * Fuerza el guardado inmediato (flush del debounce)
 * @param {string} clientId - ID del cliente
 * @param {Object} data - Datos a guardar
 * @returns {Promise<void>}
 */
export async function flushSave(clientId, data) {
    // Cancelar debounce pendiente
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
    }

    // Guardar solo si hay cambios
    const isDirty = getState('data.isDirty');
    if (isDirty) {
        await saveClientData(clientId, data, true);
    }
}

/**
 * Carga la lista de todos los usuarios (solo para admin)
 * @returns {Promise<Array>} Lista de usuarios
 */
export async function loadUsersList() {
    log(LogLevel.INFO, 'Cargando lista de usuarios...');

    const db = getState('firebase.db');
    if (!db) {
        throw new Error('Firestore no inicializado');
    }

    try {
        const usersCollection = collection(db, 'usuarios');
        const usersSnapshot = await getDocs(usersCollection);

        const users = [];
        usersSnapshot.forEach((doc) => {
            users.push({
                id: doc.id,
                ...doc.data()
            });
        });

        log(LogLevel.INFO, `Cargados ${users.length} usuarios`);
        return users;

    } catch (error) {
        handleError(error, 'Carga de lista de usuarios');
        throw error;
    }
}

/**
 * Carga todos los datos de clientes (solo para admin)
 * @returns {Promise<Array>} Lista de datos de clientes
 */
export async function loadAllClientsData() {
    log(LogLevel.INFO, 'Cargando datos de todos los clientes...');

    const db = getState('firebase.db');
    if (!db) {
        throw new Error('Firestore no inicializado');
    }

    try {
        const clientsCollection = collection(db, 'clientes');
        const clientsSnapshot = await getDocs(clientsCollection);

        const clients = [];
        clientsSnapshot.forEach((doc) => {
            clients.push({
                id: doc.id,
                ...doc.data()
            });
        });

        log(LogLevel.INFO, `Cargados datos de ${clients.length} clientes`);
        return clients;

    } catch (error) {
        handleError(error, 'Carga de datos de clientes');
        throw error;
    }
}

/**
 * Elimina un cliente (solo admin)
 * @param {string} clientId - ID del cliente a eliminar
 * @returns {Promise<void>}
 */
export async function deleteClient(clientId) {
    log(LogLevel.INFO, 'Eliminando cliente...', { clientId });

    const db = getState('firebase.db');
    if (!db) {
        throw new Error('Firestore no inicializado');
    }

    try {
        await withRetry(
            async () => {
                // Eliminar documento de cliente
                await deleteDoc(doc(db, 'clientes', clientId));

                // Eliminar usuario asociado
                await deleteDoc(doc(db, 'usuarios', clientId));
            },
            {
                context: 'Eliminación de cliente',
                maxRetries: 2
            }
    });

    log(LogLevel.INFO, 'Cliente eliminado exitosamente', { clientId });

} catch (error) {
    handleError(error, 'Eliminación de cliente', {
        userMessage: 'Error al eliminar cliente. Por favor, inténtelo nuevamente.'
    });
    throw error;
}
}

/**
 * Crea un nuevo usuario cliente
 * @param {string} userId - ID del usuario (contraseña)
 * @param {Object} userData - Datos del usuario
 * @returns {Promise<void>}
 */
export async function createUser(userId, userData) {
    log(LogLevel.INFO, 'Creando nuevo usuario...', { userId });

    const db = getState('firebase.db');
    if (!db) {
        throw new Error('Firestore no inicializado');
    }

    try {
        const userDocRef = doc(db, 'usuarios', userId);

        await setDoc(userDocRef, {
            ...userData,
            createdAt: serverTimestamp(),
            activo: true
        });

        log(LogLevel.INFO, 'Usuario creado exitosamente', { userId });

    } catch (error) {
        handleError(error, 'Creación de usuario');
        throw error;
    }
}

// Exponer funciones globalmente
if (typeof window !== 'undefined') {
    window.firestoreService = {
        initialize: initializeFirestore,
        loadClientData,
        saveClientData,
        saveClientDataDebounced,
        flushSave,
        loadUsersList,
        loadAllClientsData,
        deleteClient,
        createUser
    };
}
