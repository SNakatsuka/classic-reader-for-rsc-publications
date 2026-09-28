(() => {
  const ROOT = 'rsc-classic-reader';
  const $all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const movedSections = [];
  const hiddenVisualSources = new Set();
  let cardsObserver;
  let visualObserver;
  let requestBusy = false;
  const visualQueue = [];

  const isRsc = location.hostname === 'pubs.rsc.org';
  // The journal landing route may be exactly /SC/issue before it redirects to
  // a volume/issue URL, so accept the route root as well as nested issue pages.
  const isIssue = isRsc && /\/issue(?:\/|$)/i.test(location.pathname);
  const isArticle = isRsc && /\/article(?:\/|$)/i.test(location.pathname);
  const supported = isIssue || isArticle;

  function findVisualElement(root) {
    const label = $all('h2,h3,h4,h5,figcaption,[role="heading"],*[class*="visual" i],*[class*="graphic" i]', root)
      .filter((el) => !el.closest('.rsc-classic-visual'))
      .find((el) => /^(visual|graphical)\s+abstract$/i.test(el.textContent.trim()));
    if (label) {
      for (let node = label; node && node !== root; node = node.parentElement) {
        if (node.querySelector('img')) return node;
      }
    }
    const image = $all(
      'img[alt*="visual abstract" i],img[alt*="graphical abstract" i],' +
      '.visual-abstract img,.graphical-abstract img,[class*="visualAbstract" i] img,[class*="graphicalAbstract" i] img', root
    ).find((img) => !img.closest('.rsc-classic-visual'));
    return image ? image.closest('figure,.visual-abstract,.graphical-abstract,[class*="visualAbstract" i],[class*="graphicalAbstract" i]') || image.parentElement : null;
  }

  function imageSource(image) {
    const firstCandidate = (value) => value?.split(',').map((part) => part.trim().split(/\s+/)[0])
      .find((src) => src && !/^data:image\/(?:gif|png);base64,/i.test(src) &&
        !/(?:blank|transparent|spacer)\.(?:gif|png|svg)(?:[?#]|$)/i.test(src));
    const source = image?.closest('picture')?.querySelector('source[data-srcset],source[srcset]');
    return image?.getAttribute('data-src') || image?.getAttribute('data-original') ||
      image?.getAttribute('data-lazy-src') || firstCandidate(image?.getAttribute('data-srcset')) ||
      firstCandidate(source?.getAttribute('data-srcset')) || firstCandidate(source?.getAttribute('srcset')) ||
      firstCandidate(image?.getAttribute('srcset')) || image?.getAttribute('src');
  }

  function addPreview(card, src) {
    if (!src || card.querySelector(':scope > .rsc-classic-visual')) return null;
    const aside = document.createElement('aside');
    aside.className = 'rsc-classic-visual';
    const heading = document.createElement('div');
    heading.textContent = 'Visual Abstract';
    const image = document.createElement('img');
    image.src = src;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.setAttribute('fetchpriority', 'low');
    image.addEventListener('error', () => {
      aside.remove();
      card.classList.remove('rsc-classic-has-visual');
    }, { once: true });
    aside.append(heading, image);
    card.append(aside);
    card.classList.add('rsc-classic-has-visual');
    return aside;
  }

  function hideOriginalVisual(image, response) {
    if (!image || image.closest('.rsc-classic-visual')) return;
    const source = image.closest('figure,.visual-abstract,.graphical-abstract,[class*="visualAbstract" i],[class*="graphicalAbstract" i]') || image;
    if (source === response || response?.contains(source) === false) return;
    source.classList.add('rsc-classic-original-visual');
    hiddenVisualSources.add(source);
  }

  function cardList() {
    const cards = $all('#resourceTypeList-IssueOnRails_IssueArticleList .al-article-item-wrap.al-normal');
    return cards.length ? cards : $all('.al-article-item-wrap.al-normal');
  }

  function processCard(card) {
    card.classList.add('rsc-classic-card');
    const response = card.querySelector('.abstract-response-placeholder:not(.hide)');
    if (response?.textContent.trim()) card.classList.add('rsc-classic-abstract-ready');
    const toggle = card.querySelector('.js-show-abstract[aria-controls]');
    if (toggle && !toggle.dataset.rscClassicManualListener) {
      toggle.dataset.rscClassicManualListener = 'true';
      toggle.addEventListener('click', (event) => {
        if (event.isTrusted) setTimeout(() => processCard(card), 0);
      }, true);
    }
    if (card.classList.contains('rsc-classic-prefetching')) return;
    const visual = findVisualElement(card);
    if (visual) {
      const image = visual.querySelector('img');
      const source = imageSource(image);
      let preview = card.querySelector(':scope > .rsc-classic-visual');
      if (source && !preview) preview = addPreview(card, new URL(source, document.baseURI).href);
      if (preview) hideOriginalVisual(image, response);
    }
  }

  function processCards() {
    const cards = cardList();
    cards.forEach(processCard);
    observeCards(cards.filter((card) => !card.querySelector(':scope > .rsc-classic-visual')));
  }

  function abstractEndpoint(toggle) {
    // RSC's own handler builds this URL from #hfSiteURL and the button's data attributes.
    const siteUrl = document.querySelector('#hfSiteURL')?.value || '';
    let sitePath = '';
    if (siteUrl) {
      try {
        const parsed = new URL(`${location.protocol}//${siteUrl.replace(/^https?:\/\//, '')}`);
        if (parsed.hostname === location.hostname) sitePath = parsed.pathname.replace(/\/$/, '');
      } catch { /* use the page origin if the hidden field is absent or malformed */ }
    }
    const isLay = toggle.getAttribute('data-is-lay-abstract') === 'True';
    const isExtract = toggle.getAttribute('data-abstract-type') === 'extract';
    const action = isLay ? 'ArticleLayAbstractAjax' :
      isExtract ? 'ArticleAbstractOrExtractAjax' : 'ArticleAbstractAjax';
    const url = new URL(`${sitePath}/PlatformArticle/${action}`, location.origin);
    url.searchParams.set('articleId', toggle.getAttribute('data-articleid') || '');
    url.searchParams.set('layAbstract', String(isLay).toLowerCase());
    return url;
  }

  async function fetchAbstractMarkup(toggle) {
    const response = await fetch(abstractEndpoint(toggle), {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Requested-With-Lies': 'Not actually XMLHttpRequest, but Fetch API via SCM.Ajax; X-Requested-With is set for server-side backwards compatibility'
      }
    });
    if (!response.ok) throw new Error(`RSC abstract request failed (${response.status})`);
    const model = await response.json();
    if (!model || model.Success === false || typeof model.Html !== 'string') {
      throw new Error('RSC returned no abstract HTML');
    }
    return model.Html;
  }

  function findVisualImage(root) {
    const visual = findVisualElement(root);
    if (visual) return visual.querySelector('img');
    return $all('img', root).find((img) =>
      /visual|graphical|toc|abstract/i.test([
        img.getAttribute('alt'), img.getAttribute('title'), img.getAttribute('src'),
        img.getAttribute('data-src'), img.getAttribute('data-srcset'), img.getAttribute('data-original'),
        img.closest('figure')?.textContent
      ].filter(Boolean).join(' '))
    ) || null;
  }

  function observeCards(cards) {
    if (!('IntersectionObserver' in window)) return;
    if (!visualObserver) {
      visualObserver = new IntersectionObserver((entries) => {
        entries.filter((entry) => entry.isIntersecting).forEach(({ target }) => {
          visualObserver.unobserve(target);
          if (target.dataset.rscClassicQueued) return;
          target.dataset.rscClassicQueued = 'true';
          visualQueue.push(target);
          processVisualQueue();
        });
      }, { rootMargin: '450px 0px' });
    }
    cards.forEach((card) => {
      if (card.dataset.rscClassicObserved) return;
      card.dataset.rscClassicObserved = 'true';
      visualObserver.observe(card);
    });
  }

  async function loadCardVisual(card) {
    const toggle = card.querySelector('.js-show-abstract[aria-controls]');
    if (!toggle || card.querySelector(':scope > .rsc-classic-visual')) return;
    if (toggle.dataset.rscClassicVisualLoaded === 'true' || toggle.dataset.rscClassicVisualLoading === 'true') return;
    toggle.dataset.rscClassicVisualLoading = 'true';
    try {
      // Fetch the same first-party fragment the site's own click handler requests,
      // without opening or injecting the text abstract into the article card.
      const markup = await fetchAbstractMarkup(toggle);
      if (!document.documentElement.classList.contains(ROOT)) return;
      const parsed = new DOMParser().parseFromString(markup, 'text/html');
      const image = findVisualImage(parsed);
      const source = imageSource(image);
      if (source) {
        const preview = addPreview(card, new URL(source, document.baseURI).href);
        if (preview) toggle.dataset.rscClassicVisualLoaded = 'true';
      }
    } finally {
      delete toggle.dataset.rscClassicVisualLoading;
    }
  }

  function processVisualQueue() {
    if (requestBusy || !visualQueue.length) return;
    const card = visualQueue.shift();
    requestBusy = true;
    loadCardVisual(card).catch((error) => {
      console.warn('[RSC Classic Reader] Visual Abstract preview request failed.', error);
      // Retry once later if the endpoint is briefly unavailable or rate-limited.
      if (card.isConnected && document.documentElement.classList.contains(ROOT) && !card.dataset.rscClassicRetried) {
        card.dataset.rscClassicRetried = 'true';
        setTimeout(() => {
          if (!card.isConnected || !document.documentElement.classList.contains(ROOT)) return;
          delete card.dataset.rscClassicQueued;
          visualObserver?.observe(card);
        }, 12000);
      }
    }).finally(() => {
      requestBusy = false;
      setTimeout(processVisualQueue, 2800);
    });
  }

  function arrangeArticleIntro() {
    if (document.querySelector('.rsc-classic-intro')) return;
    const abstractHeading = $all('h2,h3,[role="heading"]')
      .find((el) => /^abstract$/i.test(el.textContent.trim()));
    const visualHeading = $all('h2,h3,h4,h5,figcaption,[role="heading"]')
      .find((el) => /^(visual|graphical)\s+abstract$/i.test(el.textContent.trim()));
    if (!abstractHeading || !visualHeading) return;
    const abstract = abstractHeading.closest('section') || abstractHeading.parentElement;
    const visual = findVisualElement(visualHeading.parentElement?.parentElement || document);
    if (!abstract || !visual || abstract === visual || abstract.contains(visual) || visual.contains(abstract)) return;
    const marker = document.createComment('rsc-classic-visual-position');
    visual.before(marker);
    const intro = document.createElement('div');
    intro.className = 'rsc-classic-intro';
    abstract.before(intro);
    intro.append(abstract, visual);
    movedSections.push({ intro, abstract, visual, marker });
  }

  function stylePdfLinks() {
    $all('a').filter((link) => /\b(pdf|download pdf)\b/i.test(link.textContent))
      .forEach((link) => link.classList.add('rsc-classic-pdf'));
  }

  function apply() {
    if (!supported) { remove(); return; }
    document.documentElement.classList.add(ROOT);
    $all('#InfoColumn,#Sidebar,.issue-browse-mobile-nav,.right-rail,.advertisement,.ad-container,.related-content,.recommended-content')
      .forEach((el) => el.classList.add('rsc-classic-hide'));
    stylePdfLinks();
    if (isIssue) {
      processCards();
      const root = document.querySelector('#ContentColumn') || document.body;
      if (!cardsObserver) {
        cardsObserver = new MutationObserver(processCards);
        cardsObserver.observe(root, { childList: true, subtree: true });
      }
    } else if (isArticle) {
      arrangeArticleIntro();
    }
  }

  function remove() {
    document.documentElement.classList.remove(ROOT);
    $all('.rsc-classic-hide').forEach((el) => el.classList.remove('rsc-classic-hide'));
    cardsObserver?.disconnect(); cardsObserver = undefined;
    visualObserver?.disconnect(); visualObserver = undefined;
    requestBusy = false; visualQueue.splice(0);
    $all('[data-rsc-classic-queued],[data-rsc-classic-observed]').forEach((card) => {
      delete card.dataset.rscClassicQueued;
      delete card.dataset.rscClassicObserved;
      delete card.dataset.rscClassicRetried;
    });
    $all('.rsc-classic-card').forEach((card) => card.classList.remove('rsc-classic-card','rsc-classic-has-visual','rsc-classic-abstract-ready','rsc-classic-prefetching'));
    hiddenVisualSources.forEach((source) => source.classList.remove('rsc-classic-original-visual'));
    hiddenVisualSources.clear();
    $all('.rsc-classic-pdf').forEach((link) => link.classList.remove('rsc-classic-pdf'));
    $all('.rsc-classic-visual').forEach((visual) => visual.remove());
    movedSections.splice(0).forEach(({ intro, abstract, visual, marker }) => {
      intro.before(abstract);
      marker.replaceWith(visual);
      intro.remove();
    });
  }

  chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
    if (enabled) apply();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.enabled) changes.enabled.newValue ? apply() : remove();
  });
})();
