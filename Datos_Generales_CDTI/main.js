// main.js (modificado para: marcar errores en el stepper lateral + recursos humanos dinámico)

// Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, signOut, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, where, getDocs, serverTimestamp, setLogLevel, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importaciones de Lógica de Validación
import {
    validateField,
    validatePage1,
    validatePage2,
    validatePage3,
    validatePage4,
    validatePage7,
    validatePage8,
    validateNumericField,
    validatePercentageField,
    validatePhoneField,
    validateCurrencyField,
    validateIBAN,
    handleCPInput,
    handleCPInputNotif
} from './validation.js';



// Variables Globales del Entorno
const appId = 'datos-generales-cdti';

// Variables de sesión del cliente
let currentClientId = null;
let isAuthenticated = false;
let datosYaCargados = false; // Bandera para prevenir guardado antes de cargar datos

const firebaseConfig = {
    apiKey: "AIzaSyDlwdxMgXISODURrmEiG9q-86BZSaIkvnk",
    authDomain: "datos-generales-cdti.firebaseapp.com",
    projectId: "datos-generales-cdti",
    storageBucket: "datos-generales-cdti.firebasestorage.app",
    messagingSenderId: "931823934681",
    appId: "1:931823934681:web:bb1836591790f385a032c8",
    measurementId: "G-PJNVSJ3JFH"
};
const initialAuthToken = null;
// CONSTANTE ELIMINADA: ADMIN_KEY ya no se usa. Se usa Firebase Auth.
const TOTAL_PAGES = 10; // Total de 10 páginas
let currentPage = 1;

let app;
let db;
let auth;
let userId = 'loading';
let isAuthReady = false;
let unsubscribe = null;
let currentData = [];
let isSaving = false; // Prevenir guardados múltiples
let pageErrorTimeout = null; // Timer para mensajes de error

setLogLevel('debug');

// --- Botones de Navegación (definidos globalmente en el script) ---
let prevBtn, nextBtn, saveBtn, pageIndicator;

/** Mostrar u ocultar clase de error en el stepper (izquierda) */
function setStepError(stepNumber, hasError) {
    try {
        const stepEl = document.getElementById(`step-${stepNumber}`);
        if (!stepEl) return;
        if (hasError) {
            stepEl.classList.add('error');
            stepEl.classList.remove('completed');
        } else {
            stepEl.classList.remove('error');
        }
    } catch (e) {
        console.warn('setStepError:', e);
    }
}

/** Marca una página como completada (sin errores) en el stepper */
function setStepCompleted(stepNumber, isCompleted) {
    try {
        const stepEl = document.getElementById(`step-${stepNumber}`);
        if (!stepEl) return;
        if (isCompleted) {
            stepEl.classList.add('completed');
            stepEl.classList.remove('error');
        } else {
            stepEl.classList.remove('completed');
        }
    } catch (e) {
        console.warn('setStepCompleted:', e);
    }
}

/** Muestra un modal personalizado. */
function showMessageBox(title, content, needsInput = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('message-modal');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        const inputEl = document.getElementById('modal-input');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        titleEl.textContent = title;
        contentEl.textContent = content;
        modal.classList.remove('hidden');
        modal.classList.add('flex'); // Mostrar el modal con display: flex

        inputEl.value = '';
        if (needsInput) {
            inputEl.classList.remove('hidden');
            inputEl.focus();
            cancelBtn.classList.remove('hidden');
            confirmBtn.textContent = 'Ingresar';
        } else {
            inputEl.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            confirmBtn.textContent = 'Aceptar';
        }

        confirmBtn.onclick = null;
        cancelBtn.onclick = null;

        confirmBtn.onclick = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resolve(needsInput ? inputEl.value : true);
        };

        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resolve(false);
        };
    });
}

/**
 * Función Debounce con closure (cada debounce tiene su propio timer).
 * Incluye método flush() para ejecutar inmediatamente.
 */
function debounce(func, delay) {
    let timer = null;
    let lastArgs = null;
    let lastContext = null;

    const debouncedFunc = function (...args) {
        lastArgs = args;
        lastContext = this;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            func.apply(lastContext, lastArgs);
            timer = null;
            lastArgs = null;
            lastContext = null;
        }, delay);
    };

    // Método para ejecutar inmediatamente (flush)
    debouncedFunc.flush = function () {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (lastArgs && lastContext) {
            func.apply(lastContext, lastArgs);
            lastArgs = null;
            lastContext = null;
        }
    };

    return debouncedFunc;
}
// Crear la función debounced para el auto-guardado (10 segundos de inactividad)
// Se guarda 10 segundos después de dejar de escribir
const debouncedSave = debounce(() => {
    console.log('💾 Guardado automático (10 seg después de dejar de escribir)');
    saveFormData(false);
}, 10000);

// NO usar intervalo automático - solo guardar cuando el usuario escribe o cambia de página
let autoSaveInterval = null;

function startAutoSaveInterval() {
    // No iniciar intervalo automático
    // El guardado solo ocurre:
    // 1. 5 segundos después de escribir (debounce)
    // 2. Al cambiar de página
    // 3. Al cerrar sesión
    console.log('✅ Auto-guardado activado (solo al escribir, cambiar página o cerrar sesión)');
}

function stopAutoSaveInterval() {
    // No hay intervalo que detener
    console.log('⏸️ Auto-guardado desactivado');
}

// Debounced validation para página 1
let validatePage1Timer;
function debouncedValidatePage1() {
    clearTimeout(validatePage1Timer);
    validatePage1Timer = setTimeout(() => {
        if (currentPage === 1) {
            const validation = validatePage1();
            setStepError(1, !validation.isValid);
            setStepCompleted(1, validation.isValid);
            // Los errores ahora se muestran como tooltips en los campos
        }
    }, 500);
}

// Debounced validation para página 2
let validatePage2Timer;
function debouncedValidatePage2() {
    clearTimeout(validatePage2Timer);
    validatePage2Timer = setTimeout(() => {
        if (currentPage === 2) {
            const validation = validatePage2();
            setStepError(2, !validation.isValid);
            setStepCompleted(2, validation.isValid);
            // Los errores ahora se muestran como tooltips en los campos
        }
    }, 500);
}

// Debounced validation para página 3
let validatePage3Timer;
function debouncedValidatePage3() {
    clearTimeout(validatePage3Timer);
    validatePage3Timer = setTimeout(() => {
        if (currentPage === 3) {
            // Solo validar participación si NO se está validando ya
            if (!window.validatingParticipacion) {
                validarParticipacionAccionarial();
            }

            // Validar el resto de la página SIN interferir con la validación de participación
            const validation = validatePage3();

            // Verificar si hay errores de participación
            const container = document.getElementById('accionarial-container');
            const hayErrorParticipacion = container?.querySelector('.input-invalid[id*="_pct"]');

            const hasErrors = !validation.isValid || !!hayErrorParticipacion;
            // Solo marcar el stepper si hay errores reales
            setStepError(3, hasErrors);
            setStepCompleted(3, !hasErrors);
        }
    }, 500);
}

// Debounced validation para página 4
let validatePage4Timer;
function debouncedValidatePage4() {
    clearTimeout(validatePage4Timer);
    validatePage4Timer = setTimeout(() => {
        if (currentPage === 4) {
            const validation = validatePage4();
            setStepError(4, !validation.isValid);
            setStepCompleted(4, validation.isValid);
            // Los errores ahora se muestran como tooltips en los campos
        }
    }, 500);
}

// Debounced validation para página 7
let validatePage7Timer;
function debouncedValidatePage7() {
    clearTimeout(validatePage7Timer);
    validatePage7Timer = setTimeout(() => {
        if (currentPage === 7) {
            const validation = validatePage7();
            setStepError(7, !validation.isValid);
            setStepCompleted(7, validation.isValid);
            // Los errores ahora se muestran como tooltips en los campos
        }
    }, 500);
}

// Debounced validation para página 5
let validatePage5Timer;
function debouncedValidatePage5() {
    clearTimeout(validatePage5Timer);
    validatePage5Timer = setTimeout(() => {
        if (currentPage === 5) {
            validatePage5RecursosID();
        }
    }, 500);
}

// Debounced validation para página 6
let validatePage6Timer;
function debouncedValidatePage6() {
    clearTimeout(validatePage6Timer);
    validatePage6Timer = setTimeout(() => {
        if (currentPage === 6) {
            // Marcar campos vacíos en rojo
            markEmptyRequiredFieldsPage6();

            // Solo validar si hay al menos un campo con contenido
            const container = document.getElementById('productos-container');
            if (container) {
                const ventasInputs = container.querySelectorAll('input[id^="prod"][id$="_ventas"]');
                const hayDatos = Array.from(ventasInputs).some(input => input.value && input.value.trim() !== '');
                if (hayDatos) {
                    validarTotalVentas();
                }
            }
        }
    }, 500);
}

// Marcar en rojo los campos requeridos vacíos de la página 6
function markEmptyRequiredFieldsPage6() {
    const container = document.getElementById('productos-container');
    if (!container) return;

    // Obtener todos los grupos de productos
    const productosGrupos = container.querySelectorAll('.producto-grupo');

    productosGrupos.forEach(grupo => {
        // Campos requeridos: nombre, ventas, nacional
        const nombreInput = grupo.querySelector('input[id$="_nombre"]');
        const ventasInput = grupo.querySelector('input[id$="_ventas"]');
        const nacionalInput = grupo.querySelector('input[id$="_nac"]');

        // Verificar si algún campo del grupo tiene contenido
        const grupoTieneDatos =
            (nombreInput && nombreInput.value.trim() !== '') ||
            (ventasInput && ventasInput.value.trim() !== '') ||
            (nacionalInput && nacionalInput.value.trim() !== '');

        // Solo marcar en rojo si el grupo tiene algún dato (el usuario empezó a completarlo)
        if (grupoTieneDatos) {
            // Marcar nombre si está vacío
            if (nombreInput && nombreInput.value.trim() === '') {
                nombreInput.classList.add('input-invalid');
                nombreInput.classList.remove('input-valid');
            }

            // Marcar ventas si está vacío o inválido
            if (ventasInput) {
                if (ventasInput.value.trim() === '') {
                    ventasInput.classList.add('input-invalid');
                    ventasInput.classList.remove('input-valid');
                }
            }

            // Marcar nacional si está vacío o inválido
            if (nacionalInput) {
                if (nacionalInput.value.trim() === '') {
                    nacionalInput.classList.add('input-invalid');
                    nacionalInput.classList.remove('input-valid');
                }
            }
        }
    });
}

let validatePage8Timer = null;
function debouncedValidatePage8() {
    clearTimeout(validatePage8Timer);
    validatePage8Timer = setTimeout(() => {
        if (currentPage === 8) {
            const validation = validatePage8();
            setStepError(8, !validation.isValid);
            setStepCompleted(8, validation.isValid);
            // Los errores ahora se muestran como tooltips en los campos
        }
    }, 500);
}

let validatePage9Timer = null;
function debouncedValidatePage9() {
    clearTimeout(validatePage9Timer);
    validatePage9Timer = setTimeout(() => {
        validatePage9();
    }, 500);
}

/** Valida todas las páginas y actualiza los indicadores del menú */
function validateAllPagesAfterLoad() {
    console.log('🔍 Validando todas las páginas después de cargar datos...');

    // Página 1 - verificar si tiene datos
    const page1HasData = document.getElementById('instNIF')?.value?.trim() ||
        document.getElementById('instNombre')?.value?.trim() ||
        document.getElementById('instApellidos')?.value?.trim();
    if (page1HasData) {
        const validation1 = validatePage1();
        setStepError(1, !validation1.isValid);
        setStepCompleted(1, validation1.isValid);
    } else {
        setStepError(1, false);
        setStepCompleted(1, false);
    }

    // Página 2 - verificar si tiene datos
    const page2HasData = document.getElementById('dirTipoVia')?.value?.trim() ||
        document.getElementById('dirDireccion')?.value?.trim() ||
        document.getElementById('dirCP')?.value?.trim();
    if (page2HasData) {
        const validation2 = validatePage2();
        setStepError(2, !validation2.isValid);
        setStepCompleted(2, validation2.isValid);
    } else {
        setStepError(2, false);
        setStepCompleted(2, false);
    }

    // Página 3 - verificar si tiene datos
    const page3HasData = document.getElementById('orgCapitalSocial')?.value?.trim() ||
        document.querySelectorAll('#accionarial-container input[id*="_nombre"]')[0]?.value?.trim();
    if (page3HasData) {
        const validation3 = validatePage3();
        const container = document.getElementById('accionarial-container');
        const hayErrorParticipacion = container?.querySelector('.input-invalid[id*="_pct"]');
        const hasErrors3 = !validation3.isValid || !!hayErrorParticipacion;
        setStepError(3, hasErrors3);
        setStepCompleted(3, !hasErrors3);
    } else {
        setStepError(3, false);
        setStepCompleted(3, false);
    }

    // Página 4 - verificar si tiene datos
    const page4Container = document.getElementById('recursos-container');
    const page4HasData = page4Container && Array.from(page4Container.querySelectorAll('input')).some(input => input.value?.trim());
    if (page4HasData) {
        const validation4 = validatePage4();
        setStepError(4, !validation4.isValid);
        setStepCompleted(4, validation4.isValid);
    } else {
        setStepError(4, false);
        setStepCompleted(4, false);
    }

    // Página 5 - Recursos I+D - verificar si tiene datos
    const page5Container = document.getElementById('recursos-id-container');
    if (page5Container) {
        const editableInputs = Array.from(page5Container.querySelectorAll('input:not([readonly])'));
        const hayDatos = editableInputs.some(input => input.value && input.value.trim() !== '' && input.value !== '0,00');
        if (hayDatos) {
            validatePage5RecursosID();
        } else {
            setStepError(5, false);
            setStepCompleted(5, false);
        }
    } else {
        setStepError(5, false);
        setStepCompleted(5, false);
    }

    // Página 6 - validación de ventas
    const containerProd = document.getElementById('productos-container');
    if (containerProd) {
        const ventasInputs = containerProd.querySelectorAll('input[id^="prod"][id$="_ventas"]');
        const hayDatos = Array.from(ventasInputs).some(input => input.value && input.value.trim() !== '');
        if (hayDatos) {
            // Primero validar la suma (actualiza error si suma != 100)
            validarTotalVentas();
            // Luego verificar si todos los campos están verdes
            setTimeout(() => {
                const todosVerdes = verificarTodosCamposVerdesProductos();
                const sumaCorrecta = !document.getElementById('page-6-error') ||
                    document.getElementById('page-6-error').classList.contains('hidden');
                if (todosVerdes && sumaCorrecta) {
                    setStepCompleted(6, true);
                    setStepError(6, false);
                }
            }, 100);
        } else {
            setStepError(6, false);
            setStepCompleted(6, false);
            clearPageError(6);
        }
    } else {
        setStepError(6, false);
        setStepCompleted(6, false);
    }

    // Página 7 - verificar si tiene datos
    const page7HasData = document.getElementById('entidadTipo')?.value?.trim() ||
        document.getElementById('ent_efectivos')?.value?.trim() ||
        document.getElementById('ent_volumen_negocio')?.value?.trim();
    if (page7HasData) {
        const validation7 = validatePage7();
        setStepError(7, !validation7.isValid);
        setStepCompleted(7, validation7.isValid);
    } else {
        setStepError(7, false);
        setStepCompleted(7, false);
    }

    // Página 8 - verificar si tiene datos
    const page8HasData = document.getElementById('bankIBAN')?.value?.trim() ||
        document.getElementById('bankEntidad')?.value?.trim();
    if (page8HasData) {
        const validation8 = validatePage8();
        setStepError(8, !validation8.isValid);
        setStepCompleted(8, validation8.isValid);
    } else {
        setStepError(8, false);
        setStepCompleted(8, false);
    }

    // Página 9 - Declaraciones (validar según campos completados)
    const page9HasData = document.getElementById('decl_ayuda_solicitada')?.value ||
        document.getElementById('decl_cumple_requisitos')?.checked;
    if (page9HasData) {
        validatePage9();
    } else {
        setStepError(9, false);
        setStepCompleted(9, false);
    }

    // Página 10 - verificar si tiene datos (condiciones)
    validatePage10();

    console.log('✅ Validación de todas las páginas completada');
}

/** Inicializa Firebase y autentica al usuario. */
async function initializeFirebase() {
    console.log('🔥 Iniciando Firebase...');
    try {
        // --- INICIO DE MODIFICACIÓN CLAVE ---
        const statusEl = document.getElementById('data-loading-status');

        if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.projectId) {
            console.error("❌ Firebase config is missing or invalid.");
            if (statusEl) {
                statusEl.textContent = "ERROR: Configuración de Firebase faltante. Por favor, revise main.js.";
            }
            // Retornar sin inicializar si la configuración es inválida
            return;
        }
        // --- FIN DE MODIFICACIÓN CLAVE ---

        console.log('🔥 Configuración de Firebase válida');
        console.log('🔥 Inicializando app con projectId:', firebaseConfig.projectId);

        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        console.log('✅ App inicializada');
        console.log('✅ Firestore obtenido');
        console.log('✅ Auth obtenido');

        const appIdEl = document.getElementById('app-id-display');
        if (appIdEl) {
            appIdEl.textContent = appId;
        }

        await new Promise(resolve => {
            const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
                unsubscribeAuth();
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken).catch(e => console.warn("Custom token sign in failed, falling back.", e));
                }
                if (!auth.currentUser) {
                    await signInAnonymously(auth);
                }
                userId = auth.currentUser?.uid || crypto.randomUUID();
                isAuthReady = true;
                resolve();
            });
        });
    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        const statusEl = document.getElementById('data-loading-status');
        if (statusEl) {
            statusEl.textContent = `Error de conexión: ${error.message}`;
        }
        showMessageBox("Error de Inicialización",
            "No se pudo conectar con la base de datos. Verifique su conexión a internet e inténtelo nuevamente.");
    }
}

/** Define la vista actual (client o admin). */
function setView(view) {
    console.log('📺 setView() llamado con:', view);
    
    const clientView = document.getElementById('client-view');
    const adminView = document.getElementById('admin-view');
    const mainTitle = document.getElementById('main-title');

    console.log('📺 Elementos encontrados:', {
        clientView: !!clientView,
        adminView: !!adminView,
        mainTitle: !!mainTitle
    });

    // Comprobar si los botones de toggle existen antes de usarlos
    const showFormBtn = document.getElementById('show-form-btn');
    const showAdminBtn = document.getElementById('show-admin-btn');

    if (view === 'client') {
        if (clientView) clientView.classList.remove('hidden');
        if (adminView) adminView.classList.add('hidden');
        if (mainTitle) mainTitle.textContent = "Recopilación de Datos del Cliente";

        if (showFormBtn && showAdminBtn) {
            showFormBtn.style.backgroundColor = 'var(--accent)';
            showFormBtn.style.color = 'white';
            showAdminBtn.style.backgroundColor = '#d1d5db';
            showAdminBtn.style.color = 'var(--brand)';
        }

        // NO LLAMAR a unsubscribe() NI a loadUserFormData() aquí.
        // El listener del cliente se gestiona en authenticateClient() y logout().

    } else if (view === 'admin') {
        console.log('📺 Intentando mostrar vista admin...');
        console.log('📺 isAuthReady:', isAuthReady, 'db:', !!db, 'appId:', appId);
        
        if (!isAuthReady || !db) {
            console.error('❌ Base de datos no lista');
            showMessageBox("Error", "La base de datos no está lista. Intente recargar la página.");
            return;
        }

        // Verificar que appId esté configurado correctamente - SIMPLIFICADO
        console.log('📺 appId check passed');

        console.log('📺 Ocultando clientView, mostrando adminView...');
        if (clientView) clientView.classList.add('hidden');
        if (adminView) adminView.classList.remove('hidden');
        if (mainTitle) mainTitle.textContent = "Panel de Administración de Datos";
        console.log('📺 Vista admin mostrada correctamente');

        if (showFormBtn && showAdminBtn) {
            showFormBtn.style.backgroundColor = '#d1d5db';
            showFormBtn.style.color = 'var(--brand)';
            showAdminBtn.style.backgroundColor = 'var(--accent)';
            showAdminBtn.style.color = 'white';
        }

        // DETENER el listener del cliente ANTES de iniciar el listener del admin
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }

        // Mostrar botón de logout específico para admin si es necesario, 
        // o reutilizar el genérico si la lógica de logout maneja ambos casos.
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.style.display = 'inline-block';
            logoutBtn.textContent = 'Cerrar Sesión Admin';
            // Asegurar que el onclick llame a logout() que ahora maneja signOut real
        }

        // Pequeña pausa para asegurar que la UI se ha actualizado
        setTimeout(() => {
            loadAdminFormData();
            loadUsersList(); // Cargar lista de usuarios
        }, 100);
    }
}

/**
 * Muestra el modal de login de administrador.
 * Reemplaza al antiguo prompt() inseguro.
 */
