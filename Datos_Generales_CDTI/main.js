// main.js (modificado para: marcar errores en el stepper lateral + recursos humanos dinámico)

// Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, serverTimestamp, setLogLevel, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Importaciones de Lógica de Validación
import { 
    validateField, 
    validatePage1, 
    validatePage2,
    validatePage3,
    validateNumericField, 
    validatePercentageField, 
    validateIBAN,
    handleCPInput,
    validatePage4,
    validatePage7,
    validatePage8
} from './validation.js';



// Variables Globales del Entorno
const appId = 'datos-generales-cdti';

// Variables de sesión del cliente
let currentClientId = null;
let isAuthenticated = false;

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
const ADMIN_KEY = 'admin123'; 
const TOTAL_PAGES = 9; // Total de 9 páginas
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
    } catch(e) {
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
    } catch(e) {
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
 */
function debounce(func, delay) {
    let timer = null;
    return function(...args) {
        const context = this;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            func.apply(context, args);
            timer = null;
        }, delay);
    };
}
// Crear la función debounced para el auto-guardado (2 segundos de inactividad)
const debouncedSave = debounce(() => saveFormData(false), 2000);

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

// Debounced validation para página 6
let validatePage6Timer;
function debouncedValidatePage6() {
    clearTimeout(validatePage6Timer);
    validatePage6Timer = setTimeout(() => {
        if (currentPage === 6) {
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

/** Inicializa Firebase y autentica al usuario. */
async function initializeFirebase() {
    try {
        // --- INICIO DE MODIFICACIÓN CLAVE ---
        const statusEl = document.getElementById('data-loading-status');
        
        if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.projectId) {
            console.error("Firebase config is missing or invalid.");
            if (statusEl) {
                 statusEl.textContent = "ERROR: Configuración de Firebase faltante. Por favor, revise main.js.";
            }
            // Retornar sin inicializar si la configuración es inválida
            return; 
        }
        // --- FIN DE MODIFICACIÓN CLAVE ---

        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
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
    const clientView = document.getElementById('client-view');
    const adminView = document.getElementById('admin-view');
    const mainTitle = document.getElementById('main-title');

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

        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
        
        // Cargar los datos del usuario si la autenticación está lista
        if (isAuthReady) {
            loadUserFormData();
        }

    } else if (view === 'admin') {
        if (!isAuthReady || !db) {
            showMessageBox("Error", "La base de datos no está lista. Intente recargar la página.");
            return;
        }
        
        // Verificar que appId esté configurado correctamente
        if (!appId || appId === 'default-app-id' || appId === 'datos-generales-cdti') {
            // El appId parece estar configurado, continuar
        } else {
            showMessageBox("Error de Configuración", "ID de aplicación no configurado correctamente.");
            return;
        }
        
        if (clientView) clientView.classList.add('hidden');
        if (adminView) adminView.classList.remove('hidden');
        if (mainTitle) mainTitle.textContent = "Panel de Administración de Datos";
        
        if (showFormBtn && showAdminBtn) {
            showFormBtn.style.backgroundColor = '#d1d5db';
            showFormBtn.style.color = 'var(--brand)';
            showAdminBtn.style.backgroundColor = 'var(--accent)';
            showAdminBtn.style.color = 'white';
        }
        
        // Pequeña pausa para asegurar que la UI se ha actualizado
        setTimeout(() => {
            loadAdminFormData();
        }, 100);
    }
}

/** Muestra la página del formulario especificada. */
function showPage(pageNumber) {
    currentPage = pageNumber;
    
    // Limpiar errores de la página actual antes de mostrarla
    clearPageError(pageNumber);
    
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

    // 6. Volver al inicio de la página (útil en móvil)
    window.scrollTo(0, 0);
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

        // Mensaje con icono (número opcional) y texto
        errorMsgEl.innerHTML = `<span class="err-icon">!</span><span class="msg">${text}</span>`;

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
        try { setStepError(pageNumber, false); } catch(e){ /* ignore */ }
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
}

/** Construye la UI dinámica de Recursos Humanos (5 años: currentYear-3 .. +1) */
// --- Reemplazar la función renderRecursosHumanos por esta versión ---
// Reemplaza la función renderRecursosHumanos por esta versión (incluye total visible y campo "Total de Titulados")
// También añade las funciones updateTotalsForYear(year) y updateAllTotals() en el mismo archivo.

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

            <!-- Total de Personas (suma de la anualidad) -->
   <!-- reemplazar por -->
<div class="rec-total-container">
  <div id="rh_${year}_total_personas_display" class="rec-total-personas" aria-live="polite">Total Personas: 0</div>
</div>

            <!-- Campo editable: Total de Titulados (salvable) -->
            <div style="margin-top:0.6rem;">
                <label for="rh_${year}_total_titulados" style="font-weight:600; display:block; margin-bottom:0.25rem;">Total de Titulados</label>
                <input id="rh_${year}_total_titulados" type="text" class="input-default" value="${existingData.total_titulados || ''}" oninput="validateNumericField(this); updateTotalsForYear(${year})">
            </div>
        `;

        container.appendChild(section);
    });

    // Inicializar totales tras renderizar
    updateAllTotals();
}

/** Suma los valores numéricos de una anualidad y actualiza el display del total.
 *  También actualiza un campo hidden/data o recalcula cuando se solicita guardar.
 */
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

        // Validar el campo usando la función centralizada (marca input-invalid si procede)
        // validateNumericField puede ser global (window) o importada; usamos window para compatibilidad inline.
        try {
          if (typeof window.validateNumericField === 'function') {
            window.validateNumericField(el);
          } else if (typeof validateNumericField === 'function') {
            validateNumericField(el);
          }
        } catch(e){ /* no bloquear suma */ }

        const v = (el.value || '').toString().trim();
        const n = Number(v);
        if (!Number.isNaN(n)) total += n;
    });

    // Actualizar display estilizado (azul y negrita) en la derecha
    const disp = document.getElementById(`rh_${year}_total_personas_display`);
    if (disp) {
        disp.textContent = `Total Personas: ${total}`;
    }

    return total;
}

/** Recalcula todos los totales para cada año (útil tras render) */
function updateAllTotals() {
    const container = document.getElementById('recursos-container');
    if (!container) return;
    container.querySelectorAll('.form-section').forEach(section => {
        const year = section.dataset.year;
        if (!year) return;
        updateTotalsForYear(year);
    });


// Exponer las funciones para uso en HTML inline si hace falta
window.updateTotalsForYear = updateTotalsForYear;
window.updateAllTotals = updateAllTotals;
}

/** Limpia todos los campos del formulario de valores extraños que puedan aparecer */
function limpiarCamposIniciales() {
    // No limpiar si hay una limpieza en progreso para evitar conflictos
    if (window.limpiezaEnProgreso) {
        return;
    }
    window.limpiezaEnProgreso = true;
    
    // Lista de todos los campos del formulario que deben estar vacíos inicialmente
    const camposLimpiar = [
        // Página 1
        'instNIF', 'instNombre', 'instApellidos', 'instCargo', 'instTelefono', 'instEmail',
        'tecNombre', 'tecApellidos', 'tecCargo', 'finNombre', 'finApellidos', 'finCargo',
        
        // Página 2
        'dirTipoVia', 'dirDireccion', 'dirNumero', 'dirCP', 'dirProvincia', 'dirLocalidad', 
        'dirTelefono', 'dirEmail',
        
        // Página 3
        'orgAnoCapital', 'orgCapitalSocial',
        
        // Página 5
        'id_ano', 'id_inmovilizado', 'id_gastos_corrientes',
        
        // Página 7
        'entidadTipo', 'entidadTamaño', 'entidadPeriodoRef',
        'ent_efectivos', 'ent_volumen_negocio', 'ent_balance_general',
        'ent_anterior_efectivos', 'ent_anterior_volumen_negocio', 'ent_anterior_balance_general',
        
        // Página 8
        'bankIBAN', 'bankEntidad', 'bankOficina', 'bankDC', 'bankNumero'
    ];
    
    // Limpiar campos estáticos - pero NO si el usuario los está editando
    camposLimpiar.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento && elemento.value && elemento.value.trim() !== '') {
            // No limpiar si el elemento tiene focus (usuario lo está editando)
            if (document.activeElement === elemento) {
                return;
            }
            
            const valor = elemento.value.trim();
            console.log(`Revisando campo ${id}: "${valor}"`);
            if (isValorExtrano(valor)) {
                console.log(`Limpiando campo ${id} con valor extraño: "${valor}"`);
                elemento.value = '';
                elemento.classList.remove('input-valid', 'input-invalid');
                elemento.classList.add('input-default');
            }
        }
    });
    
    // Limpiar campos dinámicos de accionarial - EXCEPTO los que están siendo editados
    document.querySelectorAll('#accionarial-container input').forEach(input => {
        // No limpiar si el usuario está escribiendo en este campo
        if (document.activeElement === input || input.hasAttribute('data-user-editing')) {
            return;
        }
        
        if (input.value && isValorExtrano(input.value.trim())) {
            // Excepción especial: no limpiar campos de porcentaje si contienen números válidos
            if (input.id.includes('_pct') && /^\d+(\.\d+)?$/.test(input.value.trim())) {
                const num = parseFloat(input.value.trim());
                if (num >= 0 && num <= 100) {
                    return; // Es un porcentaje válido, no limpiar
                }
            }
            
            console.log(`Limpiando campo accionarial ${input.id}: "${input.value}"`);
            input.value = '';
            input.classList.remove('input-valid', 'input-invalid');
            input.classList.add('input-default');
        }
    });
    
    // Limpiar campos dinámicos de recursos humanos - EXCEPTO los que tienen focus
    document.querySelectorAll('#recursos-container input').forEach(input => {
        if (document.activeElement === input) {
            return;
        }
        
        if (input.value && isValorExtrano(input.value.trim())) {
            input.value = '';
            input.classList.remove('input-valid', 'input-invalid');
            input.classList.add('input-default');
        }
    });
    
    // Limpiar campos dinámicos de productos - EXCEPTO los que tienen focus
    document.querySelectorAll('#productos-container input').forEach(input => {
        if (document.activeElement === input) {
            return;
        }
        
        if (input.value && isValorExtrano(input.value.trim())) {
            input.value = '';
            input.classList.remove('input-valid', 'input-invalid');
            input.classList.add('input-default');
        }
    });
    
    window.limpiezaEnProgreso = false;
}

/** Establece un campo como inválido con tooltip de error (mismo estilo que validation.js) */
function setFieldErrorWithTooltip(element, errorMessage) {
    if (!element) return;
    element.classList.remove('input-valid', 'input-default');
    element.classList.add('input-invalid');
    element.setAttribute('data-error', errorMessage);
    
    // Asegurar que el contenedor padre tenga posición relativa
    const parent = element.parentElement;
    if (parent) {
        const currentPosition = window.getComputedStyle(parent).position;
        if (currentPosition === 'static') {
            parent.style.position = 'relative';
        }
        
        // Crear tooltip si no existe
        let tooltip = parent.querySelector('.error-tooltip');
        if (!tooltip && errorMessage) {
            tooltip = document.createElement('div');
            tooltip.className = 'error-tooltip';
            tooltip.textContent = errorMessage;
            tooltip.style.display = 'none'; // Oculto por defecto
            parent.appendChild(tooltip);
        } else if (tooltip) {
            tooltip.textContent = errorMessage;
        }
    }
    
    // Remover listeners previos para evitar duplicados
    element.removeEventListener('mouseenter', showTooltipOnHover);
    element.removeEventListener('mouseleave', hideTooltipOnHover);
    
    // Añadir listeners para mostrar tooltip al hacer hover
    element.addEventListener('mouseenter', showTooltipOnHover);
    element.addEventListener('mouseleave', hideTooltipOnHover);
}

/** Establece un campo como válido y elimina tooltip */
function setFieldValidWithTooltip(element) {
    if (!element) return;
    element.classList.remove('input-invalid', 'input-default');
    element.classList.add('input-valid');
    element.removeAttribute('data-error');
    
    // Eliminar tooltip
    const parent = element.parentElement;
    if (parent) {
        const tooltip = parent.querySelector('.error-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }
    
    // Remover listeners de hover
    element.removeEventListener('mouseenter', showTooltipOnHover);
    element.removeEventListener('mouseleave', hideTooltipOnHover);
}

/** Muestra tooltip al hacer hover */
function showTooltipOnHover(event) {
    const parent = event.target.parentElement;
    if (parent) {
        const tooltip = parent.querySelector('.error-tooltip');
        if (tooltip) {
            tooltip.style.display = 'block';
        }
    }
}

/** Oculta tooltip al quitar hover */
function hideTooltipOnHover(event) {
    const parent = event.target.parentElement;
    if (parent) {
        const tooltip = parent.querySelector('.error-tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }
}

/** Establece un campo en estado por defecto y elimina tooltip */
function setFieldDefaultWithTooltip(element) {
    if (!element) return;
    element.classList.remove('input-valid', 'input-invalid');
    element.classList.add('input-default');
    element.removeAttribute('data-error');
    
    // Eliminar tooltip
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

// =============================================
// SISTEMA DE AUTENTICACIÓN POR CONTRASEÑA
// =============================================

/** Inicializa el sistema de login al cargar la página */
function initLoginSystem() {
    console.log('🚀 Inicializando sistema de login...');
    
    // Verificar si ya existe una sesión guardada
    const savedClientId = localStorage.getItem('cdti-client-id');
    if (savedClientId) {
        console.log('🔄 Sesión existente encontrada, reconectando...');
        authenticateClient(savedClientId);
        return;
    }
    
    console.log('📝 No hay sesión guardada, mostrando pantalla de login');
    
    // Mostrar pantalla de login
    showLoginScreen();
    
    // Configurar el formulario de login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('✅ Formulario de login encontrado, configurando evento submit');
        loginForm.addEventListener('submit', handleLogin);
    } else {
        console.error('❌ No se encontró el formulario de login');
    }
}

/** Muestra la pantalla de login */
function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('app');
    
    if (loginScreen) loginScreen.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
}

/** Muestra la aplicación principal */
function showMainApp() {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('app');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
}

/** Maneja el envío del formulario de login */
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
    
    // Deshabilitar botón durante el proceso
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';
    
    try {
        // Usar la contraseña como ID de cliente
        const clientId = password;
        console.log('🔐 Autenticando cliente con ID:', clientId);
        
        // Autenticar cliente
        await authenticateClient(clientId);
        console.log('✅ Cliente autenticado correctamente');
        
        // Guardar en localStorage para persistencia
        localStorage.setItem('cdti-client-id', clientId);
        console.log('💾 Sesión guardada en localStorage');
        
        // Limpiar formulario
        passwordInput.value = '';
        if (errorDiv) errorDiv.style.display = 'none';
        
        // Mostrar aplicación principal
        showMainApp();
        console.log('✅ Aplicación principal mostrada');
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        showLoginError('Error al acceder. Verifique su contraseña e inténtelo nuevamente.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Acceder al Formulario';
    }
}

/** Autentica un cliente con su ID único */
async function authenticateClient(clientId) {
    console.log('🔑 Función authenticateClient iniciada con clientId:', clientId);
    currentClientId = clientId;
    isAuthenticated = true;
    
    // Actualizar UI
    console.log('🔑 Actualizando información del cliente en UI...');
    updateClientInfo();
    
    // Inicializar Firebase si no está inicializado
    if (!app) {
        console.log('🔑 Firebase no inicializado, inicializando...');
        await initializeFirebase();
        console.log('✅ Firebase inicializado');
    } else {
        console.log('✅ Firebase ya estaba inicializado');
    }
    
    // Cargar datos del cliente específico
    console.log('🔑 Cargando datos del cliente...');
    await loadClientData();
    console.log('✅ Datos del cliente cargados');
}

/** Actualiza la información del cliente en la UI */
function updateClientInfo() {
    const clientInfo = document.getElementById('client-info');
    const clientIdSpan = document.getElementById('client-id');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (clientInfo && currentClientId) {
        clientInfo.style.display = 'block';
        if (clientIdSpan) {
            // Mostrar solo los primeros 8 caracteres para privacidad
            clientIdSpan.textContent = currentClientId.substring(0, 8) + '...';
        }
    }
    
    if (logoutBtn) {
        logoutBtn.style.display = 'block';
    }
}

/** Cierra la sesión del cliente */
function logout() {
    // Limpiar datos de sesión
    currentClientId = null;
    isAuthenticated = false;
    
    // Limpiar localStorage
    localStorage.removeItem('cdti-client-id');
    
    // Detener listeners de datos
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    
    // Limpiar formulario
    clearFormData();
    
    // Mostrar pantalla de login
    showLoginScreen();
    
    // Ocultar información del cliente
    const clientInfo = document.getElementById('client-info');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (clientInfo) clientInfo.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
}

/** Carga los datos del formulario desde un objeto */
function loadFormData(data) {
    if (!data || typeof data !== 'object') {
        console.log('No hay datos previos para cargar');
        return;
    }
    
    console.log('📥 Cargando datos del formulario...', Object.keys(data).length, 'campos');
    
    // Cargar campos simples del formulario
    Object.keys(data).forEach(key => {
        // Saltar arrays y objetos especiales
        if (key === 'recursosHumanos' || key === 'productos' || key === 'accionarial' || 
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
    
    // Cargar recursos humanos si existen
    if (data.recursosHumanos && Array.isArray(data.recursosHumanos)) {
        console.log('📥 Cargando recursos humanos:', data.recursosHumanos.length, 'años');
        renderRecursosHumanos(data.recursosHumanos);
    }
    
    // Cargar productos si existen
    if (data.productos && Array.isArray(data.productos)) {
        console.log('📥 Cargando productos:', data.productos.length, 'productos');
        renderProductos(data.productos);
    } else {
        // Si no hay productos guardados, renderizar el inicial
        renderProductosIniciales();
    }
    
    // Cargar accionistas si existen
    if (data.accionarial && Array.isArray(data.accionarial) && data.accionarial.length > 0) {
        console.log('📥 Cargando accionistas:', data.accionarial.length, 'accionistas');
        renderAccionarialData(data.accionarial);
    }
    
    // Cargar consejo si existe
    if (data.consejo && Array.isArray(data.consejo) && data.consejo.length > 0) {
        console.log('📥 Cargando consejo:', data.consejo.length, 'miembros');
        renderConsejoData(data.consejo);
    }
    
    // Cargar filiales si existen
    if (data.filiales && Array.isArray(data.filiales) && data.filiales.length > 0) {
        console.log('📥 Cargando filiales:', data.filiales.length, 'filiales');
        renderFilialesData(data.filiales);
    }
    
    console.log('✅ Datos cargados en el formulario');
}

/** Renderiza datos de accionistas desde datos guardados */
function renderAccionarialData(accionarial) {
    const container = document.getElementById('accionarial-container');
    if (!container) return;
    
    container.innerHTML = ''; // Limpiar contenedor
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
                <label for="acc_${accionarialCount}_nombre">Nombre / Razón Social:</label>
                <input id="acc_${accionarialCount}_nombre" type="text" class="input-default" value="${acc.nombre || ''}">
            </div>
            <div>
                <label for="acc_${accionarialCount}_cif">CIF:</label>
                <input id="acc_${accionarialCount}_cif" type="text" class="input-default" value="${acc.cif || ''}">
            </div>
            <div style="position: relative;">
                <label for="acc_${accionarialCount}_pct">% Participación:</label>
                <input id="acc_${accionarialCount}_pct" type="number" step="0.1" class="input-default" oninput="validatePercentageField(this)" value="${acc.pct || ''}">
            </div>
            <div>
                <label for="acc_${accionarialCount}_pyme">Pyme:</label>
                <select id="acc_${accionarialCount}_pyme" class="input-default">
                    <option value="">--</option>
                    <option value="Sí" ${acc.pyme === 'Sí' ? 'selected' : ''}>Sí</option>
                    <option value="No" ${acc.pyme === 'No' ? 'selected' : ''}>No</option>
                </select>
            </div>
            <div>
                <label for="acc_${accionarialCount}_nacionalidad">Nacionalidad:</label>
                <input id="acc_${accionarialCount}_nacionalidad" type="text" class="input-default" value="${acc.nacionalidad || ''}">
            </div>
            ${deleteBtn}
        `;
        
        container.appendChild(grupo);
    });
}

