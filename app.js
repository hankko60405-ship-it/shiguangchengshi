(() => {
  const TOTAL_PAGES = 8;
  const SHEETS = 4;
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const catalog = document.querySelector('#catalog');
  const reader = document.querySelector('#reader');
  const book = document.querySelector('#book');
  const bookScene = document.querySelector('#book-scene');
  const sheets = [...document.querySelectorAll('.sheet')];
  const mobileWrap = document.querySelector('#mobile-page-wrap');
  const mobileImage = document.querySelector('#mobile-page');
  const status = document.querySelector('#page-status');
  const prevButton = document.querySelector('#prev-page');
  const nextButton = document.querySelector('#next-page');
  const thumbsDialog = document.querySelector('#thumbs-dialog');
  const aboutDialog = document.querySelector('#about-dialog');
  const zoomDialog = document.querySelector('#zoom-dialog');
  const zoomImage = document.querySelector('#zoom-image');
  const pageImages = [...document.querySelectorAll('.page-face img')];

  let desktopCursor = 0;
  let mobilePage = 1;
  let isAnimating = false;
  let touchStartX = 0;

  const pageSrc = page => `assets/pages/page-${page}.png`;
  const mobileCurl = createMobileCurl({
    surface: mobileWrap,
    canvas: document.querySelector('#mobile-curl'),
    isActive: isMobile,
    isBlocked: () => isAnimating,
    getPage: () => mobilePage,
    setPage: setMobilePage,
    getImage: page => pageImages[page - 1],
    pageCount: TOTAL_PAGES
  });

  function isMobile() {
    return mobileQuery.matches;
  }

  function updateRoute(moveFocus) {
    const reading = window.location.hash === '#reader';
    mobileCurl.cancel();
    catalog.hidden = reading;
    reader.hidden = !reading;
    if (moveFocus) {
      const target = document.querySelector(reading ? '.reader-kicker' : '#enter-reader');
      target.focus({ preventScroll: true });
    }
  }

  function visibleLabel() {
    if (isMobile()) return `${mobilePage} / ${TOTAL_PAGES}`;
    if (desktopCursor === 0) return `1 / ${TOTAL_PAGES}`;
    if (desktopCursor === SHEETS) return `${TOTAL_PAGES} / ${TOTAL_PAGES}`;
    return `${desktopCursor * 2}\u2013${desktopCursor * 2 + 1} / ${TOTAL_PAGES}`;
  }

  function updateControls() {
    const atStart = isMobile() ? mobilePage === 1 : desktopCursor === 0;
    const atEnd = isMobile() ? mobilePage === TOTAL_PAGES : desktopCursor === SHEETS;
    prevButton.disabled = atStart;
    nextButton.disabled = atEnd;
    status.textContent = visibleLabel();
  }

  function renderBook() {
    book.dataset.current = desktopCursor;
    sheets.forEach((sheet, index) => {
      const flipped = index < desktopCursor;
      sheet.classList.toggle('is-flipped', flipped);
      sheet.style.zIndex = flipped ? index + 1 : SHEETS - index + 10;
    });
    updateControls();
  }

  function setMobilePage(page) {
    mobilePage = page;
    mobileImage.src = pageSrc(page);
    mobileWrap.setAttribute('aria-label', `放大第 ${page} 頁`);
    updateControls();
  }

  function turnDesktop(direction) {
    if (isAnimating) return;
    const target = desktopCursor + (direction === 'next' ? 1 : -1);
    if (target < 0 || target > SHEETS) return;
    isAnimating = true;
    const turningIndex = direction === 'next' ? desktopCursor : desktopCursor - 1;
    sheets[turningIndex]?.classList.add('is-turning');
    desktopCursor = target;
    renderBook();
    window.setTimeout(() => {
      sheets[turningIndex]?.classList.remove('is-turning');
      isAnimating = false;
    }, 920);
  }

  function turn(direction) {
    if (isMobile()) {
      mobileCurl.turn(direction === 'next' ? 1 : -1);
    } else {
      turnDesktop(direction);
    }
  }

  function goToPage(page) {
    const safePage = Math.max(1, Math.min(TOTAL_PAGES, page));
    if (isMobile()) {
      mobileCurl.cancel();
      setMobilePage(safePage);
    } else {
      desktopCursor = Math.floor(safePage / 2);
      renderBook();
    }
  }

  function openZoom(page) {
    zoomImage.src = pageSrc(page);
    zoomImage.alt = `節目冊第 ${page} 頁放大圖`;
    zoomDialog.showModal();
  }

  window.addEventListener('hashchange', () => updateRoute(true));
  prevButton.addEventListener('click', () => turn('prev'));
  nextButton.addEventListener('click', () => turn('next'));
  document.querySelector('#open-thumbs').addEventListener('click', () => {
    mobileCurl.cancel();
    thumbsDialog.showModal();
  });
  document.querySelectorAll('[data-open-about]').forEach(button => {
    button.addEventListener('click', () => {
      mobileCurl.cancel();
      aboutDialog.showModal();
    });
  });

  document.querySelector('#toggle-fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await reader.requestFullscreen();
    } catch (_) {
      // Fullscreen support varies by browser; the reader remains fully usable.
    }
  });

  document.querySelectorAll('[data-close]').forEach(button => {
    button.addEventListener('click', () => document.querySelector(`#${button.dataset.close}`).close());
  });

  [thumbsDialog, aboutDialog, zoomDialog].forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  });

  const thumbnailGrid = document.querySelector('#thumbnail-grid');
  for (let page = 1; page <= TOTAL_PAGES; page += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumbnail';
    button.innerHTML = `<img src="${pageSrc(page)}" alt="第 ${page} 頁縮圖" loading="lazy"><span>${String(page).padStart(2, '0')} 頁</span>`;
    button.addEventListener('click', () => {
      goToPage(page);
      thumbsDialog.close();
    });
    thumbnailGrid.appendChild(button);
  }

  pageImages.forEach(image => {
    image.addEventListener('click', event => {
      event.stopPropagation();
      openZoom(Number(image.dataset.page));
    });
  });
  mobileWrap.addEventListener('click', () => openZoom(mobilePage));

  bookScene.addEventListener('click', event => {
    if (event.target.closest('img')) return;
    const bounds = bookScene.getBoundingClientRect();
    turn(event.clientX < bounds.left + bounds.width / 2 ? 'prev' : 'next');
  });

  reader.addEventListener('touchstart', event => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });
  reader.addEventListener('touchend', event => {
    if (isMobile()) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 48) turn(distance < 0 ? 'next' : 'prev');
  }, { passive: true });

  document.addEventListener('keydown', event => {
    if (reader.hidden || document.querySelector('dialog[open]')) return;
    const spaceShortcut = event.key === ' ' && !event.target.closest('button, a');
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || spaceShortcut) {
      event.preventDefault();
      turn('next');
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      turn('prev');
    }
    if (event.key === 'Home') goToPage(1);
    if (event.key === 'End') goToPage(TOTAL_PAGES);
  });

  mobileQuery.addEventListener('change', () => {
    mobileCurl.cancel();
    if (isMobile()) {
      const page = desktopCursor * 2 + 1;
      setMobilePage(Math.min(page, TOTAL_PAGES));
    } else {
      desktopCursor = Math.floor(mobilePage / 2);
      renderBook();
    }
  });

  renderBook();
  updateRoute(false);
})();