window.promptAdminKey = async function () {
    console.log('🔑 promptAdminKey() llamado');
    
    // Inicializar Firebase si no está listo
    if (!auth || !db || !isAuthReady) {
        console.log('⚠️ Firebase no está inicializado, inicializando...');
        try {
            await initializeFirebase();
            console.log('✅ Firebase inicializado correctamente');
        } catch (error) {
            console.error('❌ Error al inicializar Firebase:', error);
            alert('Error: No se pudo inicializar el sistema. Por favor, recargue la página.');
            return;
        }
    }
    
    // Si ya hay un usuario autenticado y NO es anónimo (asumimos admin por email/pass),
    // intentar entrar directamente.
    // NOTA: Para mayor seguridad, deberíamos verificar claims, pero por ahora
    // verificamos que no sea anónimo.
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
        console.log('✅ Usuario ya autenticado como admin');
        showMainApp(); // Asegurar que la app principal esté visible
        setView('admin');
        return;
    }

    // Si es usuario anónimo (cliente), primero cerramos esa sesión o pedimos re-autenticación.
    // Para simplificar, mostramos el modal de login.

    // Crear/Mostrar un modal específico para login de admin
    // Usaremos un sweet alert personalizado o construiremos uno rápido con showMessageBox
    // Pero showMessageBox es limitado. Vamos a inyectar un modal de login admin dinámicamente o usar uno existente.

    // Vamos a usar el showMessageBox modificado para aceptar 2 campos o crear uno nuevo.
    // Por simplicidad en este refactor, inyectaremos un modal de login admin al DOM si no existe.

    let adminModal = document.getElementById('admin-login-modal');
    if (!adminModal) {
        adminModal = document.createElement('div');
        adminModal.id = 'admin-login-modal';
        adminModal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; display: none; align-items: center; justify-content: center; background-color: rgba(0, 0, 0, 0.5);';
        adminModal.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); width: 90%; max-width: 420px; position: relative;">
                <button onclick="document.getElementById('admin-login-modal').style.display='none'" style="position: absolute; top: 0.5rem; right: 0.5rem; background: none; border: none; font-size: 1.5rem; color: #6b7280; cursor: pointer; line-height: 1; padding: 0.5rem; width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center;" onmouseover="this.style.color='#374151'" onmouseout="this.style.color='#6b7280'">&times;</button>
                
                <h3 style="font-size: 1.5rem; font-weight: 700; margin: 0 0 1.5rem 0; color: #1f2937;">Acceso Administrador</h3>
                
                <!-- Botón de Google -->
                <button type="button" onclick="handleGoogleLogin()" style="width: 100%; margin-bottom: 1.5rem; padding: 0.875rem 1rem; background: white; border: 2px solid #d1d5db; border-radius: 8px; font-weight: 500; color: #374151; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.75rem; transition: all 0.2s;" onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='white'">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19.8 10.2273C19.8 9.52728 19.7364 8.85455 19.6182 8.20914H10.2V12.0491H15.6109C15.3727 13.3 14.6582 14.3591 13.5855 15.0682V17.5773H16.8218C18.7091 15.8364 19.8 13.2727 19.8 10.2273Z" fill="#4285F4"/>
                        <path d="M10.2 20C12.9 20 15.1709 19.1045 16.8218 17.5773L13.5855 15.0682C12.6873 15.6682 11.5427 16.0227 10.2 16.0227C7.59545 16.0227 5.38182 14.2636 4.58727 11.9H1.25455V14.4909C2.89636 17.7591 6.30909 20 10.2 20Z" fill="#34A853"/>
                        <path d="M4.58727 11.9C4.38727 11.3 4.27273 10.6591 4.27273 10C4.27273 9.34091 4.38727 8.7 4.58727 8.1V5.50909H1.25455C0.572727 6.85909 0.2 8.38636 0.2 10C0.2 11.6136 0.572727 13.1409 1.25455 14.4909L4.58727 11.9Z" fill="#FBBC05"/>
                        <path d="M10.2 3.97727C11.6691 3.97727 13.0036 4.48182 14.0527 5.47273L16.9364 2.58909C15.1664 0.954545 12.8955 0 10.2 0C6.30909 0 2.89636 2.24091 1.25455 5.50909L4.58727 8.1C5.38182 5.73636 7.59545 3.97727 10.2 3.97727Z" fill="#EA4335"/>
                    </svg>
                    Continuar con Google
                </button>

                <div style="position: relative; margin-bottom: 1.5rem;">
                    <div style="position: absolute; top: 50%; left: 0; right: 0; border-top: 1px solid #d1d5db;"></div>
                    <div style="position: relative; display: flex; justify-content: center;">
                        <span style="padding: 0 0.5rem; background: white; color: #6b7280; font-size: 0.875rem;">o usa email y contraseña</span>
                    </div>
                </div>

                <form id="admin-login-form" onsubmit="handleAdminLogin(event)">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem;">Email</label>
                        <input type="email" id="admin-email" style="width: 100%; padding: 0.625rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem;" placeholder="admin@deincotec.com">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem;">Contraseña</label>
                        <input type="password" id="admin-password" style="width: 100%; padding: 0.625rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.875rem;" placeholder="••••••••">
                    </div>
                    <div id="admin-login-error" style="margin-bottom: 1rem; color: #dc2626; font-size: 0.875rem; display: none;"></div>
                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                        <button type="button" onclick="document.getElementById('admin-login-modal').style.display='none'" style="padding: 0.625rem 1rem; color: #4b5563; background: transparent; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;" onmouseover="this.style.backgroundColor='#f3f4f6'" onmouseout="this.style.backgroundColor='transparent'">Cancelar</button>
                        <button type="submit" style="padding: 0.625rem 1rem; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;" onmouseover="this.style.backgroundColor='#1d4ed8'" onmouseout="this.style.backgroundColor='#2563eb'">Entrar</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(adminModal);
        console.log('✅ Modal de admin creado y añadido al DOM');
    }

    // Limpiar campos
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const errorEl = document.getElementById('admin-login-error');
    
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    if (errorEl) errorEl.style.display = 'none';

    // Mostrar modal
    adminModal.style.display = 'flex';
    console.log('✅ Modal de admin mostrado');
};

/**
 * Maneja el login con Google
 */
window.handleGoogleLogin = async function () {
    console.log('🔵 handleGoogleLogin() llamado');
    const errorEl = document.getElementById('admin-login-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
        console.log('🔵 Iniciando autenticación con Google...');
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
            prompt: 'select_account'
        });
        
        await signInWithPopup(auth, provider);
        console.log('✅ Autenticación con Google exitosa');
        
        // Login exitoso
        document.getElementById('admin-login-modal').style.display = 'none';
        showMainApp(); // Asegurar que la app principal sea visible
        setView('admin');
        console.log('✅ Admin logueado exitosamente con Google');
    } catch (error) {
        console.error('Error login con Google:', error);
        let msg = 'Error al autenticar con Google.';
        
        if (error.code === 'auth/popup-closed-by-user') {
            msg = 'Ventana de autenticación cerrada. Intente de nuevo.';
        } else if (error.code === 'auth/popup-blocked') {
            msg = 'Popup bloqueado por el navegador. Por favor, permita popups para este sitio.';
        } else if (error.code === 'auth/cancelled-popup-request') {
            // Usuario canceló, no mostrar error
            return;
        } else {
            msg = `Error: ${error.code} - ${error.message}`;
        }
        
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }
};

/**
 * Maneja el submit del login de admin con email y contraseña
 */
window.handleAdminLogin = async function (e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('admin-login-error');

    // Validar que ambos campos estén completos
    if (!email || !password) {
        errorEl.textContent = 'Por favor, complete todos los campos.';
        errorEl.style.display = 'block';
        return;
    }

    errorEl.style.display = 'none';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Login exitoso
        document.getElementById('admin-login-modal').style.display = 'none';
        showMainApp(); // Asegurar que la app principal sea visible
        setView('admin');
        console.log('✅ Admin logueado exitosamente');
    } catch (error) {
        console.error('Error login admin:', error);
        let msg = 'Error desconocido.';
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            msg = 'Correo o contraseña incorrectos.';
        } else if (error.code === 'auth/user-not-found') {
            msg = 'Usuario no encontrado. Cree el usuario en Firebase Console.';
        } else if (error.code === 'auth/too-many-requests') {
            msg = 'Demasiados intentos falidos. Espere unos minutos.';
        } else {
            msg = `Error: ${error.code} - ${error.message}`;
        }
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }
};

/**
 * Función Logout genera (sirve tanto para cliente como admin).
 * Cierra la sesión de Firebase Auth y recarga la página.
 */
window.logout = async function () {
    try {
        await signOut(auth);
        console.log('👋 Sesión cerrada');
        window.location.reload();
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        alert('Error al cerrar sesión');
    }
};

/** Muestra la página del formulario especificada. */
function showPage(pageNumber, shouldScroll = true) {
    currentPage = pageNumber;

    // NO limpiar errores del stepper al cambiar de página
    // Solo limpiar el mensaje de error de la página (no el stepper)
    const errorMsgEl = document.getElementById(`page${pageNumber}-error-message`);
    if (errorMsgEl) {
        errorMsgEl.classList.add('hidden');
        errorMsgEl.classList.remove('visible');
        errorMsgEl.innerHTML = '';
    }

    // Si es la página 6 y no hay productos renderizados, renderizar uno por defecto
    if (pageNumber === 6) {
        const container = document.getElementById('productos-container');
        if (container && container.children.length === 0) {
            renderProductosIniciales();
        }
    }

    // 1. Ocultar todas las páginas de contenido (Columna Derecha)
    document.querySelectorAll('[data-page]').forEach(page => {
        page.classList.add('hidden');
    });
    // Mostrar la página actual
    const activePage = document.querySelector(`[data-page="${pageNumber}"]`);
    if (activePage) {
        activePage.classList.remove('hidden');
    }

    // 2. Actualizar el Stepper (Columna Izquierda)
    document.querySelectorAll('#stepper-nav .step').forEach(step => {
        step.classList.remove('active');
    });
    const activeStep = document.getElementById(`step-${pageNumber}`);
    if (activeStep) {
        activeStep.classList.add('active');
    }

    // 3. Actualizar la barra de progreso
    const progressFill = document.getElementById('progress-bar-fill');
    const progressLabel = document.getElementById('progress-label');
    const progressPercentage = document.getElementById('progress-percentage');

    // Calcula el porcentaje (0% en página 1, 100% en página 9)
    const percentage = ((pageNumber - 1) / (TOTAL_PAGES - 1)) * 100;

    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }
    if (progressLabel) {
        progressLabel.textContent = `Paso ${pageNumber} de ${TOTAL_PAGES}`;
    }
    if (progressPercentage) {
        progressPercentage.textContent = `${Math.round(percentage)}%`;
    }

    // 4. Actualizar botones de navegación
    prevBtn.disabled = (pageNumber === 1) || isSaving;
    nextBtn.disabled = (pageNumber === TOTAL_PAGES) || isSaving;
    saveBtn.disabled = isSaving;

    nextBtn.classList.toggle('hidden', pageNumber === TOTAL_PAGES);
    saveBtn.classList.toggle('hidden', pageNumber !== TOTAL_PAGES);

    // 5. Ocultar el indicador de página de texto antiguo (si existe)
    if (pageIndicator) {
        pageIndicator.classList.add('hidden');
    }

    // 6. Volver al inicio de la página solo cuando sea necesario (cambio de página real)
    if (shouldScroll) {
        window.scrollTo(0, 0);
    }
}


/** Muestra un mensaje de error en una página específica. */

/** Muestra un mensaje de error en una página específica con recuadro rojo (estilo como en la imagen) */
function showPageError(pageNumber, message) {
    try {
        const errorMsgEl = document.getElementById(`page${pageNumber}-error-message`);
        if (!errorMsgEl) {
            // Fallback: si falta el elemento, escribir en consola y marcar el step
            console.warn(`Elemento de error page${pageNumber}-error-message no encontrado.`);
            setStepError(pageNumber, true);
            return;
        }

        // Aceptar arrays o strings; si es array lo convertimos a texto
        let text = '';
        if (Array.isArray(message)) {
            text = message.join(', ');
        } else {
            text = String(message || '');
        }

        // Mensaje solo texto (sin icono !)
        errorMsgEl.innerHTML = `<span class="msg">${text}</span>`;

        // Mostrar con la clase visible (evita conflictos con .hidden)
        errorMsgEl.classList.remove('hidden');
        errorMsgEl.classList.add('visible');

        // Marcar el paso izquierdo en rojo
        try { setStepError(pageNumber, true); } catch (e) { /* ignore */ }
    } catch (e) {
        console.error('Error mostrando page error:', e);
    }
}

/** Limpia el mensaje de error de una página y elimina la marca en el stepper */
function clearPageError(pageNumber) {
    try {
        const errorMsgEl = document.getElementById(`page${pageNumber}-error-message`);
        if (errorMsgEl) {
            errorMsgEl.classList.add('hidden');
            errorMsgEl.classList.remove('visible');
            errorMsgEl.innerHTML = '';
        }
        try { setStepError(pageNumber, false); } catch (e) { /* ignore */ }
    } catch (e) {
        console.error('Error limpiando page error:', e);
    }
}

/** Navega entre páginas, guardando el progreso.
 *  Nota: La navegación NO queda bloqueada por validaciones. Se muestran errores,
 *  pero el usuario puede avanzar/retroceder igualmente.
 */
async function navigatePage(direction) {
    if (isSaving) return; // No navegar si está guardando

    const newPage = currentPage + direction;
    if (newPage < 1 || newPage > TOTAL_PAGES) return;

    // Validaciones informativas (al ir hacia adelante)
    // Los errores ahora se muestran como tooltips en los campos al pasar el cursor
    if (direction > 0) {
        if (currentPage === 1) {
            const validation = validatePage1();
            setStepError(1, !validation.isValid);
            setStepCompleted(1, validation.isValid);
        } else if (currentPage === 2) {
            const validation = validatePage2();
            setStepError(2, !validation.isValid);
            setStepCompleted(2, validation.isValid);
        } else if (currentPage === 3) {
            const validation = validatePage3();
            setStepError(3, !validation.isValid);
            setStepCompleted(3, validation.isValid);
        } else if (currentPage === 4) {
            const validation = validatePage4();
            setStepError(4, !validation.isValid);
            setStepCompleted(4, validation.isValid);
        } else if (currentPage === 6) {
            // Para página 6, solo validar si realmente hay datos
            // No validar automáticamente al navegar hacia adelante
        } else if (currentPage === 7) {
            const validation = validatePage7();
            setStepError(7, !validation.isValid);
            setStepCompleted(7, validation.isValid);
        } else if (currentPage === 8) {
            const validation = validatePage8();
            setStepError(8, !validation.isValid);
            setStepCompleted(8, validation.isValid);
        }
    }

    // Guardar progreso automáticamente al navegar
    await saveFormData(false);

    currentPage = newPage;
    showPage(currentPage);

    // Después de cambiar de página, revalidar todas las páginas con datos
    // para mantener los estados de error/completado en el stepper
    setTimeout(() => {
        revalidateAllPages();
    }, 100);
}

/** Revalida todas las páginas que tienen datos para mantener el estado del stepper */
function revalidateAllPages() {
    // Página 1
    const page1HasData = document.getElementById('instNIF')?.value?.trim() ||
        document.getElementById('instNombre')?.value?.trim();
    if (page1HasData) {
        const validation1 = validatePage1();
        setStepError(1, !validation1.isValid);
        setStepCompleted(1, validation1.isValid);
    }

    // Página 2
    const page2HasData = document.getElementById('dirTipoVia')?.value?.trim() ||
        document.getElementById('dirDireccion')?.value?.trim();
    if (page2HasData) {
        const validation2 = validatePage2();
        setStepError(2, !validation2.isValid);
        setStepCompleted(2, validation2.isValid);
    }

    // Página 3
    const page3HasData = document.getElementById('orgCapitalSocial')?.value?.trim() ||
        document.querySelectorAll('#accionarial-container input[id*="_nombre"]')[0]?.value?.trim();
    if (page3HasData) {
        const validation3 = validatePage3();
        const container = document.getElementById('accionarial-container');
        const hayErrorParticipacion = container?.querySelector('.input-invalid[id*="_pct"]');
        const hasErrors3 = !validation3.isValid || !!hayErrorParticipacion;
        setStepError(3, hasErrors3);
        setStepCompleted(3, !hasErrors3);
    }

    // Página 4
    const page4Container = document.getElementById('recursos-container');
    const page4HasData = page4Container && Array.from(page4Container.querySelectorAll('input')).some(input => input.value?.trim());
    if (page4HasData) {
        const validation4 = validatePage4();
        setStepError(4, !validation4.isValid);
        setStepCompleted(4, validation4.isValid);
    }

    // Página 5
    const page5Container = document.getElementById('recursos-id-container');
    if (page5Container) {
        const editableInputs = Array.from(page5Container.querySelectorAll('input:not([readonly])'));
        const hayDatos = editableInputs.some(input => input.value && input.value.trim() !== '' && input.value !== '0,00');
        if (hayDatos) {
            validatePage5RecursosID();
        }
    }

    // Página 6
    const containerProd = document.getElementById('productos-container');
    if (containerProd) {
        const ventasInputs = containerProd.querySelectorAll('input[id^="prod"][id$="_ventas"]');
        const hayDatos = Array.from(ventasInputs).some(input => input.value && input.value.trim() !== '');
        if (hayDatos) {
            validarTotalVentas();
            setTimeout(() => {
                const todosVerdes = verificarTodosCamposVerdesProductos();
                const sumaCorrecta = !document.getElementById('page-6-error') ||
                    document.getElementById('page-6-error').classList.contains('hidden');
                if (todosVerdes && sumaCorrecta) {
                    setStepCompleted(6, true);
                    setStepError(6, false);
                } else {
                    setStepError(6, true);
                    setStepCompleted(6, false);
                }
            }, 100);
        }
    }

    // Página 7
    const page7HasData = document.getElementById('entidadTipo')?.value?.trim() ||
        document.getElementById('ent_efectivos')?.value?.trim();
    if (page7HasData) {
        const validation7 = validatePage7();
        setStepError(7, !validation7.isValid);
        setStepCompleted(7, validation7.isValid);
    }

    // Página 8
    const page8HasData = document.getElementById('bankIBAN')?.value?.trim() ||
        document.getElementById('bankEntidad')?.value?.trim();
    if (page8HasData) {
        const validation8 = validatePage8();
        setStepError(8, !validation8.isValid);
        setStepCompleted(8, validation8.isValid);
    }

    // Página 9 - solo validar si hay datos
    const page9HasData2 = document.getElementById('decl_ayuda_solicitada')?.value ||
        document.getElementById('decl_cumple_requisitos')?.checked;
    if (page9HasData2) {
        validatePage9();
    } else {
        setStepError(9, false);
        setStepCompleted(9, false);
    }

    // Página 10
    validatePage10();
}

