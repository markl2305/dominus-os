import {createSpring} from './scroll-spring.js';

const clamp = value => Math.max(0, Math.min(1, value));
const SELECTOR = '.glance2-grid > article, .chap-head, .flow-step, .arch2, .pair-tile, .kill, .ledger2-tools, .ledger2, .chap-note, .statement2, .bound, .cta2-in';
const PROPERTIES = ['--story-y','--story-scale'];

// Scroll position sets the target; critically damped springs retain velocity on
// reversal. Native scrolling is untouched. No React renders occur on scroll.
function mountScrollMotion() {
    // Only the public homepage. Papers, privacy and operational paths stay static.
    if (!document.body.classList.contains('page-index')) return;
    const root = document.querySelector('#main');
    if (!root) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const records = new Map();
    let frame = null, measurePending = true, disposed = false, hero = null, releaseTimer = null; 
    const small = () => innerWidth < 760;
    const clear = () => {
      records.forEach(record => {
        record.spring.destroy();
        record.element.removeAttribute('data-scroll-story');
        record.element.removeAttribute('data-scroll-active');
        PROPERTIES.forEach(name => record.element.style.removeProperty(name));
      });
      records.clear();
      if (hero) {
        hero.spring.destroy();
        [hero.copy, hero.image].filter(Boolean).forEach(element => {
          element.removeAttribute('data-scroll-hero');
          PROPERTIES.forEach(name => element.style.removeProperty(name));
        });
        hero = null;
      }
    };
    const paint = (record, value) => {
      const p = clamp(value);
      record.y = (1 - p) * (small() ? 26 : 48);
      record.element.style.setProperty('--story-y', `${record.y.toFixed(3)}px`);
      record.element.style.setProperty('--story-scale', String(.975 + .025 * p));
    };
    const measure = () => {
      const y = scrollY;
      // Read all layout geometry before painting. Own translation is removed,
      // and top-origin scale does not change the measured top.
      records.forEach(record => {
        record.top = record.element.getBoundingClientRect().top + y - record.y;
        record.height = record.element.offsetHeight;
      });
      if (hero) {
        hero.top = hero.section.getBoundingClientRect().top + y;
        hero.height = hero.section.offsetHeight;
      }
      measurePending = false;
    };
    const update = () => {
      frame = null;
      if (disposed || media.matches || document.hidden) return;
      if (measurePending) measure();
      const y = scrollY, height = innerHeight;
      const atEnd = y + height >= document.documentElement.scrollHeight - 2;
      records.forEach(record => {
        const top = record.top - y;
        const visible = top < height + 80 && top + record.height > -80;
        if (visible !== record.visible) {
          record.visible = visible;
          if (visible) record.element.setAttribute('data-scroll-active', '');
          else record.element.removeAttribute('data-scroll-active');
        }
        const focused = record.element.contains(document.activeElement);
        const p = atEnd ? 1 : Math.max(record.floor, clamp((height * (.96 + record.stagger) - top) / (height * .28)));
        if (focused || record.pressed) {
          if (record.spring.isRunning) record.spring.jump(record.spring.value);
        } else if (Math.abs(record.spring.target - p) > .00001) {
          if (visible) record.spring.setTarget(p);
          else record.spring.jump(p);
        }
      });
      if (hero) {
        const p = clamp((y - hero.top) / Math.max(hero.height * .85, 1));
        if (hero.pressed || hero.copy?.contains(document.activeElement) || hero.image?.contains(document.activeElement)) {
          if (hero.spring.isRunning) hero.spring.jump(hero.spring.value);
        } else if (Math.abs(hero.spring.target - p) > .00001) {
          if (y < hero.top + hero.height) hero.spring.setTarget(p);
          else hero.spring.jump(p);
        }
      }
    };
    const queue = (remeasure = false) => {
      if (disposed || media.matches) return;
      if (remeasure) measurePending = true;
      if (frame === null) frame = requestAnimationFrame(update);
    };
    const initialize = () => {
      clear();
      if (disposed || media.matches) return;
      // Do not double-transform nested groups, functional forms or disclosures.
      const candidates = [...root.querySelectorAll(SELECTOR)].filter(element =>
        !element.closest('form,dialog,details,[hidden],[aria-hidden="true"],[data-motion-ignore]'));
      candidates.forEach(element => {
        if (candidates.some(parent => parent !== element && parent.contains(element))) return;
        const rect = element.getBoundingClientRect();
        if (!rect.height || rect.height > innerHeight * 1.35) return;
        const siblings = element.parentElement?.children;
        const index = siblings ? [...siblings].indexOf(element) : 0;
        const floor = rect.top < innerHeight && rect.bottom > 0 ? 1 : 0;
        const record = {element, top: rect.top + scrollY, height: element.offsetHeight, y: 0, floor,
          stagger: Math.min(index, 3) * -.025, spring: null};
        record.spring = createSpring({value:floor, response:.24, precision:.001, onUpdate:value => paint(record,value)});
        records.set(element, record);
        element.setAttribute('data-scroll-story', 'reveal');
        record.spring.jump(floor);
      });
      const section = root.querySelector('.hero2');
      const copy = section?.querySelector('h1'), image = section?.querySelector('.hero2-crest');
      if (section && (copy || image)) {
        hero = {section,copy,image,top:0,height:0,spring:null};
        copy?.setAttribute('data-scroll-hero','copy');
        image?.setAttribute('data-scroll-hero','image');
        hero.spring = createSpring({response:.24,onUpdate:value => {
          const p = clamp(value);
          if (copy) {
            copy.style.setProperty('--story-y', `${(-p * (small() ? 16 : 38)).toFixed(3)}px`);
          }
          if (image) {
            image.style.setProperty('--story-y', `${(p * (small() ? 12 : 26)).toFixed(3)}px`);
            image.style.setProperty('--story-scale', String(1 + p * .075));
          }
        }});
      }
      queue(true);
    };
    // Freeze at the presentation value before focus can arrive. Snapping a
    // moving control to its target between pointerdown/up can swallow the click.
    const onPointerDown = event => {
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      records.forEach(record => {
        record.pressed = record.element.contains(event.target);
        if (record.pressed) record.spring.jump(record.spring.value);
      });
      if (hero) {
        hero.pressed = hero.copy?.contains(event.target) || hero.image?.contains(event.target);
        if (hero.pressed) hero.spring.jump(hero.spring.value);
      }
    };
    const onPointerEnd = () => {
      // click is dispatched after pointerup; let it finish before retargeting.
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        releaseTimer = null;
        records.forEach(record => { record.pressed = false; });
        if (hero) hero.pressed = false;
        queue();
      }, 0);
    };
    const onScroll = () => queue();
    const onResize = () => queue(true);
    const onFocus = () => queue();
    const onVisibility = () => {
      if (document.hidden) {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        // Finish offscreen; stop() alone would leave a stale value with an
        // unchanged target, so returning to this tab could freeze mid-flight.
        records.forEach(record => record.spring.jump(record.spring.target));
        hero?.spring.jump(hero.spring.target);
      } else queue(true);
    };
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    initialize();
    resize?.observe(root);
    // Consent is inserted above main: its removal moves the root without resizing it.
    resize?.observe(document.body);
    addEventListener('scroll',onScroll,{passive:true});
    addEventListener('resize',onResize);
    root.addEventListener('pointerdown',onPointerDown,true);
    addEventListener('pointerup',onPointerEnd,true);
    addEventListener('pointercancel',onPointerEnd,true);
    root.addEventListener('focusin',onFocus);
    root.addEventListener('focusout',onFocus);
    document.addEventListener('visibilitychange',onVisibility);
    media.addEventListener('change',initialize);
    document.fonts?.ready.then(() => { if (!disposed) queue(true); });
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      resize?.disconnect();
      removeEventListener('scroll',onScroll);
      removeEventListener('resize',onResize);
      if (releaseTimer !== null) clearTimeout(releaseTimer);
      root.removeEventListener('pointerdown',onPointerDown,true);
      removeEventListener('pointerup',onPointerEnd,true);
      removeEventListener('pointercancel',onPointerEnd,true);
      root.removeEventListener('focusin',onFocus);
      root.removeEventListener('focusout',onFocus);
      document.removeEventListener('visibilitychange',onVisibility);
      media.removeEventListener('change',initialize);
      clear();
    };
}

const dispose = mountScrollMotion();
// Restore native content and cancel every frame when navigating away. BFCache
// keeps this controller alive, so only dispose on a non-persisted page exit.
addEventListener('pagehide', event => { if (!event.persisted) dispose?.(); });
