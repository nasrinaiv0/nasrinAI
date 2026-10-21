// Galaxy welcome-only solar play scene. No external assets or network requests.
(() => {
  'use strict';
  const root = document.documentElement;
  const welcome = document.getElementById('welcome');
  const hero = document.getElementById('hero');
  if (!welcome || !hero) return;

  let stage = null;
  let timer = null;
  let observer = null;
  let sunTimer = null;
  let currentSun = null;

  const isGalaxyWelcome = () =>
    root.getAttribute('data-palette') === 'galaxy' &&
    !welcome.hidden &&
    !document.body.classList.contains('has-chat') &&
    !document.querySelector('#log .msg, #log .thinking, #log .gen-loader');

  function removeScene() {
    if (timer) clearTimeout(timer);
    if (sunTimer) clearTimeout(sunTimer);
    timer = sunTimer = null;
    if (observer) { observer.disconnect(); observer = null; }
    if (stage) { stage.remove(); stage = null; }
    if (currentSun) { currentSun.remove(); currentSun = null; }
    if (window.Nasrin && window.Nasrin.current === 'concerned') window.Nasrin.mood('idle');
  }

  function makePlanet(className, label, size) {
    const planet = document.createElement('span');
    planet.className = 'galaxy-play-planet ' + className;
    planet.setAttribute('aria-hidden', 'true');
    planet.style.setProperty('--planet-size', size + 'px');
    planet.title = label;
    const surface = document.createElement('span');
    surface.className = 'galaxy-play-planet-surface';
    planet.appendChild(surface);
    return planet;
  }

  function startScene() {
    removeScene();
    if (!isGalaxyWelcome()) return;
    stage = document.createElement('div');
    stage.className = 'galaxy-play-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.append(
      makePlanet('planet-mercury', 'Mercury', 13),
      makePlanet('planet-venus', 'Venus', 19),
      makePlanet('planet-earth', 'Earth', 23),
      makePlanet('planet-mars', 'Mars', 16),
      makePlanet('planet-saturn', 'Saturn', 28),
      makePlanet('planet-neptune', 'Neptune', 21)
    );
    hero.appendChild(stage);

    const reduced = root.getAttribute('data-motion') === 'reduce' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      stage.classList.add('is-reduced-motion');
      revealSun();
    } else {
      // Let Nasrin play with the little planets for a moment before the giant sun arrives.
      sunTimer = setTimeout(revealSun, 6200);
    }

    observer = new MutationObserver(() => {
      if (!isGalaxyWelcome()) removeScene();
    });
    observer.observe(welcome, { attributes: true, attributeFilter: ['hidden'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    observer.observe(root, { attributes: true, attributeFilter: ['data-palette', 'data-motion'] });
  }

  function revealSun() {
    if (!isGalaxyWelcome() || !stage) { removeScene(); return; }
    currentSun = document.createElement('div');
    currentSun.className = 'galaxy-play-sun';
    currentSun.setAttribute('aria-hidden', 'true');
    const corona = document.createElement('span');
    corona.className = 'galaxy-play-sun-corona';
    const surface = document.createElement('span');
    surface.className = 'galaxy-play-sun-surface';
    const flare = document.createElement('span');
    flare.className = 'galaxy-play-sun-flare';
    currentSun.append(corona, surface, flare);
    document.body.appendChild(currentSun);
    if (!root.matches('[data-motion="reduce"]') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentSun.classList.add('is-arriving');
    }
    if (window.Nasrin && isGalaxyWelcome()) window.Nasrin.mood('concerned');
  }

  const rootObserver = new MutationObserver(() => {
    if (isGalaxyWelcome()) {
      if (!stage) startScene();
    } else if (stage || currentSun) removeScene();
  });
  rootObserver.observe(root, { attributes: true, attributeFilter: ['data-palette', 'data-motion'] });
  rootObserver.observe(welcome, { attributes: true, attributeFilter: ['hidden'] });
  rootObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  if (isGalaxyWelcome()) startScene();
})();