/** Construye la UI dinámica de Recursos Humanos (5 años: currentYear-3 .. +1) */
function renderRecursosHumanos(existing = []) {
    const container = document.getElementById('recursos-container');
    if (!container) return;
    container.innerHTML = '';

    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y++) years.push(y);

    years.forEach((year) => {
        const existingData = (Array.isArray(existing) && existing.find(it => Number(it.year) === Number(year))) || {};

        const section = document.createElement('div');
        section.className = 'form-section';
        section.dataset.year = year;

        section.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
              <h4 class="font-semibold text-gray-800" style="margin:0;">Año ${year}</h4>
            </div>

            <div class="form-grid md:grid-cols-4 rec-grid" style="gap:0.5rem;">
                <div class="rec-item">
                    <label for="rh_${year}_directivo_h">Directivo - Hombres</label>
                    <input id="rh_${year}_directivo_h" type="text" class="input-default" value="${existingData.directivo_hombres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_directivo_m">Directivo - Mujeres</label>
                    <input id="rh_${year}_directivo_m" type="text" class="input-default" value="${existingData.directivo_mujeres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>

                <div class="rec-item">
                    <label for="rh_${year}_administracion_h">Administración H</label>
                    <input id="rh_${year}_administracion_h" type="text" class="input-default" value="${existingData.administracion_hombres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_administracion_m">Administración M</label>
                    <input id="rh_${year}_administracion_m" type="text" class="input-default" value="${existingData.administracion_mujeres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>

                <div class="rec-item">
                    <label for="rh_${year}_produccion_h">Producción - Hombres</label>
                    <input id="rh_${year}_produccion_h" type="text" class="input-default" value="${existingData.produccion_hombres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_produccion_m">Producción - Mujeres</label>
                    <input id="rh_${year}_produccion_m" type="text" class="input-default" value="${existingData.produccion_mujeres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_comercial_h">Comercial - Hombres</label>
                    <input id="rh_${year}_comercial_h" type="text" class="input-default" value="${existingData.comercial_hombres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_comercial_m">Comercial - Mujeres</label>
                    <input id="rh_${year}_comercial_m" type="text" class="input-default" value="${existingData.comercial_mujeres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>

                <!-- I+D -->
                <div class="rec-item">
                    <label for="rh_${year}_id_doct_h">I+D Doctores H</label>
                    <input id="rh_${year}_id_doct_h" type="text" class="input-default" value="${existingData.id_doct_hombres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_id_doct_m">I+D Doctores M</label>
                    <input id="rh_${year}_id_doct_m" type="text" class="input-default" value="${existingData.id_doct_mujeres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_id_mast_h">I+D Máster H</label>
                    <input id="rh_${year}_id_mast_h" type="text" class="input-default" value="${existingData.id_mast_hombres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_id_mast_m">I+D Máster M</label>
                    <input id="rh_${year}_id_mast_m" type="text" class="input-default" value="${existingData.id_mast_mujeres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>

                <div class="rec-item">
                    <label for="rh_${year}_id_grad_h">I+D Grado H</label>
                    <input id="rh_${year}_id_grad_h" type="text" class="input-default" value="${existingData.id_grad_hombres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_id_grad_m">I+D Grado M</label>
                    <input id="rh_${year}_id_grad_m" type="text" class="input-default" value="${existingData.id_grad_mujeres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_id_otros_h">I+D Otros H</label>
                    <input id="rh_${year}_id_otros_h" type="text" class="input-default" value="${existingData.id_otros_hombres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
                <div class="rec-item">
                    <label for="rh_${year}_id_otros_m">I+D Otros M</label>
                    <input id="rh_${year}_id_otros_m" type="text" class="input-default" value="${existingData.id_otros_mujeres || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
                </div>
            </div>

            <div class="rec-total-container">
              <div id="rh_${year}_total_personas_display" class="rec-total-personas" aria-live="polite">Total Personas: 0</div>
            </div>

            <div style="margin-top:0.6rem;">
                <label for="rh_${year}_total_titulados" style="font-weight:600; display:block; margin-bottom:0.25rem;">Total de Titulados</label>
                <input id="rh_${year}_total_titulados" type="text" class="input-default" value="${existingData.total_titulados || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
            </div>
        `;

        container.appendChild(section);
    });

    updateAllTotals();
}

function updateTotalsForYear(year) {
    const idsToSum = [
        `rh_${year}_directivo_h`, `rh_${year}_directivo_m`,
        `rh_${year}_administracion_h`, `rh_${year}_administracion_m`,
        `rh_${year}_produccion_h`, `rh_${year}_produccion_m`,
        `rh_${year}_comercial_h`, `rh_${year}_comercial_m`,
        `rh_${year}_id_doct_h`, `rh_${year}_id_doct_m`,
        `rh_${year}_id_mast_h`, `rh_${year}_id_mast_m`,
        `rh_${year}_id_grad_h`, `rh_${year}_id_grad_m`,
        `rh_${year}_id_otros_h`, `rh_${year}_id_otros_m`
    ];

    let total = 0;
    idsToSum.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        try {
            if (typeof window.validateNumericField === 'function') {
                window.validateNumericField(el);
            } else if (typeof validateNumericField === 'function') {
                validateNumericField(el);
            }
        } catch (e) { /* no bloquear suma */ }

        const v = (el.value || '').toString().trim();
        const n = Number(v);
        if (!Number.isNaN(n)) total += n;
    });

    const disp = document.getElementById(`rh_${year}_total_personas_display`);
    if (disp) {
        disp.textContent = `Total Personas: ${total}`;
    }

    return total;
}

function updateAllTotals() {
    const container = document.getElementById('recursos-container');
    if (!container) return;
    container.querySelectorAll('.form-section').forEach(section => {
        const year = section.dataset.year;
        if (!year) return;
        updateTotalsForYear(year);
    });
    window.updateTotalsForYear = updateTotalsForYear;
    window.updateAllTotals = updateAllTotals;
}

function renderRecursosID(existing = []) {
    const container = document.getElementById('recursos-id-container');
    if (!container) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const years = [];
    for (let y = currentYear - 3; y <= currentYear + 1; y++) years.push(y);

    const historicos = years.filter(y => y <= currentYear - 1);
    const previstos = years.filter(y => y >= currentYear);

    let html = `
        <table class="recursos-id-table" style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
            <thead>
                <tr style="background-color: var(--md-sys-color-surface-container-highest);">
                    <th style="border: 1px solid var(--md-sys-color-outline-variant); padding: 0.75rem; text-align: left; font-weight: 600;">RECURSOS DESTINADOS A I+D</th>
                    <th colspan="${historicos.length}" style="border: 1px solid var(--md-sys-color-outline-variant); padding: 0.75rem; text-align: center; font-weight: 600;">HISTÓRICO</th>
                    <th colspan="${previstos.length}" style="border: 1px solid var(--md-sys-color-outline-variant); padding: 0.75rem; text-align: center; font-weight: 600;">PREVISTOS</th>
                </tr>
                <tr style="background-color: var(--md-sys-color-surface-container);">
                    <th style="border: 1px solid var(--md-sys-color-outline-variant); padding: 0.5rem;"></th>
    `;

    years.forEach(year => {
        html += `<th style="border: 1px solid var(--md-sys-color-outline-variant); padding: 0.5rem; text-align: center; font-weight: 500;">${year}</th>`;
    });

    html += `</tr></thead><tbody>`;

    const rows = [
        { label: 'Inmovilizado Material', id: 'inm_mat', readonly: true, bold: true, groupClass: 'group-inmovilizado-start' },
        { label: 'Terrenos y edificios', id: 'terrenos', parent: 'inm_mat', groupClass: 'group-inmovilizado' },
        { label: 'Aparatos y equipos', id: 'aparatos', parent: 'inm_mat', groupClass: 'group-inmovilizado' },
        { label: 'TOTAL INMOVILIZADO MATERIAL', id: 'total_inm', readonly: true, bold: true, copyFrom: 'inm_mat', groupClass: 'group-inmovilizado-end' },
        { label: 'Inversiones Activos Fijos Materiales', id: 'inv_activos', readonly: true, bold: true, groupClass: 'group-inversiones-start' },
        { label: 'Terrenos y edificios', id: 'inv_terrenos', parent: 'inv_activos', groupClass: 'group-inversiones' },
        { label: 'Aparatos y equipos', id: 'inv_aparatos', parent: 'inv_activos', groupClass: 'group-inversiones' },
        { label: 'Gastos Corrientes', id: 'gastos_corr', readonly: true, bold: true, groupClass: 'group-inversiones' },
        { label: 'Personal', id: 'personal', parent: 'gastos_corr', groupClass: 'group-inversiones' },
        { label: 'Materiales', id: 'materiales', parent: 'gastos_corr', groupClass: 'group-inversiones' },
        { label: 'Colaboraciones externas y otros gastos', id: 'colaboraciones', parent: 'gastos_corr', groupClass: 'group-inversiones' },
        { label: 'TOTAL INVERSIONES GASTOS', id: 'total_inv_gastos', readonly: true, bold: true, groupClass: 'group-inversiones-end' }
    ];

    rows.forEach(row => {
        const rowStyle = row.bold ? 'font-weight: 600; background-color: var(--md-sys-color-surface-container-low);' : '';
        const rowClass = row.groupClass ? row.groupClass : '';
        html += `<tr class="${rowClass}"><td style="border: 1px solid var(--md-sys-color-outline-variant); padding: 0.5rem; ${rowStyle}">${row.label}</td>`;

        years.forEach(year => {
            const existingData = (Array.isArray(existing) && existing.find(it => Number(it.year) === Number(year))) || {};
            const value = existingData[row.id] || '';
            const inputId = `rid_${year}_${row.id}`;

            if (row.readonly) {
                html += `<td style="border: 1px solid var(--md-sys-color-outline-variant); padding: 0.5rem; text-align: right; ${rowStyle}">
                    <input type="text" id="${inputId}" readonly class="input-default" value="${value}" style="text-align: right; background-color: var(--md-sys-color-surface-container-highest); border: none; padding: 0.25rem;">
                </td>`;
            } else {
                html += `<td style="border: 1px solid var(--md-sys-color-outline-variant); padding: 0.5rem;">
                    <input type="text" id="${inputId}" class="input-default" value="${value}" style="text-align: right; padding: 0.25rem;" 
                           oninput="validateCurrencyField(this); calcularTotalesRecursosID(${year})">
                </td>`;
            }
        });

        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    years.forEach(year => calcularTotalesRecursosID(year));
}

function calcularTotalesRecursosID(year) {
    const terrenos = parseFloat(document.getElementById(`rid_${year}_terrenos`)?.value.replace(/\./g, '').replace(',', '.') || 0);
    const aparatos = parseFloat(document.getElementById(`rid_${year}_aparatos`)?.value.replace(/\./g, '').replace(',', '.') || 0);
    const inmMat = terrenos + aparatos;

    const inmMatField = document.getElementById(`rid_${year}_inm_mat`);
    if (inmMatField) inmMatField.value = formatCurrency(inmMat);

    const totalInmField = document.getElementById(`rid_${year}_total_inm`);
    if (totalInmField) totalInmField.value = formatCurrency(inmMat);

    const invTerrenos = parseFloat(document.getElementById(`rid_${year}_inv_terrenos`)?.value.replace(/\./g, '').replace(',', '.') || 0);
    const invAparatos = parseFloat(document.getElementById(`rid_${year}_inv_aparatos`)?.value.replace(/\./g, '').replace(',', '.') || 0);
    const invActivos = invTerrenos + invAparatos;

    const invActivosField = document.getElementById(`rid_${year}_inv_activos`);
    if (invActivosField) invActivosField.value = formatCurrency(invActivos);

    const personal = parseFloat(document.getElementById(`rid_${year}_personal`)?.value.replace(/\./g, '').replace(',', '.') || 0);
    const materiales = parseFloat(document.getElementById(`rid_${year}_materiales`)?.value.replace(/\./g, '').replace(',', '.') || 0);
    const colaboraciones = parseFloat(document.getElementById(`rid_${year}_colaboraciones`)?.value.replace(/\./g, '').replace(',', '.') || 0);
    const gastosCorr = personal + materiales + colaboraciones;

    const gastosCorrField = document.getElementById(`rid_${year}_gastos_corr`);
    if (gastosCorrField) gastosCorrField.value = formatCurrency(gastosCorr);

    const totalInvGastos = invActivos + gastosCorr;
    const totalInvGastosField = document.getElementById(`rid_${year}_total_inv_gastos`);
    if (totalInvGastosField) totalInvGastosField.value = formatCurrency(totalInvGastos);

    // Validar la página 5 después de calcular
    if (currentPage === 5) {
        debouncedValidatePage5();
    }
}

/**
 * Valida la página 5 (Recursos I+D)
 * Si hay datos en algún campo editable, todos los campos editables con datos deben estar en verde
 */
function validatePage5RecursosID() {
    const container = document.getElementById('recursos-id-container');
    if (!container) {
        setStepError(5, false);
        setStepCompleted(5, false);
        return;
    }

    // Obtener todos los campos editables (no readonly)
    const editableInputs = Array.from(container.querySelectorAll('input:not([readonly])'));

    // Verificar si hay algún campo con datos
    const hayDatos = editableInputs.some(input => input.value && input.value.trim() !== '' && input.value !== '0,00');

    if (!hayDatos) {
        // No hay datos, marcar como no completada pero sin error
        setStepError(5, false);
        setStepCompleted(5, false);
        clearPageError(5);
        return;
    }

    // Hay datos, verificar que todos los campos con datos estén en verde
    let todosVerdes = true;
    editableInputs.forEach(input => {
        const value = input.value?.trim();
        // Si el campo tiene datos y no es 0,00, debe estar en verde
        if (value && value !== '' && value !== '0,00') {
            if (!input.classList.contains('input-valid')) {
                todosVerdes = false;
            }
        }
    });

    if (todosVerdes) {
        setStepCompleted(5, true);
        setStepError(5, false);
        clearPageError(5);
    } else {
        setStepError(5, true);
        setStepCompleted(5, false);
    }
}

function formatCurrency(value) {
    if (isNaN(value) || value === 0) return '0,00';
    return value.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&.').replace('.', ',').replace(/,(\d{2})$/, ',$1');
}

window.calcularTotalesRecursosID = calcularTotalesRecursosID;
window.validatePage5RecursosID = validatePage5RecursosID;

function setFieldErrorWithTooltip(element, errorMessage) {
    if (!element) return;
    element.classList.remove('input-valid', 'input-default');
    element.classList.add('input-invalid');
    element.setAttribute('data-error', errorMessage);

    const parent = element.parentElement;
    if (parent) {
        const currentPosition = window.getComputedStyle(parent).position;
        if (currentPosition === 'static') {
            parent.style.position = 'relative';
        }

        let tooltip = parent.querySelector('.error-tooltip');
        if (!tooltip && errorMessage) {
            tooltip = document.createElement('div');
            tooltip.className = 'error-tooltip';
            tooltip.textContent = errorMessage;
            tooltip.style.display = 'none';
            parent.appendChild(tooltip);
        } else if (tooltip) {
            tooltip.textContent = errorMessage;
        }
    }

    element.removeEventListener('mouseenter', showTooltipOnHover);
    element.removeEventListener('mouseleave', hideTooltipOnHover);
    element.addEventListener('mouseenter', showTooltipOnHover);
    element.addEventListener('mouseleave', hideTooltipOnHover);
}

function setFieldValidWithTooltip(element) {
    if (!element) return;
    element.classList.remove('input-invalid', 'input-default');
    element.classList.add('input-valid');
    element.removeAttribute('data-error');

    const parent = element.parentElement;
    if (parent) {
        const tooltip = parent.querySelector('.error-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    element.removeEventListener('mouseenter', showTooltipOnHover);
    element.removeEventListener('mouseleave', hideTooltipOnHover);
}

function showTooltipOnHover(event) {
    const parent = event.target.parentElement;
    if (parent) {
        const tooltip = parent.querySelector('.error-tooltip');
        if (tooltip) {
            tooltip.style.display = 'block';
        }
    }
}

function hideTooltipOnHover(event) {
    const parent = event.target.parentElement;
    if (parent) {
        const tooltip = parent.querySelector('.error-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }
}

function setFieldDefaultWithTooltip(element) {
    if (!element) return;
    element.classList.remove('input-valid', 'input-invalid');
    element.classList.add('input-default');
    element.removeAttribute('data-error');

    const parent = element.parentElement;
    if (parent) {
        const tooltip = parent.querySelector('.error-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    element.removeEventListener('mouseenter', showTooltipOnHover);
    element.removeEventListener('mouseleave', hideTooltipOnHover);
}

function initLoginSystem() {
    console.log('🚀 Inicializando sistema de login...');
    setupLoginForm();
    const savedClientId = localStorage.getItem('cdti-client-id');
    if (savedClientId) {
        console.log('🔄 Sesión existente encontrada, reconectando...');
        authenticateClient(savedClientId).catch(error => {
            console.error('❌ Error al reconectar sesión guardada:', error);
            localStorage.removeItem('cdti-client-id');
            showLoginScreen();
        });
    } else {
        console.log('📝 No hay sesión guardada, mostrando pantalla de login');
        showLoginScreen();
    }
}

function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('✅ Formulario de login encontrado, configurando evento submit');
        const newLoginForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newLoginForm, loginForm);
        newLoginForm.addEventListener('submit', handleLogin);
    } else {
        console.error('❌ No se encontró el formulario de login');
    }
}

function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('app');
    const sessionWarning = document.getElementById('session-warning');

    if (loginScreen) loginScreen.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';

    const savedClientId = localStorage.getItem('cdti-client-id');
    if (sessionWarning) {
        sessionWarning.style.display = savedClientId ? 'block' : 'none';
    }
}

window.clearSessionAndReload = function (event) {
    if (event) event.preventDefault();
    console.log('🧹 Limpiando sesión guardada...');
    localStorage.removeItem('cdti-client-id');
    location.reload();
}

function showMainApp() {
    console.log('🏠 showMainApp() llamado');
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('app');

    console.log('🏠 Elementos:', { loginScreen: !!loginScreen, mainApp: !!mainApp });
    
    if (loginScreen) {
        loginScreen.style.display = 'none';
        console.log('🏠 Login screen ocultado');
    }
    if (mainApp) {
        mainApp.style.display = 'block';
        console.log('🏠 Main app mostrado');
    }
}

async function handleLogin(event) {
    event.preventDefault();
    console.log('🔐 Iniciando login...');

    const passwordInput = document.getElementById('client-password');
    const errorDiv = document.getElementById('login-error');
    const submitBtn = event.target.querySelector('button[type="submit"]');

    const password = passwordInput.value.trim();
    console.log('🔐 Contraseña recibida:', password ? 'Sí' : 'No');

    if (!password) {
        showLoginError('Por favor, introduzca una contraseña.');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';

    try {
        const previousSession = localStorage.getItem('cdti-client-id');
        if (previousSession) {
            console.log('🧹 Limpiando sesión anterior:', previousSession);
            localStorage.removeItem('cdti-client-id');
            currentClientId = null;
            isAuthenticated = false;
            datosYaCargados = false;
            window.datosYaCargados = false; // Sincronizar con window
        }

        // Inicializar Firebase si no está listo
        if (!app) {
            await initializeFirebase();
        }

        console.log('🔐 Validando contraseña contra base de datos...');
        const usuariosRef = collection(db, 'usuarios');
        const q = query(usuariosRef, where('password', '==', password), where('activo', '==', true));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            console.log('❌ Contraseña no válida o usuario inactivo');
            showLoginError('Contraseña incorrecta. Si no tiene una contraseña, contacte con el administrador.');
            return;
        }

        const userDoc = querySnapshot.docs[0];
        const clientId = userDoc.id;
        console.log('✅ Usuario encontrado con ID:', clientId);

        await authenticateClient(clientId);
        console.log('✅ Cliente autenticado correctamente');

        localStorage.setItem('cdti-client-id', clientId);
        console.log('💾 Sesión guardada en localStorage');

        passwordInput.value = '';
        if (errorDiv) errorDiv.style.display = 'none';

        showMainApp();
        console.log('✅ Aplicación principal mostrada');

    } catch (error) {
        console.error('❌ Error en login:', error);
        showLoginError('Error al acceder. Verifique su contraseña e inténtelo nuevamente.');
        localStorage.removeItem('cdti-client-id');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Acceder al Formulario';
    }
}

async function authenticateClient(clientId) {
    console.log('🔑 Función authenticateClient iniciada con clientId:', clientId);

    // NOTA: La autenticación de admin ahora se hace via Google Auth, no via contraseña
    // Este bloque de ADMIN_KEY ya no es necesario
    
    currentClientId = clientId;
    isAuthenticated = true;

    console.log('🔑 Actualizando información del cliente en UI...');
    updateClientInfo();

    const showAdminBtn = document.getElementById('show-admin-btn');
    if (showAdminBtn) {
        if (clientId === 'Deincotec50855260') {
            showAdminBtn.style.display = 'block';
        } else {
            showAdminBtn.style.display = 'none';
        }
    }

    if (!app) {
        console.log('🔑 Firebase no inicializado, inicializando...');
        await initializeFirebase();
        console.log('✅ Firebase inicializado');
    } else {
        console.log('✅ Firebase ya estaba inicializado');
    }

    console.log('🔑 Cargando datos del cliente...');
    await loadClientData();
    console.log('✅ Datos del cliente cargados');

    // Iniciar guardado automático cada 10 segundos
    startAutoSaveInterval();
}

function updateClientInfo() {
    const clientInfo = document.getElementById('client-info');
    const clientIdSpan = document.getElementById('client-id');
    const logoutBtn = document.getElementById('logout-btn');

    if (clientInfo && currentClientId) {
        clientInfo.style.display = 'block';
        if (clientIdSpan) {
            clientIdSpan.textContent = currentClientId.substring(0, 8) + '...';
        }
    }

    if (logoutBtn) {
        logoutBtn.style.display = 'block';
    }
}

async function logout() {
    // Detener guardado automático
    stopAutoSaveInterval();

    // Ejecutar cualquier guardado pendiente (flush del debounce)
    if (datosYaCargados && currentClientId && db) {
        console.log('💾 Ejecutando guardado pendiente (flush)...');
        try {
            // Flush del debounce para guardar cambios pendientes inmediatamente
            if (typeof debouncedSave.flush === 'function') {
                debouncedSave.flush();
            }
            // Esperar un momento para que el flush se complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Guardar una última vez por seguridad
            await saveFormData(false);
            console.log('✅ Datos guardados antes de logout');
        } catch (error) {
            console.error('❌ Error al guardar antes de logout:', error);
        }
    }

    currentClientId = null;
    isAuthenticated = false;
    datosYaCargados = false;
    window.datosYaCargados = false; // Sincronizar con window
    currentData = []; // Limpiar datos en memoria

    localStorage.removeItem('cdti-client-id');

    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    clearFormData();

    const clientView = document.getElementById('client-view');
    const adminView = document.getElementById('admin-view');
    if (clientView) clientView.style.display = 'none';
    if (adminView) adminView.classList.add('hidden');

    showLoginScreen();

    const clientInfo = document.getElementById('client-info');
    const logoutBtn = document.getElementById('logout-btn');

    if (clientInfo) clientInfo.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
}

function loadFormData(data) {
    if (!data || typeof data !== 'object') {
        console.log('No hay datos previos para cargar');
        return;
    }

    console.log('📥 Cargando datos del formulario...', Object.keys(data).length, 'campos');

    Object.keys(data).forEach(key => {
        if (key === 'recHumanos' || key === 'recursosHumanos' || key === 'recursosID' || key === 'productos' || key === 'accionarial' ||
            key === 'consejo' || key === 'filiales' || key === 'timestamp') {
            return;
        }

        const element = document.getElementById(key);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = !!data[key];
            } else if (element.tagName === 'SELECT') {
                element.value = data[key] || '';
            } else {
                element.value = data[key] || '';
            }
        }
    });

    if (data.recHumanos && Array.isArray(data.recHumanos)) {
        console.log('📥 Cargando recursos humanos:', data.recHumanos.length, 'años');
        renderRecursosHumanos(data.recHumanos);
    } else if (data.recursosHumanos && Array.isArray(data.recursosHumanos)) {
        console.log('📥 Cargando recursos humanos (legacy):', data.recursosHumanos.length, 'años');
        renderRecursosHumanos(data.recursosHumanos);
    }

    if (data.recursosID && Array.isArray(data.recursosID)) {
        console.log('📥 Cargando recursos I+D:', data.recursosID.length, 'años');
        renderRecursosID(data.recursosID);
    }

    if (data.productos && Array.isArray(data.productos)) {
        console.log('📥 Cargando productos:', data.productos.length, 'productos');
        renderProductos(data.productos);
    } else {
        renderProductosIniciales();
    }

    if (data.accionarial && Array.isArray(data.accionarial) && data.accionarial.length > 0) {
        console.log('📥 Cargando accionistas:', data.accionarial.length, 'accionistas');
        renderAccionarialData(data.accionarial);
    }

    if (data.consejo && Array.isArray(data.consejo) && data.consejo.length > 0) {
        console.log('📥 Cargando consejo:', data.consejo.length, 'miembros');
        renderConsejoData(data.consejo);
    }

    if (data.filiales && Array.isArray(data.filiales) && data.filiales.length > 0) {
        console.log('📥 Cargando filiales:', data.filiales.length, 'filiales');
        renderFilialesData(data.filiales);
    }

    // --- MANEJO ESPECIAL PARA PERIODO DE REFERENCIA ---
    // Primero, se establece el valor del selector directamente desde los datos.
    const periodoRefEl = document.getElementById('entidadPeriodoRef');
    if (periodoRefEl && data.entidadPeriodoRef) {
        periodoRefEl.value = data.entidadPeriodoRef;
    }

    // Segundo, se llama a la función que actualiza la UI (el título del ejercicio anterior).
    // Esto asegura que se ejecuta DESPUÉS de que el valor ha sido establecido.
    actualizarEjercicioAnterior();
    // --- FIN MANEJO ESPECIAL ---

    // Nota: datosYaCargados ya se estableció a true ANTES de llamar a loadFormData()
    // Esto es para permitir auto-guardado durante la carga
    console.log('✅ Datos cargados en el formulario');

    setTimeout(() => {
        validateAllPagesAfterLoad();
    }, 100);
}

function renderAccionarialData(accionarial) {
    const container = document.getElementById('accionarial-container');
    if (!container) return;

    container.innerHTML = '';
    accionarialCount = 0;

    accionarial.forEach((acc, index) => {
        accionarialCount++;
        const bgColor = accionarialCount % 2 === 0 ? '#f3f4f6' : 'var(--card)';

        const grupo = document.createElement('div');
        grupo.className = 'accionarial-grupo form-grid md:grid-cols-2';
        grupo.style.cssText = `background-color: ${bgColor}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

        const deleteBtn = accionarialCount > 1 ?
            `<button type="button" onclick="removeAccionarialGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">− Eliminar</button>` : '';

        grupo.innerHTML = `
            <div>
                <label for="acc_${accionarialCount}_nombre">Nombre / Razón Social <span class="text-red-500">*</span>:</label>
                <input id="acc_${accionarialCount}_nombre" type="text" class="input-default" value="${acc.nombre || ''}">
            </div>
            <div>
                <label for="acc_${accionarialCount}_cif">NIF/CIF <span class="text-red-500">*</span>:</label>
                <input id="acc_${accionarialCount}_cif" type="text" class="input-default" value="${acc.cif || ''}">
            </div>
            <div style="position: relative;">
                <label for="acc_${accionarialCount}_pct">% Participación <span class="text-red-500">*</span>:</label>
                <input id="acc_${accionarialCount}_pct" type="number" step="0.1" class="input-default" oninput="validatePercentageField(this)" value="${acc.pct || ''}">
            </div>
            <div>
                <label for="acc_${accionarialCount}_pyme">Pyme: <span class="text-red-500">*</span></label>
                <select id="acc_${accionarialCount}_pyme" class="input-default">
                    <option value="">--</option>
                    <option value="Sí" ${acc.pyme === 'Sí' ? 'selected' : ''}>Sí</option>
                    <option value="No" ${acc.pyme === 'No' ? 'selected' : ''}>No</option>
                </select>
            </div>
            <div>
                <label for="acc_${accionarialCount}_nacionalidad">Nacionalidad: <span class="text-red-500">*</span></label>
                <input id="acc_${accionarialCount}_nacionalidad" type="text" class="input-default" value="${acc.nacionalidad || ''}">
            </div>
            ${deleteBtn}
        `;

        container.appendChild(grupo);
    });
}

