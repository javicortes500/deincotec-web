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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

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
        } else {
            stepEl.classList.remove('error');
        }
    } catch(e) {
        console.warn('setStepError:', e);
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
            const validation = validatePage3();
            setStepError(3, !validation.isValid);
            // Los errores ahora se muestran como tooltips en los campos
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
            // Los errores ahora se muestran como tooltips en los campos
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
            // Los errores ahora se muestran como tooltips en los campos
        }
    }, 500);
}

/** Inicializa Firebase y autentica al usuario. */
async function initializeFirebase() {
    try {
        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase config is missing.");
            const statusEl = document.getElementById('data-loading-status');
            if (statusEl) {
                 statusEl.textContent = "ERROR: Configuración de Firebase faltante.";
            }
            return;
        }

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
    } catch (error)
    {
        console.error("Error al inicializar Firebase:", error);
        showMessageBox("Error de Inicialización", "No se pudo conectar con la base de datos.");
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
            showMessageBox("Error", "La base de datos no está lista. Intente recargar.");
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
        loadAdminFormData();
    }
}

/** Muestra la página del formulario especificada. */
function showPage(pageNumber) {
    currentPage = pageNumber;
    
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
        } else if (currentPage === 2) {
            const validation = validatePage2();
            setStepError(2, !validation.isValid);
        } else if (currentPage === 3) {
            const validation = validatePage3();
            setStepError(3, !validation.isValid);
        } else if (currentPage === 4) {
            const validation = validatePage4();
            setStepError(4, !validation.isValid);
        } else if (currentPage === 7) {
            const validation = validatePage7();
            setStepError(7, !validation.isValid);
        } else if (currentPage === 8) {
            const validation = validatePage8();
            setStepError(8, !validation.isValid);
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

// En la inicialización / window.onload asegúrate de que renderRecursosHumanos([]) se llame (ya estaba en la versión previa).
// Si en tu main.js original la llamada está en window.onload, mantenla; si no, añade:
// renderRecursosHumanos([]);

// Nota: No cambian los ids de inputs (siguen siendo rh_{year}_...), por tanto saveFormData y validatePage4 siguen funcionando.

/** Carga los datos existentes de un usuario. */
async function loadUserFormData() {
    if (!db || !userId) {
        console.warn("DB or userId not ready for loading data.");
        return;
    }
    
    const collectionPath = `artifacts/${appId}/public/data/client_forms`;
    const docRef = doc(db, collectionPath, userId);
    
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            console.log("Documento existente encontrado, rellenando formulario.");
            const data = docSnap.data();
            
            // Página 1: Contactos
            document.getElementById('instNIF').value = data.instNIF || '';
            document.getElementById('instNombre').value = data.instNombre || '';
            document.getElementById('instApellidos').value = data.instApellidos || '';
            document.getElementById('instCargo').value = data.instCargo || '';
            document.getElementById('instTelefono').value = data.instTelefono || '';
            document.getElementById('instEmail').value = data.instEmail || '';
            document.getElementById('tecNombre').value = data.tecNombre || '';
            document.getElementById('tecApellidos').value = data.tecApellidos || '';
            document.getElementById('tecCargo').value = data.tecCargo || '';
            document.getElementById('finNombre').value = data.finNombre || '';
            document.getElementById('finApellidos').value = data.finApellidos || '';
            document.getElementById('finCargo').value = data.finCargo || '';
            
            // Página 2: Dirección
            document.getElementById('dirTipoVia').value = data.dirTipoVia || '';
            document.getElementById('dirDireccion').value = data.dirDireccion || '';
            document.getElementById('dirNumero').value = data.dirNumero || '';
            document.getElementById('dirCP').value = data.dirCP || '';
            document.getElementById('dirProvincia').value = data.dirProvincia || '';
            document.getElementById('dirLocalidad').value = data.dirLocalidad || '';
            document.getElementById('dirTelefono').value = data.dirTelefono || '';
            document.getElementById('dirEmail').value = data.dirEmail || '';

            // Página 3: Organización (estáticos)
            document.getElementById('orgAnoCapital').value = data.orgAnoCapital || '';
            document.getElementById('orgCapitalSocial').value = data.orgCapitalSocial || '';

            // Página 4: Recursos Humanos - reconstruir usando recHumanos array
            const recHumanosArr = Array.isArray(data.recHumanos) ? data.recHumanos : [];
            renderRecursosHumanos(recHumanosArr);

            // Página 4: si no hay dato, renderRecursosHumanos generará vacíos
            // Página 4 validation state update:
            const page4Validation = validatePage4();
            setStepError(4, !page4Validation.isValid);
            if (!page4Validation.isValid) showPageError(4, "Revisar Recursos Humanos: " + page4Validation.errors.join(', '));
            else clearPageError(4);

            // Página 5: Gastos I+D
            document.getElementById('id_ano').value = data.id_ano || '';
            document.getElementById('id_inmovilizado').value = data.id_inmovilizado || '';
            document.getElementById('id_gastos_corrientes').value = data.id_gastos_corrientes || '';

            // Página 6: Productos
            document.getElementById('prod1_nombre').value = data.prod1_nombre || '';
            document.getElementById('prod1_ventas').value = data.prod1_ventas || '';
            document.getElementById('prod1_nac').value = data.prod1_nac || '';
            document.getElementById('prod1_exp').value = data.prod1_exp || '';
            document.getElementById('prod2_nombre').value = data.prod2_nombre || '';
            document.getElementById('prod2_ventas').value = data.prod2_ventas || '';
            document.getElementById('prod2_nac').value = data.prod2_nac || '';
            document.getElementById('prod2_exp').value = data.prod2_exp || '';
            document.getElementById('prod3_nombre').value = data.prod3_nombre || '';
            document.getElementById('prod3_ventas').value = data.prod3_ventas || '';
            document.getElementById('prod3_nac').value = data.prod3_nac || '';
            document.getElementById('prod3_exp').value = data.prod3_exp || '';

            // Página 7: Tipo Entidad
            document.getElementById('entidadTipo').value = data.entidadTipo || '';
            document.getElementById('entidadTamaño').value = data.entidadTamaño || '';
            document.getElementById('ent_efectivos').value = data.ent_efectivos || '';
            document.getElementById('ent_volumen_negocio').value = data.ent_volumen_negocio || '';
            document.getElementById('ent_balance_general').value = data.ent_balance_general || '';

            // Página 8: Datos Bancarios
            document.getElementById('bankIBAN').value = data.bankIBAN || '';
            document.getElementById('bankEntidad').value = data.bankEntidad || '';
            document.getElementById('bankOficina').value = data.bankOficina || '';
            document.getElementById('bankDC').value = data.bankDC || '';
            document.getElementById('bankNumero').value = data.bankNumero || '';

            // Página 9 (Condiciones)
            document.getElementById('cond_1').checked = !!data.cond_1;
            document.getElementById('cond_2').checked = !!data.cond_2;
            document.getElementById('cond_3').checked = !!data.cond_3;
            document.getElementById('cond_4').checked = !!data.cond_4;

            // Reconstruir arrays dinámicos: accionarial, consejo, filiales (si existen)
            // ACCIONARIAL
            const accionarialArr = Array.isArray(data.accionarial) ? data.accionarial : [];
            const accContainer = document.getElementById('accionarial-container');
            if (accContainer) {
                accContainer.innerHTML = '';
                if (accionarialArr.length === 0) {
                    // default empty group
                    accContainer.innerHTML = `<div class="accionarial-grupo form-grid md:grid-cols-2" style="background-color: var(--card); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                        <div><label for="acc_1_nombre">Nombre / Razón Social:</label><input id="acc_1_nombre" type="text" class="input-default"></div>
                        <div><label for="acc_1_cif">CIF:</label><input id="acc_1_cif" type="text" class="input-default"></div>
                        <div><label for="acc_1_pct">% Participación:</label><input id="acc_1_pct" type="number" step="0.1" class="input-default"></div>
                        <div><label for="acc_1_pyme">Pyme:</label><select id="acc_1_pyme" class="input-default"><option value=\"\">--</option><option value=\"Sí\">Sí</option><option value=\"No\">No</option></select></div>
                        <div><label for="acc_1_nacionalidad">Nacionalidad:</label><input id="acc_1_nacionalidad" type="text" class="input-default"></div>
                    </div>`;
                    accionarialCount = 1;
                } else {
                    accionarialArr.forEach((acc, idx) => {
                        const i = idx + 1;
                        const bg = i % 2 === 0 ? '#f3f4f6' : 'var(--card)';
                        const div = document.createElement('div');
                        div.className = 'accionarial-grupo form-grid md:grid-cols-2';
                        div.style.cssText = `background-color: ${bg}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;
                        div.innerHTML = `
                            <div><label for="acc_${i}_nombre">Nombre / Razón Social:</label><input id="acc_${i}_nombre" type="text" class="input-default" value="${acc.nombre || ''}"></div>
                            <div><label for="acc_${i}_cif">CIF:</label><input id="acc_${i}_cif" type="text" class="input-default" value="${acc.cif || ''}"></div>
                            <div><label for="acc_${i}_pct">% Participación:</label><input id="acc_${i}_pct" type="number" step="0.1" class="input-default" value="${acc.porcentaje || ''}"></div>
                            <div><label for="acc_${i}_pyme">Pyme:</label><select id="acc_${i}_pyme" class="input-default"><option value="">--</option><option value="Sí"${acc.pyme==='Sí'?' selected':''}>Sí</option><option value="No"${acc.pyme==='No'?' selected':''}>No</option></select></div>
                            <div><label for="acc_${i}_nacionalidad">Nacionalidad:</label><input id="acc_${i}_nacionalidad" type="text" class="input-default" value="${acc.nacionalidad || ''}"></div>
                            <button type="button" onclick="removeAccionarialGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">− Eliminar</button>
                        `;
                        accContainer.appendChild(div);
                    });
                    accionarialCount = accionarialArr.length;
                }
            }

            // CONSEJO
            const consejoArr = Array.isArray(data.consejo) ? data.consejo : [];
            const consejoContainer = document.getElementById('consejo-container');
            if (consejoContainer) {
                consejoContainer.innerHTML = '';
                if (consejoArr.length === 0) {
                    consejoContainer.innerHTML = `<div class="consejo-grupo form-grid md:grid-cols-2" style="background-color: var(--card); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                        <div><label for="consejo_1_nombre">Nombre:</label><input id="consejo_1_nombre" type="text" class="input-default"></div>
                        <div><label for="consejo_1_dni">DNI/CIF:</label><input id="consejo_1_dni" type="text" class="input-default"></div>
                        <div><label for="consejo_1_cargo">Cargo:</label><input id="consejo_1_cargo" type="text" class="input-default"></div>
                        <div><label for="consejo_1_nacionalidad">Nacionalidad:</label><input id="consejo_1_nacionalidad" type="text" class="input-default"></div>
                    </div>`;
                    consejoCount = 1;
                } else {
                    consejoArr.forEach((c, idx) => {
                        const i = idx + 1;
                        const bg = i % 2 === 0 ? '#f3f4f6' : 'var(--card)';
                        const div = document.createElement('div');
                        div.className = 'consejo-grupo form-grid md:grid-cols-2';
                        div.style.cssText = `background-color: ${bg}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;
                        div.innerHTML = `
                            <div><label for="consejo_${i}_nombre">Nombre:</label><input id="consejo_${i}_nombre" type="text" class="input-default" value="${c.nombre || ''}"></div>
                            <div><label for="consejo_${i}_dni">DNI/CIF:</label><input id="consejo_${i}_dni" type="text" class="input-default" value="${c.dni || ''}"></div>
                            <div><label for="consejo_${i}_cargo">Cargo:</label><input id="consejo_${i}_cargo" type="text" class="input-default" value="${c.cargo || ''}"></div>
                            <div><label for="consejo_${i}_nacionalidad">Nacionalidad:</label><input id="consejo_${i}_nacionalidad" type="text" class="input-default" value="${c.nacionalidad || ''}"></div>
                            <button type="button" onclick="removeConsejoGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">− Eliminar</button>
                        `;
                        consejoContainer.appendChild(div);
                    });
                    consejoCount = consejoArr.length;
                }
            }

            // FILIALES
            const filialesArr = Array.isArray(data.filiales) ? data.filiales : [];
            const filialContainer = document.getElementById('filial-container');
            if (filialContainer) {
                filialContainer.innerHTML = '';
                if (filialesArr.length === 0) {
                    filialContainer.innerHTML = `<div class="filial-grupo form-grid md:grid-cols-2" style="background-color: var(--card); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                        <div><label for="filial_1_razon">Razón Social:</label><input id="filial_1_razon" type="text" class="input-default"></div>
                        <div><label for="filial_1_cif">CIF:</label><input id="filial_1_cif" type="text" class="input-default"></div>
                        <div><label for="filial_1_actividad">Actividad Principal:</label><input id="filial_1_actividad" type="text" class="input-default"></div>
                        <div><label for="filial_1_pct">% Participación:</label><input id="filial_1_pct" type="number" step="0.1" class="input-default"></div>
                        <div><label for="filial_1_pais">País:</label><input id="filial_1_pais" type="text" class="input-default"></div>
                    </div>`;
                    filialCount = 1;
                } else {
                    filialesArr.forEach((f, idx) => {
                        const i = idx + 1;
                        const bg = i % 2 === 0 ? '#f3f4f6' : 'var(--card)';
                        const div = document.createElement('div');
                        div.className = 'filial-grupo form-grid md:grid-cols-2';
                        div.style.cssText = `background-color: ${bg}; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;`;
                        div.innerHTML = `
                            <div><label for="filial_${i}_razon">Razón Social:</label><input id="filial_${i}_razon" type="text" class="input-default" value="${f.razon || ''}"></div>
                            <div><label for="filial_${i}_cif">CIF:</label><input id="filial_${i}_cif" type="text" class="input-default" value="${f.cif || ''}"></div>
                            <div><label for="filial_${i}_actividad">Actividad Principal:</label><input id="filial_${i}_actividad" type="text" class="input-default" value="${f.actividad || ''}"></div>
                            <div><label for="filial_${i}_pct">% Participación:</label><input id="filial_${i}_pct" type="number" step="0.1" class="input-default" value="${f.porcentaje || ''}"></div>
                            <div><label for="filial_${i}_pais">País:</label><input id="filial_${i}_pais" type="text" class="input-default" value="${f.pais || ''}"></div>
                            <button type="button" onclick="removeFilialGrupo(this)" class="md:col-span-2" style="background-color: #ef4444; color: white; padding: 0.6rem 1.2rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600; margin-top: 0.5rem;">− Eliminar</button>
                        `;
                        filialContainer.appendChild(div);
                    });
                    filialCount = filialesArr.length;
                }
            }

        } else {
            console.log("No existing document found for this user.");
            // If no doc, render Recursos Humanos blank
            renderRecursosHumanos([]);
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
    
    // Disparar eventos input para que las validaciones se apliquen visualmente
    document.querySelectorAll('[data-page="1"] input, [data-page="1"] select').forEach(el => el.dispatchEvent(new Event('input')));
    document.querySelectorAll('[data-page="2"] input, [data-page="2"] select').forEach(el => el.dispatchEvent(new Event('input')));

    // Mostrar la primera página después de cargar
    showPage(1);
}

/** Pide la clave de administrador. */
async function promptAdminKey() {
    const key = await showMessageBox(
        "Acceso de Administrador",
        "Por favor, ingrese la clave de administrador para acceder a los datos.",
        true
    );
    if (key === ADMIN_KEY) {
        setView('admin');
    } else if (key !== false) { // false means canceled
        showMessageBox("Acceso Denegado", "Clave incorrecta. Permanece en la vista de cliente.");
    }
}

/** Guarda los datos del formulario en Firestore usando setDoc con el userId. */
async function saveFormData(isFinalSave = false) {
    if (!db || isSaving) {
        if (!db && isFinalSave) showMessageBox("Error", "La base de datos no está disponible.");
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

            prod1_nombre: document.getElementById('prod1_nombre').value.trim(),
            prod1_ventas: document.getElementById('prod1_ventas').value.trim(),
            prod1_nac: document.getElementById('prod1_nac').value.trim(),
            prod1_exp: document.getElementById('prod1_exp').value.trim(),
            prod2_nombre: document.getElementById('prod2_nombre').value.trim(),
            prod2_ventas: document.getElementById('prod2_ventas').value.trim(),
            prod2_nac: document.getElementById('prod2_nac').value.trim(),
            prod2_exp: document.getElementById('prod2_exp').value.trim(),
            prod3_nombre: document.getElementById('prod3_nombre').value.trim(),
            prod3_ventas: document.getElementById('prod3_ventas').value.trim(),
            prod3_nac: document.getElementById('prod3_nac').value.trim(),
            prod3_exp: document.getElementById('prod3_exp').value.trim(),

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

        // Ruta: /artifacts/{appId}/public/data/client_forms/{userId}
        const collectionPath = `artifacts/${appId}/public/data/client_forms`;
        await setDoc(doc(db, collectionPath, userId), formData, { merge: true });

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

    statusEl.textContent = "Conectado. Esperando datos...";

    const collectionPath = `artifacts/${appId}/public/data/client_forms`;
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

        dataArray.forEach(data => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${data.Fecha}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${data.NIF_Institucional}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${data.Nombre_Institucional} ${data.Apellidos_Institucional}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-blue-600">${data.Email_Institucional}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${data.Telefono_Institucional}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700">${data.Direccion_Localidad}</td>
            `;
        });
        statusEl.textContent = `Mostrando ${dataArray.length} registros en tiempo real.`;

    }, (error) => {
        console.error("Error en onSnapshot: ", error);
        const statusEl = document.getElementById('data-loading-status');
        if (statusEl) statusEl.textContent = "Error al cargar los datos en tiempo real.";
    });
}

/** Exporta los datos a CSV. */
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
        <div>
            <label for="acc_${accionarialCount}_pct">% Participación:</label>
            <input id="acc_${accionarialCount}_pct" type="number" step="0.1" class="input-default">
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

window.addAccionarialGrupo = addAccionarialGrupo;
window.removeAccionarialGrupo = removeAccionarialGrupo;

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
                <input id="prod${productoCount}_ventas" type="text" class="input-default" oninput="validatePercentageField(this); validarTotalVentas()">
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
    
    // Buscar todos los inputs de ventas totales
    const ventasInputs = container.querySelectorAll('input[id^="prod"][id$="_ventas"]');
    let sumaTotal = 0;
    
    ventasInputs.forEach(input => {
        const valor = parseFloat(input.value) || 0;
        sumaTotal += valor;
    });
    
    // Redondear a 1 decimal para evitar problemas de precisión
    sumaTotal = Math.round(sumaTotal * 10) / 10;
    
    if (sumaTotal !== 100) {
        showPageError(6, `La suma de % Ventas Totales debe ser 100%. Actual: ${sumaTotal}%`);
    } else {
        clearPageError(6);
    }
}

/**
 * Renderizar productos iniciales (al menos 1)
 */
function renderProductosIniciales() {
    const container = document.getElementById('productos-container');
    if (!container) return;
    
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
                <input id="prod1_ventas" type="text" class="input-default" oninput="validatePercentageField(this); validarTotalVentas()">
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


// Exponer funciones globales mínimas
window.setView = setView;
window.promptAdminKey = promptAdminKey;
window.saveFormData = saveFormData;
window.navigatePage = navigatePage;
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
window.handleCPInput = handleCPInput;

// Inicializar la aplicación
window.onload = function () {
    // Referenciar los botones de navegación
    prevBtn = document.getElementById('prev-btn');
    nextBtn = document.getElementById('next-btn');
    saveBtn = document.getElementById('save-btn');
    pageIndicator = document.getElementById('page-indicator'); // Aunque esté oculto, lo referenciamos
    
    // Render Recursos Humanos inicialmente (vacío), se actualizará al cargar datos
    renderRecursosHumanos([]);
    
    // Render Productos inicialmente (al menos 1 producto)
    renderProductosIniciales();

    // Añadir el listener para el auto-guardado a todo el formulario
    const dataForm = document.getElementById('data-form');
    if (dataForm) {
        dataForm.addEventListener('input', (e) => {
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
                debouncedValidatePage3();
            }

            // Validar página 4 en vivo (Recursos Humanos)
            const page4Section = document.querySelector('[data-page="4"]');
            if (page4Section && !page4Section.classList.contains('hidden')) {
                debouncedValidatePage4();
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

    initializeFirebase().then(() => {
        // Iniciar en la vista de formulario por defecto
        setView('client'); 
    });
}