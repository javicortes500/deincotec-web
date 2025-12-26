// nif-validator.js - Validación completa de NIF/NIE/CIF españoles con dígito de control

/**
 * Valida un NIF español (DNI + letra de control)
 * @param {string} nif - NIF a validar (formato: 12345678A o 12345678-A)
 * @returns {boolean} true si el NIF es válido
 */
export function validateNIF(nif) {
    if (!nif || typeof nif !== 'string') return false;

    // Limpiar espacios y guiones
    const cleaned = nif.toUpperCase().replace(/[\s\-]/g, '');

    // Formato: 8 dígitos + 1 letra
    const nifRegex = /^(\d{8})([A-Z])$/;
    const match = cleaned.match(nifRegex);

    if (!match) return false;

    const number = parseInt(match[1], 10);
    const letter = match[2];

    // Letras válidas para NIF ordenadas según el algoritmo
    const validLetters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    const expectedLetter = validLetters[number % 23];

    return letter === expectedLetter;
}

/**
 * Valida un NIE español (Número de Identidad de Extranjero)
 * @param {string} nie - NIE a validar (formato: X1234567A, Y1234567A, Z1234567A)
 * @returns {boolean} true si el NIE es válido
 */
export function validateNIE(nie) {
    if (!nie || typeof nie !== 'string') return false;

    // Limpiar espacios y guiones
    const cleaned = nie.toUpperCase().replace(/[\s\-]/g, '');

    // Formato: X/Y/Z + 7 dígitos + 1 letra
    const nieRegex = /^([XYZ])(\d{7})([A-Z])$/;
    const match = cleaned.match(nieRegex);

    if (!match) return false;

    const firstLetter = match[1];
    const number = match[2];
    const controlLetter = match[3];

    // Reemplazar primera letra por número según especificación
    const replacements = { 'X': '0', 'Y': '1', 'Z': '2' };
    const fullNumber = parseInt(replacements[firstLetter] + number, 10);

    // Usar el mismo algoritmo que NIF
    const validLetters = 'TRWAGMYFPDXBNJZSQVHLCKE';
    const expectedLetter = validLetters[fullNumber % 23];

    return controlLetter === expectedLetter;
}

/**
 * Valida un CIF español (Código de Identificación Fiscal para personas jurídicas)
 * @param {string} cif - CIF a validar
 * @returns {boolean} true si el CIF es válido
 */
export function validateCIF(cif) {
    if (!cif || typeof cif !== 'string') return false;

    // Limpiar espacios y guiones
    const cleaned = cif.toUpperCase().replace(/[\s\-]/g, '');

    // Formato: 1 letra + 7 dígitos + 1 dígito/letra de control
    const cifRegex = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/;
    const match = cleaned.match(cifRegex);

    if (!match) return false;

    const organizationType = match[1];
    const number = match[2];
    const control = match[3];

    // Calcular dígito de control
    let sum = 0;

    // Sumar dígitos en posiciones pares
    for (let i = 1; i < 7; i += 2) {
        sum += parseInt(number[i], 10);
    }

    // Sumar dígitos en posiciones impares (con algoritmo especial)
    for (let i = 0; i < 7; i += 2) {
        let doubled = parseInt(number[i], 10) * 2;
        // Si el resultado es mayor a 9, sumar sus dígitos
        sum += doubled > 9 ? Math.floor(doubled / 10) + (doubled % 10) : doubled;
    }

    // Obtener unidad del resultado
    const unitDigit = sum % 10;
    const controlDigit = unitDigit === 0 ? 0 : 10 - unitDigit;

    // Letras de control para CIF que usan letra en vez de número
    const controlLetters = 'JABCDEFGHI';

    // Tipos de organización que usan letra de control
    const usesLetter = ['N', 'P', 'Q', 'R', 'S', 'W'].includes(organizationType);

    if (usesLetter) {
        // Debe ser una letra
        return control === controlLetters[controlDigit];
    } else {
        // Puede ser número o letra
        return control === String(controlDigit) || control === controlLetters[controlDigit];
    }
}

/**
 * Valida si el string es un NIF, NIE o CIF válido
 * @param {string} value - Valor a validar
 * @returns {Object} { valid: boolean, type: 'NIF'|'NIE'|'CIF'|null, error: string|null }
 */
export function validateNIFOrCIFOrNIE(value) {
    if (!value || typeof value !== 'string') {
        return { valid: false, type: null, error: 'Valor vacío o inválido' };
    }

    const cleaned = value.toUpperCase().replace(/[\s\-]/g, '');

    // Intentar validar como NIF
    if (/^\d{8}[A-Z]$/.test(cleaned)) {
        if (validateNIF(value)) {
            return { valid: true, type: 'NIF', error: null };
        } else {
            return { valid: false, type: 'NIF', error: 'NIF inválido: letra de control incorrecta' };
        }
    }

    // Intentar validar como NIE
    if (/^[XYZ]\d{7}[A-Z]$/.test(cleaned)) {
        if (validateNIE(value)) {
            return { valid: true, type: 'NIE', error: null };
        } else {
            return { valid: false, type: 'NIE', error: 'NIE inválido: letra de control incorrecta' };
        }
    }

    // Intentar validar como CIF
    if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(cleaned)) {
        if (validateCIF(value)) {
            return { valid: true, type: 'CIF', error: null };
        } else {
            return { valid: false, type: 'CIF', error: 'CIF inválido: dígito de control incorrecto' };
        }
    }

    // No coincide con ningún formato
    return {
        valid: false,
        type: null,
        error: 'Formato inválido. Debe ser NIF (12345678A), NIE (X1234567A) o CIF (A12345678)'
    };
}

// Exponer funciones globalmente para uso desde HTML inline handlers si es necesario
if (typeof window !== 'undefined') {
    window.validateNIF = validateNIF;
    window.validateNIE = validateNIE;
    window.validateCIF = validateCIF;
    window.validateNIFOrCIFOrNIE = validateNIFOrCIFOrNIE;
}