function renderConsejoData(consejo) {
    const container = document.getElementById('consejo-container');
    if (!container) return;

    container.innerHTML = '';
    consejoCount = 0;

    consejo.forEach((miembro) => {
        consejoCount++;
        const bgColor = consejoCount % 2 === 0 ? '#f3f4f6' : 'var(--card)';

        const grupo = document.createElement('div');
        grupo.className = 'consejo-grupo form-grid md:grid-cols-2';
        grupo.style.cssText = `background-color: ${bgColor}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

        const deleteBtn = consejoCount > 1 ?
            `<button type="button" onclick="removeConsejoGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">− Eliminar</button>` : '';

        grupo.innerHTML = `
            <div>
                <label for="con_${consejoCount}_nombre">Nombre <span class="text-red-500">*</span>:</label>
                <input id="con_${consejoCount}_nombre" type="text" class="input-default" value="${miembro.nombre || ''}">
            </div>
            <div>
                <label for="con_${consejoCount}_cif">NIF/CIF <span class="text-red-500">*</span>:</label>
                <input id="con_${consejoCount}_cif" type="text" class="input-default" oninput="validateField(this, 'nif')" value="${miembro.cif || ''}">
            </div>
            <div>
                <label for="con_${consejoCount}_cargo">Cargo <span class="text-red-500">*</span>:</label>
                <input id="con_${consejoCount}_cargo" type="text" class="input-default" value="${miembro.cargo || ''}">
            </div>
            <div>
                <label for="con_${consejoCount}_nacionalidad">Nacionalidad: <span class="text-red-500">*</span></label>
                <input id="con_${consejoCount}_nacionalidad" type="text" class="input-default" value="${miembro.nacionalidad || ''}">
            </div>
            ${deleteBtn}
        `;

        container.appendChild(grupo);
    });
}

function renderFilialesData(filiales) {
    const container = document.getElementById('filiales-container');
    if (!container) return;

    container.innerHTML = '';
    filialCount = 0;

    filiales.forEach((filial) => {
        filialCount++;
        const bgColor = filialCount % 2 === 0 ? '#f3f4f6' : 'var(--card)';

        const grupo = document.createElement('div');
        grupo.className = 'filial-grupo form-grid md:grid-cols-2';
        grupo.style.cssText = `background-color: ${bgColor}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

        const deleteBtn = filialCount > 1 ?
            `<button type="button" onclick="removeFilialGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">− Eliminar</button>` : '';

        grupo.innerHTML = `
            <div>
                <label for="fil_${filialCount}_razon">Razón Social:</label>
                <input id="fil_${filialCount}_razon" type="text" class="input-default" value="${filial.razon || ''}">
            </div>
            <div>
                <label for="fil_${filialCount}_cif">CIF:</label>
                <input id="fil_${filialCount}_cif" type="text" class="input-default" value="${filial.cif || ''}">
            </div>
            <div>
                <label for="fil_${filialCount}_participacion">% Participación:</label>
                <input id="fil_${filialCount}_participacion" type="number" step="0.1" class="input-default" oninput="validatePercentageField(this)" value="${filial.participacion || ''}">
            </div>
            <div>
                <label for="fil_${filialCount}_pais">País:</label>
                <input id="fil_${filialCount}_pais" type="text" class="input-default" value="${filial.pais || ''}">
            </div>
            ${deleteBtn}
        `;

        container.appendChild(grupo);
    });
}

async function loadClientData() {
    if (!currentClientId || !db) return;

    // Mostrar indicador de carga
    const autosaveEl = document.getElementById('autosave-indicator');
    if (autosaveEl) {
        autosaveEl.textContent = 'Cargando datos...';
        autosaveEl.style.color = 'var(--brand)';
    }

    try {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }

        const clientDocRef = doc(db, 'clientes', currentClientId);
        let isFirstLoad = true;

        unsubscribe = onSnapshot(clientDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();

                // Si es escritura local, solo actualizamos memoria pero NO la UI
                // Esto evita que se recargue el formulario cuando el usuario está escribiendo
                if (docSnapshot.metadata.hasPendingWrites) {
                    console.log('📝 Escritura local detectada, actualizando solo memoria');
                    currentData = data;
                    return;
                }

                // Evitar re-renderizado si los datos son idénticos
                if (currentData && JSON.stringify(data) === JSON.stringify(currentData)) {
                    console.log('📋 Datos idénticos, omitiendo re-renderizado');

                    // Asegurar que las banderas estén correctas incluso si los datos son idénticos
                    if (!datosYaCargados) {
                        datosYaCargados = true;
                        window.datosYaCargados = true;
                        console.log('✅ Auto-guardado habilitado (datos idénticos)');
                    }

                    // Si es la primera carga, NO retornar para permitir que se ejecute initializeMainApp
                    if (!isFirstLoad) {
                        return;
                    }
                } else {
                    // Solo aquí cargamos datos desde el servidor (primera carga o cambio externo)
                    console.log('📥 Cargando datos desde Firebase...');
                    currentData = data;

                    // IMPORTANTE: Habilitar auto-guardado ANTES de cargar el formulario
                    // Esto permite que los cambios que el usuario haga durante la carga se guarden
                    if (!datosYaCargados) {
                        datosYaCargados = true;
                        window.datosYaCargados = true;
                        console.log('✅ Auto-guardado habilitado');
                    }

                    loadFormData(data);
                    console.log(`✅ Datos cargados para cliente: ${currentClientId}`);
                }
            } else {
                console.log(`🆕 Nuevo cliente sin datos previos: ${currentClientId}`);
                currentData = {};
                datosYaCargados = true;
                window.datosYaCargados = true; // Sincronizar con window
                console.log('✅ Cliente nuevo - Auto-guardado habilitado');
            }

            if (isFirstLoad) {
                initializeMainApp();
                isFirstLoad = false;
                const autosaveEl = document.getElementById('autosave-indicator');
                if (autosaveEl) autosaveEl.textContent = '';
            }
        }, (error) => {
            console.error('Error al cargar datos del cliente:', error);
        });

        // initializeMainApp() se llama dentro de onSnapshot

    } catch (error) {
        console.error('Error al configurar listener de datos:', error);
    }
}

function initializeMainApp() {
    setView('client');
    showPage(1);
    
    // Inicializar funcionalidad de checkboxes "Seleccionar todos"
    setTimeout(() => {
        initSelectAllOtrasDeclaraciones();
    }, 500);

    const adminBtn = document.getElementById('show-admin-btn');
    if (adminBtn) {
        adminBtn.disabled = false;
        adminBtn.style.opacity = '1';
        adminBtn.title = 'Acceder al panel de administración';
    }

    setTimeout(() => {
        validateAllPagesAfterLoad();
    }, 200);
}

function showLoginError(message) {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function clearFormData() {
    const form = document.getElementById('data-form');
    if (!form) return;

    const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"]');
    inputs.forEach(input => {
        input.value = '';
        input.classList.remove('input-valid', 'input-invalid');
        input.classList.add('input-default');
    });

    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    const selects = form.querySelectorAll('select');
    selects.forEach(select => {
        select.selectedIndex = 0;
    });

    accionarialCount = 1;
    consejoCount = 1;
    filialCount = 1;
    productoCount = 1;

    renderRecursosHumanos([]);
    renderRecursosID([]);
    renderProductosIniciales();

    showPage(1);

    for (let i = 1; i <= TOTAL_PAGES; i++) {
        clearPageError(i);
        setStepError(i, false);
    }

    console.log('Formulario limpiado para nuevo cliente');
}

function isValorExtrano(valor) {
    const valoresBasura = ['vg', 's', 'undefined', 'null', 'NaN', 'test', 'x', 'xx', 'xxx'];
    if (valoresBasura.includes(valor.toLowerCase())) {
        return true;
    }
    if (valor.length <= 3 && /^[a-zA-Z]+$/.test(valor)) {
        return true;
    }
    if (valor === '23' || valor === '32') {
        return true;
    }
    if (/[\x00-\x1F\x7F-\x9F]/.test(valor)) {
        return true;
    }
    return false;
}

async function loadUserFormData() {
    if (!db || !userId || userId === 'loading') return;

    try {
        const collectionPath = 'clientes';
        const docSnap = await getDoc(doc(db, collectionPath, userId));

        if (docSnap.exists()) {
            const data = docSnap.data();
            Object.keys(data).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = data[key] || false;
                    } else {
                        element.value = data[key] || '';
                    }
                }
            });

            if (data.accionarial && Array.isArray(data.accionarial)) {
                loadAccionarialData(data.accionarial);
            }

            if (data.consejo && Array.isArray(data.consejo)) {
                loadConsejoData(data.consejo);
            }

            if (data.filiales && Array.isArray(data.filiales)) {
                loadFilialesData(data.filiales);
            }

            if (data.productos && Array.isArray(data.productos)) {
                loadProductosData(data.productos);
            }

            if (data.recHumanos && Array.isArray(data.recHumanos)) {
                renderRecursosHumanos(data.recHumanos);
            }
        }
    } catch (error) {
        console.error("Error cargando datos del usuario:", error);
    }
}

function loadAccionarialData(accionarial) {
    accionarial.forEach((item, index) => {
        if (index === 0) {
            const el1 = document.getElementById('acc_1_nombre');
            const el2 = document.getElementById('acc_1_cif');
            const el3 = document.getElementById('acc_1_pct');
            const el4 = document.getElementById('acc_1_pyme');
            const el5 = document.getElementById('acc_1_nacionalidad');

            if (el1) el1.value = item.nombre || '';
            if (el2) el2.value = item.cif || '';
            if (el3) el3.value = item.porcentaje || '';
            if (el4) el4.value = item.pyme || '';
            if (el5) el5.value = item.nacionalidad || '';
        } else {
            addAccionarialGrupo();
            const currentCount = accionarialCount;
            const el1 = document.getElementById(`acc_${currentCount}_nombre`);
            const el2 = document.getElementById(`acc_${currentCount}_cif`);
            const el3 = document.getElementById(`acc_${currentCount}_pct`);
            const el4 = document.getElementById(`acc_${currentCount}_pyme`);
            const el5 = document.getElementById(`acc_${currentCount}_nacionalidad`);

            if (el1) el1.value = item.nombre || '';
            if (el2) el2.value = item.cif || '';
            if (el3) el3.value = item.porcentaje || '';
            if (el4) el4.value = item.pyme || '';
            if (el5) el5.value = item.nacionalidad || '';
        }
    });
}

function loadConsejoData(consejo) {
    consejo.forEach((item, index) => {
        if (index === 0) {
            const el1 = document.getElementById('consejo_1_nombre');
            const el2 = document.getElementById('consejo_1_dni');
            const el3 = document.getElementById('consejo_1_cargo');
            const el4 = document.getElementById('consejo_1_nacionalidad');

            if (el1) el1.value = item.nombre || '';
            if (el2) el2.value = item.dni || '';
            if (el3) el3.value = item.cargo || '';
            if (el4) el4.value = item.nacionalidad || '';
        } else {
            addConsejoGrupo();
            const currentCount = consejoCount;
            const el1 = document.getElementById(`consejo_${currentCount}_nombre`);
            const el2 = document.getElementById(`consejo_${currentCount}_dni`);
            const el3 = document.getElementById(`consejo_${currentCount}_cargo`);
            const el4 = document.getElementById(`consejo_${currentCount}_nacionalidad`);

            if (el1) el1.value = item.nombre || '';
            if (el2) el2.value = item.dni || '';
            if (el3) el3.value = item.cargo || '';
            if (el4) el4.value = item.nacionalidad || '';
        }
    });
}

function loadFilialesData(filiales) {
    filiales.forEach((item, index) => {
        if (index === 0) {
            const el1 = document.getElementById('filial_1_razon');
            const el2 = document.getElementById('filial_1_cif');
            const el3 = document.getElementById('filial_1_actividad');
            const el4 = document.getElementById('filial_1_pct');
            const el5 = document.getElementById('filial_1_pais');

            if (el1) el1.value = item.razon || '';
            if (el2) el2.value = item.cif || '';
            if (el3) el3.value = item.actividad || '';
            if (el4) el4.value = item.porcentaje || '';
            if (el5) el5.value = item.pais || '';
        } else {
            addFilialGrupo();
            const currentCount = filialCount;
            const el1 = document.getElementById(`filial_${currentCount}_razon`);
            const el2 = document.getElementById(`filial_${currentCount}_cif`);
            const el3 = document.getElementById(`filial_${currentCount}_actividad`);
            const el4 = document.getElementById(`filial_${currentCount}_pct`);
            const el5 = document.getElementById(`filial_${currentCount}_pais`);

            if (el1) el1.value = item.razon || '';
            if (el2) el2.value = item.cif || '';
            if (el3) el3.value = item.actividad || '';
            if (el4) el4.value = item.porcentaje || '';
            if (el5) el5.value = item.pais || '';
        }
    });
}

function loadProductosData(productos) {
    const container = document.getElementById('productos-container');
    if (!container) return;

    container.innerHTML = '';
    productoCount = 0;

    renderProductosIniciales();

    productos.forEach((item, index) => {
        if (index === 0) {
            document.getElementById('prod1_nombre').value = item.nombre || '';
            document.getElementById('prod1_ventas').value = item.ventas || '';
            document.getElementById('prod1_nac').value = item.nacional || '';
            document.getElementById('prod1_exp').value = item.exportacion || '';
        } else {
            addProductoGrupo();
            const currentCount = productoCount;
            document.getElementById(`prod${currentCount}_nombre`).value = item.nombre || '';
            document.getElementById(`prod${currentCount}_ventas`).value = item.ventas || '';
            document.getElementById(`prod${currentCount}_nac`).value = item.nacional || '';
            document.getElementById(`prod${currentCount}_exp`).value = item.exportacion || '';
        }
    });

    if (productos.length > 0) {
        validarTotalVentas();
    }
}

/** Copia los datos de Dirección de Desarrollo a Dirección de Notificaciones */
window.copyAddressData = function () {
    const fields = [
        { src: 'dirTipoVia', dest: 'dirNotifTipoVia' },
        { src: 'dirDireccion', dest: 'dirNotifDireccion' },
        { src: 'dirNumero', dest: 'dirNotifNumero' },
        { src: 'dirDatosAdicionales', dest: 'dirNotifDatosAdicionales' },
        { src: 'dirCP', dest: 'dirNotifCP' },
        { src: 'dirProvincia', dest: 'dirNotifProvincia' },
        { src: 'dirLocalidad', dest: 'dirNotifLocalidad' },
        { src: 'dirTelefono', dest: 'dirNotifTelefono' },
        { src: 'dirEmail', dest: 'dirNotifEmail' }
    ];

    fields.forEach(field => {
        const srcEl = document.getElementById(field.src);
        const destEl = document.getElementById(field.dest);
        if (srcEl && destEl) {
            destEl.value = srcEl.value;
            // Disparar evento input para validaciones
            destEl.dispatchEvent(new Event('input'));
        }
    });

    console.log('Datos de dirección copiados.');
};