/** Renderiza datos de consejo desde datos guardados */
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
                <label for="con_${consejoCount}_nombre">Nombre:</label>
                <input id="con_${consejoCount}_nombre" type="text" class="input-default" value="${miembro.nombre || ''}">
            </div>
            <div>
                <label for="con_${consejoCount}_cif">CIF:</label>
                <input id="con_${consejoCount}_cif" type="text" class="input-default" value="${miembro.cif || ''}">
            </div>
            <div>
                <label for="con_${consejoCount}_cargo">Cargo:</label>
                <input id="con_${consejoCount}_cargo" type="text" class="input-default" value="${miembro.cargo || ''}">
            </div>
            <div>
                <label for="con_${consejoCount}_nacionalidad">Nacionalidad:</label>
                <input id="con_${consejoCount}_nacionalidad" type="text" class="input-default" value="${miembro.nacionalidad || ''}">
            </div>
            ${deleteBtn}
        `;
        
        container.appendChild(grupo);
    });
}

/** Renderiza datos de filiales desde datos guardados */
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

/** Carga los datos específicos del cliente autenticado */
async function loadClientData() {
    if (!currentClientId || !db) return;
    
    try {
        const clientDocRef = doc(db, 'clientes', currentClientId);
        
        // Configurar listener de datos en tiempo real
        unsubscribe = onSnapshot(clientDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                currentData = data;
                loadFormData(data);
                console.log(`Datos cargados para cliente: ${currentClientId}`);
            } else {
                console.log(`Nuevo cliente: ${currentClientId}`);
                currentData = {};
            }
        }, (error) => {
            console.error('Error al cargar datos del cliente:', error);
        });
        
        // Inicializar la aplicación después de configurar los datos
        initializeMainApp();
        
    } catch (error) {
        console.error('Error al configurar listener de datos:', error);
    }
}

/** Inicializa la aplicación principal después del login */
function initializeMainApp() {
    // Iniciar en la vista de formulario por defecto
    setView('client');
    
    // Mostrar página 1 inicialmente y limpiar todos los errores
    showPage(1);
    
    // NO limpiar campos si hay datos del cliente (datos cargados desde Firebase)
    // Solo limpiar si es un cliente completamente nuevo sin datos
    const tienesDatos = currentData && Object.keys(currentData).length > 1; // más que solo timestamp
    
    if (!tienesDatos) {
        console.log('Cliente nuevo, limpiando campos iniciales...');
        setTimeout(() => {
            limpiarCamposIniciales();
        }, 500);
    } else {
        console.log('Cliente existente con datos, NO se limpiarán campos');
    }
    
    // Habilitar el botón de admin una vez que Firebase esté listo
    const adminBtn = document.getElementById('show-admin-btn');
    if (adminBtn) {
        adminBtn.disabled = false;
        adminBtn.style.opacity = '1';
        adminBtn.title = 'Acceder al panel de administración';
    }
}

/** Muestra un error en la pantalla de login */
function showLoginError(message) {
    const errorDiv = document.getElementById('login-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // Ocultar error después de 5 segundos
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

/** Limpia todos los datos del formulario */
function clearFormData() {
    const form = document.getElementById('data-form');
    if (!form) return;
    
    // Limpiar todos los inputs
    const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"]');
    inputs.forEach(input => {
        input.value = '';
        input.classList.remove('input-valid', 'input-invalid');
        input.classList.add('input-default');
    });
    
    // Limpiar checkboxes
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // Limpiar selects
    const selects = form.querySelectorAll('select');
    selects.forEach(select => {
        select.selectedIndex = 0;
    });
    
    // Resetear contadores
    accionarialCount = 1;
    consejoCount = 1;
    filialCount = 1;
    productoCount = 1;
    
    // Re-renderizar secciones dinámicas
    renderRecursosHumanos([]);
    renderProductosIniciales();
    
    // Volver a página 1
    showPage(1);
    
    // Limpiar errores
    for (let i = 1; i <= TOTAL_PAGES; i++) {
        clearPageError(i);
        setStepError(i, false);
    }
    
    console.log('Formulario limpiado para nuevo cliente');
}

/** Determina si un valor parece ser extraño o basura */
function isValorExtrano(valor) {
    // Lista de valores que claramente son basura (casos específicos conocidos)
    const valoresBasura = ['vg', 's', 'undefined', 'null', 'NaN', 'test', 'x', 'xx', 'xxx'];
    
    // Si es uno de los valores conocidos de basura
    if (valoresBasura.includes(valor.toLowerCase())) {
        return true;
    }
    
    // Si es muy corto y contiene solo letras (probablemente basura)
    if (valor.length <= 3 && /^[a-zA-Z]+$/.test(valor)) {
        return true;
    }
    
    // Para números específicos que sabemos que son basura en contexto
    // Ser más específico: solo los valores exactos problemáticos
    if (valor === '23' || valor === '32') {
        return true;
    }
    
    // Si contiene caracteres extraños o de control
    if (/[\x00-\x1F\x7F-\x9F]/.test(valor)) {
        return true;
    }
    
    return false;
}

// En la inicialización / window.onload asegúrate de que renderRecursosHumanos([]) se llame (ya estaba en la versión previa).
// Si en tu main.js original la llamada está en window.onload, mantenla; si no, añade:
// renderRecursosHumanos([]);

// Nota: No cambian los ids de inputs (siguen siendo rh_{year}_...), por tanto saveFormData y validatePage4 siguen funcionando.

/** Carga los datos existentes de un usuario desde Firestore. */
async function loadUserFormData() {
    if (!db || !userId || userId === 'loading') return;
    
    try {
        const collectionPath = 'clientes';
        const docSnap = await getDoc(doc(db, collectionPath, userId));
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Cargar datos básicos
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
            
            // Cargar datos dinámicos
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
    // No limpiar el container ya que el primer grupo ya existe en el HTML
    accionarial.forEach((item, index) => {
        if (index === 0) {
            // Primer elemento usa los campos existentes
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
            // Elementos adicionales se crean dinámicamente
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
    // No limpiar el container ya que el primer grupo ya existe en el HTML
    consejo.forEach((item, index) => {
        if (index === 0) {
            // Primer elemento usa los campos existentes
            const el1 = document.getElementById('consejo_1_nombre');
            const el2 = document.getElementById('consejo_1_dni');
            const el3 = document.getElementById('consejo_1_cargo');
            const el4 = document.getElementById('consejo_1_nacionalidad');
            
            if (el1) el1.value = item.nombre || '';
            if (el2) el2.value = item.dni || '';
            if (el3) el3.value = item.cargo || '';
            if (el4) el4.value = item.nacionalidad || '';
        } else {
            // Elementos adicionales se crean dinámicamente
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
    // No limpiar el container ya que el primer grupo ya existe en el HTML
    filiales.forEach((item, index) => {
        if (index === 0) {
            // Primer elemento usa los campos existentes
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
            // Elementos adicionales se crean dinámicamente
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
    
    // Renderizar primer producto
    renderProductosIniciales();
    
    productos.forEach((item, index) => {
        if (index === 0) {
            // Primer elemento usa los campos existentes
            document.getElementById('prod1_nombre').value = item.nombre || '';
            document.getElementById('prod1_ventas').value = item.ventas || '';
            document.getElementById('prod1_nac').value = item.nacional || '';
            document.getElementById('prod1_exp').value = item.exportacion || '';
        } else {
            // Elementos adicionales se crean dinámicamente
            addProductoGrupo();
            const currentCount = productoCount;
            document.getElementById(`prod${currentCount}_nombre`).value = item.nombre || '';
            document.getElementById(`prod${currentCount}_ventas`).value = item.ventas || '';
            document.getElementById(`prod${currentCount}_nac`).value = item.nacional || '';
            document.getElementById(`prod${currentCount}_exp`).value = item.exportacion || '';
        }
    });
    
    // Solo validar si hay datos cargados
    if (productos.length > 0) {
        validarTotalVentas();
    }
}

/** Guarda los datos del formulario en Firestore usando setDoc con el userId. */
async function saveFormData(isFinalSave = false) {
    if (!db || isSaving || !isAuthenticated || !currentClientId) {
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
            dirCP: document.getElementById('dirCP').value.trim(),
            dirProvincia: document.getElementById('dirProvincia').value.trim(),
            dirLocalidad: document.getElementById('dirLocalidad').value.trim(),
            dirTelefono: document.getElementById('dirTelefono').value.trim(),
            dirEmail: document.getElementById('dirEmail').value.trim(),

            orgAnoCapital: document.getElementById('orgAnoCapital').value.trim(),
            orgCapitalSocial: document.getElementById('orgCapitalSocial').value.trim(),

            // Otros campos...
            id_ano: document.getElementById('id_ano') ? document.getElementById('id_ano').value.trim() : '',
            id_inmovilizado: document.getElementById('id_inmovilizado') ? document.getElementById('id_inmovilizado').value.trim() : '',
            id_gastos_corrientes: document.getElementById('id_gastos_corrientes') ? document.getElementById('id_gastos_corrientes').value.trim() : '',

            // --- INICIO DE CORRECCIÓN (Página 6) ---
            // Los productos se gestionan dinámicamente más abajo
            // --- FIN DE CORRECCIÓN ---

            entidadTipo: document.getElementById('entidadTipo').value,
            entidadTamaño: document.getElementById('entidadTamaño').value,
            ent_efectivos: document.getElementById('ent_efectivos').value.trim(),
            ent_volumen_negocio: document.getElementById('ent_volumen_negocio').value.trim(),
            ent_balance_general: document.getElementById('ent_balance_general').value.trim(),

            bankIBAN: document.getElementById('bankIBAN').value.trim(),
            bankEntidad: document.getElementById('bankEntidad').value.trim(),
            bankOficina: document.getElementById('bankOficina').value.trim(),
            bankDC: document.getElementById('bankDC').value.trim(),
            bankNumero: document.getElementById('bankNumero').value.trim(),

            cond_1: document.getElementById('cond_1').checked,
            cond_2: document.getElementById('cond_2').checked,
            cond_3: document.getElementById('cond_3').checked,
            cond_4: document.getElementById('cond_4').checked
        };

        // --- INICIO DE CORRECCIÓN (Página 6) ---
        // Recolectar Productos (DINÁMICAMENTE)
        const productos = [];
        document.querySelectorAll('#productos-container .producto-grupo').forEach((grupo, index) => {
            const nombreInput = grupo.querySelector('input[id*="_nombre"]');
            if (!nombreInput) return;
            
            // Extraer el número del ID (prod1 -> 1, prod2 -> 2, etc.)
            const match = nombreInput.id.match(/prod(\d+)_nombre/);
            const prodNum = match ? match[1] : (index + 1);
            
            const nombre = nombreInput.value.trim();
            const ventas = document.getElementById(`prod${prodNum}_ventas`)?.value?.trim() || '';
            const nac = document.getElementById(`prod${prodNum}_nac`)?.value?.trim() || '';
            const exp = document.getElementById(`prod${prodNum}_exp`)?.value?.trim() || '';

            if (nombre || ventas || nac || exp) {
                productos.push({ 
                    id: `prod${prodNum}`,
                    nombre: nombre, 
                    ventas: ventas, 
                    nacional: nac, 
                    exportacion: exp 
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
            accionarial.push({ nombre, cif, porcentaje: pct, pyme, nacionalidad });
          }
        });
        formData.accionarial = accionarial;

        // Recolectar Consejo
        const consejo = [];
        document.querySelectorAll('#consejo-container .consejo-grupo').forEach(grupo => {
          const nombre = grupo.querySelector('[id*="_nombre"]')?.value?.trim() || '';
          const dni = grupo.querySelector('[id*="_dni"]')?.value?.trim() || '';
          const cargo = grupo.querySelector('[id*="_cargo"]')?.value?.trim() || '';
          const nacionalidad = grupo.querySelector('[id*="_nacionalidad"]')?.value?.trim() || '';
          if (nombre || dni || cargo || nacionalidad) {
            consejo.push({ nombre, dni, cargo, nacionalidad });
          }
        });
        formData.consejo = consejo;

        // Recolectar Filiales
        const filiales = [];
        document.querySelectorAll('#filial-container .filial-grupo').forEach(grupo => {
          const razon = grupo.querySelector('[id*="_razon"]')?.value?.trim() || '';
          const cif = grupo.querySelector('[id*="_cif"]')?.value?.trim() || '';
          const actividad = grupo.querySelector('[id*="_actividad"]')?.value?.trim() || '';
          const pct = grupo.querySelector('[id*="_pct"]')?.value?.trim() || '';
          const pais = grupo.querySelector('[id*="_pais"]')?.value?.trim() || '';
          if (razon || cif || actividad || pct || pais) {
            filiales.push({ razon, cif, actividad, porcentaje: pct, pais });
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

        // Ruta: /clientes/{clientId} - Datos separados por contraseña de cliente
        const clientDocRef = doc(db, 'clientes', currentClientId);
        await setDoc(clientDocRef, formData, { merge: true });

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
        showPage(currentPage);
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
                
                Condicion_FEDER: data.cond_1 || false,
                Condicion_Datos: data.cond_2 || false,
                Condicion_Veraz: data.cond_3 || false,
                Condicion_CCAA: data.cond_4 || false,

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
                    <button onclick="downloadClientCSV('${clientId}')" class="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-medium">
                        Descargar CSV
                    </button>
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

/** Exporta los datos a CSV. */
/** Descarga CSV de un cliente específico organizado por pestañas/páginas */
window.downloadClientCSV = async function(clientId) {
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
        
        // Estructura CSV organizada por páginas (pestañas)
        const csvContent = [];
        
        // === PÁGINA 1: CONTACTOS ===
        csvContent.push('=== PÁGINA 1: CONTACTOS ===');
        csvContent.push('');
        csvContent.push('Representante Institucional');
        csvContent.push('Campo;Valor');
        csvContent.push(`"NIF";"${data.instNIF || ''}"`);
        csvContent.push(`"Nombre";"${data.instNombre || ''}"`);
        csvContent.push(`"Apellidos";"${data.instApellidos || ''}"`);
        csvContent.push(`"Cargo";"${data.instCargo || ''}"`);
        csvContent.push(`"Teléfono";"${data.instTelefono || ''}"`);
        csvContent.push(`"Email";"${data.instEmail || ''}"`);
        csvContent.push('');
        csvContent.push('Contacto Técnico');
        csvContent.push('Campo;Valor');
        csvContent.push(`"Nombre";"${data.tecNombre || ''}"`);
        csvContent.push(`"Apellidos";"${data.tecApellidos || ''}"`);
        csvContent.push(`"Cargo";"${data.tecCargo || ''}"`);
        csvContent.push('');
        csvContent.push('Contacto Financiero');
        csvContent.push('Campo;Valor');
        csvContent.push(`"Nombre";"${data.finNombre || ''}"`);
        csvContent.push(`"Apellidos";"${data.finApellidos || ''}"`);
        csvContent.push(`"Cargo";"${data.finCargo || ''}"`);
        csvContent.push('');
        csvContent.push('');
        
        // === PÁGINA 2: DIRECCIONES ===
        csvContent.push('=== PÁGINA 2: DIRECCIÓN ===');
        csvContent.push('');
        csvContent.push('Campo;Valor');
        csvContent.push(`"Tipo de Vía";"${data.dirTipoVia || ''}"`);
        csvContent.push(`"Dirección";"${data.dirDireccion || ''}"`);
        csvContent.push(`"Número";"${data.dirNumero || ''}"`);
        csvContent.push(`"Código Postal";"${data.dirCP || ''}"`);
        csvContent.push(`"Provincia";"${data.dirProvincia || ''}"`);
        csvContent.push(`"Localidad";"${data.dirLocalidad || ''}"`);
        csvContent.push(`"Teléfono";"${data.dirTelefono || ''}"`);
        csvContent.push(`"Email";"${data.dirEmail || ''}"`);
        csvContent.push('');
        csvContent.push('');
        
        // === PÁGINA 3: ORGANIZACIÓN ===
        csvContent.push('=== PÁGINA 3: ORGANIZACIÓN ===');
        csvContent.push('');
        csvContent.push('Capital Social');
        csvContent.push('Campo;Valor');
        csvContent.push(`"Año de Constitución";"${data.orgAnoCapital || ''}"`);
        csvContent.push(`"Capital Social";"${data.orgCapitalSocial || ''}"`);
        csvContent.push('');
        csvContent.push('Composición Accionarial');
        csvContent.push('Nombre/Razón Social;CIF;% Participación;Pyme;Nacionalidad');
        if (data.accionarial && Array.isArray(data.accionarial)) {
            data.accionarial.forEach(acc => {
                csvContent.push(`"${acc.nombre || ''}";"${acc.cif || ''}";"${acc.pct || ''}";"${acc.pyme || ''}";"${acc.nacionalidad || ''}"`);
            });
        }
        csvContent.push('');
        csvContent.push('');
        
        // === PÁGINA 4: RECURSOS HUMANOS ===
        csvContent.push('=== PÁGINA 4: RECURSOS HUMANOS ===');
        csvContent.push('');
        if (data.recursosHumanos && Array.isArray(data.recursosHumanos)) {
            data.recursosHumanos.forEach(rh => {
                csvContent.push(`Año ${rh.year || ''}`);
                csvContent.push('Categoría;Hombres;Mujeres;Total');
                csvContent.push(`"Personal Investigador - Doctor";"${rh.inv_doc_h || ''}";"${rh.inv_doc_m || ''}";"${rh.inv_doc_total || ''}"`);
                csvContent.push(`"Personal Investigador - Titulado";"${rh.inv_tit_h || ''}";"${rh.inv_tit_m || ''}";"${rh.inv_tit_total || ''}"`);
                csvContent.push(`"Técnicos";"${rh.tec_h || ''}";"${rh.tec_m || ''}";"${rh.tec_total || ''}"`);
                csvContent.push(`"Auxiliar";"${rh.aux_h || ''}";"${rh.aux_m || ''}";"${rh.aux_total || ''}"`);
                csvContent.push(`"Otros";"${rh.otros_h || ''}";"${rh.otros_m || ''}";"${rh.otros_total || ''}"`);
                csvContent.push(`"TOTAL";"${rh.total_h || ''}";"${rh.total_m || ''}";"${rh.total_total || ''}"`);
                csvContent.push('');
            });
        }
        csvContent.push('');
        
        // === PÁGINA 5: PERSONAL I+D ===
        csvContent.push('=== PÁGINA 5: PERSONAL I+D ===');
        csvContent.push('');
        csvContent.push('Campo;Valor');
        csvContent.push(`"Año";"${data.rec_ano || ''}"`);
        csvContent.push(`"Total Empleados";"${data.rec_total || ''}"`);
        csvContent.push(`"Hombres I+D";"${data.rec_id_hombres || ''}"`);
        csvContent.push(`"Mujeres I+D";"${data.rec_id_mujeres || ''}"`);
        csvContent.push(`"Año Inmovilizado";"${data.id_ano || ''}"`);
        csvContent.push(`"Inmovilizado Material";"${data.id_inmovilizado || ''}"`);
        csvContent.push(`"Gastos Corrientes";"${data.id_gastos_corrientes || ''}"`);
        csvContent.push('');
        csvContent.push('');
        
        // === PÁGINA 6: PRODUCTOS/SERVICIOS ===
        csvContent.push('=== PÁGINA 6: PRODUCTOS/SERVICIOS ===');
        csvContent.push('');
        csvContent.push('Producto/Servicio;% Ventas Totales;% Ventas Nacionales;% Ventas Exportación');
        if (data.productos && Array.isArray(data.productos)) {
            data.productos.forEach(prod => {
                csvContent.push(`"${prod.nombre || ''}";"${prod.ventas || ''}";"${prod.nac || ''}";"${prod.exp || ''}"`);
            });
        }
        csvContent.push('');
        csvContent.push('');
        
        // === PÁGINA 7: DATOS EMPRESA ===
        csvContent.push('=== PÁGINA 7: DATOS DE LA EMPRESA ===');
        csvContent.push('');
        csvContent.push('Campo;Valor');
        csvContent.push(`"Tipo de Entidad";"${data.entidadTipo || ''}"`);
        csvContent.push(`"Tamaño de la Empresa";"${data.entidadTamaño || ''}"`);
        csvContent.push(`"Efectivos";"${data.ent_efectivos || ''}"`);
        csvContent.push(`"Volumen de Negocio";"${data.ent_volumen_negocio || ''}"`);
        csvContent.push(`"Balance General";"${data.ent_balance_general || ''}"`);
        csvContent.push('');
        csvContent.push('');
        
        // === PÁGINA 8: DATOS BANCARIOS ===
        csvContent.push('=== PÁGINA 8: DATOS BANCARIOS ===');
        csvContent.push('');
        csvContent.push('Campo;Valor');
        csvContent.push(`"IBAN";"${data.bankIBAN || ''}"`);
        csvContent.push(`"Entidad";"${data.bankEntidad || ''}"`);
        csvContent.push(`"Oficina";"${data.bankOficina || ''}"`);
        csvContent.push(`"DC";"${data.bankDC || ''}"`);
        csvContent.push(`"Número de Cuenta";"${data.bankNumero || ''}"`);
        csvContent.push('');
        csvContent.push('');
        
        // === PÁGINA 9: CONDICIONES ===
        csvContent.push('=== PÁGINA 9: CONDICIONES ===');
        csvContent.push('');
        csvContent.push('Condición;Aceptada');
        csvContent.push(`"FEDER";"${data.cond_1 ? 'Sí' : 'No'}"`);
        csvContent.push(`"Tratamiento de Datos";"${data.cond_2 ? 'Sí' : 'No'}"`);
        csvContent.push(`"Información Veraz";"${data.cond_3 ? 'Sí' : 'No'}"`);
        csvContent.push(`"CCAA";"${data.cond_4 ? 'Sí' : 'No'}"`);
        
        const csvString = csvContent.join('\n');
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvString], { type: 'text/csv;charset=utf-8;' });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        const dateStr = new Date().toISOString().slice(0, 10);
        const safeName = clientId.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
        link.setAttribute('download', `cliente_${safeName}_${dateStr}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showMessageBox("Exportación Exitosa", `CSV descargado para el cliente: ${clientId}`);
        
    } catch (error) {
        console.error("Error descargando CSV:", error);
        showMessageBox("Error", "No se pudo descargar el CSV del cliente");
    }
}

