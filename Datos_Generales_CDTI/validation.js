// validation.js — helpers de validación y utilidades de CP/Provincia/Localidad
// Versión corregida y completa — sin "Unexpected end of script".

// ===== Mapa CP → Provincia =====
export const PROVINCES_BY_PREFIX = {
  '01':'Álava','02':'Albacete','03':'Alicante','04':'Almería','05':'Ávila','06':'Badajoz',
  '07':'Islas Baleares','08':'Barcelona','09':'Burgos','10':'Cáceres','11':'Cádiz','12':'Castellón',
  '13':'Ciudad Real','14':'Córdoba','15':'A Coruña','16':'Cuenca','17':'Girona','18':'Granada',
  '19':'Guadalajara','20':'Guipúzcoa','21':'Huelva','22':'Huesca','23':'Jaén','24':'León',
  '25':'Lleida','26':'La Rioja','27':'Lugo','28':'Madrid','29':'Málaga','30':'Murcia',
  '31':'Navarra','32':'Ourense','33':'Asturias','34':'Palencia','35':'Las Palmas','36':'Pontevedra',
  '37':'Salamanca','38':'Santa Cruz de Tenerife','39':'Cantabria','40':'Segovia','41':'Sevilla',
  '42':'Soria','43':'Tarragona','44':'Teruel','45':'Toledo','46':'Valencia','47':'Valladolid',
  '48':'Bizkaia','49':'Zamora','50':'Zaragoza','51':'Ceuta','52':'Melilla'
};

export function validSpanishCP(cp){
  return /^\d{5}$/.test(cp) && parseInt(cp.slice(0,2),10) >= 1 && parseInt(cp.slice(0,2),10) <= 52;
}

export function inferProvinceFromCP(cp){
  if(!validSpanishCP(cp)) return '';
  const pref = cp.slice(0,2);
  return PROVINCES_BY_PREFIX[pref] || '';
}

// Inferencia básica de localidades (capitals y rangos comunes). Para mayor cobertura, cargar dataset externo.
export function inferLocalidadFromCP(cp){
  if(!validSpanishCP(cp)) return '';
  const n = parseInt(cp,10);

  // Lista ampliada de rangos para capitales y localidades comunes.
  const ranges = [
    [28001,28080,'Madrid'],
    [8001,8080,'Barcelona'],
    [46001,46026,'València'],
    [41001,41099,'Sevilla'],
    [29001,29099,'Málaga'],
    [50001,50099,'Zaragoza'],
    [48001,48080,'Bilbao'],
    [15001,15099,'A Coruña'],
    [30001,30099,'Murcia'],
    [14001,14099,'Córdoba'],
    [18001,18099,'Granada'],
    [35001,35099,'Las Palmas'],
    [38001,38099,'Santa Cruz de Tenerife'],
    [7001,7020,'Palma'],
    [3001,3099,'Alicante'],
    [43001,43099,'Tarragona'],
    [17001,17099,'Girona'],
    [21001,21099,'Huelva'],
    [11001,11099,'Cádiz'],
    [24001,24099,'León'],
    [37001,37099,'Salamanca'],
    [47001,47099,'Valladolid'],
    [32001,32099,'Ourense'],
    [36001,36099,'Pontevedra'],
    [33001,33099,'Oviedo']
  ];

  for(const [from,to,local] of ranges){
    if(n >= from && n <= to) return local;
  }

  // Fallback: devolver la provincia si no hay una localidad precisa
  return inferProvinceFromCP(cp);
}

// Validaciones genéricas
export const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v||'').trim());
export const validatePhone9 = (v) => /^\d{9}$/.test((v||'').trim());

export function validateFieldClasses(el, ok){
  if(!el) return false;
  el.classList.remove('input-valid','input-invalid','input-default');
  el.classList.add(ok ? 'input-valid' : 'input-invalid');
  return ok;
}

