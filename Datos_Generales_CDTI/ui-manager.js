// ui-manager.js - Gestor de interfaz de usuario

import { getState, setState, subscribe } from './state-manager.js';
import { log, LogLevel } from './error-handler.js';

const TOTAL_PAGES = 10;

/**
 * Muestra una página específica del formulario
 * @param {number} pageNumber - Número de página (1-10)
 * @param {boolean} shouldScroll - Si debe hacer scroll hacia arriba
 */
export function showPage(pageNumber, shouldScroll = true) {
    log(LogLevel.DEBUG, `Mostrando página ${pageNumber}`);

    setState('ui.currentPage', pageNumber);

    // Ocultar todas las páginas
    document.querySelectorAll('[data-page]').forEach(page => {
        page.classList.add('hidden');
    });

    // Mostrar la página activa
    const activePage = document.querySelector(`[data-page="${pageNumber}"]`);
    if (activePage) {
        activePage.classList.remove('hidden');
    }

    // Actualizar stepper
    updateStepper(pageNumber);

    // Actualizar barra de progreso
    updateProgressBar(pageNumber);

    // Scroll hacia arriba
    if (shouldScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

/**
 * Actualiza el stepper lateral
 * @param {number} activePage - Página activa
 */
export function updateStepper(activePage) {
    document.querySelectorAll('#stepper-nav .step').forEach(step => {
        step.classList.remove('active');
    });

    const activeStep = document.getElementById(`step-${activePage}`);
    if (activeStep) {
        activeStep.classList.add('active');
    }
}

/**
 * Actualiza la barra de progreso
 * @param {number} pageNumber - Página actual
 */
export function updateProgressBar(pageNumber) {
    const percentage = ((pageNumber - 1) / (TOTAL_PAGES - 1)) * 100;

    const progressFill = document.getElementById('progress-bar-fill');
    const progressLabel = document.getElementById('progress-label');
    const progressPercentage = document.getElementById('progress-percentage');

    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }

    if (progressLabel) {
        progressLabel.textContent = `Paso ${pageNumber} de ${TOTAL_PAGES}`;
    }

    if (progressPercentage) {
        progressPercentage.textContent = `${Math.round(percentage)}%`;
    }
}

/**
 * Marca un paso como error en el stepper
 * @param {number} stepNumber - Número del paso
 * @param {boolean} hasError - Si tiene error
 */
export function setStepError(stepNumber, hasError) {
    const stepEl = document.getElementById(`step-${stepNumber}`);
    if (!stepEl) return;

    if (hasError) {
        stepEl.classList.add('error');
        stepEl.classList.remove('completed');
    } else {
        stepEl.classList.remove('error');
    }
}

/**
 * Marca un paso como completado en el stepper
 * @param {number} stepNumber - Número del paso
 * @param {boolean} isCompleted - Si está completado
 */
export function setStepCompleted(stepNumber, isCompleted) {
    const stepEl = document.getElementById(`step-${stepNumber}`);
    if (!stepEl) return;

    if (isCompleted) {
        stepEl.classList.add('completed');
        stepEl.classList.remove('error');
    } else {
        stepEl.classList.remove('completed');
    }
}

/**
 * Muestra un modal genérico
 * @param {string} title - Título del modal
 * @param {string} content - Contenido del modal
 * @param {boolean} needsInput - Si necesita input del usuario
 * @returns {Promise<string|boolean>} Valor ingresado o true/false
 */
export function showMessageBox(title, content, needsInput = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('message-modal');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-content');
        const inputEl = document.getElementById('modal-input');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        if (!modal) {
            log(LogLevel.WARN, 'Modal no encontrado en el DOM');
            alert(`${title}: ${content}`);
            resolve(true);
            return;
        }

        titleEl.textContent = title;
        contentEl.textContent = content;
        modal.classList.remove('hidden');
        modal.classList.add('flex');

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
 * Muestra el indicador de auto-guardado
 * @param {string} message - Mensaje a mostrar
 * @param {string} status - Estado ('success', 'error', 'saving')
 */
export function showAutosaveIndicator(message, status = 'success') {
    const indicator = document.getElementById('autosave-indicator');
    if (!indicator) return;

    indicator.textContent = message;

    // Remover clases anteriores
    indicator.classList.remove('success', 'error', 'saving');

    // Añadir clase según status
    if (status) {
        indicator.classList.add(status);
    }

    // Auto-ocultar después de 3 segundos
    if (status !== 'saving') {
        setTimeout(() => {
            indicator.textContent = 'Autosave activo';
            indicator.classList.remove('success', 'error');
        }, 3000);
    }
}

/**
 * Muestra la pantalla de login
 */
export function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app');

    if (loginScreen) loginScreen.style.display = 'flex';
    if (appScreen) appScreen.style.display = 'none';
}

/**
 * Muestra la aplicación principal (oculta login)
 */
export function showMainApp() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app');

    if (loginScreen) loginScreen.style.display = 'none';
    if (appScreen) appScreen.style.display = 'block';
}