/** Guarda los datos del formulario en Firestore usando setDoc con el userId. */
async function saveFormData(isFinalSave = false) {
    console.log('🔄 saveFormData llamado - isFinalSave:', isFinalSave);
    console.log('   datosYaCargados:', datosYaCargados);
    console.log('   isAuthenticated:', isAuthenticated);
    console.log('   currentClientId:', currentClientId);
    console.log('   db:', !!db);
    console.log('   isSaving:', isSaving);

    // NO guardar hasta que los datos del cliente estén cargados
    if (!datosYaCargados && !isFinalSave) {
        console.log('⏸️ Auto-guardado pausado hasta que los datos se carguen');
        return;
    }

    if (!db || isSaving || !isAuthenticated || !currentClientId) {
        console.log('❌ No se puede guardar:');
        if (!db) console.log('   - Base de datos no disponible');
        if (isSaving) console.log('   - Ya hay un guardado en progreso');
        if (!isAuthenticated) console.log('   - No autenticado');
        if (!currentClientId) console.log('   - No hay ID de cliente');

        if (!db && isFinalSave) showMessageBox("Error", "La base de datos no está disponible.");
        if (!isAuthenticated && isFinalSave) showMessageBox("Error", "No hay una sesión de cliente activa.");
        return;
    }

    // Validar que appId sea válido (no sea el valor por defecto)
    if (appId === 'default-app-id') {
        if (isFinalSave) {
            showMessageBox("Error de Configuración", "El ID de aplicación no está configurado correctamente. Contacte al administrador.");
        }
        return;
    }

    isSaving = true;
    const form = document.getElementById('data-form');
    const autosaveEl = document.getElementById('autosave-indicator');

    // Deshabilitar botones mientras se guarda
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    saveBtn.disabled = true;

    if (autosaveEl) {
        if (isFinalSave) {
            autosaveEl.textContent = 'Guardando...';
        } else {
            autosaveEl.textContent = 'Autoguardando...';
        }
        autosaveEl.style.color = 'var(--accent-2)';
    }

    try {
        // Recolectar datos de TODOS los campos del formulario (estáticos)
        const formData = {
            instNIF: document.getElementById('instNIF').value.trim(),
            instNombre: document.getElementById('instNombre').value.trim(),
            instApellidos: document.getElementById('instApellidos').value.trim(),
            instCargo: document.getElementById('instCargo').value.trim(),
            instTelefono: document.getElementById('instTelefono').value.trim(),
            instEmail: document.getElementById('instEmail').value.trim(),
            tecNombre: document.getElementById('tecNombre').value.trim(),
            tecApellidos: document.getElementById('tecApellidos').value.trim(),
            tecCargo: document.getElementById('tecCargo').value.trim(),
            finNombre: document.getElementById('finNombre').value.trim(),
            finApellidos: document.getElementById('finApellidos').value.trim(),
            finCargo: document.getElementById('finCargo').value.trim(),

            dirTipoVia: document.getElementById('dirTipoVia').value.trim(),
            dirDireccion: document.getElementById('dirDireccion').value.trim(),
            dirNumero: document.getElementById('dirNumero').value.trim(),
            dirDatosAdicionales: document.getElementById('dirDatosAdicionales').value.trim(),
            dirCP: document.getElementById('dirCP').value.trim(),
            dirProvincia: document.getElementById('dirProvincia').value.trim(),
            dirLocalidad: document.getElementById('dirLocalidad').value.trim(),
            dirTelefono: document.getElementById('dirTelefono').value.trim(),
            dirEmail: document.getElementById('dirEmail').value.trim(),

            dirNotifTipoVia: document.getElementById('dirNotifTipoVia').value.trim(),
            dirNotifDireccion: document.getElementById('dirNotifDireccion').value.trim(),
            dirNotifNumero: document.getElementById('dirNotifNumero').value.trim(),
            dirNotifDatosAdicionales: document.getElementById('dirNotifDatosAdicionales').value.trim(),
            dirNotifCP: document.getElementById('dirNotifCP').value.trim(),
            dirNotifProvincia: document.getElementById('dirNotifProvincia').value.trim(),
            dirNotifLocalidad: document.getElementById('dirNotifLocalidad').value.trim(),
            dirNotifTelefono: document.getElementById('dirNotifTelefono').value.trim(),
            dirNotifEmail: document.getElementById('dirNotifEmail').value.trim(),

            orgAnoCapital: document.getElementById('orgAnoCapital').value.trim(),
            orgCapitalSocial: document.getElementById('orgCapitalSocial').value.trim(),

            // Otros campos...
            id_ano: document.getElementById('id_ano') ? document.getElementById('id_ano').value.trim() : '',
            id_inmovilizado: document.getElementById('id_inmovilizado') ? document.getElementById('id_inmovilizado').value.trim() : '',
            id_gastos_corrientes: document.getElementById('id_gastos_corrientes') ? document.getElementById('id_gastos_corrientes').value.trim() : '',

            // --- INICIO DE CORRECCIÓN (Página 6) ---
            // Los productos se gestionan dinámicamente más abajo
            // --- FIN DE CORRECCIÓN ---

            entidadTipo: document.getElementById('entidadTipo') ? document.getElementById('entidadTipo').value : '',
            entidadTamaño: document.getElementById('entidadTamaño') ? document.getElementById('entidadTamaño').value : '',
            entidadPeriodoRef: document.getElementById('entidadPeriodoRef') ? document.getElementById('entidadPeriodoRef').value : '',
            ent_efectivos: document.getElementById('ent_efectivos').value.trim(),
            ent_volumen_negocio: document.getElementById('ent_volumen_negocio').value.trim(),
            ent_balance_general: document.getElementById('ent_balance_general').value.trim(),
            ent_anterior_efectivos: document.getElementById('ent_anterior_efectivos').value.trim(),
            ent_anterior_volumen_negocio: document.getElementById('ent_anterior_volumen_negocio').value.trim(),
            ent_anterior_balance_general: document.getElementById('ent_anterior_balance_general').value.trim(),

            bankIBAN: document.getElementById('bankIBAN').value.trim(),
            bankEntidad: document.getElementById('bankEntidad').value.trim(),
            bankOficina: document.getElementById('bankOficina').value.trim(),
            bankDC: document.getElementById('bankDC').value.trim(),
            bankNumero: document.getElementById('bankNumero').value.trim(),

            // Página 9 - Declaraciones
            decl_ayuda_solicitada: document.getElementById('decl_ayuda_solicitada')?.value || '',
            decl_ayuda_europea: document.getElementById('decl_ayuda_europea')?.value || '',
            decl_entidad_crisis: document.getElementById('decl_entidad_crisis')?.value || '',
            decl_cumple_requisitos: document.getElementById('decl_cumple_requisitos')?.checked || false,
            decl_no_inicio_previo: document.getElementById('decl_no_inicio_previo')?.checked || false,
            decl_cumple_normativa: document.getElementById('decl_cumple_normativa')?.checked || false,
            decl_sujeto_control: document.getElementById('decl_sujeto_control')?.checked || false,
            decl_representante_agrupacion: document.getElementById('decl_representante_agrupacion')?.checked || false,
            decl_respeta_dnsh: document.getElementById('decl_respeta_dnsh')?.checked || false,
            decl_no_deudas: document.getElementById('decl_no_deudas')?.checked || false,
            decl_autoriza_cesion_datos: document.getElementById('decl_autoriza_cesion_datos')?.checked || false,
            decl_feder_personal_ca: document.getElementById('decl_feder_personal_ca')?.checked || false,
            decl_feder_conoce_condiciones: document.getElementById('decl_feder_conoce_condiciones')?.checked || false,
            decl_feder_capacidad: document.getElementById('decl_feder_capacidad')?.checked || false,
            decl_feder_cumple_reglamento: document.getElementById('decl_feder_cumple_reglamento')?.checked || false,
            decl_feder_publicidad: document.getElementById('decl_feder_publicidad')?.checked || false,
            decl_feder_licencia_ue: document.getElementById('decl_feder_licencia_ue')?.checked || false,
            decl_feder_conoce_minoracion: document.getElementById('decl_feder_conoce_minoracion')?.checked || false,
            decl_feder_operacion_no_concluida: document.getElementById('decl_feder_operacion_no_concluida')?.checked || false,
            decl_feder_conservar_docs: document.getElementById('decl_feder_conservar_docs')?.checked || false,
            decl_feder_registros_contables: document.getElementById('decl_feder_registros_contables')?.checked || false,
            decl_feder_conoce_antifraude: document.getElementById('decl_feder_conoce_antifraude')?.checked || false,
            decl_feder_informado_medidas: document.getElementById('decl_feder_informado_medidas')?.checked || false,
            decl_feder_difundir_comunicado: document.getElementById('decl_feder_difundir_comunicado')?.checked || false,
            decl_feder_durabilidad: document.getElementById('decl_feder_durabilidad')?.checked || false,
            decl_feder_indicadores: document.getElementById('decl_feder_indicadores')?.checked || false,
            decl_feder_comprobacion: document.getElementById('decl_feder_comprobacion')?.checked || false,
            decl_feder_cooperacion: document.getElementById('decl_feder_cooperacion')?.checked || false,
            decl_feder_analisis_riesgos: document.getElementById('decl_feder_analisis_riesgos')?.checked || false,
            decl_feder_lista_operaciones: document.getElementById('decl_feder_lista_operaciones')?.checked || false,
            decl_feder_accesibilidad: document.getElementById('decl_feder_accesibilidad')?.checked || false,
            decl_feder_autoriza_facilitar: document.getElementById('decl_feder_autoriza_facilitar')?.checked || false,
            decl_plan_igualdad: document.getElementById('decl_plan_igualdad')?.value || '',
            decl_protocolo_acoso: document.getElementById('decl_protocolo_acoso')?.value || '',
            decl_distintivo_igualdad: document.getElementById('decl_distintivo_igualdad')?.value || '',
            decl_medidas_conciliacion: document.getElementById('decl_medidas_conciliacion')?.value || '',
            decl_reserva_discapacidad: document.getElementById('decl_reserva_discapacidad')?.value || '',
            decl_accesibilidad_instalaciones: document.getElementById('decl_accesibilidad_instalaciones')?.value || '',
            decl_impacto_medioambiental: document.getElementById('decl_impacto_medioambiental')?.value || '',
            decl_responsable_mujer: document.getElementById('decl_responsable_mujer')?.value || '',
            decl_proy_autorizaciones: document.getElementById('decl_proy_autorizaciones')?.checked || false,
            decl_proy_normas_ambientales: document.getElementById('decl_proy_normas_ambientales')?.checked || false,
            decl_proy_desarrollo_sostenible: document.getElementById('decl_proy_desarrollo_sostenible')?.checked || false,
            decl_proy_dimension_genero: document.getElementById('decl_proy_dimension_genero')?.checked || false,
            decl_proy_impacto_genero: document.getElementById('decl_proy_impacto_genero')?.checked || false,
            decl_proy_eliminar_desigualdades: document.getElementById('decl_proy_eliminar_desigualdades')?.checked || false,
            decl_proy_lucha_discriminacion: document.getElementById('decl_proy_lucha_discriminacion')?.checked || false,
            decl_proy_ayuda_reembolsable: document.getElementById('decl_proy_ayuda_reembolsable')?.checked || false,
            decl_feder_proy_susceptible_cofinanciar: document.getElementById('decl_feder_proy_susceptible_cofinanciar')?.checked || false,
            decl_feder_proy_uso_civil: document.getElementById('decl_feder_proy_uso_civil')?.checked || false,

            // Página 10 - Condiciones
            acceptAllConditions: document.getElementById('acceptAllConditions')?.checked || false
        };

        // --- INICIO DE CORRECCIÓN (Página 6) ---
        // Recolectar Productos (DINÁMICAMENTE)
        const productos = [];
        document.querySelectorAll('#productos-container .producto-grupo').forEach((grupo, index) => {
            // Buscar todos los inputs dentro de este grupo específico
            const nombreInput = grupo.querySelector('input[id*="_nombre"]');
            const ventasInput = grupo.querySelector('input[id*="_ventas"]');
            const nacInput = grupo.querySelector('input[id*="_nac"]');
            const expInput = grupo.querySelector('input[id*="_exp"]');

            if (!nombreInput) return;

            const nombre = nombreInput.value.trim();
            const ventas = ventasInput?.value?.trim() || '';
            const nac = nacInput?.value?.trim() || '';
            const exp = expInput?.value?.trim() || '';

            // Guardar TODOS los productos que tienen al menos un campo con datos
            // Esto asegura que si borras un producto, no se guarda
            if (nombre || ventas || nac || exp) {
                productos.push({
                    nombre: nombre,
                    ventas: ventas,
                    nac: nac,
                    exp: exp
                });
            }
        });
        formData.productos = productos; // Añadir el array al objeto formData
        // --- FIN DE CORRECCIÓN ---


        // Recolectar Accionarial dinámico
        const accionarial = [];
        document.querySelectorAll('#accionarial-container .accionarial-grupo').forEach(grupo => {
            const nombre = grupo.querySelector('[id*="_nombre"]')?.value?.trim() || '';
            const cif = grupo.querySelector('[id*="_cif"]')?.value?.trim() || '';
            const pct = grupo.querySelector('[id*="_pct"]')?.value?.trim() || '';
            const pyme = grupo.querySelector('[id*="_pyme"]')?.value || '';
            const nacionalidad = grupo.querySelector('[id*="_nacionalidad"]')?.value?.trim() || '';
            if (nombre || cif || pct || pyme || nacionalidad) {
                accionarial.push({ nombre, cif, pct, pyme, nacionalidad });
            }
        });
        formData.accionarial = accionarial;

        // Recolectar Consejo
        const consejo = [];
        document.querySelectorAll('#consejo-container .consejo-grupo').forEach(grupo => {
            const nombre = grupo.querySelector('[id*="_nombre"]')?.value?.trim() || '';
            const cif = grupo.querySelector('[id*="_cif"]')?.value?.trim() || '';
            const cargo = grupo.querySelector('[id*="_cargo"]')?.value?.trim() || '';
            const nacionalidad = grupo.querySelector('[id*="_nacionalidad"]')?.value?.trim() || '';
            if (nombre || cif || cargo || nacionalidad) {
                consejo.push({ nombre, cif, cargo, nacionalidad });
            }
        });
        formData.consejo = consejo;

        // Recolectar Filiales
        const filiales = [];
        document.querySelectorAll('#filial-container .filial-grupo').forEach(grupo => {
            const razon = grupo.querySelector('[id*="_razon"]')?.value?.trim() || '';
            const cif = grupo.querySelector('[id*="_cif"]')?.value?.trim() || '';
            const actividad = grupo.querySelector('[id*="_actividad"]')?.value?.trim() || '';
            const participacion = grupo.querySelector('[id*="_participacion"]')?.value?.trim() || '';
            const pais = grupo.querySelector('[id*="_pais"]')?.value?.trim() || '';
            if (razon || cif || actividad || participacion || pais) {
                filiales.push({ razon, cif, actividad, participacion, pais });
            }
        });
        formData.filiales = filiales;

        // Recolectar Recursos Humanos dinámico (recHumanos array)

        const recHumanos = [];
        document.querySelectorAll('#recursos-container .form-section').forEach(section => {
            const year = section.dataset.year;
            if (!year) return;
            const obj = {
                year: Number(year),
                directivo_hombres: document.getElementById(`rh_${year}_directivo_h`) ? document.getElementById(`rh_${year}_directivo_h`).value.trim() : '',
                directivo_mujeres: document.getElementById(`rh_${year}_directivo_m`) ? document.getElementById(`rh_${year}_directivo_m`).value.trim() : '',
                administracion_hombres: document.getElementById(`rh_${year}_administracion_h`) ? document.getElementById(`rh_${year}_administracion_h`).value.trim() : '',
                administracion_mujeres: document.getElementById(`rh_${year}_administracion_m`) ? document.getElementById(`rh_${year}_administracion_m`).value.trim() : '',
                produccion_hombres: document.getElementById(`rh_${year}_produccion_h`) ? document.getElementById(`rh_${year}_produccion_h`).value.trim() : '',
                produccion_mujeres: document.getElementById(`rh_${year}_produccion_m`) ? document.getElementById(`rh_${year}_produccion_m`).value.trim() : '',
                comercial_hombres: document.getElementById(`rh_${year}_comercial_h`) ? document.getElementById(`rh_${year}_comercial_h`).value.trim() : '',
                comercial_mujeres: document.getElementById(`rh_${year}_comercial_m`) ? document.getElementById(`rh_${year}_comercial_m`).value.trim() : '',
                // I+D
                id_doct_hombres: document.getElementById(`rh_${year}_id_doct_h`) ? document.getElementById(`rh_${year}_id_doct_h`).value.trim() : '',
                id_doct_mujeres: document.getElementById(`rh_${year}_id_doct_m`) ? document.getElementById(`rh_${year}_id_doct_m`).value.trim() : '',
                id_mast_hombres: document.getElementById(`rh_${year}_id_mast_h`) ? document.getElementById(`rh_${year}_id_mast_h`).value.trim() : '',
                id_mast_mujeres: document.getElementById(`rh_${year}_id_mast_m`) ? document.getElementById(`rh_${year}_id_mast_m`).value.trim() : '',
                id_grad_hombres: document.getElementById(`rh_${year}_id_grad_h`) ? document.getElementById(`rh_${year}_id_grad_h`).value.trim() : '',
                id_grad_mujeres: document.getElementById(`rh_${year}_id_grad_m`) ? document.getElementById(`rh_${year}_id_grad_m`).value.trim() : '',
                id_otros_hombres: document.getElementById(`rh_${year}_id_otros_h`) ? document.getElementById(`rh_${year}_id_otros_h`).value.trim() : '',
                id_otros_mujeres: document.getElementById(`rh_${year}_id_otros_m`) ? document.getElementById(`rh_${year}_id_otros_m`).value.trim() : '',
                // total calculado y campo editable
                total_personas: updateTotalsForYear(year),
                total_titulados: document.getElementById(`rh_${year}_total_titulados`) ? document.getElementById(`rh_${year}_total_titulados`).value.trim() : ''
            };
            recHumanos.push(obj);
        });
        formData.recHumanos = recHumanos;

        // Recolectar Recursos I+D dinámico
        const recursosID = [];
        const container = document.getElementById('recursos-id-container');
        if (container) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const years = [];
            for (let y = currentYear - 3; y <= currentYear + 1; y++) years.push(y);

            years.forEach(year => {
                const obj = {
                    year: Number(year),
                    // Campos editables
                    terrenos: document.getElementById(`rid_${year}_terrenos`)?.value?.trim() || '',
                    aparatos: document.getElementById(`rid_${year}_aparatos`)?.value?.trim() || '',
                    inv_terrenos: document.getElementById(`rid_${year}_inv_terrenos`)?.value?.trim() || '',
                    inv_aparatos: document.getElementById(`rid_${year}_inv_aparatos`)?.value?.trim() || '',
                    personal: document.getElementById(`rid_${year}_personal`)?.value?.trim() || '',
                    materiales: document.getElementById(`rid_${year}_materiales`)?.value?.trim() || '',
                    colaboraciones: document.getElementById(`rid_${year}_colaboraciones`)?.value?.trim() || '',
                    // Campos calculados (readonly)
                    inm_mat: document.getElementById(`rid_${year}_inm_mat`)?.value?.trim() || '',
                    total_inm: document.getElementById(`rid_${year}_total_inm`)?.value?.trim() || '',
                    inv_activos: document.getElementById(`rid_${year}_inv_activos`)?.value?.trim() || '',
                    gastos_corr: document.getElementById(`rid_${year}_gastos_corr`)?.value?.trim() || '',
                    total_inv_gastos: document.getElementById(`rid_${year}_total_inv_gastos`)?.value?.trim() || ''
                };
                recursosID.push(obj);
            });
        }
        formData.recursosID = recursosID;

        // Si es guardado final, validar todas las páginas
        if (isFinalSave) {
            const validations = [
                validatePage1(),
                validatePage2(),
                validatePage3(),
                validatePage4(),
                validatePage7(),
                validatePage8()
            ];

            const invalidPages = [];
            validations.forEach((v, idx) => {
                const pageNum = idx < 4 ? idx + 1 : (idx === 4 ? 7 : 8);
                if (!v.isValid) {
                    invalidPages.push(pageNum);
                    setStepError(pageNum, true);
                }
            });

            if (invalidPages.length > 0) {
                await showMessageBox('Validación', `Por favor complete correctamente las páginas: ${invalidPages.join(', ')}`);
                showPage(invalidPages[0]);
                isSaving = false;
                prevBtn.disabled = false;
                nextBtn.disabled = false;
                saveBtn.disabled = false;
                if (autosaveEl) {
                    autosaveEl.textContent = 'Error de validación';
                    autosaveEl.style.color = 'var(--danger)';
                }
                return;
            }
        }

        // Añadir timestamp
        formData.timestamp = serverTimestamp();

        console.log('💾 Intentando guardar en Firebase...');
        console.log('📍 Cliente ID:', currentClientId);
        console.log('📦 Datos a guardar:', Object.keys(formData).length, 'campos');

        // Ruta: /clientes/{clientId} - Datos separados por contraseña de cliente
        const clientDocRef = doc(db, 'clientes', currentClientId);
        await setDoc(clientDocRef, formData, { merge: true });

        console.log('✅ Datos guardados exitosamente en Firebase');

        if (isFinalSave) {
            if (autosaveEl) autosaveEl.textContent = '¡Guardado con éxito!';
            if (autosaveEl) autosaveEl.style.color = 'var(--success)';
            await showMessageBox('Éxito', '¡Datos guardados con éxito! Gracias.');
            showPage(1); // Volver a la primera página
        } else {
            if (autosaveEl) autosaveEl.textContent = 'Progreso guardado';
            if (autosaveEl) autosaveEl.style.color = 'var(--success)';
            setTimeout(() => {
                if (autosaveEl) {
                    autosaveEl.textContent = 'Autosave activo';
                    autosaveEl.style.color = 'var(--success)';
                }
            }, 2000);
        }

    } catch (error) {
        console.error("Error al guardar los datos: ", error);
        if (autosaveEl) autosaveEl.textContent = 'Error al guardar';
        if (autosaveEl) autosaveEl.style.color = 'var(--danger)';
    } finally {
        isSaving = false;
        // Reactivar botones y actualizar su estado según la página actual
        // No hacer scroll automático durante auto-guardado
        showPage(currentPage, false);
    }
}

