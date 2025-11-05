/*
  main.js (Versión Definitiva - Rutas Absolutas)
  Este script gestiona:
  1. Carga de componentes (_header.html, _footer.html) usando rutas absolutas (ej: /_header.html)
  2. Lógica del menú móvil (hamburguesa).
  3. Resaltado del enlace activo en el menú de navegación.
*/

document.addEventListener('DOMContentLoaded', () => {

  // --- 1. CARGADOR DE COMPONENTES (HEADER Y FOOTER) ---
  
  const loadComponent = async (id, url) => {
    const element = document.getElementById(id);
    if (element) {
      try {
        // Usa rutas absolutas (empiezan con /)
        const response = await fetch(url);
        if (response.ok) {
          const text = await response.text();
          element.innerHTML = text;
        } else {
          element.innerHTML = `<p class="text-red-500 text-center p-4">Error: No se pudo cargar ${id}. (Ruta: ${url})</p>`;
          console.error(`Error loading ${id}: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        element.innerHTML = `<p class="text-red-500 text-center p-4">Error: Fallo de red al cargar ${id}. (Ruta: ${url})</p>`;
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
        // Si el menú principal se cierra, asegurarse de cerrar también el submenú
        if (mobileMenu.classList.contains('hidden')) {
          if (mobileServicesMenu) mobileServicesMenu.classList.add('hidden');
        }
      });
    }

    if (mobileServicesBtn && mobileServicesMenu) {
      mobileServicesBtn.addEventListener('click', () => {
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
    // ej: /index.html -> index.html
    // ej: / -> (se convierte a 'index.html')
    let currentPath = window.location.pathname.substring(1);
    if (currentPath === '') {
      currentPath = 'index.html'; // Tratar la raíz como index.html
    }

    // Seleccionar todos los enlaces del header que tienen 'data-page'
    const navLinks = document.querySelectorAll('header .nav-link-header');

    navLinks.forEach(link => {
      const linkPage = link.dataset.page;
      
      // Quitar clases activas de todos
      link.classList.remove('text-brand-700', 'font-semibold');
      link.classList.add('text-slate-700');

      if (!linkPage) return;

      // 1. Coincidencia exacta (ej: 'quienes-somos.html' === 'quienes-somos.html')
      if (currentPath === linkPage) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      } 
      // 2. Coincidencia de sub-página (ej: 'servicios/consultoria.html' empieza con 'servicios')
      else if (linkPage === 'servicios' && currentPath.startsWith('servicios/')) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      }
      // 3. Coincidencia de sub-página de noticias
      else if (linkPage === 'noticias' && currentPath.startsWith('noticias/')) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      }
      // 4. Coincidencia de la página de inicio (Evitar que 'index.html#servicios' marque "Servicios" y "Contacto")
      else if (currentPath === 'index.html' && window.location.hash) {
         if (linkPage === 'index.html') {
            link.classList.add('text-brand-700', 'font-semibold');
            link.classList.remove('text-slate-700');
         }
      }
    });
  };

  // --- EJECUCIÓN ---
  
  // Crear un array de promesas para cargar componentes
  const loadPromises = [
    loadComponent('header-placeholder', '/_header.html'),
    loadComponent('footer-placeholder', '/_footer.html')
  ];

  // Esperar a que se carguen AMBOS (header y footer)
  Promise.all(loadPromises)
    .then(() => {
      // Una vez que el HEADER se ha cargado en el DOM...
      // ...podemos inicializar sus scripts (menú móvil y resaltado)
      initMobileMenu();
      highlightActiveLink();
    })
    .catch(error => {
      console.error("Error al cargar componentes:", error);
    });

}); // Fin del DOMContentLoaded