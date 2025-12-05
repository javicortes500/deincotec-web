/*
  main.js (Versión robusta: BASE + reescritura de enlaces)
  Funcionalidad:
  1) Carga de componentes (header.html, footer.html) con base dinámica (dominio propio / GitHub Pages).
  2) Reescritura de enlaces del header/footer para evitar rutas relativas rotas en subcarpetas.
  3) Lógica del menú móvil.
  4) Resaltado del enlace activo en el menú.
*/

document.addEventListener('DOMContentLoaded', () => {

  // --- BASE dinámica: dominio propio vs GitHub Pages (project page) ---
  const getBasePath = () => {
    // Si NO es *.github.io -> dominio propio (ej. deincotec.es)
    if (!location.hostname.endsWith('github.io')) return '/';
    // En GitHub Pages, la 1ª carpeta del path suele ser el repo: /mi-repo/...
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length > 0 ? `/${parts[0]}/` : '/';
  };

  const BASE = getBasePath();

  // --- Utilidades para normalizar enlaces de los fragmentos cargados ---
  const shouldRewrite = (href) => {
    if (!href) return false;
    return !/^https?:\/\//i.test(href)       // externos
        && !href.startsWith('#')             // anclas
        && !href.startsWith('mailto:')
        && !href.startsWith('tel:')
        && !href.startsWith('javascript:');
  };

  const absolutizeLinks = (rootEl) => {
    if (!rootEl) return;
    const anchors = rootEl.querySelectorAll('a[href]');
    anchors.forEach(a => {
      const raw = a.getAttribute('href'); // valor tal cual en el HTML
      if (!shouldRewrite(raw)) return;
      // Si empieza por "/", quitamos la barra inicial y anteponemos BASE.
      // Si es relativo ("servicios/deducciones.html"), también anteponemos BASE.
      const normalized = raw.startsWith('/') ? raw.replace(/^\//, '') : raw;
      a.setAttribute('href', `${BASE}${normalized}`);
    });
  };

  // --- 1. CARGADOR DE COMPONENTES (HEADER Y FOOTER) ---
  const loadComponent = async (id, fileName) => {
    const element = document.getElementById(id);
    if (!element) return;

    try {
      const url = `${BASE}${fileName}`;
      const response = await fetch(url);
      if (!response.ok) {
        element.innerHTML = `<p class="text-red-500 text-center p-4">Error: No se pudo cargar ${id}. (Ruta: ${url})</p>`;
        console.error(`Error loading ${id}: ${response.status} ${response.statusText}`);
        return;
      }
      const text = await response.text();
      element.innerHTML = text;

      // Reescribir enlaces del fragmento cargado para que apunten a BASE
      absolutizeLinks(element);

      // Si se cargó el header, inicializamos su lógica
      if (id === 'header-placeholder') {
        initMobileMenu();
        highlightActiveLink();
      }
    } catch (error) {
      element.innerHTML = `<p class="text-red-500 text-center p-4">Error: Fallo de red al cargar ${id}. (Ruta: ${BASE}${fileName})</p>`;
      console.error(`Fetch error for ${id}:`, error);
    }
  };

  // --- 2. LÓGICA DE MENÚ MÓVIL ---
  const initMobileMenu = () => {
    const menuBtn = document.getElementById('menuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileServicesBtn = document.getElementById('mobileServicesBtn');
    const mobileServicesMenu = document.getElementById('mobileServicesMenu');
    const mobileSectoresBtn = document.getElementById('mobileSectoresBtn');
    const mobileSectoresMenu = document.getElementById('mobileSectoresMenu');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    if (menuBtn && mobileMenu) {
      menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        if (mobileMenu.classList.contains('hidden')) {
          if (mobileServicesMenu) mobileServicesMenu.classList.add('hidden');
          if (mobileSectoresMenu) mobileSectoresMenu.classList.add('hidden');
        }
      });
    }

    if (mobileServicesBtn && mobileServicesMenu) {
      mobileServicesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        mobileServicesMenu.classList.toggle('hidden');
      });
    }

    if (mobileSectoresBtn && mobileSectoresMenu) {
      mobileSectoresBtn.addEventListener('click', (e) => {
        e.preventDefault();
        mobileSectoresMenu.classList.toggle('hidden');
      });
    }

    if (mobileLinks.length > 0 && mobileMenu) {
      mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.add('hidden');
          if (mobileServicesMenu) mobileServicesMenu.classList.add('hidden');
          if (mobileSectoresMenu) mobileSectoresMenu.classList.add('hidden');
        });
      });
    }
  };

  // --- 3. RESALTADO DE ENLACE ACTIVO ---
  const highlightActiveLink = () => {
    // Ruta actual sin "/" inicial
    let currentPath = window.location.pathname.substring(1);
    if (currentPath === '') currentPath = 'index.html';

    // Si la ruta incluye nombre de repo y NO estamos en *.github.io, limpiamos (seguridad extra)
    const repoNameMatch = window.location.pathname.match(/^\/([^\/]+)\//);
    if (repoNameMatch && !window.location.host.endsWith('github.io')) {
      currentPath = window.location.pathname.replace(repoNameMatch[0], '');
    }

    const navLinks = document.querySelectorAll('header .nav-link-header');

    // Reset estilos
    navLinks.forEach(link => {
      link.classList.remove('text-brand-700', 'font-semibold');
      link.classList.add('text-slate-700');
    });

    // Activación según coincidencia
    navLinks.forEach(link => {
      const linkPage = link.dataset.page;
      if (!linkPage) return;

      let targetPath = linkPage.endsWith('.html') ? linkPage : `${linkPage}.html`;

      // 1) Coincidencia directa de página
      if (currentPath.endsWith(targetPath)) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      }
      // 2) Sub-secciones en index.html (hash)
      else if (currentPath === 'index.html' || currentPath === '') {
        const hash = window.location.hash.substring(1);
        if (hash === linkPage || (linkPage === 'index.html' && hash === '')) {
          link.classList.add('text-brand-700', 'font-semibold');
          link.classList.remove('text-slate-700');
        }
      }
      // 3) Sección padre
      else if (linkPage === 'servicios' && currentPath.startsWith('servicios/')) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      }
      else if (linkPage === 'sectores' && currentPath.startsWith('sectores/')) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      }
      else if (linkPage === 'noticias' && currentPath.startsWith('noticias/')) {
        link.classList.add('text-brand-700', 'font-semibold');
        link.classList.remove('text-slate-700');
      }
    });
  };

  // --- 4. EJECUCIÓN ---
  // Ajusta los nombres si usas una carpeta, p. ej.: 'partials/header.html'
  loadComponent('header-placeholder', 'header.html')
    .then(() => {
      loadComponent('footer-placeholder', 'footer.html');
    })
    .catch(error => {
      console.error('Error fatal al cargar header:', error);
    });

}); // Fin DOMContentLoaded