/** Carga los datos de Firestore en tiempo real para el ADMIN. */
function loadAdminFormData() {
    if (unsubscribe) {
        unsubscribe();
    }

    const tableBody = document.getElementById('data-table-body');
    const statusEl = document.getElementById('data-loading-status');

    if (!tableBody || !statusEl) {
        console.warn("Admin view elements not found.");
        return;
    }

    // Verificar que Firebase esté inicializado
    if (!db) {
        console.error("Firebase database not initialized");
        statusEl.textContent = "Error: Base de datos no inicializada";
        return;
    }

    // Verificar que appId esté configurado
    if (!appId || appId === 'default-app-id') {
        console.error("AppId not configured:", appId);
        statusEl.textContent = "Error: ID de aplicación no configurado";
        return;
    }

    console.log("Intentando conectar con colección:", `artifacts/${appId}/public/data/client_forms`);

    statusEl.textContent = "Conectando con la base de datos...";

    try {
        const collectionPath = 'clientes';
        const q = query(collection(db, collectionPath));

        unsubscribe = onSnapshot(q, (querySnapshot) => {
            const dataArray = [];
            tableBody.innerHTML = '';

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
                const formattedDate = timestamp.toLocaleDateString('es-ES', {
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                });

                const rowData = {
                    Fecha: formattedDate,
                    NIF_Institucional: data.instNIF || '',
                    Nombre_Institucional: data.instNombre || '',
                    Apellidos_Institucional: data.instApellidos || '',
                    Cargo_Institucional: data.instCargo || '',
                    Telefono_Institucional: data.instTelefono || '',
                    Email_Institucional: data.instEmail || '',
                    Nombre_Tecnico: data.tecNombre || '',
                    Apellidos_Tecnico: data.tecApellidos || '',
                    Cargo_Tecnico: data.tecCargo || '',
                    Nombre_Financiero: data.finNombre || '',
                    Apellidos_Financiero: data.finApellidos || '',
                    Cargo_Financiero: data.finCargo || '',

                    Direccion_TipoVia: data.dirTipoVia || '',
                    Direccion_Direccion: data.dirDireccion || '',
                    Direccion_Numero: data.dirNumero || '',
                    Direccion_CP: data.dirCP || '',
                    Direccion_Provincia: data.dirProvincia || '',
                    Direccion_Localidad: data.dirLocalidad || '',
                    Direccion_Telefono: data.dirTelefono || '',
                    Direccion_Email: data.dirEmail || '',

                    Notif_TipoVia: data.dirNotifTipoVia || '',
                    Notif_Direccion: data.dirNotifDireccion || '',
                    Notif_Numero: data.dirNotifNumero || '',
                    Notif_CP: data.dirNotifCP || '',
                    Notif_Provincia: data.dirNotifProvincia || '',
                    Notif_Localidad: data.dirNotifLocalidad || '',
                    Notif_Telefono: data.dirNotifTelefono || '',
                    Notif_Email: data.dirNotifEmail || '',

                    Org_Año_Capital: data.orgAnoCapital || '',
                    Org_Capital_Social: data.orgCapitalSocial || '',
                    Accionarial: JSON.stringify(data.accionarial || []),

                    Rec_Humanos: JSON.stringify(data.recHumanos || []),

                    Rec_Año: data.rec_ano || '',
                    Rec_Total_Empleados: data.rec_total || '',
                    Rec_ID_Hombres: data.rec_id_hombres || '',
                    Rec_ID_Mujeres: data.rec_id_mujeres || '',

                    ID_Año: data.id_ano || '',
                    ID_Inmovilizado: data.id_inmovilizado || '',
                    ID_Gastos_Corrientes: data.id_gastos_corrientes || '',

                    Prod1_Nombre: data.prod1_nombre || '',
                    Prod1_Ventas: data.prod1_ventas || '',
                    Prod1_Nac: data.prod1_nac || '',
                    Prod1_Exp: data.prod1_exp || '',
                    Prod2_Nombre: data.prod2_nombre || '',
                    Prod2_Ventas: data.prod2_ventas || '',
                    Prod2_Nac: data.prod2_nac || '',
                    Prod2_Exp: data.prod2_exp || '',
                    Prod3_Nombre: data.prod3_nombre || '',
                    Prod3_Ventas: data.prod3_ventas || '',
                    Prod3_Nac: data.prod3_nac || '',
                    Prod3_Exp: data.prod3_exp || '',

                    Entidad_Tipo: data.entidadTipo || '',
                    Entidad_Tamaño: data.entidadTamaño || '',
                    Ent_Efectivos: data.ent_efectivos || '',
                    Ent_Volumen_Negocio: data.ent_volumen_negocio || '',
                    Ent_Balance_General: data.ent_balance_general || '',

                    Banco_IBAN: data.bankIBAN || '',
                    Banco_Entidad: data.bankEntidad || '',
                    Banco_Oficina: data.bankOficina || '',
                    Banco_DC: data.bankDC || '',
                    Banco_Numero: data.bankNumero || '',

                    Condiciones_Aceptadas: data.acceptAllConditions || false,

                    timestampSort: timestamp.getTime()
                };
                dataArray.push(rowData);
            });

            dataArray.sort((a, b) => b.timestampSort - a.timestampSort);
            currentData = dataArray;

            if (dataArray.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Aún no hay datos de clientes.</td></tr>';
                statusEl.textContent = "No hay datos.";
                return;
            }

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const clientId = doc.id; // ID del cliente (su contraseña)
                const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
                const formattedDate = timestamp.toLocaleDateString('es-ES', {
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                });

                const row = tableBody.insertRow();
                row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formattedDate}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-purple-600">${clientId}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${data.instNombre || ''} ${data.instApellidos || ''}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">${data.instEmail || ''}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${data.instTelefono || ''}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <div class="flex gap-2">
                        <button onclick="downloadClientExcel('${clientId}')" class="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-medium">
                            📊 Excel
                        </button>
                        <button onclick="deleteClientData('${clientId}')" class="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-xs font-medium">
                            🗑️ Eliminar
                        </button>
                    </div>
                </td>
            `;
            });
            statusEl.textContent = `Mostrando ${dataArray.length} registros en tiempo real.`;

        }, (error) => {
            console.error("Error en onSnapshot: ", error);
            const statusEl = document.getElementById('data-loading-status');
            if (statusEl) statusEl.textContent = "Error al cargar los datos en tiempo real.";
        });

    } catch (error) {
        console.error("Error al configurar listener de datos: ", error);
        statusEl.textContent = "Error al conectar con la base de datos.";
    }
}

/** Exporta los datos a Excel con pestañas por página. */
/** Descarga Excel de un cliente específico organizado por pestañas/páginas */
window.downloadClientExcel = async function (clientId) {
    if (!db) {
        showMessageBox("Error", "Base de datos no disponible");
        return;
    }

    try {
        const clientDocRef = doc(db, 'clientes', clientId);
        const docSnap = await getDoc(clientDocRef);

        if (!docSnap.exists()) {
            showMessageBox("Error", "No se encontraron datos para este cliente");
            return;
        }

        const data = docSnap.data();

        // Obtener fecha de última actualización
        const lastUpdate = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
        const formattedUpdateDate = lastUpdate.toLocaleDateString('es-ES', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        // Crear libro de Excel
        const wb = XLSX.utils.book_new();

        // === INFORMACIÓN DEL CLIENTE ===
        const wsInfoData = [
            ["INFORMACIÓN DEL CLIENTE"],
            [],
            ["ID Cliente", clientId],
            ["Última Actualización", formattedUpdateDate],
            ["Empresa", `${data.instNombre || ''} ${data.instApellidos || ''}`],
            ["Email", data.instEmail || ''],
            ["Teléfono", data.instTelefono || ''],
            [],
            ["Este documento contiene la última versión de los datos del cliente"],
            ["Fecha de exportación:", new Date().toLocaleDateString('es-ES', {
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            })]
        ];
        const wsInfo = XLSX.utils.aoa_to_sheet(wsInfoData);
        XLSX.utils.book_append_sheet(wb, wsInfo, "Información");

        // === PÁGINA 1: CONTACTOS ===
        const ws1Data = [
            ["CONTACTOS"],
            [],
            ["Representante Institucional"],
            ["Campo", "Valor"],
            ["NIF", data.instNIF || ''],
            ["Nombre", data.instNombre || ''],
            ["Apellidos", data.instApellidos || ''],
            ["Cargo", data.instCargo || ''],
            ["Teléfono", data.instTelefono || ''],
            ["Email", data.instEmail || ''],
            [],
            ["Contacto Técnico"],
            ["Campo", "Valor"],
            ["Nombre", data.tecNombre || ''],
            ["Apellidos", data.tecApellidos || ''],
            ["Cargo", data.tecCargo || ''],
            [],
            ["Contacto Financiero"],
            ["Campo", "Valor"],
            ["Nombre", data.finNombre || ''],
            ["Apellidos", data.finApellidos || ''],
            ["Cargo", data.finCargo || '']
        ];
        const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
        XLSX.utils.book_append_sheet(wb, ws1, "Página 1");

        // === PÁGINA 2: DIRECCIÓN ===
        const ws2Data = [
            ["DIRECCIÓN"],
            [],
            ["Dirección de Desarrollo"],
            ["Campo", "Valor"],
            ["Tipo de Vía", data.dirTipoVia || ''],
            ["Dirección", data.dirDireccion || ''],
            ["Número", data.dirNumero || ''],
            ["Código Postal", data.dirCP || ''],
            ["Provincia", data.dirProvincia || ''],
            ["Localidad", data.dirLocalidad || ''],
            ["Teléfono", data.dirTelefono || ''],
            ["Email", data.dirEmail || ''],
            [],
            ["Dirección de Notificaciones"],
            ["Campo", "Valor"],
            ["Tipo de Vía", data.dirNotifTipoVia || ''],
            ["Dirección", data.dirNotifDireccion || ''],
            ["Número", data.dirNotifNumero || ''],
            ["Código Postal", data.dirNotifCP || ''],
            ["Provincia", data.dirNotifProvincia || ''],
            ["Localidad", data.dirNotifLocalidad || ''],
            ["Teléfono", data.dirNotifTelefono || ''],
            ["Email", data.dirNotifEmail || '']
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
        XLSX.utils.book_append_sheet(wb, ws2, "Página 2");

        // === PÁGINA 3: ORGANIZACIÓN ===
        const ws3Data = [
            ["ORGANIZACIÓN"],
            [],
            ["Capital Social"],
            ["Campo", "Valor"],
            ["Año de Constitución", data.orgAnoCapital || ''],
            ["Capital Social", data.orgCapitalSocial || ''],
            [],
            ["Composición Accionarial"],
            ["Nombre/Razón Social", "CIF", "% Participación", "Pyme", "Nacionalidad"]
        ];
        if (data.accionarial && Array.isArray(data.accionarial)) {
            data.accionarial.forEach(acc => {
                ws3Data.push([
                    acc.nombre || '',
                    acc.cif || '',
                    acc.pct || '',
                    acc.pyme || '',
                    acc.nacionalidad || ''
                ]);
            });
        } else {
            ws3Data.push(["(Sin datos)"]);
        }
        const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
        XLSX.utils.book_append_sheet(wb, ws3, "Página 3");

        // === PÁGINA 4: RECURSOS HUMANOS ===
        const ws4Data = [
            ["RECURSOS HUMANOS"],
            []
        ];
        if (data.recursosHumanos && Array.isArray(data.recursosHumanos)) {
            data.recursosHumanos.forEach(rh => {
                ws4Data.push([`Año ${rh.year || ''}`]);
                ws4Data.push(["Categoría", "Hombres", "Mujeres", "Total"]);
                ws4Data.push(["Personal Investigador - Doctor", rh.inv_doc_h || '', rh.inv_doc_m || '', rh.inv_doc_total || '']);
                ws4Data.push(["Personal Investigador - Titulado", rh.inv_tit_h || '', rh.inv_tit_m || '', rh.inv_tit_total || '']);
                ws4Data.push(["Técnicos", rh.tec_h || '', rh.tec_m || '', rh.tec_total || '']);
                ws4Data.push(["Auxiliar", rh.aux_h || '', rh.aux_m || '', rh.aux_total || '']);
                ws4Data.push(["Otros", rh.otros_h || '', rh.otros_m || '', rh.otros_total || '']);
                ws4Data.push(["TOTAL", rh.total_h || '', rh.total_m || '', rh.total_total || '']);
                ws4Data.push([]);
            });
        } else {
            ws4Data.push(["(Sin datos)"]);
        }
        const ws4 = XLSX.utils.aoa_to_sheet(ws4Data);
        XLSX.utils.book_append_sheet(wb, ws4, "Página 4");

        // === PÁGINA 5: RECURSOS I+D ===
        const ws5Data = [
            ["RECURSOS DESTINADOS A I+D"],
            []
        ];

        if (data.recursosID && Array.isArray(data.recursosID) && data.recursosID.length > 0) {
            // Obtener años ordenados
            const years = data.recursosID.map(r => r.year).sort((a, b) => a - b);
            const currentYear = new Date().getFullYear();
            const historicos = years.filter(y => y <= currentYear - 1);
            const previstos = years.filter(y => y >= currentYear);

            // Encabezado de sección
            const headerRow1 = ["Concepto"];
            if (historicos.length > 0) {
                headerRow1.push(...Array(historicos.length).fill("HISTÓRICO"));
            }
            if (previstos.length > 0) {
                headerRow1.push(...Array(previstos.length).fill("PREVISTOS"));
            }
            ws5Data.push(headerRow1);

            // Encabezado de años
            const headerRow2 = [""];
            years.forEach(year => headerRow2.push(year));
            ws5Data.push(headerRow2);

            // Filas de datos
            const rows = [
                { label: 'Inmovilizado Material', field: 'inm_mat' },
                { label: '  Terrenos y edificios', field: 'terrenos' },
                { label: '  Aparatos y equipos', field: 'aparatos' },
                { label: 'TOTAL INMOVILIZADO MATERIAL', field: 'total_inm' },
                { label: 'Inversiones Activos Fijos Materiales', field: 'inv_activos' },
                { label: '  Terrenos y edificios', field: 'inv_terrenos' },
                { label: '  Aparatos y equipos', field: 'inv_aparatos' },
                { label: 'Gastos Corrientes', field: 'gastos_corr' },
                { label: '  Personal', field: 'personal' },
                { label: '  Materiales', field: 'materiales' },
                { label: '  Colaboraciones externas y otros gastos', field: 'colaboraciones' },
                { label: 'TOTAL INVERSIONES GASTOS', field: 'total_inv_gastos' }
            ];

            rows.forEach(row => {
                const dataRow = [row.label];
                years.forEach(year => {
                    const yearData = data.recursosID.find(r => r.year === year);
                    dataRow.push(yearData ? (yearData[row.field] || '0,00') : '0,00');
                });
                ws5Data.push(dataRow);
            });
        } else {
            ws5Data.push(["(Sin datos)"]);
        }

        const ws5 = XLSX.utils.aoa_to_sheet(ws5Data);
        XLSX.utils.book_append_sheet(wb, ws5, "Página 5");

        // === PÁGINA 6: PRODUCTOS/SERVICIOS ===
        const ws6Data = [
            ["PRODUCTOS/SERVICIOS"],
            [],
            ["Producto/Servicio", "% Ventas Totales", "% Ventas Nacionales", "% Ventas Exportación"]
        ];
        if (data.productos && Array.isArray(data.productos)) {
            data.productos.forEach(prod => {
                ws6Data.push([
                    prod.nombre || '',
                    prod.ventas || '',
                    prod.nac || '',
                    prod.exp || ''
                ]);
            });
        } else {
            ws6Data.push(["(Sin datos)"]);
        }
        const ws6 = XLSX.utils.aoa_to_sheet(ws6Data);
        XLSX.utils.book_append_sheet(wb, ws6, "Página 6");

        // === PÁGINA 7: DATOS DE LA EMPRESA ===
        const ws7Data = [
            ["DATOS DE LA EMPRESA"],
            [],
            ["Campo", "Valor"],
            ["Tipo de Entidad", data.entidadTipo || ''],
            ["Tamaño de la Empresa", data.entidadTamaño || ''],
            ["Efectivos", data.ent_efectivos || ''],
            ["Volumen de Negocio", data.ent_volumen_negocio || ''],
            ["Balance General", data.ent_balance_general || '']
        ];
        const ws7 = XLSX.utils.aoa_to_sheet(ws7Data);
        XLSX.utils.book_append_sheet(wb, ws7, "Página 7");

        // === PÁGINA 8: DATOS BANCARIOS ===
        const ws8Data = [
            ["DATOS BANCARIOS"],
            [],
            ["Campo", "Valor"],
            ["IBAN", data.bankIBAN || ''],
            ["Entidad", data.bankEntidad || ''],
            ["Oficina", data.bankOficina || ''],
            ["DC", data.bankDC || ''],
            ["Número de Cuenta", data.bankNumero || '']
        ];
        const ws8 = XLSX.utils.aoa_to_sheet(ws8Data);
        XLSX.utils.book_append_sheet(wb, ws8, "Página 8");

        // === PÁGINA 9: CONDICIONES ===
        const ws9Data = [
            ["CONDICIONES"],
            [],
            ["Estado", "Aceptada"],
            ["Todas las Condiciones Aceptadas", data.acceptAllConditions ? 'Sí' : 'No']
        ];
        const ws9 = XLSX.utils.aoa_to_sheet(ws9Data);
        XLSX.utils.book_append_sheet(wb, ws9, "Página 9");

        // Generar y descargar el archivo Excel
        const dateStr = new Date().toISOString().slice(0, 10);
        const safeName = clientId.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
        XLSX.writeFile(wb, `cliente_${safeName}_${dateStr}.xlsx`);

        showMessageBox("Exportación Exitosa", `Excel descargado para el cliente: ${clientId}`);

    } catch (error) {
        console.error("Error descargando Excel:", error);
        showMessageBox("Error", "No se pudo descargar el Excel del cliente: " + error.message);
    }
}

window.exportToCSV = function () {
    if (currentData.length === 0) {
        showMessageBox("Sin Datos", "No hay datos para exportar.");
        return;
    }

    const headers = Object.keys(currentData[0]).filter(key => key !== 'timestampSort');
    const csvRows = [];

    csvRows.push(headers.join(';'));

    for (const row of currentData) {
        const values = headers.map(header => {
            const value = row[header];
            const escaped = ('' + value).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(';'));
    }

    const csvString = csvRows.join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvString], { type: 'text/csv;charset=utf-8;' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `datos_clientes_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showMessageBox("Exportación Exitosa", `Se ha generado el archivo CSV ("datos_clientes_${dateStr}.csv") que puedes abrir con Excel.`);
}

/**
 * Elimina los datos de un cliente después de guardar un registro histórico
 */
window.deleteClientData = async function (clientId) {
    if (!db) {
        showMessageBox("Error", "Base de datos no disponible");
        return;
    }

    try {
        // Confirmar la eliminación
        const confirmed = await showConfirmDialog(
            "¿Eliminar Cliente?",
            `¿Está seguro de que desea eliminar los datos del cliente: ${clientId}?\n\nSe descargará automáticamente una copia en Excel antes de eliminar.`
        );

        if (!confirmed) return;

        // 1. Descargar automáticamente el Excel del cliente antes de eliminar
        console.log('📥 Descargando Excel del cliente antes de eliminar...');
        await downloadClientExcel(clientId);

        // Pequeña pausa para asegurar que la descarga se complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. Eliminar el documento de la colección principal
        const clientDocRef = doc(db, 'clientes', clientId);
        await deleteDoc(clientDocRef);

        console.log('✅ Cliente eliminado de la base de datos');

        showMessageBox("Éxito", `Cliente ${clientId} eliminado correctamente.\n\nSe ha descargado una copia en Excel con la última versión de los datos.`);

    } catch (error) {
        console.error("Error al eliminar cliente:", error);
        showMessageBox("Error", "No se pudo eliminar el cliente: " + error.message);
    }
}

/**
 * Muestra un diálogo de confirmación
 */
async function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('message-modal');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-content');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
            console.error('Elementos del modal no encontrados');
            resolve(false);
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = 'Sí, eliminar';
        confirmBtn.style.backgroundColor = '#ef4444'; // Rojo para acción destructiva
        cancelBtn.classList.remove('hidden'); // Mostrar botón cancelar

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Handler para confirmar
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        // Handler para cancelar
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        // Cleanup function
        const cleanup = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleModalClick);
            confirmBtn.textContent = 'Aceptar'; // Restaurar texto
            confirmBtn.style.backgroundColor = ''; // Restaurar color
            cancelBtn.classList.add('hidden'); // Ocultar botón cancelar
        };

        // Handler para clic en el modal (cerrar si se hace clic fuera)
        const handleModalClick = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };

        // Añadir event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleModalClick);
    });
}

// ==================== GESTIÓN DE USUARIOS ====================

/**
 * Carga y muestra la lista de usuarios en el panel de administración
 */
async function loadUsersList() {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;

    try {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Cargando usuarios...</td></tr>';

        const usuariosRef = collection(db, 'usuarios');
        const querySnapshot = await getDocs(usuariosRef);

        if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">No hay usuarios registrados.</td></tr>';
            return;
        }

        tableBody.innerHTML = '';

        querySnapshot.forEach((doc) => {
            const user = doc.data();
            const userId = doc.id;
            const createdDate = user.createdAt?.toDate ?
                user.createdAt.toDate().toLocaleDateString('es-ES', {
                    year: 'numeric', month: '2-digit', day: '2-digit'
                }) : 'N/A';

            const estado = user.activo ?
                '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">Activo</span>' :
                '<span class="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">Inactivo</span>';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-4 py-3 text-sm text-gray-900">${userId}</td>
                <td class="px-4 py-3 text-sm font-mono text-gray-700">${user.password || ''}</td>
                <td class="px-4 py-3 text-sm">${estado}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${createdDate}</td>
                <td class="px-4 py-3 text-sm">
                    <div class="flex gap-2">
                        <button onclick="toggleUserStatus('${userId}', ${!user.activo})" 
                            class="px-3 py-1 ${user.activo ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} text-white text-xs rounded-md transition-colors">
                            ${user.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button onclick="deleteUser('${userId}')" 
                            class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md transition-colors">
                            Eliminar
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);
        });

    } catch (error) {
        console.error("Error al cargar usuarios:", error);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-red-500">Error al cargar usuarios.</td></tr>';
    }
}

/**
 * Crea un nuevo usuario
 */
async function createNewUser() {
    const userIdInput = document.getElementById('new-user-id');
    const passwordInput = document.getElementById('new-user-password');

    if (!userIdInput || !passwordInput) return;

    const userId = userIdInput.value.trim();
    const password = passwordInput.value.trim();

    if (!userId || !password) {
        showMessageBox("Error", "Debe completar ambos campos: ID Cliente y Contraseña.");
        return;
    }

    // Validar que el ID no sea solo números o muy corto
    if (userId.length < 3) {
        showMessageBox("Error", "El ID del cliente debe tener al menos 3 caracteres.");
        return;
    }

    if (password.length < 6) {
        showMessageBox("Error", "La contraseña debe tener al menos 6 caracteres.");
        return;
    }

    try {
        // Verificar si ya existe un usuario con ese ID
        const userDocRef = doc(db, 'usuarios', userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            showMessageBox("Error", "Ya existe un usuario con ese ID. Por favor, use otro ID.");
            return;
        }

        // Verificar si ya existe esa contraseña
        const usuariosRef = collection(db, 'usuarios');
        const q = query(usuariosRef, where('password', '==', password));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            showMessageBox("Error", "Esa contraseña ya está en uso. Por favor, use otra contraseña.");
            return;
        }

        // Crear el nuevo usuario
        await setDoc(userDocRef, {
            password: password,
            activo: true,
            createdAt: serverTimestamp(),
            createdBy: 'admin'
        });

        // Crear también el documento del cliente en la colección 'clientes'
        const clientDocRef = doc(db, 'clientes', userId);
        await setDoc(clientDocRef, {
            timestamp: serverTimestamp(),
            // Campos iniciales vacíos
            instNIF: '',
            instNombre: '',
            instApellidos: ''
        });

        showMessageBox("Éxito", `Usuario creado correctamente.\n\nID: ${userId}\nContraseña: ${password}\n\nEnvíe esta contraseña al cliente para que pueda acceder.`);

        // Limpiar formulario
        userIdInput.value = '';
        passwordInput.value = '';

        // Recargar lista de usuarios
        await loadUsersList();

    } catch (error) {
        console.error("Error al crear usuario:", error);
        showMessageBox("Error", "No se pudo crear el usuario: " + error.message);
    }
}

/**
 * Activa o desactiva un usuario
 */
async function toggleUserStatus(userId, newStatus) {
    try {
        const userDocRef = doc(db, 'usuarios', userId);
        await setDoc(userDocRef, {
            activo: newStatus
        }, { merge: true });

        showMessageBox("Éxito", `Usuario ${newStatus ? 'activado' : 'desactivado'} correctamente.`);
        await loadUsersList();

    } catch (error) {
        console.error("Error al cambiar estado del usuario:", error);
        showMessageBox("Error", "No se pudo cambiar el estado del usuario: " + error.message);
    }
}

/**
 * Elimina un usuario
 */
async function deleteUser(userId) {
    const confirmed = await showConfirmDialog(
        "Confirmar Eliminación",
        `¿Está seguro de que desea eliminar el usuario "${userId}"?\n\nEsto NO eliminará los datos del cliente, solo su acceso al sistema.`
    );

    if (!confirmed) return;

    try {
        const userDocRef = doc(db, 'usuarios', userId);
        await deleteDoc(userDocRef);

        showMessageBox("Éxito", `Usuario "${userId}" eliminado correctamente.\n\nLos datos del cliente se conservan en la base de datos.`);
        await loadUsersList();

    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        showMessageBox("Error", "No se pudo eliminar el usuario: " + error.message);
    }
}

// Exponer funciones al ámbito global
window.createNewUser = createNewUser;
window.toggleUserStatus = toggleUserStatus;
window.deleteUser = deleteUser;

// Variables de contadores dinámicos (inicializadas a 1, se actualizarán al cargar)
let accionarialCount = 1;
let consejoCount = 1;
let filialCount = 1;
let productoCount = 1;

/**
 * Función para añadir nuevos grupos de accionistas dinámicamente
 */