window.exportToCSV = function() {
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

// Variables de contadores dinámicos (inicializadas a 1, se actualizarán al cargar)
let accionarialCount = 1;
let consejoCount = 1;
let filialCount = 1;

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
            <label for="acc_${accionarialCount}_nombre">Nombre / Razón Social:</label>
            <input id="acc_${accionarialCount}_nombre" type="text" class="input-default">
        </div>
        <div>
            <label for="acc_${accionarialCount}_cif">CIF:</label>
            <input id="acc_${accionarialCount}_cif" type="text" class="input-default">
        </div>
        <div style="position: relative;">
            <label for="acc_${accionarialCount}_pct">% Participación:</label>
            <input id="acc_${accionarialCount}_pct" type="number" step="0.1" class="input-default" oninput="validatePercentageField(this)">
        </div>
        <div>
            <label for="acc_${accionarialCount}_pyme">Pyme:</label>
            <select id="acc_${accionarialCount}_pyme" class="input-default">
                <option value="">--</option>
                <option value="Sí">Sí</option>
                <option value="No">No</option>
            </select>
        </div>
        <div>
            <label for="acc_${accionarialCount}_nacionalidad">Nacionalidad:</label>
            <input id="acc_${accionarialCount}_nacionalidad" type="text" class="input-default">
        </div>
        <button type="button" onclick="removeAccionarialGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">
            − Eliminar
        </button>
    `;
    
    container.appendChild(nuevoGrupo);
}

/**
 * Función para eliminar grupos de accionistas
 */
function removeAccionarialGrupo(button) {
    const parent = button.parentElement;
    if (!parent) return;
    parent.remove();
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
        setStepError(3, true);
        setStepCompleted(3, false);
    } else {
        // Marcar todos los campos como válidos
        camposPorcentaje.forEach(campo => {
            if (campo.value && campo.value.trim() !== '') {
                setFieldValidWithTooltip(campo);
            }
        });
        
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
            <label for="consejo_${consejoCount}_nombre">Nombre:</label>
            <input id="consejo_${consejoCount}_nombre" type="text" class="input-default">
        </div>
        <div>
            <label for="consejo_${consejoCount}_dni">DNI/CIF:</label>
            <input id="consejo_${consejoCount}_dni" type="text" class="input-default">
        </div>
        <div>
            <label for="consejo_${consejoCount}_cargo">Cargo:</label>
            <input id="consejo_${consejoCount}_cargo" type="text" class="input-default">
        </div>
        <div>
            <label for="consejo_${consejoCount}_nacionalidad">Nacionalidad:</label>
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
let productoCount = 1;

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
            <label for="prod${productoCount}_nombre" style="font-weight: 700; display: block; margin-bottom: 0.5rem;">Producto/Servicio ${productoCount}:</label>
            <input id="prod${productoCount}_nombre" type="text" class="input-default" placeholder="Nombre del producto o servicio">
        </div>
        <div class="form-grid md:grid-cols-3" style="gap: 1rem;">
            <div>
                <label for="prod${productoCount}_ventas">% Ventas Totales:</label>
                <input id="prod${productoCount}_ventas" type="text" class="input-default" oninput="validatePercentageField(this)">
            </div>
            <div>
                <label for="prod${productoCount}_nac">% Ventas Nacionales:</label>
                <input id="prod${productoCount}_nac" type="text" class="input-default" oninput="validatePercentageField(this); calcularExportacion(${productoCount})">
            </div>
            <div>
                <label for="prod${productoCount}_exp">% Ventas Exportación:</label>
                <input id="prod${productoCount}_exp" type="text" class="input-readonly" readonly>
            </div>
        </div>
        <button type="button" onclick="removeProductoGrupo(this)" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.75rem;">
            − Eliminar
        </button>
    `;
    
    container.appendChild(nuevoGrupo);
    validarTotalVentas(); // Validar después de añadir
}

