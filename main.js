/*
  main.js (Versión más estable y limpia)
  Este script gestiona:
  1. Carga de componentes (_header.html, _footer.html) usando rutas RELATIVAS.
  2. Lógica del menú móvil (hamburguesa).
  3. Resaltado del enlace activo en el menú de navegación.
*/

document.addEventListener('DOMContentLoaded', () => {

  // --- 1. CARGADOR DE COMPONENTES (HEADER Y FOOTER) ---
  
  const loadComponent = async (id, fileName) => {
    const element = document.getElementById(id);
    if (element) {
      try {
        // CAMBIO CLAVE: Usamos el nombre del archivo directamente (ruta relativa: _header.html)
        const response = await fetch(fileName);
        if (response.ok) {
          const text = await response.text();
          element.innerHTML = text;
          // Si el header se carga correctamente, inicializamos la lógica
          if (id === 'header-placeholder') {
            initMobileMenu();
            highlightActiveLink();
          }
        } else {
          element.innerHTML = `<p class="text-red-500 text-center p-4">Error: No se pudo cargar ${id}. (Ruta: ${fileName})</p>`;
          console.error(`Error loading ${id}: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        // En un hosting real, este error no debería pasar si la ruta es correcta
        element.innerHTML = `<p class="text-red-500 text-center p-4">Error: Fallo de red al cargar ${id}. (Ruta: ${fileName})</p>`;
        console.error(`Fetch error for ${id}:`, error);
      }
    }
  };

  // --- 2. LÓGICA DE MENÚ MÓVIL ---
  
  const initMobileMenu = () => {
    const menuBtn = document.getElementById('menuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileServicesBtn = document.getElementById('mobileServicesBtn');
    const mobileServicesMenu = document.getElementById('mobileServicesMenu');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    if (menuBtn && mobileMenu) {
      menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        if (mobileMenu.classList.contains('hidden')) {
          if (mobileServicesMenu) mobileServicesMenu.classList.add('hidden');
        }
      });
    }

    if (mobileServicesBtn && mobileServicesMenu) {
      mobileServicesBtn.addEventListener('click', (e) => {
        // Evitar que el clic en el botón active el enlace ancla
        e.preventDefault(); 
        mobileServicesMenu.classList.toggle('hidden');
      });
    }
    
    // Cerrar el menú principal al hacer clic en un enlace (para SPA)
    if(mobileLinks.length > 0 && mobileMenu) {
      mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.add('hidden');
          if (mobileServicesMenu) mobileServicesMenu.classList.add('hidden');
        });
      });
    }
  };

  // --- 3. RESALTADO DE ENLACE ACTIVO ---
  
  const highlightActiveLink = () => {
    // Obtener la ruta de la página actual, quitando la / del principio.
    // ej: /servicios/consultoria.html -> servicios/consultoria.html
    let currentPath = window.location.pathname.substring(1);
    if (currentPath === '') {
      currentPath = 'index.html'; // Tratar la raíz como index.html
    }
    // Si la ruta incluye el nombre del repositorio, se limpia (solo en GitHub Pages)
    // Esto es para que funcione en repositorios que no son la página principal de usuario.
    const repoNameMatch = window.location.pathname.match(/^\/([^\/]+)\//);
    if (repoNameMatch && !window.location.host.endsWith('github.io')) {
        currentPath = window.location.pathname.replace(repoNameMatch[0], '');
    }


    // Seleccionar todos los enlaces del header que tienen 'data-page'
    const navLinks = document.querySelectorAll('header .nav-link-header');

    // Desactivar todos los enlaces y luego activar el correcto
    navLinks.forEach(link => {
      link.classList.remove('text-brand-700', 'font-semibold');
      link.classList.add('text-slate-700');
    });


    // Lógica de activación
    navLinks.forEach(link => {
      const linkPage = link.dataset.page;
      if (!linkPage) return;

      // Simplificamos la lógica de activación
      let targetPath = linkPage.endsWith('.html') ? linkPage : linkPage + '.html';
      
      // 1. Coincidencia de página (ej: 'quienes-somos.html')
      if (currentPath.endsWith(targetPath)) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      } 
      // 2. Coincidencia de sub-sección (Servicios o Noticias en index.html)
      else if (currentPath === 'index.html' || currentPath === '') {
        const hash = window.location.hash.substring(1); // ej: 'servicios' o 'contacto'
        
        if (hash === linkPage || (linkPage === 'index.html' && hash === '')) {
             link.classList.add('text-brand-700', 'font-semibold');
             link.classList.remove('text-slate-700');
        }
        
      }
      // 3. Coincidencia de sección padre (marcar "Servicios" cuando estoy en /servicios/consultoria.html)
      else if (linkPage === 'servicios' && currentPath.startsWith('servicios/')) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
        // Aquí no rompemos el bucle para que si el enlace específico del desplegable también coincide, se marque.
      }
      else if (linkPage === 'noticias' && currentPath.startsWith('noticias/')) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      }
      
    });
  };

  // --- EJECUCIÓN ---
  
  // No usamos Promise.all ya que la inicialización debe esperar solo al header
  loadComponent('header-placeholder', 'header.html')
    .then(() => {
      // El footer no necesita esperar
      loadComponent('footer-placeholder', 'footer.html');
    })
    .catch(error => {
      console.error("Error fatal al cargar header:", error);
    });

}); // Fin del DOMContentLoaded