function addAccionarialGrupo() {
    accionarialCount++;
    const container = document.getElementById('accionarial-container');
    const bgColor = accionarialCount % 2 === 0 ? '#f3f4f6' : 'var(--card)';

    const nuevoGrupo = document.createElement('div');
    nuevoGrupo.className = 'accionarial-grupo form-grid md:grid-cols-2';
    nuevoGrupo.style.cssText = `background-color: ${bgColor}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

    nuevoGrupo.innerHTML = `
        <div>
            <label for="acc_${accionarialCount}_nombre">Nombre / Razón Social: <span class="text-red-500">*</span></label>
            <input id="acc_${accionarialCount}_nombre" type="text" class="input-default">
        </div>
        <div>
            <label for="acc_${accionarialCount}_cif">CIF: <span class="text-red-500">*</span></label>
            <input id="acc_${accionarialCount}_cif" type="text" class="input-default">
        </div>
        <div style="position: relative;">
            <label for="acc_${accionarialCount}_pct">% Participación: <span class="text-red-500">*</span></label>
            <input id="acc_${accionarialCount}_pct" type="number" step="0.1" class="input-default" oninput="validatePercentageField(this)">
        </div>
        <div>
            <label for="acc_${accionarialCount}_pyme">Pyme: <span class="text-red-500">*</span></label>
            <select id="acc_${accionarialCount}_pyme" class="input-default">
                <option value="">--</option>
                <option value="Sí">Sí</option>
                <option value="No">No</option>
                <option value="No aplica">No aplica</option>
            </select>
        </div>
        <div>
            <label for="acc_${accionarialCount}_nacionalidad">Nacionalidad: <span class="text-red-500">*</span></label>
            <input id="acc_${accionarialCount}_nacionalidad" type="text" class="input-default">
        </div>
        <button type="button" onclick="removeAccionarialGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">
            − Eliminar
        </button>
    `;

    container.appendChild(nuevoGrupo);

    // Validar participación después de agregar
    setTimeout(() => {
        validarParticipacionAccionarial();
    }, 100);
}

/**
 * Función para eliminar grupos de accionistas
 */
function removeAccionarialGrupo(button) {
    const parent = button.parentElement;
    if (!parent) return;
    parent.remove();

    // Validar participación después de eliminar
    setTimeout(() => {
        validarParticipacionAccionarial();
    }, 100);
}

/**
 * Valida que la suma de porcentajes de participación accionarial sea 100%
 */
function validarParticipacionAccionarial() {
    // Marcar que estamos validando participación para evitar interferencias
    window.validatingParticipacion = true;

    const container = document.getElementById('accionarial-container');
    if (!container) {
        window.validatingParticipacion = false;
        return;
    }

    const grupos = container.querySelectorAll('.accionarial-grupo');
    let sumaTotal = 0;
    let hayDatos = false;
    const camposPorcentaje = [];

    grupos.forEach(grupo => {
        const pctEl = grupo.querySelector('[id*="_pct"]');
        if (pctEl) {
            // No validar si el usuario está escribiendo en este campo
            if (document.activeElement === pctEl) {
                window.validatingParticipacion = false;
                return;
            }

            camposPorcentaje.push(pctEl);
            const valor = parseFloat(pctEl.value) || 0;
            if (pctEl.value && pctEl.value.trim() !== '') {
                hayDatos = true;
                sumaTotal += valor;
            }
        }
    });

    // Solo validar si hay datos
    if (!hayDatos) {
        camposPorcentaje.forEach(campo => {
            setFieldDefaultWithTooltip(campo);
        });
        setStepError(3, false);
        window.validatingParticipacion = false;
        return;
    }

    // Redondear a 1 decimal
    sumaTotal = Math.round(sumaTotal * 10) / 10;

    if (sumaTotal !== 100) {
        // Marcar todos los campos de porcentaje como inválidos con tooltip
        camposPorcentaje.forEach(campo => {
            if (campo.value && campo.value.trim() !== '') {
                setFieldErrorWithTooltip(campo, `La suma debe ser 100% (Actual: ${sumaTotal}%)`);
            }
        });

        // Mostrar mensaje de error general en la página
        showPageError(3, `⚠️ La suma de % de Participación debe ser 100%. Actual: ${sumaTotal}%`);

        setStepError(3, true);
        setStepCompleted(3, false);
    } else {
        // Marcar todos los campos como válidos
        camposPorcentaje.forEach(campo => {
            if (campo.value && campo.value.trim() !== '') {
                setFieldValidWithTooltip(campo);
            }
        });

        // Limpiar mensaje de error general
        clearPageError(3);

        // Verificar validación general de página 3 antes de marcar como completada
        const validation = validatePage3();
        const isPageValid = validation.isValid;

        setStepError(3, !isPageValid);
        setStepCompleted(3, isPageValid);
    }

    // Marcar que terminamos la validación
    window.validatingParticipacion = false;
}

window.addAccionarialGrupo = addAccionarialGrupo;
window.removeAccionarialGrupo = removeAccionarialGrupo;
window.validarParticipacionAccionarial = validarParticipacionAccionarial;

/**
 * Función para añadir nuevos miembros del consejo dinámicamente
 */
function addConsejoGrupo() {
    consejoCount++;
    const container = document.getElementById('consejo-container');
    const bgColor = consejoCount % 2 === 0 ? '#f3f4f6' : 'var(--card)';

    const nuevoGrupo = document.createElement('div');
    nuevoGrupo.className = 'consejo-grupo form-grid md:grid-cols-2';
    nuevoGrupo.style.cssText = `background-color: ${bgColor}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

    nuevoGrupo.innerHTML = `
        <div>
            <label for="consejo_${consejoCount}_nombre">Nombre: <span class="text-red-500">*</span></label>
            <input id="consejo_${consejoCount}_nombre" type="text" class="input-default">
        </div>
        <div>
            <label for="consejo_${consejoCount}_cif">NIF/CIF: <span class="text-red-500">*</span></label>
            <input id="consejo_${consejoCount}_cif" type="text" class="input-default" oninput="validateField(this, 'nif')">
        </div>
        <div>
            <label for="consejo_${consejoCount}_cargo">Cargo: <span class="text-red-500">*</span></label>
            <input id="consejo_${consejoCount}_cargo" type="text" class="input-default">
        </div>
        <div>
            <label for="consejo_${consejoCount}_nacionalidad">Nacionalidad: <span class="text-red-500">*</span></label>
            <input id="consejo_${consejoCount}_nacionalidad" type="text" class="input-default">
        </div>
        <button type="button" onclick="removeConsejoGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">
            − Eliminar
        </button>
    `;

    container.appendChild(nuevoGrupo);
}

/**
 * Función para eliminar miembros del consejo
 */
function removeConsejoGrupo(button) {
    const parent = button.parentElement;
    if (!parent) return;
    parent.remove();
}

window.addConsejoGrupo = addConsejoGrupo;
window.removeConsejoGrupo = removeConsejoGrupo;

/**
 * Función para añadir nuevas filiales dinámicamente
 */
function addFilialGrupo() {
    filialCount++;
    const container = document.getElementById('filial-container');
    const bgColor = filialCount % 2 === 0 ? '#f3f4f6' : 'var(--card)';

    const nuevoGrupo = document.createElement('div');
    nuevoGrupo.className = 'filial-grupo form-grid md:grid-cols-2';
    nuevoGrupo.style.cssText = `background-color: ${bgColor}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

    nuevoGrupo.innerHTML = `
        <div>
            <label for="filial_${filialCount}_razon">Razón Social:</label>
            <input id="filial_${filialCount}_razon" type="text" class="input-default">
        </div>
        <div>
            <label for="filial_${filialCount}_cif">CIF:</label>
            <input id="filial_${filialCount}_cif" type="text" class="input-default">
        </div>
        <div>
            <label for="filial_${filialCount}_actividad">Actividad Principal:</label>
            <input id="filial_${filialCount}_actividad" type="text" class="input-default">
        </div>
        <div>
            <label for="filial_${filialCount}_pct">% Participación:</label>
            <input id="filial_${filialCount}_pct" type="number" step="0.1" class="input-default">
        </div>
        <div>
            <label for="filial_${filialCount}_pais">País:</label>
            <input id="filial_${filialCount}_pais" type="text" class="input-default">
        </div>
        <button type="button" onclick="removeFilialGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">
            − Eliminar
        </button>
    `;

    container.appendChild(nuevoGrupo);
}

/**
 * Función para eliminar filiales
 */
function removeFilialGrupo(button) {
    const parent = button.parentElement;
    if (!parent) return;
    parent.remove();
}

window.addFilialGrupo = addFilialGrupo;
window.removeFilialGrupo = removeFilialGrupo;

// Variables de contador de productos
// productoCount ya está declarado arriba

/**
 * Función para calcular el % de exportación automáticamente
 */
function calcularExportacion(productoId) {
    const ventasTotalesEl = document.getElementById(`prod${productoId}_ventas`);
    const ventasNacEl = document.getElementById(`prod${productoId}_nac`);
    const ventasExpEl = document.getElementById(`prod${productoId}_exp`);

    if (!ventasTotalesEl || !ventasNacEl || !ventasExpEl) return;

    const ventasNac = parseFloat(ventasNacEl.value) || 0;
    const exportacion = 100 - ventasNac;

    ventasExpEl.value = exportacion.toFixed(1);

    // Si el campo de ventas nacionales está válido (verde), poner exportación en verde también
    if (ventasNacEl.classList.contains('input-valid')) {
        ventasExpEl.classList.remove('input-invalid', 'input-default');
        ventasExpEl.classList.add('input-valid');
    } else {
        ventasExpEl.classList.remove('input-valid', 'input-invalid');
        ventasExpEl.classList.add('input-default');
    }

    // Disparar auto-guardado después de calcular
    if (datosYaCargados) {
        debouncedSave();
    }

    // Verificar si ahora todos los campos están verdes para actualizar el stepper
    setTimeout(() => {
        if (currentPage === 6) {
            validarTotalVentas();
        }
    }, 50);
}

/**
 * Función para añadir nuevos productos/servicios dinámicamente
 */
function addProductoGrupo() {
    productoCount++;
    const container = document.getElementById('productos-container');
    const bgColor = productoCount % 2 === 0 ? '#f3f4f6' : 'var(--card)';

    const nuevoGrupo = document.createElement('div');
    nuevoGrupo.className = 'producto-grupo';
    nuevoGrupo.style.cssText = `background-color: ${bgColor}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

    nuevoGrupo.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <label for="prod${productoCount}_nombre" style="font-weight: 700; display: block; margin-bottom: 0.5rem;">Producto/Servicio ${productoCount}: <span class="text-red-500">*</span></label>
            <input id="prod${productoCount}_nombre" type="text" class="input-default" placeholder="Nombre del producto o servicio" oninput="validateField(this, 'required'); debouncedValidatePage6();">
        </div>
        <div class="form-grid md:grid-cols-3" style="gap: 1rem;">
            <div>
                <label for="prod${productoCount}_ventas">% Ventas Totales: <span class="text-red-500">*</span></label>
                <input id="prod${productoCount}_ventas" type="text" class="input-default" oninput="validatePercentageField(this); validarTotalVentas();">
            </div>
            <div>
                <label for="prod${productoCount}_nac">% Ventas Nacionales: <span class="text-red-500">*</span></label>
                <input id="prod${productoCount}_nac" type="text" class="input-default" oninput="validatePercentageField(this); calcularExportacion(${productoCount}); debouncedValidatePage6();">
            </div>
            <div>
                <label for="prod${productoCount}_exp">% Ventas Exportación:</label>
                <input id="prod${productoCount}_exp" type="text" class="input-readonly" readonly style="background-color: #e5e7eb; color: #6b7280;">
            </div>
        </div>
        <button type="button" onclick="removeProductoGrupo(this)" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.75rem;">
            − Eliminar
        </button>
    `;

    container.appendChild(nuevoGrupo);

    // Validar después de añadir para actualizar el stepper
    validarTotalVentas();

    // Activar validación debounced para actualizar el stepper
    setTimeout(() => {
        debouncedValidatePage6();
    }, 100);
}

/**
 * Función para eliminar grupos de productos
 */
function removeProductoGrupo(button) {
    // Buscar el contenedor .producto-grupo que contiene este botón
    const productoGrupo = button.closest('.producto-grupo');
    if (!productoGrupo) {
        console.error('No se encontró el contenedor del producto');
        return;
    }

    // Eliminar todo el grupo del producto
    productoGrupo.remove();

    // Revalidar después de eliminar
    validarTotalVentas();

    // GUARDADO INMEDIATO (sin esperar el debounce) después de eliminar
    if (datosYaCargados) {
        console.log('💾 Guardando inmediatamente después de eliminar producto...');
        saveFormData(false);
    }
}

/**
 * Función para validar que la suma de % Ventas Totales sea 100%
 */
function validarTotalVentas() {
    const container = document.getElementById('productos-container');

    if (!container) return;

    // Solo ejecutar si estamos en la página 6
    if (currentPage !== 6) {
        return;
    }

    // Buscar todos los inputs de ventas totales
    const ventasInputs = container.querySelectorAll('input[id^="prod"][id$="_ventas"]');
    let sumaTotal = 0;
    let hayDatos = false;

    ventasInputs.forEach(input => {
        const valor = parseFloat(input.value) || 0;
        if (input.value && input.value.trim() !== '') {
            hayDatos = true;
        }
        sumaTotal += valor;
    });

    // Solo validar si hay al menos un campo con datos
    if (!hayDatos) {
        clearPageError(6);
        setStepError(6, false); // Quitar marca de error del stepper
        return;
    }

    // Redondear a 1 decimal para evitar problemas de precisión
    sumaTotal = Math.round(sumaTotal * 10) / 10;

    if (sumaTotal !== 100) {
        showPageError(6, `La suma de % Ventas Totales debe ser 100%. Actual: ${sumaTotal}%`);
        setStepError(6, true); // Marcar error en el stepper
        setStepCompleted(6, false);
    } else {
        // Verificar que TODOS los campos estén en verde antes de marcar la página como completa
        const todosVerdes = verificarTodosCamposVerdesProductos();
        clearPageError(6);
        setStepError(6, false); // Quitar marca de error del stepper
        setStepCompleted(6, todosVerdes);
    }
}

/**
 * Verifica que todos los campos de productos estén válidos (verdes)
 */
function verificarTodosCamposVerdesProductos() {
    const container = document.getElementById('productos-container');
    if (!container) return false;

    const grupos = container.querySelectorAll('.producto-grupo');
    if (grupos.length === 0) return false;

    let todosValidos = true;

    grupos.forEach((grupo, index) => {
        const num = index + 1;
        const nombreEl = document.getElementById(`prod${num}_nombre`);
        const ventasEl = document.getElementById(`prod${num}_ventas`);
        const nacEl = document.getElementById(`prod${num}_nac`);
        const expEl = document.getElementById(`prod${num}_exp`);

        // Verificar que todos los campos obligatorios estén llenos y válidos
        if (!nombreEl || !nombreEl.value.trim() || !nombreEl.classList.contains('input-valid')) {
            todosValidos = false;
        }
        if (!ventasEl || !ventasEl.value.trim() || !ventasEl.classList.contains('input-valid')) {
            todosValidos = false;
        }
        if (!nacEl || !nacEl.value.trim() || !nacEl.classList.contains('input-valid')) {
            todosValidos = false;
        }
        // El campo de exportación debe estar calculado y válido también
        if (!expEl || !expEl.value.trim() || !expEl.classList.contains('input-valid')) {
            todosValidos = false;
        }
    });

    return todosValidos;
}

/**
 * Renderizar productos iniciales (al menos 1)
 */
/** Renderiza productos desde datos guardados */
function renderProductos(productos) {
    if (!productos || productos.length === 0) {
        renderProductosIniciales();
        return;
    }

    const container = document.getElementById('productos-container');
    if (!container) return;

    container.innerHTML = '';
    clearPageError(6);
    setStepError(6, false);

    productos.forEach((prod, index) => {
        const num = index + 1;
        const grupo = document.createElement('div');
        grupo.className = 'producto-grupo';
        grupo.style.cssText = `background-color: var(--card); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

        const deleteButton = num > 1 ? `<button type="button" onclick="removeProductoGrupo(this)" style="padding: 0.4rem 0.8rem; background-color: var(--danger); color: white; border-radius: 0.375rem; border: none; font-size: 0.875rem; cursor: pointer;">Eliminar Producto ${num}</button>` : '';

        grupo.innerHTML = `
            <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
                <label for="prod${num}_nombre" style="font-weight: 700; display: block;">Producto/Servicio ${num}: <span class="text-red-500">*</span></label>
                ${deleteButton}
            </div>
            <div style="margin-bottom: 1rem;">
                <input id="prod${num}_nombre" type="text" class="input-default" placeholder="Nombre del producto o servicio" value="${prod.nombre || ''}" oninput="validateField(this, 'required')">
            </div>
            <div class="form-grid md:grid-cols-3" style="gap: 1rem;">
                <div>
                    <label for="prod${num}_ventas">% Ventas Totales: <span class="text-red-500">*</span></label>
                    <input id="prod${num}_ventas" type="text" class="input-default" oninput="validatePercentageField(this)" value="${prod.ventas || ''}">
                </div>
                <div>
                    <label for="prod${num}_nac">% Ventas Nacionales: <span class="text-red-500">*</span></label>
                    <input id="prod${num}_nac" type="text" class="input-default" oninput="validatePercentageField(this); calcularExportacion(${num})" value="${prod.nac || ''}">
                </div>
            <div>
                <label for="prod${num}_exp">% Ventas Exportación:</label>
                <input id="prod${num}_exp" type="text" class="input-readonly" readonly value="${prod.exp || ''}" style="background-color: #e5e7eb; color: #6b7280;">
            </div>
        </div>
        `;

        container.appendChild(grupo);        // Validar campos para restaurar estado visual (verde/rojo)
        const nombreEl = document.getElementById(`prod${num}_nombre`);
        if (nombreEl && nombreEl.value) validateField(nombreEl, 'required');

        const ventasEl = document.getElementById(`prod${num}_ventas`);
        if (ventasEl && ventasEl.value) validatePercentageField(ventasEl);

        const nacEl = document.getElementById(`prod${num}_nac`);
        if (nacEl && nacEl.value) {
            validatePercentageField(nacEl);
            // Recalcular exportación para restaurar el estado visual
            calcularExportacion(num);
        }
    });

    productoCount = productos.length;
}

function renderProductosIniciales() {
    const container = document.getElementById('productos-container');
    if (!container) return;

    // Limpiar el contenedor primero
    container.innerHTML = '';

    // Limpiar errores de página 6 antes de renderizar
    clearPageError(6);
    setStepError(6, false);

    // Agregar el primer producto por defecto (SIN botón eliminar)
    const primerGrupo = document.createElement('div');
    primerGrupo.className = 'producto-grupo';
    primerGrupo.style.cssText = `background-color: var(--card); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;

    primerGrupo.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <label for="prod1_nombre" style="font-weight: 700; display: block; margin-bottom: 0.5rem;">Producto/Servicio 1: <span class="text-red-500">*</span></label>
            <input id="prod1_nombre" type="text" class="input-default" placeholder="Nombre del producto o servicio" oninput="validateField(this, 'required'); debouncedValidatePage6();">
        </div>
        <div class="form-grid md:grid-cols-3" style="gap: 1rem;">
            <div>
                <label for="prod1_ventas">% Ventas Totales: <span class="text-red-500">*</span></label>
                <input id="prod1_ventas" type="text" class="input-default" oninput="validatePercentageField(this); validarTotalVentas();">
            </div>
            <div>
                <label for="prod1_nac">% Ventas Nacionales: <span class="text-red-500">*</span></label>
                <input id="prod1_nac" type="text" class="input-default" oninput="validatePercentageField(this); calcularExportacion(1); debouncedValidatePage6();">
            </div>
            <div>
                <label for="prod1_exp">% Ventas Exportación:</label>
                <input id="prod1_exp" type="text" class="input-readonly" readonly style="background-color: #e5e7eb; color: #6b7280;">
            </div>
        </div>
    `;

    container.appendChild(primerGrupo);
    productoCount = 1;
}

window.addProductoGrupo = addProductoGrupo;
window.removeProductoGrupo = removeProductoGrupo;
window.calcularExportacion = calcularExportacion;
window.validarTotalVentas = validarTotalVentas;
window.debouncedSave = debouncedSave;
// window.datosYaCargados se actualiza dinámicamente en cada cambio de estado

/**
 * Valida la página 9 (Declaraciones)
 * Comportamiento: gris si no se ha tocado, rojo si hay datos pero incompleto, verde si completo
 */
function validatePage9() {
    // Validar los selects obligatorios
    const selectsIds = [
        'decl_ayuda_solicitada',
        'decl_ayuda_europea',
        'decl_entidad_crisis',
        'decl_plan_igualdad',
        'decl_protocolo_acoso',
        'decl_distintivo_igualdad',
        'decl_medidas_conciliacion',
        'decl_reserva_discapacidad',
        'decl_accesibilidad_instalaciones',
        'decl_impacto_medioambiental',
        'decl_responsable_mujer'
    ];
    
    // Validar los checkboxes obligatorios (TODOS los de la página 9)
    const checkboxesIds = [
        'decl_cumple_requisitos',
        'decl_no_inicio_previo',
        'decl_cumple_normativa',
        'decl_sujeto_control',
        'decl_representante_agrupacion',
        'decl_respeta_dnsh',
        'decl_no_deudas',
        'decl_autoriza_cesion_datos',
        'decl_feder_personal_ca',
        'decl_feder_conoce_condiciones',
        'decl_feder_capacidad',
        'decl_feder_cumple_reglamento',
        'decl_feder_publicidad',
        'decl_feder_licencia_ue',
        'decl_feder_conoce_minoracion',
        'decl_feder_operacion_no_concluida',
        'decl_feder_conservar_docs',
        'decl_feder_registros_contables',
        'decl_feder_conoce_antifraude',
        'decl_feder_informado_medidas',
        'decl_feder_difundir_comunicado',
        'decl_feder_durabilidad',
        'decl_feder_indicadores',
        'decl_feder_comprobacion',
        'decl_feder_cooperacion',
        'decl_feder_analisis_riesgos',
        'decl_feder_lista_operaciones',
        'decl_feder_accesibilidad',
        'decl_feder_autoriza_facilitar',
        // Lista comprobación proyecto
        'decl_proy_autorizaciones',
        'decl_proy_normas_ambientales',
        'decl_proy_desarrollo_sostenible',
        'decl_proy_dimension_genero',
        'decl_proy_impacto_genero',
        'decl_proy_eliminar_desigualdades',
        'decl_proy_lucha_discriminacion',
        'decl_proy_ayuda_reembolsable',
        // Cumplimiento FEDER proyecto
        'decl_feder_proy_susceptible_cofinanciar',
        'decl_feder_proy_uso_civil'
    ];
    
    let selectsCompleted = 0;
    let checkboxesChecked = 0;
    
    // Contar selects completados
    for (const id of selectsIds) {
        const select = document.getElementById(id);
        if (select && select.value) {
            selectsCompleted++;
        }
    }
    
    // Contar checkboxes marcados
    for (const id of checkboxesIds) {
        const checkbox = document.getElementById(id);
        if (checkbox && checkbox.checked) {
            checkboxesChecked++;
        }
    }
    
    const totalFields = selectsIds.length + checkboxesIds.length;
    const completedFields = selectsCompleted + checkboxesChecked;
    const hasAnyData = completedFields > 0;
    const isComplete = completedFields === totalFields;
    
    if (!hasAnyData) {
        // No se ha tocado ningún campo: sin color (gris)
        setStepError(9, false);
        setStepCompleted(9, false);
    } else if (isComplete) {
        // Todos los campos completados: verde
        setStepError(9, false);
        setStepCompleted(9, true);
    } else {
        // Hay datos pero incompleto: rojo
        setStepError(9, true);
        setStepCompleted(9, false);
    }
    
    return isComplete;
}