/**
 * Función para eliminar grupos de productos
 */
function removeProductoGrupo(button) {
    const parent = button.parentElement;
    if (!parent) return;
    parent.remove();
    validarTotalVentas(); // Revalidar después de eliminar
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
        clearPageError(6);
        setStepError(6, false); // Quitar marca de error del stepper
        setStepCompleted(6, true);
    }
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
                <label for="prod${num}_nombre" style="font-weight: 700; display: block;">Producto/Servicio ${num}:</label>
                ${deleteButton}
            </div>
            <div style="margin-bottom: 1rem;">
                <input id="prod${num}_nombre" type="text" class="input-default" placeholder="Nombre del producto o servicio" value="${prod.nombre || ''}">
            </div>
            <div class="form-grid md:grid-cols-3" style="gap: 1rem;">
                <div>
                    <label for="prod${num}_ventas">% Ventas Totales:</label>
                    <input id="prod${num}_ventas" type="text" class="input-default" oninput="validatePercentageField(this)" value="${prod.ventas || ''}">
                </div>
                <div>
                    <label for="prod${num}_nac">% Ventas Nacionales:</label>
                    <input id="prod${num}_nac" type="text" class="input-default" oninput="validatePercentageField(this); calcularExportacion(${num})" value="${prod.nac || ''}">
                </div>
                <div>
                    <label for="prod${num}_exp">% Ventas Exportación:</label>
                    <input id="prod${num}_exp" type="text" class="input-readonly" readonly value="${prod.exp || ''}">
                </div>
            </div>
        `;
        
        container.appendChild(grupo);
    });
    
    productoCount = productos.length;
}

function renderProductosIniciales() {
    const container = document.getElementById('productos-container');
    if (!container) return;
    
    // Limpiar errores de página 6 antes de renderizar
    clearPageError(6);
    setStepError(6, false);
    
    // Agregar el primer producto por defecto (SIN botón eliminar)
    const primerGrupo = document.createElement('div');
    primerGrupo.className = 'producto-grupo';
    primerGrupo.style.cssText = `background-color: var(--card); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;
    
    primerGrupo.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <label for="prod1_nombre" style="font-weight: 700; display: block; margin-bottom: 0.5rem;">Producto/Servicio 1:</label>
            <input id="prod1_nombre" type="text" class="input-default" placeholder="Nombre del producto o servicio">
        </div>
        <div class="form-grid md:grid-cols-3" style="gap: 1rem;">
            <div>
                <label for="prod1_ventas">% Ventas Totales:</label>
                <input id="prod1_ventas" type="text" class="input-default" oninput="validatePercentageField(this)">
            </div>
            <div>
                <label for="prod1_nac">% Ventas Nacionales:</label>
                <input id="prod1_nac" type="text" class="input-default" oninput="validatePercentageField(this); calcularExportacion(1)">
            </div>
            <div>
                <label for="prod1_exp">% Ventas Exportación:</label>
                <input id="prod1_exp" type="text" class="input-readonly" readonly>
            </div>
        </div>
    `;
    
    container.appendChild(primerGrupo);
}

window.addProductoGrupo = addProductoGrupo;
window.removeProductoGrupo = removeProductoGrupo;
window.calcularExportacion = calcularExportacion;
window.validarTotalVentas = validarTotalVentas;

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


/** Solicita la clave de administrador para acceder al panel admin */
async function promptAdminKey() {
    // Verificar que Firebase esté inicializado antes de solicitar acceso
    if (!isAuthReady || !db) {
        showMessageBox("Error", "Sistema no inicializado. Por favor espere unos segundos y vuelva a intentarlo.");
        return;
    }
    
    const key = await showMessageBox("Acceso Administrador", "Introduzca la clave de administrador:", true);
    if (key === ADMIN_KEY) {
        setView('admin');
    } else if (key !== false && key !== null) { // key !== false significa que no canceló
        showMessageBox("Error", "Clave incorrecta.");
    }
}

// Exponer funciones globales mínimas
window.setView = setView;
window.promptAdminKey = promptAdminKey;
window.saveFormData = saveFormData;
window.navigatePage = navigatePage;
window.logout = logout;
window.goToPage = async function(pageNumber){
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
window.validateIBAN = validateIBAN;
window.validatePage3 = validatePage3;
window.validatePage4 = validatePage4;
window.validatePage8 = validatePage8;
window.validarParticipacionAccionarial = validarParticipacionAccionarial;
window.handleCPInput = handleCPInput;

// Inicializar la aplicación
window.onload = function () {
    // Inicializar sistema de login
    initLoginSystem();
    
    // Referenciar los botones de navegación
    prevBtn = document.getElementById('prev-btn');
    nextBtn = document.getElementById('next-btn');
    saveBtn = document.getElementById('save-btn');
    pageIndicator = document.getElementById('page-indicator'); // Aunque esté oculto, lo referenciamos
    
    // Render Recursos Humanos inicialmente (vacío), se actualizará al cargar datos
    renderRecursosHumanos([]);
    
    // Render Productos inicialmente (al menos 1 producto)
    renderProductosIniciales();
    
    // Limpiar todos los errores de página al inicializar
    for (let i = 1; i <= TOTAL_PAGES; i++) {
        clearPageError(i);
        setStepError(i, false);
    }
    
    // Limpiar todos los campos del formulario de valores extraños
    limpiarCamposIniciales();
    
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
            }
        });
        
        dataForm.addEventListener('input', (e) => {
            // Marcar que el usuario está interactuando activamente
            if (e.target && e.target.tagName === 'INPUT') {
                e.target.setAttribute('data-user-editing', 'true');
            }
            
            debouncedSave();
            
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
                // Si el campo modificado es de participación, validar inmediatamente y SIN debounce
                if (e.target && e.target.id && e.target.id.includes('_pct')) {
                    // Validación inmediata de participación
                    setTimeout(() => validarParticipacionAccionarial(), 100);
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
        });
    }

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