// Handlers para inputs (usables desde window)
export function handleCPInput(el){
  if(!el) return;
  const cp = (el.value || '').replace(/\D/g,'').slice(0,5);
  el.value = cp;
  const provinciaEl = document.getElementById('dirProvincia');
  const localidadEl = document.getElementById('dirLocalidad');

  [el, provinciaEl, localidadEl].forEach(inp=>{
    if(!inp) return; inp.classList.remove('input-valid','input-invalid','input-default');
  });

  if(!validSpanishCP(cp)){
    el.classList.add(cp.length ? 'input-invalid' : 'input-default');
    if(provinciaEl){ provinciaEl.value = ''; provinciaEl.classList.add('input-default'); }
    if(localidadEl){ localidadEl.value = ''; localidadEl.classList.add('input-default'); }
    return;
  }
  el.classList.add('input-valid');

  const prov = inferProvinceFromCP(cp);
  if(provinciaEl){ provinciaEl.value = prov; provinciaEl.classList.add(prov ? 'input-valid' : 'input-invalid'); }
  // Intentar usar un listado local más preciso (Listado-de-CP.json) si está disponible.
  // Normalizamos a número porque el dataset contiene `codigo_postal` como número (sin ceros iniciales).
  const cpNum = parseInt(cp, 10);
  if (typeof window !== 'undefined' && window.__CP_MAP_LOADED__) {
    const map = window.__CP_MAP__ || null;
    const mapped = map ? map[cpNum] : null;
    if (mapped && localidadEl) {
      localidadEl.value = mapped;
      localidadEl.classList.add('input-valid');
      return;
    }
  }

  // Si no hay mapeo preciso disponible aún, intentar inferir por rangos y usar provincia como fallback
  const loc = inferLocalidadFromCP(cp);
  if(localidadEl){
    if(loc){
      localidadEl.value = loc;
      localidadEl.classList.add('input-valid');
    } else if (prov) {
      localidadEl.value = prov;
      localidadEl.classList.add('input-valid');
    } else {
      const ok = (localidadEl.value||'').trim().length>0;
      localidadEl.classList.add(ok ? 'input-valid' : 'input-invalid');
    }
  }

  // Lanzar carga asíncrona del fichero Listado-de-CP.json si no lo hemos hecho aún
  if (typeof window !== 'undefined' && !window.__CP_MAP_LOADING__ && !window.__CP_MAP_LOADED__) {
    window.__CP_MAP_LOADING__ = true;
    fetch('Listado-de-CP.json').then(r => r.ok ? r.json() : null).then(arr => {
      try{
        const map = Object.create(null);
        if (Array.isArray(arr)){
          for(const it of arr){
            // Asegurar que usamos el número sin ceros iniciales
            const key = typeof it.codigo_postal === 'number' ? it.codigo_postal : parseInt(it.codigo_postal,10);
            if (key) map[key] = it.entidad_singular_nombre || map[key];
          }
        }
        window.__CP_MAP__ = map;
        window.__CP_MAP_LOADED__ = true;
        // Si el usuario ya escribió un CP en el formulario, actualizamos la localidad inmediatamente
        try{
          const cpNow = document.getElementById('dirCP')?.value.replace(/\D/g,'').slice(0,5) || '';
          const numNow = cpNow ? parseInt(cpNow,10) : null;
          const mappedNow = numNow ? map[numNow] : null;
          if(mappedNow){
            const locEl = document.getElementById('dirLocalidad');
            if(locEl){ locEl.value = mappedNow; locEl.classList.remove('input-invalid','input-default'); locEl.classList.add('input-valid'); }
          }
        }catch(e){/*ignore*/}
      }catch(e){
        console.warn('Error parsing CP map', e);
      }
    }).catch(e => { console.warn('No se pudo cargar Listado-de-CP.json', e); }).finally(()=>{ window.__CP_MAP_LOADING__ = false; });
  }
}

export function validateRequired(el){
  if(!el) return false;
  const ok = !!(el.value||'').trim();
  return validateFieldClasses(el, ok);
}

// Validador de la página 2 (para usar en main.js)
export function validatePage2(){
  const errors = [];
  const cpEl = document.getElementById('dirCP');
  const provinciaEl = document.getElementById('dirProvincia');
  const localidadEl = document.getElementById('dirLocalidad');
  const viaEl = document.getElementById('dirTipoVia');
  const dirEl = document.getElementById('dirDireccion');
  const numEl = document.getElementById('dirNumero');
  const telEl = document.getElementById('dirTelefono');
  const emailEl = document.getElementById('dirEmail');

  // Tipo de vía
  if(viaEl) {
    const value = (viaEl.value || '').trim();
    if(!value) {
      setFieldError(viaEl, 'Este campo es requerido');
      errors.push('Tipo de vía');
    } else {
      setFieldValid(viaEl);
    }
  }

  // Dirección
  if(dirEl) {
    const value = (dirEl.value || '').trim();
    if(!value) {
      setFieldError(dirEl, 'Este campo es requerido');
      errors.push('Dirección');
    } else {
      setFieldValid(dirEl);
    }
  }

  // Número
  if(numEl) {
    const value = (numEl.value || '').trim();
    if(!value) {
      setFieldError(numEl, 'Este campo es requerido');
      errors.push('Número');
    } else {
      setFieldValid(numEl);
    }
  }

  // CP
  const cp = (cpEl?.value||'').trim();
  if(cpEl){
    if(!cp) {
      setFieldError(cpEl, 'Este campo es requerido');
      errors.push('Código Postal');
    } else if(!validSpanishCP(cp)) {
      setFieldError(cpEl, 'Código Postal inválido (5 dígitos)');
      errors.push('Código Postal');
    } else {
      setFieldValid(cpEl);
    }
  }

  // Provincia
  if(provinciaEl){
    const value = (provinciaEl.value || '').trim();
    if(!value) {
      setFieldError(provinciaEl, 'Este campo es requerido');
      errors.push('Provincia');
    } else {
      setFieldValid(provinciaEl);
    }
  }

  // Localidad
  if(localidadEl){
    const value = (localidadEl.value || '').trim();
    if(!value) {
      setFieldError(localidadEl, 'Este campo es requerido');
      errors.push('Localidad');
    } else {
      setFieldValid(localidadEl);
    }
  }

  // Teléfono
  if(telEl){
    const value = (telEl.value || '').trim();
    if(!value) {
      setFieldError(telEl, 'Este campo es requerido');
      errors.push('Teléfono');
    } else if(!validatePhone9(value)) {
      setFieldError(telEl, 'Teléfono debe tener 9 dígitos');
      errors.push('Teléfono');
    } else {
      setFieldValid(telEl);
    }
  }

  // Email
  if(emailEl){
    const value = (emailEl.value || '').trim();
    if(!value) {
      setFieldError(emailEl, 'Este campo es requerido');
      errors.push('E-Mail');
    } else if(!validateEmail(value)) {
      setFieldError(emailEl, 'Email inválido');
      errors.push('E-Mail');
    } else {
      setFieldValid(emailEl);
    }
  }

  return { isValid: errors.length===0, errors };
}