/**
 * Valida la página 10 (Condiciones)
 * Retorna true si todas las condiciones están marcadas
 */
function validatePage10() {
    const acceptAllCheckbox = document.getElementById('acceptAllConditions');

    if (!acceptAllCheckbox) {
        return false;
    }

    const isChecked = acceptAllCheckbox.checked;

    // Si está marcado -> completado (verde)
    // Si no está marcado -> sin completar (sin error)
    if (isChecked) {
        setStepError(10, false);
        setStepCompleted(10, true);
    } else {
        setStepError(10, false);
        setStepCompleted(10, false);
    }

    return isChecked;
}

/**
 * Función para actualizar el título del ejercicio anterior según el periodo de referencia
 */
function actualizarEjercicioAnterior() {
    const periodoSelect = document.getElementById('entidadPeriodoRef');
    const titleElement = document.getElementById('ejercicioAnteriorTitle');

    if (!periodoSelect || !titleElement) return;

    const periodoSeleccionado = parseInt(periodoSelect.value);

    if (periodoSeleccionado && !isNaN(periodoSeleccionado)) {
        const ejercicioAnterior = periodoSeleccionado - 1;
        titleElement.textContent = `Ejercicio anterior ${ejercicioAnterior}`;
    } else {
        titleElement.textContent = 'Ejercicio anterior';
    }

    // Forzar guardado al cambiar
    if (datosYaCargados) {
        debouncedSave();
    }
}

/**
 * Función para validar que un campo solo contenga números enteros (sin decimales)
 */
function validateIntegerField(el) {
    if (!el) return false;
    const v = (el.value || '').toString().trim();

    // vacío -> estado por defecto
    if (v === '') {
        el.classList.remove('input-valid', 'input-invalid');
        el.classList.add('input-default');
        el.removeAttribute('data-error');
        return true;
    }

    // Verificar si contiene caracteres inválidos (solo números enteros, sin punto ni coma)
    const hasInvalidChars = /[^0-9]/.test(v);

    if (hasInvalidChars) {
        // Contiene letras, símbolos o decimales
        el.classList.remove('input-valid', 'input-default');
        el.classList.add('input-invalid');
        el.setAttribute('data-error', 'Solo números enteros');
        return false;
    }

    // Intentar convertir a número entero
    const numValue = parseInt(v, 10);

    if (Number.isNaN(numValue)) {
        el.classList.remove('input-valid', 'input-default');
        el.classList.add('input-invalid');
        el.setAttribute('data-error', 'Número entero inválido');
        return false;
    } else {
        el.classList.remove('input-invalid', 'input-default');
        el.classList.add('input-valid');
        el.removeAttribute('data-error');
        return true;
    }
}

window.actualizarEjercicioAnterior = actualizarEjercicioAnterior;
window.validateIntegerField = validateIntegerField;




// Exponer funciones globales mínimas
window.setView = setView;
// window.promptAdminKey ya está definida arriba directamente en window
window.saveFormData = saveFormData;
window.navigatePage = navigatePage;
window.logout = logout;
window.goToPage = async function (pageNumber) {
    if (isSaving) return;
    if (typeof pageNumber !== 'number' || pageNumber < 1 || pageNumber > TOTAL_PAGES) return;
    await saveFormData(false);
    currentPage = pageNumber;
    showPage(pageNumber);
};

// Exponer validaciones (para oninput en index.html)
window.validateField = validateField;
window.validateNumericField = validateNumericField;
window.validatePercentageField = validatePercentageField;
window.validatePhoneField = validatePhoneField;
window.validateCurrencyField = validateCurrencyField;
window.validateIBAN = validateIBAN;
window.validatePage3 = validatePage3;
window.validatePage4 = validatePage4;
window.validatePage8 = validatePage8;
window.validarParticipacionAccionarial = validarParticipacionAccionarial;
window.handleCPInput = handleCPInput;
window.handleCPInputNotif = handleCPInputNotif;

// Inicializar la aplicación
window.onload = function () {
    // Inicializar sistema de login
    initLoginSystem();

    // Referenciar los botones de navegación
    prevBtn = document.getElementById('prev-btn');
    nextBtn = document.getElementById('next-btn');
    saveBtn = document.getElementById('save-btn');
    pageIndicator = document.getElementById('page-indicator'); // Aunque esté oculto, lo referenciamos

    // Render Recursos Humanos y Recursos I+D inicialmente (vacío), se actualizará al cargar datos
    renderRecursosHumanos([]);
    renderRecursosID([]);

    // NO renderizar productos aquí - se renderizarán al cargar datos o cuando el usuario navegue a la página 6
    // renderProductosIniciales();

    // Limpiar todos los errores de página al inicializar
    for (let i = 1; i <= TOTAL_PAGES; i++) {
        clearPageError(i);
        setStepError(i, false);
    }

    // Inicializar contadores para elementos dinámicos
    accionarialCount = 1;
    consejoCount = 1;
    filialCount = 1;
    productoCount = 1;

    // Añadir el listener para el auto-guardado a todo el formulario
    const dataForm = document.getElementById('data-form');
    if (dataForm) {
        // Proteger campos mientras el usuario los está editando
        dataForm.addEventListener('focusin', (e) => {
            if (e.target && e.target.tagName === 'INPUT') {
                e.target.setAttribute('data-user-editing', 'true');
            }
        });

        dataForm.addEventListener('focusout', (e) => {
            if (e.target && e.target.tagName === 'INPUT') {
                // Quitar protección después de un breve delay
                setTimeout(() => {
                    e.target.removeAttribute('data-user-editing');
                }, 500);

                // Si es un campo de % participación, validar inmediatamente al salir
                if (e.target.id && e.target.id.includes('_pct')) {
                    const page3Section = document.querySelector('[data-page="3"]');
                    if (page3Section && !page3Section.classList.contains('hidden')) {
                        setTimeout(() => {
                            validarParticipacionAccionarial();
                        }, 100);
                    }
                }
            }
        });

        dataForm.addEventListener('change', (e) => {
            // Solo llamar debouncedSave si datosYaCargados es true
            if (datosYaCargados) {
                debouncedSave();
            }

            // Validar página 7 si cambia el select
            if (currentPage === 7) {
                debouncedValidatePage7();
            }
        });

        dataForm.addEventListener('input', (e) => {
            // Marcar que el usuario está interactuando activamente
            if (e.target && e.target.tagName === 'INPUT') {
                e.target.setAttribute('data-user-editing', 'true');
            }

            // Solo llamar debouncedSave si datosYaCargados es true
            if (datosYaCargados) {
                debouncedSave();
            }

            // Validar página 1 en vivo si estamos en ella
            const page1Section = document.querySelector('[data-page="1"]');
            if (page1Section && !page1Section.classList.contains('hidden')) {
                debouncedValidatePage1();
            }

            // Validar página 2 en vivo si estamos en ella
            const page2Section = document.querySelector('[data-page="2"]');
            if (page2Section && !page2Section.classList.contains('hidden')) {
                debouncedValidatePage2();
            }

            // Validar página 3 en vivo si estamos en ella
            const page3Section = document.querySelector('[data-page="3"]');
            if (page3Section && !page3Section.classList.contains('hidden')) {
                // Si el campo modificado es de participación, validar con debounce para evitar conflictos
                if (e.target && e.target.id && e.target.id.includes('_pct')) {
                    debouncedValidatePage3();
                } else {
                    // Para otros campos, usar debounce normal
                    debouncedValidatePage3();
                }
            }

            // Validar página 4 en vivo (Recursos Humanos)
            const page4Section = document.querySelector('[data-page="4"]');
            if (page4Section && !page4Section.classList.contains('hidden')) {
                debouncedValidatePage4();
            }

            // Validar página 5 en vivo (Recursos I+D)
            const page5Section = document.querySelector('[data-page="5"]');
            if (page5Section && !page5Section.classList.contains('hidden')) {
                debouncedValidatePage5();
            }

            // Validar página 6 en vivo (Productos/Servicios)
            const page6Section = document.querySelector('[data-page="6"]');
            if (page6Section && !page6Section.classList.contains('hidden')) {
                debouncedValidatePage6();
            }

            // Validar página 7 en vivo (Tipo de Entidad)
            const page7Section = document.querySelector('[data-page="7"]');
            if (page7Section && !page7Section.classList.contains('hidden')) {
                debouncedValidatePage7();
            }

            // Validar página 8 en vivo (Datos Bancarios)
            const page8Section = document.querySelector('[data-page="8"]');
            if (page8Section && !page8Section.classList.contains('hidden')) {
                debouncedValidatePage8();
            }

            // Validar página 9 en vivo (Declaraciones)
            const page9Section = document.querySelector('[data-page="9"]');
            if (page9Section && !page9Section.classList.contains('hidden')) {
                debouncedValidatePage9();
            }
        });
    }

    // Añadir event listeners a todos los campos de la página 9 (Declaraciones)
    const page9Selects = [
        'decl_ayuda_solicitada', 'decl_ayuda_europea', 'decl_entidad_crisis',
        'decl_plan_igualdad', 'decl_protocolo_acoso', 'decl_distintivo_igualdad',
        'decl_medidas_conciliacion', 'decl_reserva_discapacidad',
        'decl_accesibilidad_instalaciones', 'decl_impacto_medioambiental',
        'decl_responsable_mujer'
    ];
    
    const page9Checkboxes = [
        'decl_cumple_requisitos', 'decl_no_inicio_previo', 'decl_cumple_normativa',
        'decl_sujeto_control', 'decl_representante_agrupacion', 'decl_respeta_dnsh',
        'decl_no_deudas', 'decl_autoriza_cesion_datos',
        'decl_feder_personal_ca', 'decl_feder_conoce_condiciones', 'decl_feder_capacidad',
        'decl_feder_cumple_reglamento', 'decl_feder_publicidad', 'decl_feder_licencia_ue',
        'decl_feder_conoce_minoracion', 'decl_feder_operacion_no_concluida',
        'decl_feder_conservar_docs', 'decl_feder_registros_contables',
        'decl_feder_conoce_antifraude', 'decl_feder_informado_medidas',
        'decl_feder_difundir_comunicado', 'decl_feder_durabilidad',
        'decl_feder_indicadores', 'decl_feder_comprobacion', 'decl_feder_cooperacion',
        'decl_feder_analisis_riesgos', 'decl_feder_lista_operaciones',
        'decl_feder_accesibilidad', 'decl_feder_autoriza_facilitar',
        // Lista comprobación proyecto
        'decl_proy_autorizaciones', 'decl_proy_normas_ambientales',
        'decl_proy_desarrollo_sostenible', 'decl_proy_dimension_genero',
        'decl_proy_impacto_genero', 'decl_proy_eliminar_desigualdades',
        'decl_proy_lucha_discriminacion', 'decl_proy_ayuda_reembolsable',
        // Cumplimiento FEDER proyecto
        'decl_feder_proy_susceptible_cofinanciar', 'decl_feder_proy_uso_civil'
    ];

    page9Selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                debouncedValidatePage9();
                if (datosYaCargados) {
                    debouncedSave();
                }
            });
        }
    });

    page9Checkboxes.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                debouncedValidatePage9();
                if (datosYaCargados) {
                    debouncedSave();
                }
            });
        }
    });

    // Hacer clickable el stepper izquierdo: cada .step con id='step-N' navegará a la página N
    const stepElements = document.querySelectorAll('#stepper-nav .step');
    stepElements.forEach(el => {
        el.setAttribute('tabindex', '0');
        el.style.cursor = 'pointer';
        el.addEventListener('click', async () => {
            const id = el.id || '';
            const m = id.match(/step-(\d+)/);
            if (m) await window.goToPage(parseInt(m[1], 10));
        });
        el.addEventListener('keydown', async (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                const id = el.id || '';
                const m = id.match(/step-(\d+)/);
                if (m) await window.goToPage(parseInt(m[1], 10));
            }
        });
    });

    // Nota: initializeFirebase() ahora se llama desde authenticateClient()
    // cuando el usuario se autentica correctamente
}

// ===== SISTEMA DE INFORMACIÓN POR PÁGINA =====
const pageInfoContent = {
    page1: {
        title: "Contactos",
        content: `
            <p><strong>Representante Institucional:</strong> Persona con capacidad legal para firmar en nombre de la empresa.</p>
            <p><strong>Contacto Técnico:</strong> Responsable del proyecto a nivel técnico.</p>
            <p><strong>Contacto Financiero:</strong> Responsable de la gestión económica del proyecto.</p>
            <p>Una vez introducida la información en cada sección, pulsar el icono de guardado en el menú para actualizar la Base de Datos.</p>
        `
    },
    page2: {
        title: "Dirección",
        content: `
            <p><strong>Dirección Desarrollo:</strong> En la pestaña Dirección Desarrollo, indicar la dirección donde se va a realizar el desarrollo del proyecto. Una vez introducida la información en la pestaña correspondiente, pulsar el icono que se encuentra en la sección del menú, para actualizar la Base de Datos.</p>
            <p><strong>Dirección Notificaciones:</strong> En la pestaña Dirección Notificaciones, indicar la dirección donde el CDTI debe realizar las peticiones de información necesarias para el estudio del proyecto, así como las comunicaciones oficiales de él. Una vez introducida la información, pulsar el icono sección del menú, para grabar los datos.</p>
        `
    },
    page3: {
        title: "Organización",
        content: `
            <p><strong>Capital Social:</strong> Indicar el año y el capital social de la empresa.</p>
            <p><strong>Composición Accionarial:</strong> Detallar los accionistas de la empresa con su porcentaje de participación.</p>
            <p><strong>Consejo de Administración:</strong> Indicar personas físicas que forman parte del Consejo de Administración.</p>
            <p><strong>Filiales:</strong> Indicar filiales o empresas participadas.</p>
        `
    },
    page4: {
        title: "Recursos Humanos",
        content: `
            <p>Indicar los recursos humanos de la empresa durante los últimos 3 años y las previsiones para los próximos 2 años.</p>
            <p>Los datos se organizan por categorías profesionales (doctores, licenciados, diplomados, FP, otros) diferenciando entre hombres y mujeres.</p>
            <p>Una vez introducida la información, pulsar el icono en la sección del menú para actualizar la Base de Datos.</p>
        `
    },
    page5: {
        title: "Recursos I+D",
        content: `
            <p>Detallar los recursos destinados a I+D durante los últimos 3 años y las previsiones para los próximos 2 años.</p>
            <p>Incluir inmovilizado material, inversiones en activos y gastos corrientes relacionados con I+D.</p>
            <p>Una vez introducida la información, pulsar el icono en la sección del menú para grabar los datos.</p>
        `
    },
    page6: {
        title: "Productos",
        content: `
            <p>Indicar los principales productos o servicios de la empresa.</p>
            <p>Para cada producto, especificar las ventas totales, ventas nacionales y ventas de exportación.</p>
            <p>Una vez introducida la información, pulsar el icono en la sección del menú para actualizar la Base de Datos.</p>
        `
    },
    page7: {
        title: "Entidad",
        content: `
            <p>Seleccionar el tipo de entidad y el tamaño de la empresa según criterios europeos.</p>
            <p>Indicar el período de referencia y los datos económicos correspondientes (efectivos, volumen de negocio y balance general).</p>
            <p>Una vez introducida la información, pulsar el icono en la sección del menú para grabar los datos.</p>
        `
    },
    page8: {
        title: "Datos Bancarios",
        content: `
            <p>Introducir el IBAN completo de la cuenta bancaria donde se realizarán los pagos del proyecto.</p>
            <p>El sistema validará automáticamente el formato del IBAN y extraerá los datos de Entidad, Oficina, DC y Número de cuenta.</p>
            <p>Una vez introducida la información, pulsar el icono en la sección del menú para actualizar la Base de Datos.</p>
        `
    },
    page9: {
        title: "Condiciones",
        content: `
            <p>Es obligatorio aceptar todas las condiciones para poder finalizar el proceso.</p>
            <p><strong>Condiciones Presentación Empresa:</strong> Condiciones relacionadas con FEDER, tratamiento de datos, gastos generales y cofinanciación.</p>
            <p><strong>Condiciones Presentación Proyecto:</strong> Condiciones sobre confidencialidad, reglamentos DNSH, materias excluidas y declaraciones de veracidad.</p>
            <p>Una vez marcadas todas las casillas, el indicador del menú se pondrá en verde. Pulse el botón "Guardar y Finalizar" para completar el proceso.</p>
        `
    }
};

window.showInfoPopup = function (pageId) {
    const overlay = document.getElementById('info-popup-overlay');
    const titleEl = document.getElementById('info-popup-title');
    const contentEl = document.getElementById('info-popup-content');

    const info = pageInfoContent[pageId];
    if (info) {
        titleEl.textContent = info.title;
        contentEl.innerHTML = info.content;
        overlay.classList.add('active');
    }
};

window.closeInfoPopup = function () {
    const overlay = document.getElementById('info-popup-overlay');
    overlay.classList.remove('active');
};

// Cerrar el pop-up al hacer clic fuera de él
document.addEventListener('click', function (e) {
    const overlay = document.getElementById('info-popup-overlay');
    if (e.target === overlay) {
        window.closeInfoPopup();
    }
});

// Cerrar con la tecla ESC
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        window.closeInfoPopup();
    }
});

// Guardar datos antes de cerrar el navegador/pestaña
window.addEventListener('beforeunload', function (e) {
    if (datosYaCargados && currentClientId && db && !isSaving) {
        // Detener el guardado automático
        stopAutoSaveInterval();

        // Ejecutar guardado pendiente inmediatamente (flush)
        console.log('💾 Ejecutando flush antes de cerrar pestaña...');
        if (typeof debouncedSave.flush === 'function') {
            debouncedSave.flush();
        }

        // Intentar guardar una última vez de forma síncrona
        // Nota: beforeunload tiene limitaciones con operaciones async,
        // pero intentamos guardar lo que sea posible
        saveFormData(false).catch(err => {
            console.warn('⚠️ No se pudo guardar antes de cerrar:', err);
        });
    }
});

// NO guardar automáticamente cuando la pestaña pierde visibilidad
// porque esto causaba guardados muy frecuentes
// El guardado se hace:
// 1. 5 segundos después de escribir (debounce)
// 2. Al cambiar de página
// 3. Al cerrar sesión
// 4. Al cerrar la ventana (beforeunload)
/*
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden' && datosYaCargados && currentClientId && db && !isSaving) {
        console.log('👁️ Pestaña oculta, guardando datos...');
        if (typeof debouncedSave.flush === 'function') {
            debouncedSave.flush();
        }
        saveFormData(false).catch(err => {
            console.warn('⚠️ No se pudo guardar al ocultar pestaña:', err);
        });
    }
});
*/

// ========================================
// Funcionalidad: Seleccionar todos los checkboxes en "OTRAS DECLARACIONES"
// ========================================
function initSelectAllOtrasDeclaraciones() {
    console.log('🚀 Iniciando configuración de "Seleccionar todos" para Otras Declaraciones...');
    
    const selectAllCheckbox = document.getElementById('decl_select_all_otras');
    
    if (!selectAllCheckbox) {
        console.warn('⚠️ No se encontró el checkbox "decl_select_all_otras". Reintentando en 1 segundo...');
        setTimeout(initSelectAllOtrasDeclaraciones, 1000);
        return;
    }

    // Obtener todos los checkboxes de la sección "OTRAS DECLARACIONES"
    // Usamos la clase que añadimos en el HTML
    const otrasDeclaracionesCheckboxes = document.querySelectorAll('.otras-declaraciones-item');
    
    if (otrasDeclaracionesCheckboxes.length === 0) {
        console.warn('⚠️ No se encontraron checkboxes con la clase .otras-declaraciones-item');
        return;
    }

    console.log(`✅ Encontrados ${otrasDeclaracionesCheckboxes.length} checkboxes para controlar.`);

    // Función para actualizar el estado del checkbox "Todos" basado en los individuales
    function updateSelectAllState() {
        const allChecked = Array.from(otrasDeclaracionesCheckboxes).every(cb => cb.checked);
        const someChecked = Array.from(otrasDeclaracionesCheckboxes).some(cb => cb.checked);
        
        selectAllCheckbox.checked = allChecked;
        selectAllCheckbox.indeterminate = someChecked && !allChecked;
    }

    // Evento cuando se hace clic en "Seleccionar todos"
    selectAllCheckbox.addEventListener('change', function(e) {
        console.log('🖱️ Click en "Seleccionar todos". Estado:', this.checked);
        const isChecked = this.checked;
        
        otrasDeclaracionesCheckboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
            // Disparar evento change manualmente para que otros listeners (validación) se enteren
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        // Guardar los cambios
        if (typeof debouncedSave === 'function') {
            debouncedSave();
        } else if (window.debouncedSave) {
            window.debouncedSave();
        }
    });
    
    // Sincronizar el estado del checkbox "seleccionar todos" cuando cambian los items individuales
    otrasDeclaracionesCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectAllState);
    });
    
    // Estado inicial
    updateSelectAllState();
    
    console.log('✓ Funcionalidad de "Seleccionar todos" inicializada correctamente.');
}