/**
 * Cambia entre vista cliente y admin
 * @param {string} view - 'client' o 'admin'
 */
export function setView(view) {
    const clientView = document.getElementById('client-view');
    const adminView = document.getElementById('admin-view');
    const mainTitle = document.getElementById('main-title');
    const showFormBtn = document.getElementById('show-form-btn');
    const showAdminBtn = document.getElementById('show-admin-btn');

    setState('ui.currentView', view);

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
    } else if (view === 'admin') {
        if (clientView) clientView.classList.add('hidden');
        if (adminView) adminView.classList.remove('hidden');
        if (mainTitle) mainTitle.textContent = "Panel de Administración de Datos";

        if (showFormBtn && showAdminBtn) {
            showFormBtn.style.backgroundColor = '#d1d5db';
            showFormBtn.style.color = 'var(--brand)';
            showAdminBtn.style.backgroundColor = 'var(--accent)';
            showAdminBtn.style.color = 'white';
        }
    }

    log(LogLevel.INFO, `Vista cambiada a: ${view}`);
}

/**
 * Actualiza el badge de información del cliente
 * @param {string} clientId - ID del cliente
 * @param {string} nombre - Nombre del cliente (opcional)
 */
export function updateClientBadge(clientId, nombre = null) {
    const clientInfo = document.getElementById('client-info');
    const clientIdEl = document.getElementById('client-id');

    if (clientInfo && clientIdEl) {
        clientIdEl.textContent = nombre || clientId;
        clientInfo.style.display = 'flex';
    }
}

/**
 * Muestra/oculta el botón de logout
 * @param {boolean} show - Si debe mostrarse
 */
export function toggleLogoutButton(show) {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.style.display = show ? 'inline-block' : 'none';
    }
}

/**
 * Habilita/deshabilita botones de navegación
 * @param {boolean} enabled - Si deben estar habilitados
 */
export function setNavigationEnabled(enabled) {
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const saveBtn = document.getElementById('save-btn');

    [prevBtn, nextBtn, saveBtn].forEach(btn => {
        if (btn) {
            btn.disabled = !enabled;
        }
    });
}

/**
 * Inicializa listeners de UI reactivos basados en estado
 */
export function initializeReactiveUI() {
    // Actualizar UI cuando cambia la página
    subscribe('ui.currentPage', (pageNumber) => {
        showPage(pageNumber, true);
    });

    // Actualizar UI cuando cambia el estado de guardado
    subscribe('ui.isSaving', (isSaving) => {
        if (isSaving) {
            showAutosaveIndicator('Guardando...', 'saving');
        }
    });

    // Actualizar UI cuando cambia el estado de carga
    subscribe('ui.isLoading', (isLoading) => {
        setNavigationEnabled(!isLoading);
    });

    log(LogLevel.INFO, 'UI reactiva inicializada');
}

// Exponer funciones globalmente
if (typeof window !== 'undefined') {
    window.uiManager = {
        showPage,
        updateStepper,
        updateProgressBar,
        setStepError,
        setStepCompleted,
        showMessageBox,
        showAutosaveIndicator,
        showLoginScreen,
        showMainApp,
        setView,
        updateClientBadge,
        toggleLogoutButton,
        setNavigationEnabled,
        initializeReactiveUI
    };

    // Exponer algunas funciones directamente para compatibilidad
    window.showMessageBox = showMessageBox;
    window.showAutosaveIndicator = showAutosaveIndicator;
}