// ===== Helper para establecer tooltip de error =====
function setFieldError(element, errorMessage) {
  if (!element) return;
  element.classList.remove('input-valid', 'input-default');
  element.classList.add('input-invalid');
  element.setAttribute('data-error', errorMessage);
  
  // Crear tooltip si no existe
  let tooltip = element.parentElement.querySelector('.error-tooltip');
  if (!tooltip && errorMessage) {
    tooltip = document.createElement('div');
    tooltip.className = 'error-tooltip';
    tooltip.textContent = errorMessage;
    element.parentElement.style.position = 'relative';
    element.parentElement.appendChild(tooltip);
  } else if (tooltip) {
    tooltip.textContent = errorMessage;
  }
  
  // Mostrar tooltip al hacer hover
  element.addEventListener('mouseenter', showTooltip);
  element.addEventListener('mouseleave', hideTooltip);
}

function setFieldValid(element) {
  if (!element) return;
  element.classList.remove('input-invalid', 'input-default');
  element.classList.add('input-valid');
  element.removeAttribute('data-error');
  
  // Eliminar tooltip
  const tooltip = element.parentElement.querySelector('.error-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
  
  element.removeEventListener('mouseenter', showTooltip);
  element.removeEventListener('mouseleave', hideTooltip);
}

function setFieldDefault(element) {
  if (!element) return;
  element.classList.remove('input-valid', 'input-invalid');
  element.classList.add('input-default');
  element.removeAttribute('data-error');
  
  // Eliminar tooltip
  const tooltip = element.parentElement.querySelector('.error-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
  
  element.removeEventListener('mouseenter', showTooltip);
  element.removeEventListener('mouseleave', hideTooltip);
}

function showTooltip(event) {
  const tooltip = event.target.parentElement.querySelector('.error-tooltip');
  if (tooltip) {
    tooltip.style.display = 'block';
  }
}

function hideTooltip(event) {
  const tooltip = event.target.parentElement.querySelector('.error-tooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

// validateField estilo Página 1: required / email / phone / nif
export function validateField(element, type){
  if(!element) return false;
  const value = (element.value || '').trim();

  if(value === ""){
    if(type === 'phone'){
      setFieldDefault(element);
      return true;
    }
    setFieldError(element, 'Este campo es requerido');
    return false;
  }

  let isValid = false;
  let errorMsg = '';
  
  switch(type){
    case 'required':
      isValid = value.length > 0;
      errorMsg = 'Este campo es requerido';
      break;
    case 'email':
      isValid = validateEmail(value);
      errorMsg = 'Email inválido';
      break;
    case 'phone':
      isValid = validatePhone9(value);
      errorMsg = 'Teléfono debe tener 9 dígitos';
      break;
    case 'nif':
      // Simplified NIF/NIE check (covers common formats)
      isValid = /^[A-Z]\-?\d{8}$|^\d{8}\-?[A-Z]$/i.test(value);
      errorMsg = 'NIF/CIF inválido';
      break;
    default:
      isValid = true;
  }

  if (isValid) {
    setFieldValid(element);
  } else {
    setFieldError(element, errorMsg);
  }
  
  return isValid;
}

// Valida campos numéricos usados por oninput en el HTML

export function validateNumericField(el) {
  if (!el) return false;
  const v = (el.value || '').toString().trim();

  // vacío -> estado por defecto (no error en tiempo real, la validación de requerido se hace en validatePage4)
  if (v === '') {
    setFieldDefault(el);
    return true;
  }

  // Verificar si contiene caracteres inválidos (letras o símbolos excepto números, punto, coma)
  const hasInvalidChars = /[^0-9.,\-]/.test(v);
  
  if (hasInvalidChars) {
    setFieldError(el, 'Solo se permiten números');
    return false;
  }

  // Intentar convertir a número (reemplazando coma por punto)
  const numValue = Number(v.replace(',', '.'));
  
  if (Number.isNaN(numValue)) {
    setFieldError(el, 'Número inválido');
    return false;
  } else {
    setFieldValid(el);
    return true;
  }
}

// Asegurar que la función esté disponible globalmente para oninput inline
if (typeof window !== 'undefined') {
  window.validateNumericField = validateNumericField;
}

// Valida porcentajes entre 0 y 100 (acepta decimales)
export function validatePercentageField(el){
  if(!el) return false;
  const v = (el.value || '').toString().trim();
  
  if(v === ''){ 
    setFieldDefault(el); 
    return true; 
  }
  
  const n = Number(v);
  const ok = !Number.isNaN(n) && n >= 0 && n <= 100;
  
  if (ok) {
    setFieldValid(el);
  } else {
    setFieldError(el, 'Debe ser entre 0 y 100');
  }
  
  return ok;
}

// Comprobación simple de formato IBAN (España). No sustituye validación bancaria.
export function validateIBAN(el){
  if(!el) return false;
  const raw = (el.value || '').toString().replace(/\s+/g, '').toUpperCase();
  
  if(raw === ''){ 
    setFieldDefault(el); 
    return true; 
  }
  
  // Formato ES + 22 dígitos
  const ok = /^ES\d{22}$/.test(raw);
  
  if (ok) {
    setFieldValid(el);
  } else {
    setFieldError(el, 'IBAN debe ser ES + 22 dígitos');
  }
  
  return ok;
}

// Validador para la Página 1 (Contactos)
// incluye validación de Contacto Técnico y Financiero (nombre/apellidos/cargo)
export function validatePage1(){
  const errors = [];
  const nifEl = document.getElementById('instNIF');
  const nombreEl = document.getElementById('instNombre');
  const apellidosEl = document.getElementById('instApellidos');
  const cargoEl = document.getElementById('instCargo');
  const telEl = document.getElementById('instTelefono');
  const emailEl = document.getElementById('instEmail');

  // Contacto Técnico
  const tNombreEl = document.getElementById('tecNombre');
  const tApellidosEl = document.getElementById('tecApellidos');
  const tCargoEl = document.getElementById('tecCargo');

  // Contacto Financiero
  const fNombreEl = document.getElementById('finNombre');
  const fApellidosEl = document.getElementById('finApellidos');
  const fCargoEl = document.getElementById('finCargo');

  if(!validateField(nifEl, 'nif')) errors.push('NIF');
  if(!validateField(nombreEl, 'required')) errors.push('Nombre (Inst.)');
  if(!validateField(apellidosEl, 'required')) errors.push('Apellidos (Inst.)');
  if(!validateField(cargoEl, 'required')) errors.push('Cargo (Inst.)');
  if(!validateField(telEl, 'phone')) errors.push('Teléfono (Inst.)');
  if(!validateField(emailEl, 'email')) errors.push('E‑Mail (Inst.)');

  // Validar Técnico (todos required)
  if(tNombreEl){
    if(!validateField(tNombreEl, 'required')) errors.push('Nombre (Técnico)');
  }
  if(tApellidosEl){
    if(!validateField(tApellidosEl, 'required')) errors.push('Apellidos (Técnico)');
  }
  if(tCargoEl){
    if(!validateField(tCargoEl, 'required')) errors.push('Cargo (Técnico)');
  }

  // Validar Financiero (todos required)
  if(fNombreEl){
    if(!validateField(fNombreEl, 'required')) errors.push('Nombre (Financiero)');
  }
  if(fApellidosEl){
    if(!validateField(fApellidosEl, 'required')) errors.push('Apellidos (Financiero)');
  }
  if(fCargoEl){
    if(!validateField(fCargoEl, 'required')) errors.push('Cargo (Financiero)');
  }

  return { isValid: errors.length === 0, errors };
}

// Validador para la Página 3 (Organización)
// incluye validación del Consejo de Administración (al menos un miembro completo)
// y validación de composición accionarial y periodos
export function validatePage3(){
  const errors = [];
  
  // Validar Capital Social
  const anoCapitalEl = document.getElementById('orgAnoCapital');
  const capitalSocialEl = document.getElementById('orgCapitalSocial');
  
  if(anoCapitalEl){
    const value = (anoCapitalEl.value || '').trim();
    if(!value) {
      setFieldError(anoCapitalEl, 'Este campo es requerido');
      errors.push('Año Capital Social');
    } else {
      setFieldValid(anoCapitalEl);
    }
  }
  
  if(capitalSocialEl){
    const value = (capitalSocialEl.value || '').trim();
    if(!value) {
      setFieldError(capitalSocialEl, 'Este campo es requerido');
      errors.push('Capital Social');
    } else {
      // Verificar si es un número válido
      const hasInvalidChars = /[^0-9.,\-]/.test(value);
      if(hasInvalidChars) {
        setFieldError(capitalSocialEl, 'Solo se permiten números');
        errors.push('Capital Social debe ser numérico');
      } else {
        const numValue = Number(value.replace(',', '.'));
        if(Number.isNaN(numValue)) {
          setFieldError(capitalSocialEl, 'Número inválido');
          errors.push('Capital Social inválido');
        } else {
          setFieldValid(capitalSocialEl);
        }
      }
    }
  }
  
  // Validar grupos accionariales (al menos uno debe estar completo)
  const accionarialContainer = document.getElementById('accionarial-container');
  let accionarialesCompletos = 0;
  let sumaParticipaciones = 0;
  
  if(accionarialContainer){
    const grupos = accionarialContainer.querySelectorAll('.accionarial-grupo');
    grupos.forEach((grupo, idx) => {
      const nombreEl = grupo.querySelector('[id*="_nombre"]');
      const cifEl = grupo.querySelector('[id*="_cif"]');
      const pctEl = grupo.querySelector('[id*="_pct"]');
      const pymeEl = grupo.querySelector('[id*="_pyme"]');
      const nacionalidadEl = grupo.querySelector('[id*="_nacionalidad"]');
      
      const campos = [nombreEl, cifEl, pctEl, pymeEl, nacionalidadEl].filter(el => el);
      const todosCompletos = campos.every(el => (el.value || '').toString().trim().length > 0);
      const algunoCompleto = campos.some(el => (el.value || '').toString().trim().length > 0);
      
      if(algunoCompleto){
        campos.forEach(el => {
          el.classList.remove('input-valid','input-invalid','input-default');
          if(!el.value || !el.value.toString().trim()){
            el.classList.add('input-invalid');
            errors.push(`Accionista ${idx+1}: ${el.id.split('_').pop()}`);
          } else {
            el.classList.add('input-valid');
          }
        });
      } else {
        campos.forEach(el => {
          el.classList.remove('input-valid','input-invalid');
          el.classList.add('input-default');
        });
      }
      
      if(todosCompletos) {
        accionarialesCompletos++;
        // Sumar porcentaje de participación
        if(pctEl) {
          const pctValue = parseFloat(pctEl.value) || 0;
          sumaParticipaciones += pctValue;
        }
      }
    });
    
    // La validación de suma de participaciones se maneja en validarParticipacionAccionarial()
  }
  
  // Al menos un accionista es recomendado/esperado
  if(accionarialesCompletos === 0){
    errors.push('Al menos un Accionista completo');
  }
  
  // Validar Consejo de Administración (al menos un miembro completo)
  const consejoContainer = document.getElementById('consejo-container');
  let consejoCompletos = 0;
  if(consejoContainer){
    const grupos = consejoContainer.querySelectorAll('.consejo-grupo');
    grupos.forEach((grupo, idx) => {
      const nombreEl = grupo.querySelector('[id*="_nombre"]');
      const dniEl = grupo.querySelector('[id*="_dni"]');
      const cargoEl = grupo.querySelector('[id*="_cargo"]');
      const nacionalidadEl = grupo.querySelector('[id*="_nacionalidad"]');

      const campos = [nombreEl, dniEl, cargoEl, nacionalidadEl].filter(el => el);
      const todosCompletos = campos.every(el => (el.value || '').toString().trim().length > 0);
      const algunoCompleto = campos.some(el => (el.value || '').toString().trim().length > 0);

      if(algunoCompleto){
        campos.forEach(el => {
          el.classList.remove('input-valid','input-invalid','input-default');
          if(!el.value || !el.value.toString().trim()){
            el.classList.add('input-invalid');
            errors.push(`Consejo ${idx+1}: ${el.id.split('_').pop()}`);
          } else {
            el.classList.add('input-valid');
          }
        });
      } else {
        campos.forEach(el => {
          el.classList.remove('input-valid','input-invalid');
          el.classList.add('input-default');
        });
      }

      if(todosCompletos) consejoCompletos++;
    });
  }

  if(consejoCompletos === 0){
    errors.push('Al menos un Miembro del Consejo completo');
  }
  
  // Validar periodos de referencia - todos los campos son requeridos (si existen)
  const refUltimoPeriodoEl = document.getElementById('ref_ultimo_periodo');
  const refUltimoUtaEl = document.getElementById('ref_ultimo_uta');
  const refUltimoVolumenEl = document.getElementById('ref_ultimo_volumen');
  const refUltimoBalanceEl = document.getElementById('ref_ultimo_balance');
  const refAnteriorPeriodoEl = document.getElementById('ref_anterior_periodo');
  const refAnteriorUtaEl = document.getElementById('ref_anterior_uta');
  const refAnteriorVolumenEl = document.getElementById('ref_anterior_volumen');
  const refAnteriorBalanceEl = document.getElementById('ref_anterior_balance');
  
  // Primer período
  if(refUltimoPeriodoEl){
    refUltimoPeriodoEl.classList.remove('input-valid','input-invalid','input-default');
    if(!refUltimoPeriodoEl.value || !refUltimoPeriodoEl.value.toString().trim()){
      refUltimoPeriodoEl.classList.add('input-invalid');
      errors.push('Periodo (Último)');
    } else {
      refUltimoPeriodoEl.classList.add('input-valid');
    }
  }
  
  if(refUltimoUtaEl){
    refUltimoUtaEl.classList.remove('input-valid','input-invalid','input-default');
    if(!refUltimoUtaEl.value || isNaN(refUltimoUtaEl.value)){
      refUltimoUtaEl.classList.add('input-invalid');
      errors.push('Efectivos UTA (Último)');
    } else {
      refUltimoUtaEl.classList.add('input-valid');
    }
  }
  
  if(refUltimoVolumenEl){
    refUltimoVolumenEl.classList.remove('input-valid','input-invalid','input-default');
    if(!refUltimoVolumenEl.value || isNaN(refUltimoVolumenEl.value)){
      refUltimoVolumenEl.classList.add('input-invalid');
      errors.push('Volumen de Negocio (Último)');
    } else {
      refUltimoVolumenEl.classList.add('input-valid');
    }
  }
  
  if(refUltimoBalanceEl){
    refUltimoBalanceEl.classList.remove('input-valid','input-invalid','input-default');
    if(!refUltimoBalanceEl.value || isNaN(refUltimoBalanceEl.value)){
      refUltimoBalanceEl.classList.add('input-invalid');
      errors.push('Balance General (Último)');
    } else {
      refUltimoBalanceEl.classList.add('input-valid');
    }
  }
  
  // Segundo período (Anterior)
  if(refAnteriorPeriodoEl){
    refAnteriorPeriodoEl.classList.remove('input-valid','input-invalid','input-default');
    if(!refAnteriorPeriodoEl.value){
      refAnteriorPeriodoEl.classList.add('input-invalid');
      errors.push('Periodo Anterior');
    } else {
      refAnteriorPeriodoEl.classList.add('input-valid');
    }
  }
  
  if(refAnteriorUtaEl){
    refAnteriorUtaEl.classList.remove('input-valid','input-invalid','input-default');
    if(!refAnteriorUtaEl.value || isNaN(refAnteriorUtaEl.value)){
      refAnteriorUtaEl.classList.add('input-invalid');
      errors.push('Efectivos UTA (Anterior)');
    } else {
      refAnteriorUtaEl.classList.add('input-valid');
    }
  }
  
  if(refAnteriorVolumenEl){
    refAnteriorVolumenEl.classList.remove('input-valid','input-invalid','input-default');
    if(!refAnteriorVolumenEl.value || isNaN(refAnteriorVolumenEl.value)){
      refAnteriorVolumenEl.classList.add('input-invalid');
      errors.push('Volumen de Negocio (Anterior)');
    } else {
      refAnteriorVolumenEl.classList.add('input-valid');
    }
  }
  
  if(refAnteriorBalanceEl){
    refAnteriorBalanceEl.classList.remove('input-valid','input-invalid','input-default');
    if(!refAnteriorBalanceEl.value || isNaN(refAnteriorBalanceEl.value)){
      refAnteriorBalanceEl.classList.add('input-invalid');
      errors.push('Balance General (Anterior)');
    } else {
      refAnteriorBalanceEl.classList.add('input-valid');
    }
  }

  return { isValid: errors.length === 0, errors };
}

// validation.js (modificado: validatePage4 ya no busca input readonly del año; usa dataset.year siempre)

// [Este es el bloque correspondiente a validatePage4 actualizado. Reemplaza la función validatePage4 actual

export function validatePage4(){
  const errors = [];
  const container = document.getElementById('recursos-container');
  if(!container) return { isValid: true, errors };

  const sections = container.querySelectorAll('.form-section');
  sections.forEach(section => {
    const year = section.dataset.year || 'Año';

    // Campos a validar (los numéricos) - TODOS SON REQUERIDOS
    const numericFields = [
      { id:`rh_${year}_directivo_h`, label: 'Directivo - Hombres' },
      { id:`rh_${year}_directivo_m`, label: 'Directivo - Mujeres' },
      { id:`rh_${year}_administracion_h`, label: 'Administración H' },
      { id:`rh_${year}_administracion_m`, label: 'Administración M' },
      { id:`rh_${year}_produccion_h`, label: 'Producción - Hombres' },
      { id:`rh_${year}_produccion_m`, label: 'Producción - Mujeres' },
      { id:`rh_${year}_comercial_h`, label: 'Comercial - Hombres' },
      { id:`rh_${year}_comercial_m`, label: 'Comercial - Mujeres' },

      // I+D
      { id:`rh_${year}_id_doct_h`, label: 'I+D Doctores H' },
      { id:`rh_${year}_id_doct_m`, label: 'I+D Doctores M' },
      { id:`rh_${year}_id_mast_h`, label: 'I+D Máster H' },
      { id:`rh_${year}_id_mast_m`, label: 'I+D Máster M' },
      { id:`rh_${year}_id_grad_h`, label: 'I+D Grado H' },
      { id:`rh_${year}_id_grad_m`, label: 'I+D Grado M' },
      { id:`rh_${year}_id_otros_h`, label: 'I+D Otros H' },
      { id:`rh_${year}_id_otros_m`, label: 'I+D Otros M' }
    ];

    // Validar campos numéricos: NO son requeridos (vacío = OK), pero si tienen valor debe ser numérico
    numericFields.forEach(f => {
      const el = document.getElementById(f.id);
      if(!el) return;
      el.classList.remove('input-valid','input-invalid','input-default');

      const raw = (el.value || '').toString().trim();
      
      // Campo vacío = OK (no error)
      if(raw === '') {
        el.classList.add('input-default');
        return;
      }
      
      // Si tiene valor, verificar si contiene caracteres no numéricos
      const hasInvalidChars = /[^0-9.\-,]/.test(raw);
      if (hasInvalidChars) {
        el.classList.add('input-invalid');
        errors.push(`Año ${year}: ${f.label} contiene caracteres inválidos`);
        return;
      }
      
      // Convertir a número
      const n = Number(raw.replace(',', '.'));
      if (Number.isNaN(n) || n < 0) {
        el.classList.add('input-invalid');
        errors.push(`Año ${year}: ${f.label} debe ser un número válido (0 o mayor)`);
      } else {
        el.classList.add('input-valid');
      }
    });

    // Calcular el total de personas para esta anualidad
    let totalPersonas = 0;
    numericFields.forEach(f => {
      const el = document.getElementById(f.id);
      if (el) {
        const val = (el.value || '').toString().trim().replace(',', '.');
        const num = Number(val);
        if (!Number.isNaN(num) && num >= 0) {
          totalPersonas += num;
        }
      }
    });

    // Validación del campo editable "Total de Titulados"
    const titEl = document.getElementById(`rh_${year}_total_titulados`);
    if (titEl) {
      const rawT = (titEl.value || '').toString().trim();
      
      // Vacío = ERROR
      if (rawT === '') {
        setFieldError(titEl, 'Este campo es requerido');
        errors.push(`Año ${year}: Total de Titulados es requerido`);
      } else {
        // Verificar caracteres inválidos
        const hasInvalidChars = /[^0-9.\-,]/.test(rawT);
        if (hasInvalidChars) {
          setFieldError(titEl, 'Solo se permiten números');
          errors.push(`Año ${year}: Total de Titulados contiene caracteres inválidos`);
        } else {
          const nT = Number(rawT.replace(',', '.'));
          
          // Debe ser número válido
          if (Number.isNaN(nT)) {
            setFieldError(titEl, 'Número inválido');
            errors.push(`Año ${year}: Total de Titulados debe ser un número`);
          }
          // No puede ser cero o negativo
          else if (nT <= 0) {
            setFieldError(titEl, 'Debe ser mayor que 0');
            errors.push(`Año ${year}: Total de Titulados debe ser mayor que 0`);
          }
          // No puede ser mayor que el total de personas
          else if (nT > totalPersonas) {
            setFieldError(titEl, `Total Titulados (${nT}) supera Total Personas (${totalPersonas})`);
            errors.push(`Año ${year}: Total de Titulados (${nT}) no puede ser mayor que Total de Personas (${totalPersonas})`);
          }
          // Todo correcto
          else {
            setFieldValid(titEl);
          }
        }
      }
    }
  });

  return { isValid: errors.length === 0, errors };
}

export function validatePage7(){
  const errors = [];

  // Validar Tipo de Entidad
  const tipoEntidadEl = document.getElementById('entidadTipo');
  if(!validateField(tipoEntidadEl, 'required')) {
    errors.push('Tipo de Entidad');
  }

  // Validar Tamaño Entidad
  const tamañoEntidadEl = document.getElementById('entidadTamaño');
  if(!validateField(tamañoEntidadEl, 'required')) {
    errors.push('Tamaño Entidad');
  }

  // Validar Periodo de Referencia
  const periodoRefEl = document.getElementById('entidadPeriodoRef');
  if(!validateField(periodoRefEl, 'required')) {
    errors.push('Periodo de Referencia');
  }

  // Validar Efectivos UTA (último ejercicio) - debe ser entero
  const efectivosEl = document.getElementById('ent_efectivos');
  if(efectivosEl) {
    const raw = (efectivosEl.value || '').toString().trim();
    if(raw === '') {
      setFieldError(efectivosEl, 'Este campo es requerido');
      errors.push('Efectivos (UTA) - último ejercicio');
    } else if(/[^0-9]/.test(raw)) {
      setFieldError(efectivosEl, 'Solo números enteros');
      errors.push('Efectivos (UTA) debe ser un número entero');
    } else {
      setFieldValid(efectivosEl);
    }
  }

  // Validar Volumen de Negocio (último ejercicio)
  const volumenEl = document.getElementById('ent_volumen_negocio');
  if(volumenEl) {
    const rawVol = (volumenEl.value || '').toString().trim();
    if(rawVol === '') {
      setFieldError(volumenEl, 'Este campo es requerido');
      errors.push('Volumen de Negocio - último ejercicio');
    } else if(/[^0-9.,\-]/.test(rawVol)) {
      setFieldError(volumenEl, 'Solo se permiten números');
      errors.push('Volumen de Negocio contiene caracteres inválidos');
    } else {
      const numVol = Number(rawVol.replace(',', '.'));
      if(Number.isNaN(numVol)) {
        setFieldError(volumenEl, 'Número inválido');
        errors.push('Volumen de Negocio debe ser un número válido');
      } else {
        setFieldValid(volumenEl);
      }
    }
  }

  // Validar Balance General (último ejercicio)
  const balanceEl = document.getElementById('ent_balance_general');
  if(balanceEl) {
    const rawBal = (balanceEl.value || '').toString().trim();
    if(rawBal === '') {
      setFieldError(balanceEl, 'Este campo es requerido');
      errors.push('Balance General - último ejercicio');
    } else if(/[^0-9.,\-]/.test(rawBal)) {
      setFieldError(balanceEl, 'Solo se permiten números');
      errors.push('Balance General contiene caracteres inválidos');
    } else {
      const numBal = Number(rawBal.replace(',', '.'));
      if(Number.isNaN(numBal)) {
        setFieldError(balanceEl, 'Número inválido');
        errors.push('Balance General debe ser un número válido');
      } else {
        setFieldValid(balanceEl);
      }
    }
  }

  // Validar Efectivos UTA (ejercicio anterior) - debe ser entero
  const efectivosAntEl = document.getElementById('ent_anterior_efectivos');
  if(efectivosAntEl) {
    const raw = (efectivosAntEl.value || '').toString().trim();
    if(raw === '') {
      setFieldError(efectivosAntEl, 'Este campo es requerido');
      errors.push('Efectivos (UTA) - ejercicio anterior');
    } else if(/[^0-9]/.test(raw)) {
      setFieldError(efectivosAntEl, 'Solo números enteros');
      errors.push('Efectivos (UTA) ejercicio anterior debe ser un número entero');
    } else {
      setFieldValid(efectivosAntEl);
    }
  }

  // Validar Volumen de Negocio (ejercicio anterior)
  const volumenAntEl = document.getElementById('ent_anterior_volumen_negocio');
  if(volumenAntEl) {
    const rawVolAnt = (volumenAntEl.value || '').toString().trim();
    if(rawVolAnt === '') {
      setFieldError(volumenAntEl, 'Este campo es requerido');
      errors.push('Volumen de Negocio - ejercicio anterior');
    } else if(/[^0-9.,\-]/.test(rawVolAnt)) {
      setFieldError(volumenAntEl, 'Solo se permiten números');
      errors.push('Volumen de Negocio ejercicio anterior contiene caracteres inválidos');
    } else {
      const numVolAnt = Number(rawVolAnt.replace(',', '.'));
      if(Number.isNaN(numVolAnt)) {
        setFieldError(volumenAntEl, 'Número inválido');
        errors.push('Volumen de Negocio ejercicio anterior debe ser un número válido');
      } else {
        setFieldValid(volumenAntEl);
      }
    }
  }

  // Validar Balance General (ejercicio anterior)
  const balanceAntEl = document.getElementById('ent_anterior_balance_general');
  if(balanceAntEl) {
    const rawBalAnt = (balanceAntEl.value || '').toString().trim();
    if(rawBalAnt === '') {
      setFieldError(balanceAntEl, 'Este campo es requerido');
      errors.push('Balance General - ejercicio anterior');
    } else if(/[^0-9.,\-]/.test(rawBalAnt)) {
      setFieldError(balanceAntEl, 'Solo se permiten números');
      errors.push('Balance General ejercicio anterior contiene caracteres inválidos');
    } else {
      const numBalAnt = Number(rawBalAnt.replace(',', '.'));
      if(Number.isNaN(numBalAnt)) {
        setFieldError(balanceAntEl, 'Número inválido');
        errors.push('Balance General ejercicio anterior debe ser un número válido');
      } else {
        setFieldValid(balanceAntEl);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

// Validar campos bancarios individuales
export function validateBankField(element, type) {
  if(!element) return false;
  
  let value = (element.value || '').toString().trim();
  
  // Convertir a mayúsculas para IBAN
  if(type === 'iban') {
    value = value.toUpperCase();
    element.value = value;
  }
  
  // Campo vacío = error
  if(value === '') {
    setFieldError(element, 'Este campo es requerido');
    return false;
  }
  
  // Validar según el tipo
  switch(type) {
    case 'iban':
      // IBAN: 2 letras + 2 dígitos (ES00)
      if(!/^[A-Z]{2}[0-9]{2}$/.test(value)) {
        setFieldError(element, 'IBAN debe ser 2 letras + 2 dígitos (ej: ES00)');
        return false;
      }
      break;
      
    case 'entidad':
      // Entidad: 4 números
      if(!/^[0-9]{4}$/.test(value)) {
        setFieldError(element, 'Entidad debe ser 4 números');
        return false;
      }
      break;
      
    case 'oficina':
      // Oficina: 4 números
      if(!/^[0-9]{4}$/.test(value)) {
        setFieldError(element, 'Oficina debe ser 4 números');
        return false;
      }
      break;
      
    case 'dc':
      // DC: 2 números
      if(!/^[0-9]{2}$/.test(value)) {
        setFieldError(element, 'DC debe ser 2 números');
        return false;
      }
      break;
      
    case 'cuenta':
      // Número de cuenta: 10 números
      if(!/^[0-9]{10}$/.test(value)) {
        setFieldError(element, 'Número de cuenta debe ser 10 dígitos');
        return false;
      }
      break;
  }
  
  setFieldValid(element);
  return true;
}

// Validar página 8 (Datos Bancarios)
export function validatePage8() {
  const errors = [];
  
  const ibanEl = document.getElementById('bankIBAN');
  const entidadEl = document.getElementById('bankEntidad');
  const oficinaEl = document.getElementById('bankOficina');
  const dcEl = document.getElementById('bankDC');
  const cuentaEl = document.getElementById('bankNumero');
  
  if(!validateBankField(ibanEl, 'iban')) {
    errors.push('IBAN inválido');
  }
  
  if(!validateBankField(entidadEl, 'entidad')) {
    errors.push('Entidad inválida');
  }
  
  if(!validateBankField(oficinaEl, 'oficina')) {
    errors.push('Oficina inválida');
  }
  
  if(!validateBankField(dcEl, 'dc')) {
    errors.push('DC inválido');
  }
  
  if(!validateBankField(cuentaEl, 'cuenta')) {
    errors.push('Número de cuenta inválido');
  }
  
  return { isValid: errors.length === 0, errors };
}

// Exponer algunos helpers al window para oninput en HTML clásico
if(typeof window !== 'undefined'){
  window.handleCPInput = handleCPInput;
}

// Exports finales (ya realizados mediante 'export function ...' arriba)
// Para compatibilidad con código que espera las funciones en window (HTML inline oninput), las exponemos:
if(typeof window !== 'undefined'){
  window.validateField = validateField;
  window.validateNumericField = validateNumericField;
  window.validatePercentageField = validatePercentageField;
  window.validateIBAN = validateIBAN;
  window.validateBankField = validateBankField;
  window.validatePage1 = validatePage1;
  window.validatePage2 = validatePage2;
  window.validatePage3 = validatePage3;
  window.validatePage4 = validatePage4;
  window.validatePage7 = validatePage7;
  window.validatePage8 = validatePage8;
  window.handleCPInput = handleCPInput;
}